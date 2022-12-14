import { isDef, isUndef } from 'shared/util'
import type { VNodeData } from 'types/vnode'

import { concat, stringifyClass, genClassForVnode } from 'web/util/index'

// 更新节点上的class
function updateClass(oldVnode: any, vnode: any) {
  const el = vnode.elm
  const data: VNodeData = vnode.data
  const oldData: VNodeData = oldVnode.data
  // 新旧节点没有定义类则直接返回
  if (
    isUndef(data.staticClass) &&
    isUndef(data.class) &&
    (isUndef(oldData) ||
      (isUndef(oldData.staticClass) && isUndef(oldData.class)))
  ) {
    return
  }
  // 获得动态静态绑定的class组成的字符串
  let cls = genClassForVnode(vnode)

  // handle transition classes
  // ???似乎是transition组件的class合并
  const transitionClass = el._transitionClasses
  if (isDef(transitionClass)) {
    cls = concat(cls, stringifyClass(transitionClass))
  }

  // set the class
  // 设置DOM元素上的class
  if (cls !== el._prevClass) {
    el.setAttribute('class', cls)
    el._prevClass = cls
  }
}

export default {
  create: updateClass,
  update: updateClass
}
