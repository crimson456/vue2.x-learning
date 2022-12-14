import { extend, warn, isObject, isFunction } from 'core/util/index'
import VNode from 'core/vdom/vnode'

/**
 * Runtime helper for rendering <slot>
 */
// _t(slotName, children, attrs, bind)
// 返回插槽渲染的结果虚拟节点
export function renderSlot(
  name: string,                                                                // 插槽名
  fallbackRender: ((() => Array<VNode>) | Array<VNode>) | null,                // 插槽下的备用内容的渲染函数
  props: Record<string, any> | null,                                           // 组件上的属性，包括动态静态属性
  bindObject: object | null                                                    // v-bind接对象的语法绑定的属性
): Array<VNode> | null {
  // 获取对应slotName(slotTarget)的normalized函数或者普通插槽的代理函数
  const scopedSlotFn = this.$scopedSlots[name]
  let nodes
  // 组件有外部节点时一定会有$scopedSlots，如果能找到对应插槽名的函数则在此分支
  // 注意普通插槽也被代理到了$scopedSlots
  if (scopedSlotFn) {
    // scoped slot
    // props为调用作用域插槽时的参数，会将插槽上所有的属性都放到props上作为实参调用作用域插槽的渲染函数
    props = props || {}
    // 处理v-bind后直接接对象的语法
    if (bindObject) {
      if (__DEV__ && !isObject(bindObject)) {
        warn('slot v-bind without argument expects an Object', this)
      }
      props = extend(extend({}, bindObject), props)
    }
    // 以插槽上所有属性组成的对象为参数调用插槽的normalized函数，如果没有，则调用备用内容的渲染函数
    nodes = scopedSlotFn(props) || (isFunction(fallbackRender) ? fallbackRender() : fallbackRender)
  } 
  // 应该是没有组件外部的占位符节点时可能直接到此分支
  // 或者没有对应插槽名的插槽，也会直接调用备用内容
  else {
    nodes = this.$slots[name] || (isFunction(fallbackRender) ? fallbackRender() : fallbackRender)
  }

  // ??? slot标签上存在slot属性的情况,使用template标签包裹
  const target = props && props.slot
  if (target) {
    return this.$createElement('template', { slot: target }, nodes)
  } else {
    return nodes
  }
}
