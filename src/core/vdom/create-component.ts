import VNode from './vnode'
import { isArray } from 'core/util'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import { warn, isDef, isUndef, isTrue, isObject } from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import type {
  MountedComponentVNode,
  VNodeData,
  VNodeWithData
} from 'types/vnode'
import type { Component } from 'types/component'
import type { ComponentOptions, InternalComponentOptions } from 'types/options'
// 获取name、__name、_componentTag字段的值
export function getComponentName(options: ComponentOptions) {
  return options.name || options.__name || options._componentTag
}

// inline hooks to be invoked on component VNodes during patch
// 合并到data属性下的钩子会在patch阶段被调用，主要区分在或不在keep-alive包裹中的不同处理
const componentVNodeHooks = {
  init(vnode: VNodeWithData, hydrating: boolean): boolean | void {
    // 在keepAlive组件包裹中的情况
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } 
    // 不在keepAlive中的情况
    else {
      // 这里的 child 是相对于父级的组件来说的
      // componentInstance为组件节点的vm实例
      const child = (vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      ))
      // 这里第一个参数一般为undefined
      // 此处会创建组件的真实节点，但是不会挂载在DOM上，即vnode.componentInstance.$el为此真实节点片段的根节点
      // 后续的insert()函数会将此处创建的真实节点片段挂载DOM树上
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  prepatch(oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    // 复用旧节点的组件实例
    const child = (vnode.componentInstance = oldVnode.componentInstance)
    // 更新子组件上的一系列属性 ???
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode 此参数为子组件的外层节点
      options.children // new children
    )
  },

  insert(vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    // 触发组件实例的mounted声明周期钩子
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy(vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)

// 根据构造函数创建组件的虚拟节点，并处理为异步组件、函数式组件、抽象组件的情况
export function createComponent(
  Ctor: typeof Component | Function | ComponentOptions | void,
  data: VNodeData | undefined,
  context: Component,
  children?: Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  // 没有定义第一个参数直接返回空
  if (isUndef(Ctor)) {
    return
  }

  const baseCtor = context.$options._base

  // 将传入options的情况通过Vue.extend处理为子构造函数
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor as typeof Component)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  // 警告Ctor既不是同步写法的构造函数也不是异步写法的工厂函数的情况
  if (typeof Ctor !== 'function') {
    if (__DEV__) {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  let asyncFactory
  // @ts-expect-error
  // 没有定义cid表示为异步写法的工厂
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor)
    // 返回的组件构造函数如果为undefined说明没有加载完成且没有要使用的替换组件
    // 此时返回一个带有元数据的空节点占位
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(asyncFactory, data, context, children, tag)
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 合并构造函数上的选项，防止父构造函数新添加全局mixin后没有更新
  resolveConstructorOptions(Ctor as typeof Component)

  // transform component v-model data into props & events
  // 解析组件上的v-model指令
  if (isDef(data.model)) {
    // @ts-expect-error
    transformModel(Ctor.options, data)
  }

  // extract props
  // @ts-expect-error
  // 获取所有props对应值组成的对象，这里是获取vnode中对应props的值
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component
  // @ts-expect-error
  // 如果是函数式组件,则调用对应render返回对应节点
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(
      Ctor as typeof Component,
      propsData,
      data,
      context,
      children
    )
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn

  // @ts-expect-error
  // 抽象组件只保留props、listeners、slot
  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  // 在data上添加hook字段并挂载四个默认钩子
  installComponentHooks(data)

  // return a placeholder vnode
  // @ts-expect-error
  const name = getComponentName(Ctor.options) || tag
  const vnode = new VNode(
    // @ts-expect-error
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data,
    undefined,
    undefined,
    undefined,
    context,
    // @ts-expect-error
    { Ctor, propsData, listeners, tag, children },      // componentOptions
    asyncFactory
  )

  return vnode
}

// 创建组件实例
export function createComponentInstanceForVnode(
  // we know it's MountedComponentVNode but flow doesn't
  vnode: any,
  // activeInstance in lifecycle state
  parent?: any
): Component {
  // 组件实例创建使用的options
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode,
    parent
  }
  // check inline-template render functions
  // 内联模板的处理
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // 返回vue组件的实例
  return new vnode.componentOptions.Ctor(options)
}

// 在data上挂载合并默认的四个钩子
function installComponentHooks(data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  // 合并init、prepatch、insert、destroy四个钩子
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    // @ts-expect-error
    // 去重，且防止再次合并
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}
// 合并钩子的策略：合并为一个函数，依次调用
function mergeHook(f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
// 解析组件上的v-model指令
function transformModel(options, data: any) {
  // 获取v-model指令的目标属性和事件(可以options的model字段下配置)
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  // 给attrs对应字段赋值
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value
  // 拼接对应事件
  const on = data.on || (data.on = {})
  const existing = on[event]
  const callback = data.model.callback
  if (isDef(existing)) {
    if (
      // 去重
      isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing)
    }
  } else {
    on[event] = callback
  }
}
