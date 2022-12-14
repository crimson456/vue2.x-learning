/*

new Watcher(vm,expOrFn,cb,options,isRenderWatcher)
watcherOptions中的字段有:deep、user、lazy、sync、before


Watcher实例分三种，传入的参数区分

1.渲染Watcher
调用时机为mountComponent()调用时挂载
  new Watcher(
    vm,
    updateComponent,
    noop,
    watcherOptions,   //watcherOptions中有before字段，调用会触发beforeUpdate钩子
    true 
    )
具体流程：

创建watcher实例挂载在vm._watcher上，并在实例上挂载各种选项，并处理getter函数

调用get()方法触发getter，并走完整个依赖收集流程：
getter()方法会将watcher存入数据的dep对象中






2.计算Watcher(懒Watcher)
options.lazy= true


3.自定义Watcher
options.user = true




*/






import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop,
  isFunction
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget, DepTarget } from './dep'
import { DebuggerEvent, DebuggerOptions } from 'v3/debug'

import type { SimpleSet } from '../util/index'
import type { Component } from 'types/component'
import { activeEffectScope, recordEffectScope } from 'v3/reactivity/effectScope'

let uid = 0

/**
 * @internal
 */
export interface WatcherOptions extends DebuggerOptions {
  deep?: boolean
  user?: boolean
  lazy?: boolean
  sync?: boolean
  before?: Function
}

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 * @internal
 */

export default class Watcher implements DepTarget {
  vm?: Component | null
  expression: string
  cb: Function
  id: number
  deep: boolean
  user: boolean
  lazy: boolean
  sync: boolean
  dirty: boolean
  active: boolean
  deps: Array<Dep>
  newDeps: Array<Dep>
  depIds: SimpleSet
  newDepIds: SimpleSet
  before?: Function
  onStop?: Function
  noRecurse?: boolean
  getter: Function
  value: any
  post: boolean

  // dev only
  onTrack?: ((event: DebuggerEvent) => void) | undefined
  onTrigger?: ((event: DebuggerEvent) => void) | undefined

  // 渲染watcher : new Watcher( vm , updateComponent , noop , watcherOptions , true )
  constructor(
    vm: Component | null,                                 // 实例
    expOrFn: string | (() => any),                        // 调用的表达式
    cb: Function,                                         // 观测对象改变后调用的回调
    options?: WatcherOptions | null,                      // 不同watcher会有不同的配置选项
    isRenderWatcher?: boolean                             // 渲染watcher的标志位
  ) {
    recordEffectScope(
      this,
      // if the active effect scope is manually created (not a component scope),
      // prioritize it
      activeEffectScope && !activeEffectScope._vm
        ? activeEffectScope
        : vm
        ? vm._scope
        : undefined
    )
    if ((this.vm = vm) && isRenderWatcher) {
      vm._watcher = this
    }
    //将传入的options的选项挂载在实例上
    if (options) {
      this.deep = !!options.deep          //
      this.user = !!options.user          //
      this.lazy = !!options.lazy          //
      this.sync = !!options.sync          //
      this.before = options.before        //渲染watcher中用于调用后触发beforeUpdate钩子
      if (__DEV__) {
        this.onTrack = options.onTrack
        this.onTrigger = options.onTrigger
      }
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.post = false
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    // newDeps为不重复的依赖的数组
    this.newDeps = []
    // 
    this.depIds = new Set()
    // newDepIds用于依赖的dep去重判断
    this.newDepIds = new Set()
    this.expression = __DEV__ ? expOrFn.toString() : ''
    //处理getter函数
    if (isFunction(expOrFn)) {
      this.getter = expOrFn
    } else {
      //处理路径表达式的情况，如obj.a.b
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        __DEV__ &&
          warn(
            `Failed watching path: "${expOrFn}" ` +
              'Watcher only accepts simple dot-delimited paths. ' +
              'For full control, use a function instead.',
            vm
          )
      }
    }
    // 1.渲染watcher:直接调用get方法()
    // 
    // 
    this.value = this.lazy ? undefined : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get() {
    // Dep.target全局变量用于保存当前正在执行get方法的watcher
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 调用getter方法时会触发被观察数据上的Dep实例保存当前watcher
      value = this.getter.call(vm, vm)
    } catch (e: any) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 如果为深度观察，则会递归读取value对象下的每一个属性
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      // 所有新的依赖关系建立结束后
      // 清除旧的依赖，并将newDeps赋给deps
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 添加一项依赖到newDeps(依赖和watcher互相收集)
  addDep(dep: Dep) {
    const id = dep.id
    // watcher上对dep去重
    if (!this.newDepIds.has(id)) {
      // 此处是将dep添加到watcher的依赖数组中
      // Set实例上的add方法，Set实例中只有唯一原始值
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // 旧的dep中不存在对应依赖则添加新依赖
      if (!this.depIds.has(id)) {
        // 此处是将watcher添加到dep的订阅数组中
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  // 清除旧的依赖关系，并将newDeps赋给deps
  cleanupDeps() {
    let i = this.deps.length
    // 更新原dep中订阅数组
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        // dep实例的订阅数组中清除对应watcher
        dep.removeSub(this)
      }
    }
    // 更新newDeps到deps
    let tmp: any = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update() {
    /* istanbul ignore else */

    if (this.lazy) {
      this.dirty = true
    } 
    
    else if (this.sync) {
      this.run()
    } 
    // 渲染watcher，将watcher放入处理队列
    else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run() {
    if (this.active) {
      // 重新调用getter收集依赖
      const value = this.get()
      if (
        // 新旧值不同
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        // 对象下的引用对象可能不变，但引用对象的内容可能已经变了
        isObject(value) ||
        // ???可能是深度观察也需要更新新值
        this.deep
      ) {
        // set new value
        // 更新新值
        const oldValue = this.value
        this.value = value
        // 分情况调用回调
        // 用户定义的watcher:回调放入try/catch语句中调用并提示可能的错误
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(
            this.cb,
            this.vm,
            [value, oldValue],
            this.vm,
            info
          )
        } 
        // 其他watcher:直接调用回调
        else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate() {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  //让栈的上一级watcher收集所有此watcher的dep
  depend() {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown() {
    if (this.vm && !this.vm._isBeingDestroyed) {
      remove(this.vm._scope.effects, this)
    }
    if (this.active) {
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
      if (this.onStop) {
        this.onStop()
      }
    }
  }
}
