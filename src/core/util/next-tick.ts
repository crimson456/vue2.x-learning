/*
nextTick方法：
维护一个内部和外部都相同的异步方法的任务队列
可用于：
1. 实现多次更改数据只会更新一次的操作
2. 获取数据修改后的真实dom(因为内部实现视图渲染实在异步任务队列中进行的，同步只能获取修改前)
优雅降级处理顺序：
Promise   =>  MutationObserver  =>  setImmediate (IE) =>  setTimeout
实现方法：
在调用nextTick()时会将回调同步推入callbacks队列

准备一个初始值为false的标志位pending                目的是标记已将flushCallbacks加入任务队列)
准备一个回调为flushCallbacks的异步方法timerFunc     目的是调用此异步方法时,会将flushCallbacks放入任务队列

flushCallbacks作用：执行callbacks中所有回调的任务，清空calbacks，并将标志位置为false
timerFunc作用：将flushCallbacks压入任务队列
标志位为false时执行timerFunc并置为true，让任务队列中添加上flushCallbacks
标志位为true时不处理

这样，调用所有nextTick()方法时，都会同步将所有回调推入队列，并且所有回调都会在所有同步代码执行完毕后依次执行

*/

/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks: Array<Function> = []
let pending = false

// 依次调用回调数组中的回调函数
function flushCallbacks() {
  pending = false
  // 此处可处理嵌套调用nextTick方法
  // 如nextTick方法中有调用其他响应数据更新,就会触发新的nextTick方法
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */

// 任务队列的降级处理

if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (
  !isIE &&
  typeof MutationObserver !== 'undefined' &&
  (isNative(MutationObserver) ||
    // PhantomJS and iOS 7.x
    MutationObserver.toString() === '[object MutationObserverConstructor]')
) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// nextTick方法主逻辑 
export function nextTick(): Promise<void>
export function nextTick<T>(this: T, cb: (this: T, ...args: any[]) => any): void
export function nextTick<T>(cb: (this: T, ...args: any[]) => any, ctx: T): void
/**
 * @internal
 */
export function nextTick(cb?: (...args: any[]) => any, ctx?: object) {
  let _resolve
  // 向回调数组推入回调函数
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e: any) {
        handleError(e, ctx, 'nextTick')
      }
    } 
    // 没有提供参数的情况,promise的兼容调用
    else if (_resolve) {
      _resolve(ctx)
    }
  })
  // 
  if (!pending) {
    pending = true
    // 此函数为降级处理的某个任务队列的调用,将 依次调用所有回调函数 的操作封装在此任务队列中
    timerFunc()
  }
  // $flow-disable-line
  // 没有提供参数的情况,且支持promise语法的环境返回一个promise的兼容处理
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
