/*
为所有更新视图的Watcher实例维护一个队列
当有Watcher实例调用update方法时，将该实例推入队列中，并在nextTick方法中异步执行
推入队列中时会对id进行监测防重(在多次修改数据调用update方法时最终只渲染一次，防抖效果)

waiting标志位用于让多次更改数据的Watcher的更新都在任务队列中执行

*/

import type Watcher from './watcher'
import config from '../config'
import Dep from './dep'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import { warn, nextTick, devtools, inBrowser, isIE } from '../util/index'
import type { Component } from 'types/component'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
// has[watcher.id]用于去重
let has: { [key: number]: true | undefined | null } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState() {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (__DEV__) {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

// watcher队列的排序函数，普通逻辑为由小到大排序，有post成员的watcher排在最后
const sortCompareFn = (a: Watcher, b: Watcher): number => {
  if (a.post) {
    if (!b.post) return 1
  } else if (b.post) {
    return -1
  }
  return a.id - b.id
}

/**
 * Flush both queues and run the watchers.
 */
// 任务队列中处理watcher队列执行的函数
function flushSchedulerQueue() {
  currentFlushTimestamp = getNow()
  // flushing标志位用于标记是否处于watcher队列的处理中
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  // 根据watcher的id由小到大排序(有post成员的watcher排到最后)
  queue.sort(sortCompareFn)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 处理每一项watcher的更新
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    // 调用渲染watcher上的before函数，该函数中触发vue实例的beforeUpdate钩子
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    has[id] = null
    // 调用watcher上的更新函数
    watcher.run()
    // in dev build, check and stop circular updates.
    // 对循环调用更新做出警告
    if (__DEV__ && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' +
            (watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`),
          watcher.vm
        )
        break
      }
    }
  }

  // ???
  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()
  
  // 所有更新函数调用结束
  // 重置刷新和等待标志位为false
  // 刷新标志位:用于标记处于刷新阶段内部,嵌套调用watcher时内部可能有不同处理
  // 等待标志位:用于标记已经将刷新任务队列
  resetSchedulerState()

  // call component updated and activated hooks
  // ???
  callActivatedHooks(activatedQueue)
  // 依次调用所有渲染watcher的updated声明周期钩子
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

// 调用队列中所有渲染watcher的updated声明周期钩子
function callUpdatedHooks(queue: Watcher[]) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm && vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent(vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks(queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
// 将渲染watcher放入执行队列中
export function queueWatcher(watcher: Watcher) {
  // 去掉重复的watcher
  const id = watcher.id
  if (has[id] != null) {
    return
  }
  // ???
  if (watcher === Dep.target && watcher.noRecurse) {
    return
  }
  // 标志对应id的watcher已在处理队列
  has[id] = true

  // 不处于 处理watcher队列中每一项的更新的阶段中(正在调用flushSchedulerQueue函数) 的情况 ，放入队尾
  // 一般情况都是在此分支
  if (!flushing) {
    queue.push(watcher)
  } 
  // 处于 处理watcher队列中每一项的更新的阶段中(正在调用flushSchedulerQueue函数) 的情况 ，按watcher的id顺序插入
  // 如 计算属性watcher的回调中触发了某个响应式数据 在此分支
  else {
    // if already flushing, splice the watcher based on its id
    // if already past its id, it will be run next immediately.
    let i = queue.length - 1
    while (i > index && queue[i].id > watcher.id) {
      i--
    }
    queue.splice(i + 1, 0, watcher)
  }

  // queue the flush
  // 将 处理watcher队列中每一项的更新的函数flushSchedulerQueue 放入某个任务队列中
  if (!waiting) {
    // waiting标志位用于确保每一次任务轮询阶段只将该函数放入任务队列一次
    waiting = true

    if (__DEV__ && !config.async) {
      flushSchedulerQueue()
      return
    }
    // nextTick为Vue内部实现的判断兼容性进行优雅降级选择的一个任务队列
    nextTick(flushSchedulerQueue)
  }
}
