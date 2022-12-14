import type VNode from 'core/vdom/vnode'
import type { Component } from 'types/component'

/**
 * Runtime helper for resolving raw children VNodes into a slot object.
 */
// 将组件节点下的节点解析为插槽slots对象，供组件内渲染调用
// slots对象格式大致为: { default: [children], slotTarget1: [children], ...}
export function resolveSlots(
  children: Array<VNode> | null | undefined,
  context: Component | null
): { [key: string]: Array<VNode> } {
  // 组件节点没有子节点的情况说明没有插槽内容，直接返回
  if (!children || !children.length) {
    return {}
  }

  const slots: Record<string, any> = {}
  // 递归所有子节点,生成slots对象,格式为: { default: [children], slotTarget1: [children], ...}
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i]
    const data = child.data
    // remove slot attribute if the node is resolved as a Vue slot node
    // 删除该子节点上的data.attrs.slot字段，表示已经处理
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    // 具名插槽，slots下增加字段 slotTarget: [children] 
    if (
      (child.context === context || child.fnContext === context) &&
      data &&
      data.slot != null
    ) {
      const name = data.slot
      const slot = slots[name] || (slots[name] = [])
      if (child.tag === 'template') {
        slot.push.apply(slot, child.children || [])
      } else {
        slot.push(child)
      }
    } 
    // 普通插槽，slots下增加字段 default: [children] 
    else {
      ;(slots.default || (slots.default = [])).push(child)
    }
  }
  // ignore slots that contains only whitespace
  // 去除solts对象中的空节点
  for (const name in slots) {
    if (slots[name].every(isWhitespace)) {
      delete slots[name]
    }
  }
  return slots
}

// 判断节点是否为空白节点
function isWhitespace(node: VNode): boolean {
  return (node.isComment && !node.asyncFactory) || node.text === ' '
}
