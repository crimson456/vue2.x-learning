import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'
import type { Component } from 'types/component'
import type { InternalComponentOptions } from 'types/options'
import { EffectScope } from 'v3/reactivity/effectScope'

let uid = 0

export function initMixin(Vue: typeof Component) {
  Vue.prototype._init = function (options?: Record<string, any>) {
    const vm: Component = this
    // a uid
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (__DEV__ && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    //Vue实例的标志位，$set、$delete中用到
    vm._isVue = true
    // avoid instances from being observed
    vm.__v_skip = true
    // effect scope
    vm._scope = new EffectScope(true /* detached */)
    vm._scope._vm = true

    // 合并options,挂载$options
    // 内部组件实例初始化时调用
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options as any)
    } 
    // 自身new创建实例时调用，包括Vue根实例初始化调用
    else {
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor as any),
        options || {},
        vm
      )
    }

    //vm._renderProxy的定义,渲染时的代理，拦截with语法的访问，给出提示信息
    /* istanbul ignore else */
    if (__DEV__) {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    // 组件的父子关系的初始化 $parent 、 $children 、 $root
    // 创建一些生命周期相关的属性和 $ref
    initLifecycle(vm)
    // 创建事件相关的属性
    initEvents(vm)
    // 渲染相关函数的挂载 _c $createElement
    // 插槽相关的挂载 $slots $scopedSlots $vnode
    initRender(vm)
    //执行beforeCreate钩子中的函数
    callHook(vm, 'beforeCreate', undefined, false /* setContext */)
    // 解析inject字段，挂载在vm下
    initInjections(vm) // resolve injections before data/props
    // 挂载 数据(状态) 如data、method、computed
    initState(vm) 
    // 解析provide字段，挂载在vm._provided下
    initProvide(vm) // resolve provide after data/props
    //执行created钩子中的函数
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (__DEV__ && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      //实际调用：mountComponent()
      //核心逻辑：vm._update(vm._render(), hydrating)
      vm.$mount(vm.$options.el)
    }
  }
}

// 内部组件调用
export function initInternalComponent(
  vm: Component,
  options: InternalComponentOptions
) {
  const opts = (vm.$options = Object.create((vm.constructor as any).options))
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions!
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// 用户直接new组件实例调用
export function resolveConstructorOptions(Ctor: typeof Component) {
  // 获取构造函数的options
  let options = Ctor.options
  // 合并上一级构造函数的选项，递归调用
  // 创建组件实例时会走这里
  if (Ctor.super) {
    // 递归调用
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // vm.superOptions用于缓存上级的所有选项的合并项
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      // 返回所有更改项组成的对象
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // 合并所有更改项
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 将更新后的上级构造函数选项合并到当前选项
      // 更新的目的在于可能出现初始化合并选项后上级可能会添加混合等修改选项
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      // 用于调用自身
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions(
  Ctor: typeof Component
): Record<string, any> | null {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
