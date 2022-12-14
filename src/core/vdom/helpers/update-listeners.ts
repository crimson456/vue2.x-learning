import { warn, invokeWithErrorHandling } from 'core/util/index'
import { cached, isUndef, isTrue, isArray } from 'shared/util'
import type { Component } from 'types/component'

// 解析事件的passive、once、capture修饰符
// 返回事件名和修饰符名组成的对象
const normalizeEvent = cached(
  (
    name: string
  ): {
    name: string
    once: boolean
    capture: boolean
    passive: boolean
    handler?: Function
    params?: Array<any>
  } => {
    const passive = name.charAt(0) === '&'
    name = passive ? name.slice(1) : name
    const once = name.charAt(0) === '~' // Prefixed last, checked first
    name = once ? name.slice(1) : name
    const capture = name.charAt(0) === '!'
    name = capture ? name.slice(1) : name
    return {
      name,
      once,
      capture,
      passive
    }
  }
)

// 创建一个invoker函数并返回
// invoker函数的功能为调用invoker函数对象下fns字段上的所有回调
export function createFnInvoker(
  fns: Function | Array<Function>,
  vm?: Component
): Function {
  function invoker() {
    const fns = invoker.fns
    // 函数数组则依次调用
    if (isArray(fns)) {
      const cloned = fns.slice()
      for (let i = 0; i < cloned.length; i++) {
        invokeWithErrorHandling(
          cloned[i],
          null,
          arguments as any,
          vm,
          `v-on handler`
        )
      }
    } 
    // 函数则直接调用
    else {
      // return handler return value for single handlers
      return invokeWithErrorHandling(
        fns,
        null,
        arguments as any,
        vm,
        `v-on handler`
      )
    }
  }
  invoker.fns = fns
  return invoker
}

export function updateListeners(
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  createOnceHandler: Function,
  vm: Component
) {
  let name, cur, old, event
  // 遍历data.on字段下的所有属性(事件名)
  for (name in on) {
    cur = on[name]
    old = oldOn[name]
    // 解析事件的passive、once、capture修饰符
    event = normalizeEvent(name)
    // 对事件无回调进行警告
    if (isUndef(cur)) {
      __DEV__ &&
        warn(
          `Invalid handler for event "${event.name}": got ` + String(cur),
          vm
        )
    } 
    // 新添加事件
    else if (isUndef(old)) {
      // 将事件名的字段包装成一个invoker函数，函数中会依次invoker函数对象下的fns字段上的所有回调函数
      // 并且将原来的回调函数或回调函数的数组挂载在invoker函数对象的fns字段下
      if (isUndef(cur.fns)) {
        cur = on[name] = createFnInvoker(cur, vm)
      }
      // 处理once修饰符，将事件包装成执行一次后从事件对象上移除的函数
      if (isTrue(event.once)) {
        cur = on[name] = createOnceHandler(event.name, cur, event.capture)
      }
      // 在DOM上添加事件处理函数
      add(event.name, cur, event.capture, event.passive, event.params)
    } 
    // 更新事件
    else if (cur !== old) {
      // 将旧事件的invoker函数对象下的fns字段的回调进行修改
      old.fns = cur
      // 将新的invoker函数赋值为要处理的事件
      on[name] = old
    }
  }
  // 删除新事件中不存在的事件
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name)
      remove(event.name, oldOn[name], event.capture)
    }
  }
}
