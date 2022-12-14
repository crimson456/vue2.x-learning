import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import VNode, { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'
import type { VNodeData } from 'types/vnode'
import type { Component } from 'types/component'

// ensureCtor(res, baseCtor)
function ensureCtor(comp: any, base) {
  if (comp.__esModule || (hasSymbol && comp[Symbol.toStringTag] === 'Module')) {
    comp = comp.default
  }
  return isObject(comp) ? base.extend(comp) : comp
}

// 返回一个带有异步组件元数据的空节点占位
export function createAsyncPlaceholder(
  factory: Function,
  data: VNodeData | undefined,
  context: Component,
  children: Array<VNode> | undefined,
  tag?: string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}


export function resolveAsyncComponent(
  factory: { (...args: any[]): any; [keye: string]: any },
  baseCtor: typeof Component
): typeof Component | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  if (isDef(factory.resolved)) {
    return factory.resolved
  }
  // owner 为当前正在渲染的实例
  // 对同一个异步组件的引用不必多次解析，而是将当前使用该异步组件的实例存入owners字段下，待到异步组件解析完毕，依次通知渲染更新即可
  const owner = currentRenderingInstance
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner)
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    const owners = (factory.owners = [owner])
    // 同步标志
    let sync = true
    let timerLoading: number | null = null
    let timerTimeout: number | null = null

    owner.$on('hook:destroyed', () => remove(owners, owner))

    // 让所有依赖强制更新
    const forceRender = (renderCompleted: boolean) => {
      // 让所有依赖的组件调用$forceUpdate()
      for (let i = 0, l = owners.length; i < l; i++) {
        owners[i].$forceUpdate()
      }
      
      // 清空所有依赖项，并将定时器置为零 ???
      if (renderCompleted) {
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    }
    // 异步任务完成后调用resolve()
    const resolve = once((res: Object | Component) => {
      // cache resolved
      // 将resolve传入的异步组件参数生成子类构造函数，并挂载在factory的resolved字段下
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      // 异步执行的代码会执行强制更新
      if (!sync) {
        forceRender(true)
      } else {
        owners.length = 0
      }
    })
    // 异步任务失败后调用reject()，强制更新
    const reject = once(reason => {
      __DEV__ &&
        warn(
          `Failed to resolve async component: ${String(factory)}` +
            (reason ? `\nReason: ${reason}` : '')
        )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })
    // 调用工厂函数，返回异步结果
    const res = factory(resolve, reject)
    // 此处主要分为三种：
    // 1.普通异步组件       (resolve, reject) => { xxx }              res为undefined
    // 2.Promise异步组件    () => import('./my-async-component')      res为Promise实例
    // 3.高级异步组件       () => ({})                                res为异步组件的配置对象
    // 注意后两种入参和返回值无关，只有普通异步组件会执行入参中传入的resolve和reject，后两种的执行在下面的代码中
    if (isObject(res)) {
      // Promise异步组件的处理:promise完成后调用执行then方法，在then方法中执行resolve和reject
      if (isPromise(res)) {
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } 
      // 高阶异步组件的处理：
      // 高阶写法中包含几个字段分别是等待时的渲染的组件，正常渲染的组件，出错时渲染的组件.....
      else if (isPromise(res.component)) {
        // 正常处理异步加载组件
        res.component.then(resolve, reject)
        // 定义错误时要渲染的组件
        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }
        // 定义等待加载时渲染的组件
        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          // 根据展示加载时组件的延时时间定义处理loading标志位，和加载时组件的更新
          if (res.delay === 0) {
            factory.loading = true
          } else {
            // @ts-expect-error NodeJS timeout type
            timerLoading = setTimeout(() => {
              timerLoading = null
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }
        // 定义超时如果没有加载完成则直接调用reject加载出错时的组件
        if (isDef(res.timeout)) {
          // @ts-expect-error NodeJS timeout type
          timerTimeout = setTimeout(() => {
            timerTimeout = null
            if (isUndef(factory.resolved)) {
              reject(__DEV__ ? `timeout (${res.timeout}ms)` : null)
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // return in case resolved synchronously
    // 根据loading标志位返回当前要渲染的组件
    return factory.loading ? factory.loadingComp : factory.resolved
  }
}
