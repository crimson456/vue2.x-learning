import { def } from 'core/util/lang'
import { normalizeChildren } from 'core/vdom/helpers/normalize-children'
import { emptyObject, isArray } from 'shared/util'
import { isAsyncPlaceholder } from './is-async-placeholder'
import type VNode from '../vnode'
import { Component } from 'types/component'
import { currentInstance, setCurrentInstance } from 'v3/currentInstance'

// normalizeScopedSlots( vm.$parent, parentVnode.data.scopedSlots, vm.$slots)
// normalizeScopedSlots( vm.$parent!, _parentVnode.data!.scopedSlots, vm.$slots, vm.$scopedSlots)
// 将作用域插槽的渲染函数包裹处理，调用后对各种情况进行判断，返回一个规范化的结果
export function normalizeScopedSlots(
  ownerVm: Component,                                                       // 此参数为父组件
  scopedSlots: { [key: string]: Function } | undefined,                     // 此参数为 _u函数解析后的 组件的虚拟节点上的data.scopedSlots字段
  normalSlots: { [key: string]: VNode[] },                                  // 此参数为普通插槽的挂载字段vm.$slots，用于将普通插槽代理到$scopedSlots，方便渲染操作
  prevScopedSlots?: { [key: string]: Function }                             // 此参数为上一次渲染的vm.$scopedSlots，用于复用
): any {
  let res
  const hasNormalSlots = Object.keys(normalSlots).length > 0
  const isStable = scopedSlots ? !!scopedSlots.$stable : !hasNormalSlots
  // $key是解析作用域插槽时生成的hash值
  const key = scopedSlots && scopedSlots.$key
  // 没有作用域插槽的情况
  if (!scopedSlots) {
    res = {}
  } 
  // 已经规范化过则直接返回
  else if (scopedSlots._normalized) {
    // fast path 1: child component re-render only, parent did not change
    return scopedSlots._normalized
  } 
  // 似乎是可以沿用上一次的 ???
  else if (
    isStable &&
    prevScopedSlots &&
    prevScopedSlots !== emptyObject &&
    key === prevScopedSlots.$key &&
    !hasNormalSlots &&
    !prevScopedSlots.$hasNormal
  ) {
    // fast path 2: stable scoped slots w/ no normal slots to proxy,
    // only need to normalize once
    return prevScopedSlots
  } 
  // 主逻辑
  else {
    res = {}
    // 此处的scopedSlots为组件虚拟节点的data.scopedSlots字段
    for (const key in scopedSlots) {
      // 排除$key和$stable等逻辑判断的标志位,其他属性就是解析完成的作用域插槽
      if (scopedSlots[key] && key[0] !== '$') {
        // 将作用域插槽的渲染函数进行包裹和参数的处理，返回一个normalized函数，根据参数调用此函数会返回作用域插槽的虚拟节点
        // normalized函数主要是对插槽上存在v-for,v-if和v-slot的语法糖做处理
        res[key] = normalizeScopedSlot( ownerVm, normalSlots, key, scopedSlots[key] )
      }
    }
  }
  // expose normal slots on scopedSlots
  // 将普通插槽也暴露在res上
  for (const key in normalSlots) {
    if (!(key in res)) {
      res[key] = proxyNormalSlot(normalSlots, key)
    }
  }
  // avoriaz seems to mock a non-extensible $scopedSlots object
  // and when that is passed down this would cause an error
  // 处理后将处理结果标记在_normalized字段下
  if (scopedSlots && Object.isExtensible(scopedSlots)) {
    scopedSlots._normalized = res
  }
  // 定义三个用于判断复用的字段
  def(res, '$stable', isStable)
  def(res, '$key', key)
  def(res, '$hasNormal', hasNormalSlots)
  return res
}

// 将data.scopedSlots字段下的一项作用域插槽的渲染函数处理为规范化后的函数(似乎是调用的上下文和生成的节点进行了处理)
function normalizeScopedSlot(vm, normalSlots, key, fn) {
  const normalized = function () {
    const cur = currentInstance
    setCurrentInstance(vm)
    let res = arguments.length ? fn.apply(null, arguments) : fn({})
    res =  res && typeof res === 'object' && !isArray(res)
            ? [res] // single vnode
            // 此处会进行扁平化的处理
            : normalizeChildren(res)
    const vnode: VNode | null = res && res[0]
    setCurrentInstance(cur)
    return res &&
      (!vnode ||
        (res.length === 1 && vnode.isComment && !isAsyncPlaceholder(vnode))) // #9658, #10391
      ? undefined
      : res
  }
  // this is a slot using the new v-slot syntax without scope. although it is
  // compiled as a scoped slot, render fn users would expect it to be present
  // on this.$slots because the usage is semantically a normal slot.
  if (fn.proxy) {
    Object.defineProperty(normalSlots, key, {
      get: normalized,
      enumerable: true,
      configurable: true
    })
  }
  return normalized
}

function proxyNormalSlot(slots, key) {
  return () => slots[key]
}
