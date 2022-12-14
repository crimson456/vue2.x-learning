import VNode, { cloneVNode } from './vnode'
import { createElement } from './create-element'
import { resolveInject } from '../instance/inject'
import { normalizeChildren } from '../vdom/helpers/normalize-children'
import { resolveSlots } from '../instance/render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import { installRenderHelpers } from '../instance/render-helpers/index'

import {
  isDef,
  isTrue,
  hasOwn,
  isArray,
  camelize,
  emptyObject,
  validateProp
} from '../util/index'
import type { Component } from 'types/component'
import type { VNodeData } from 'types/vnode'

// 创建函数式组件render的上下文
export function FunctionalRenderContext(
  data: VNodeData,
  props: Object,
  children: Array<VNode> | undefined,
  parent: Component,
  Ctor: typeof Component
) {
  const options = Ctor.options
  // ensure the createElement function in functional components
  // gets a unique context - this is necessary for correct named slot check
  let contextVm
  // 此处判断确保contextVm是Vue实例
  // 父元素为Vue实例的情况
  if (hasOwn(parent, '_uid')) {
    contextVm = Object.create(parent)
    contextVm._original = parent
  } 
  // 父元素也为函数式组件的情况
  else {
    // the context vm passed in is a functional context as well.
    // in this case we want to make sure we are able to get a hold to the
    // real context instance.
    contextVm = parent
    // @ts-ignore
    parent = parent._original
  }
  // 用于对编译过了的单文件组件<template functional></template>写法作支持
  const isCompiled = isTrue(options._compiled)
  const needNormalization = !isCompiled

  // 初始化上下文对象中的状态属性
  this.data = data
  this.props = props
  this.children = children
  this.parent = parent
  this.listeners = data.on || emptyObject
  this.injections = resolveInject(options.inject, parent)
  this.slots = () => {
    if (!this.$slots) {
      normalizeScopedSlots(
        parent,
        data.scopedSlots,
        (this.$slots = resolveSlots(children, parent))
      )
    }
    return this.$slots
  }

  Object.defineProperty(this, 'scopedSlots', {
    enumerable: true,
    get() {
      return normalizeScopedSlots(parent, data.scopedSlots, this.slots())
    }
  } as any)

  // support for compiled functional template
  if (isCompiled) {
    // exposing $options for renderStatic()
    this.$options = options
    // pre-resolve slots for renderSlot()
    this.$slots = this.slots()
    this.$scopedSlots = normalizeScopedSlots(
      parent,
      data.scopedSlots,
      this.$slots
    )
  }

  if (options._scopeId) {
    this._c = (a, b, c, d) => {
      const vnode = createElement(contextVm, a, b, c, d, needNormalization)
      if (vnode && !isArray(vnode)) {
        vnode.fnScopeId = options._scopeId
        vnode.fnContext = parent
      }
      return vnode
    }
  } else {
    this._c = (a, b, c, d) =>
      createElement(contextVm, a, b, c, d, needNormalization)
  }
}

installRenderHelpers(FunctionalRenderContext.prototype)

// 创建函数式组件,返回函数式组件的render函数调用后生成的节点
export function createFunctionalComponent(
  Ctor: typeof Component,
  propsData: Object | undefined,
  data: VNodeData,
  contextVm: Component,
  children?: Array<VNode>
): VNode | Array<VNode> | void {
  const options = Ctor.options
  const props = {}
  const propOptions = options.props
  // 函数式组件定义时的选项添加了props的情况
  if (isDef(propOptions)) {
    // 查询定义的props
    for (const key in propOptions) {
      // 获取props的值(没有则使用默认值)，并进行类型检测
      props[key] = validateProp(key, propOptions, propsData || emptyObject)
    }
  } 
  // 函数式组件定义时的选项没有添加props的情况
  // 定义时不添加props字段会直接将所有属性都添加context的props下
  else {
    // 从data下的attrs、props字段获取对应字段的值
    // 注意data下的props字段表示某些必须使用DOM的js属性，props和propsData中的props表示组件中获取的属性
    if (isDef(data.attrs)) mergeProps(props, data.attrs)
    if (isDef(data.props)) mergeProps(props, data.props)
  }
  // 创建函数式组件的上下文
  const renderContext = new FunctionalRenderContext(
    data,
    props,
    children,
    contextVm,
    Ctor
  )
  // 用renderContext作参数调用函数式组件的render函数
  const vnode = options.render.call(null, renderContext._c, renderContext)

  // 返回render调用结果的克隆的节点,并挂载fnContext和fnOptions
  // 如果是节点数组,则对每一项都调用
  if (vnode instanceof VNode) {
    return cloneAndMarkFunctionalResult(
      vnode,
      data,
      renderContext.parent,
      options,
      renderContext
    )
  } else if (isArray(vnode)) {
    const vnodes = normalizeChildren(vnode) || []
    const res = new Array(vnodes.length)
    for (let i = 0; i < vnodes.length; i++) {
      res[i] = cloneAndMarkFunctionalResult(
        vnodes[i],
        data,
        renderContext.parent,
        options,
        renderContext
      )
    }
    return res
  }
}

// 克隆函数式组件render调用的结果节点,并且重新赋值data.slot的值
function cloneAndMarkFunctionalResult(
  vnode,
  data,
  contextVm,
  options,
  renderContext
) {
  // #7817 clone node before setting fnContext, otherwise if the node is reused
  // (e.g. it was from a cached normal slot) the fnContext causes named slots
  // that should not be matched to match.
  const clone = cloneVNode(vnode)
  clone.fnContext = contextVm
  clone.fnOptions = options
  if (__DEV__) {
    ;(clone.devtoolsMeta = clone.devtoolsMeta || ({} as any)).renderContext =
      renderContext
  }
  // 此处的slot值代表组件标签上slot属性值
  if (data.slot) {
    ;(clone.data || (clone.data = {})).slot = data.slot
  }
  return clone
}

function mergeProps(to, from) {
  for (const key in from) {
    to[camelize(key)] = from[key]
  }
}
