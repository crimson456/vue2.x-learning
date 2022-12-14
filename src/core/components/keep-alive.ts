import { isRegExp, isArray, remove } from 'shared/util'
import { getFirstComponentChild } from 'core/vdom/helpers/index'
import type VNode from 'core/vdom/vnode'
import type { VNodeComponentOptions } from 'types/vnode'
import type { Component } from 'types/component'
import { getComponentName } from '../vdom/create-component'

type CacheEntry = {
  name?: string
  tag?: string
  componentInstance?: Component
}

type CacheEntryMap = Record<string, CacheEntry | null>

// 获取name、__name、_componentTag字段的值或者tag值
function _getComponentName(opts?: VNodeComponentOptions): string | null {
  return opts && (getComponentName(opts.Ctor.options as any) || opts.tag)
}

// 匹配include和exclude的规则
function matches(
  pattern: string | RegExp | Array<string>,
  name: string
): boolean {
  if (isArray(pattern)) {
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

// 遍历缓存中每一项，销毁不符合新规则的组件的缓存
function pruneCache(
  keepAliveInstance: { cache: CacheEntryMap; keys: string[]; _vnode: VNode },
  filter: Function
) {
  const { cache, keys, _vnode } = keepAliveInstance
  // 遍历缓存中的每一项
  for (const key in cache) {
    const entry = cache[key]
    if (entry) {
      const name = entry.name
      // 如果组件的名字不符合新的规则，则销毁组件的缓存
      if (name && !filter(name)) {
        pruneCacheEntry(cache, key, keys, _vnode)
      }
    }
  }
}
// 从缓存中删除对应key值的组件实例，并进行组件的销毁(当前正在使用的实例不销毁，只移出缓存)
function pruneCacheEntry(
  cache: CacheEntryMap,
  key: string,
  keys: Array<string>,
  current?: VNode
) {
  const entry = cache[key]
  // 除了当前组件的其他组件会进行销毁
  if (entry && (!current || entry.tag !== current.tag)) {
    // @ts-expect-error can be undefined
    entry.componentInstance.$destroy()
  }
  cache[key] = null
  remove(keys, key)
}

const patternTypes: Array<Function> = [String, RegExp, Array]

// TODO defineComponent
export default {
  name: 'keep-alive',
  // 抽象组件，不会被记录到$children和$parent上，并且没有自己的真实dom
  abstract: true,

  // keep-alive组件上传入的参数 eg. <keep-alive include='xxx' exclude='xxx' max='xxx'><keep-alive>
  props: {
    // 需要缓存的组件名、正则     eg. ['componentA','componentB'] ...
    include: patternTypes,
    // 需要排除的组件名、正则
    exclude: patternTypes,
    // 最大缓存的组件个数
    max: [String, Number]
  },

  methods: {
    // 缓存当前实例到cache字段
    cacheVNode() {
      const { cache, keys, vnodeToCache, keyToCache } = this
      if (vnodeToCache) {
        const { tag, componentInstance, componentOptions } = vnodeToCache
        // 缓存的格式
        cache[keyToCache] = {
          name: _getComponentName(componentOptions),
          tag,
          componentInstance
        }
        keys.push(keyToCache)
        // prune oldest entry
        // 超出max最大限制后将队头的组件销毁
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
        this.vnodeToCache = null
      }
    }
  },

  created() {
    // 此字段作为缓存区
    this.cache = Object.create(null)
    // 此字段保存缓存组件的名字
    this.keys = []
  },

  destroyed() {
    // 销毁所有缓存的组件
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted() {
    // 缓存组件实例，并将超出缓存的组件实例销毁
    this.cacheVNode()
    // 观察include和exclude属性，如果发生改变，则
    this.$watch('include', val => {
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },

  updated() {
    // 缓存组件，并将超出缓存的组件实例销毁
    this.cacheVNode()
  },

  render() {
    // 获取keep-alive组件的默认插槽，一般为包裹的所有内容
    const slot = this.$slots.default
    // 获取第一个组件子节点作为渲染结果
    // 所以keep-alive中只放一个组件，放多了只渲染第一个
    const vnode = getFirstComponentChild(slot)
    const componentOptions = vnode && vnode.componentOptions
    if (componentOptions) {
      // check pattern
      // 从组件的属性中获取组件的名字或者标签
      const name = _getComponentName(componentOptions)
      const { include, exclude } = this
      // 匹配include和exclude字段的属性，如果组件名不包含在需要缓存的组件名中，直接返回组件的虚拟节点
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) {
        return vnode
      }

      const { cache, keys } = this
      // 生成一个独立的key挂载虚拟节点上
      const key =
        vnode.key == null
          ? // same constructor may get registered as different local components
            // so cid alone is not enough (#3269)
            componentOptions.Ctor.cid +
            (componentOptions.tag ? `::${componentOptions.tag}` : '')
          : vnode.key
      // 根据key值复用组件实例
      // 此处的策略：LRU(Least recently used)
      // 命中key，则删除原位置的key并放入队尾，没有命中，则存入新的，如果超出最大数量，则从队头删除
      // 命中(缓存中存在对应key值的实例)的情况:复用组件实例，更新key值到队尾
      if (cache[key]) {
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        remove(keys, key)
        keys.push(key)
      } 
      // 没有命中的情况:保存需要缓存的虚拟节点和key值，等待挂载或更新时放入缓存
      else {
        // delay setting the cache until update
        this.vnodeToCache = vnode
        this.keyToCache = key
      }

      // @ts-expect-error can vnode.data can be undefined
      // 在虚拟节点上挂载data.keepAlive字段，用于patch时的特殊处理
      vnode.data.keepAlive = true
    }
    // 没有组件节点就返回第一个子节点
    return vnode || (slot && slot[0])
  }
}
