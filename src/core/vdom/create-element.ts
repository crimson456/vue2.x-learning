import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isArray,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset,
  isFunction
} from '../util/index'

import { normalizeChildren, simpleNormalizeChildren } from './helpers/index'
import type { Component } from 'types/component'
import type { VNodeData } from 'types/vnode'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
export function createElement(
  context: Component,
  tag: any,
  data: any,
  children: any,
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {
  // 没有data入参的参数兼容性处理
  if (isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  // compiler编译的_c()函数中alwaysNormalize为false
  // 用于手写的$createElement函数alwaysNormalize为true
  // 所以手写render函数的normalizationType值始终为2
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType)
}

export function _createElement(
  context: Component,
  tag?: string | Component | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  // 如果data被观察则做出警告并返回空的虚拟节点
  if (isDef(data) && isDef((data as any).__ob__)) {
    __DEV__ &&
      warn(
        `Avoid using observed data object as vnode data: ${JSON.stringify(
          data
        )}\n` + 'Always create fresh vnode data objects in each render!',
        context
      )
    return createEmptyVNode()
  }
  // object syntax in v-bind
  // 动态组件的情况
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }
  // 动态组件is不存在或者为false的情况，创建空节点
  if (!tag) {
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  // 判断key值是否为有效值(原始类型:string、number、boolean、symbol)
  if (__DEV__ && isDef(data) && isDef(data.key) && !isPrimitive(data.key)) {
    warn(
      'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
      context
    )
  }
  // support single function children as default scoped slot
  // 子节点数组第一个子元素为函数时，将它当作默认作用域插槽，然后清空子节点列表 ???
  if (isArray(children) && isFunction(children[0])) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }
  // 处理子节点规范化，将children处理为节点数组
  if (normalizationType === ALWAYS_NORMALIZE) {
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    children = simpleNormalizeChildren(children)
  }

  let vnode, ns
  if (typeof tag === 'string') {
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    // 浏览器原生标签
    if (config.isReservedTag(tag)) {
      // platform built-in elements
      // 对原生标签使用v-on .native 修饰符做出提示
      if ( __DEV__ && isDef(data) && isDef(data.nativeOn) && data.tag !== 'component' ) {
        warn(
          `The .native modifier for v-on is only valid on components but it was used on <${tag}>.`,
          context
        )
      }
      // 生成原生浏览器标签的节点
      vnode = new VNode( config.parsePlatformTagName(tag) , data , children , undefined , undefined , context)
    } 
    // 没有v-pre指令且定义在实例$options上的组件
    else if ((!data || !data.pre) && isDef((Ctor = resolveAsset(context.$options, 'components', tag)))) {
      // Ctor为对应的子类构造函数或者异步组件的工厂函数
      // 创建组件的虚拟节点
      vnode = createComponent(Ctor, data, context, children, tag)
    } 
    // 未知标签(没有定义在实例上，且不是原生)
    else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      // 直接创建节点
      vnode = new VNode(tag, data, children, undefined, undefined, context)
    }
  } 
  // tag不是字符串的时候 ???还没到过这里
  else {
    // tag 为一个组件的配置对象或者是一个组件的构造函数
    // direct component options / constructor
    vnode = createComponent(tag as any, data, context, children)
  }

  // 处理生成的节点
  // 只有函数式组件可能返回数组
  if (isArray(vnode)) {
    return vnode
  } 
  // 对节点进行命名空间的绑定和触发class和style深层的动态绑定数据的处理
  else if (isDef(vnode)) {
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } 
  // 没有定义节点的情况返回空节点
  else {
    return createEmptyVNode()
  }
}

function applyNS(vnode, ns, force?: boolean) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (
        isDef(child.tag) &&
        (isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))
      ) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
function registerDeepBindings(data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
