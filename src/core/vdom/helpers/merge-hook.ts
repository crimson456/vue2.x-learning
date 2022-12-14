import VNode from '../vnode'
import { createFnInvoker } from './update-listeners'
import { remove, isDef, isUndef, isTrue } from 'shared/util'

// 将钩子函数包装为只执行一次后合并到节点上data.hook上的对应钩子的invoker函数对象上
export function mergeVNodeHook(
  def: Record<string, any>,               // 节点或节点data.hook字段
  hookKey: string,                        // 钩子名
  hook: Function                          // 要合并的钩子函数
) {
  // 将第一个参数如果为节点，置为节点的data.hook字段
  if (def instanceof VNode) {
    def = def.data!.hook || (def.data!.hook = {})
  }
  let invoker
  const oldHook = def[hookKey]

  // 将钩子函数包装成执行后移除
  function wrappedHook() {
    hook.apply(this, arguments)
    // important: remove merged hook to ensure it's called only once
    // and prevent memory leak
    remove(invoker.fns, wrappedHook)
  }

  // 将钩子函数合并到节点data.hook对应钩子的invoker函数对象上]/
  // 节点上不存在对应钩子的情况
  if (isUndef(oldHook)) {
    // no existing hook
    // 创建一个invoker函数并返回
    // invoker函数的功能为调用invoker函数对象下fns字段上的所有回调
    invoker = createFnInvoker([wrappedHook])
  } 
  // 节点上存在对应钩子
  else {
    /* istanbul ignore if */
    // 对应钩子已经合并过
    if (isDef(oldHook.fns) && isTrue(oldHook.merged)) {
      // already a merged invoker
      invoker = oldHook
      invoker.fns.push(wrappedHook)
    } 
    // 对应钩子还未合并过
    else {
      // existing plain hook
      invoker = createFnInvoker([oldHook, wrappedHook])
    }
  }

  invoker.merged = true
  def[hookKey] = invoker
}
