import VNode from 'core/vdom/vnode'
import { isDef, isObject } from 'shared/util'
import type { VNodeData, VNodeWithData } from 'types/vnode'

// 返回静态和动态绑定的class拼接的字符串
export function genClassForVnode(vnode: VNodeWithData): string {
  let data = vnode.data
  let parentNode: VNode | VNodeWithData | undefined = vnode
  let childNode: VNode | VNodeWithData = vnode
  // 父节点为外层节点(当前创建的节点)，子节点是组件render函数创建的节点片段的第一个节点(可能有递归的情况)
  // 合并内层data中的class
  while (isDef(childNode.componentInstance)) {
    childNode = childNode.componentInstance._vnode!
    if (childNode && childNode.data) {
      data = mergeClassData(childNode.data, data)
    }
  }
  // @ts-expect-error parentNode.parent not VNodeWithData
  // 合并外层data中的class
  while (isDef((parentNode = parentNode.parent))) {
    if (parentNode && parentNode.data) {
      data = mergeClassData(data, parentNode.data)
    }
  }

  return renderClass(data.staticClass!, data.class)
}
// 合并class、staticClass字段
function mergeClassData(
  child: VNodeData,
  parent: VNodeData
): {
  staticClass: string
  class: any
} {
  return {
    staticClass: concat(child.staticClass, parent.staticClass),
    class: isDef(child.class) ? [child.class, parent.class] : parent.class
  }
}

// 拼接动态和静态绑定的class
export function renderClass(
  staticClass: string | null | undefined,
  dynamicClass: any
): string {
  if (isDef(staticClass) || isDef(dynamicClass)) {
    return concat(staticClass, stringifyClass(dynamicClass))
  }
  /* istanbul ignore next */
  return ''
}
// 合并字符串
export function concat(a?: string | null, b?: string | null): string {
  return a ? (b ? a + ' ' + b : a) : b || ''
}

export function stringifyClass(value: any): string {
  if (Array.isArray(value)) {
    return stringifyArray(value)
  }
  if (isObject(value)) {
    return stringifyObject(value)
  }
  if (typeof value === 'string') {
    return value
  }
  /* istanbul ignore next */
  return ''
}

function stringifyArray(value: Array<any>): string {
  let res = ''
  let stringified
  for (let i = 0, l = value.length; i < l; i++) {
    if (isDef((stringified = stringifyClass(value[i]))) && stringified !== '') {
      if (res) res += ' '
      res += stringified
    }
  }
  return res
}

function stringifyObject(value: Object): string {
  let res = ''
  for (const key in value) {
    if (value[key]) {
      if (res) res += ' '
      res += key
    }
  }
  return res
}
