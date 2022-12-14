import { getStyle, normalizeStyleBinding } from 'web/util/style'
import {
  cached,
  camelize,
  extend,
  isDef,
  isUndef,
  hyphenate
} from 'shared/util'
import type { VNodeWithData } from 'types/vnode'

const cssVarRE = /^--/
const importantRE = /\s*!important$/
// 调用dom方法设置style
const setProp = (el, name, val) => {
  /* istanbul ignore if */
  if (cssVarRE.test(name)) {
    el.style.setProperty(name, val)
  } else if (importantRE.test(val)) {
    el.style.setProperty(
      hyphenate(name),
      val.replace(importantRE, ''),
      'important'
    )
  } else {
    const normalizedName = normalize(name)
    if (Array.isArray(val)) {
      // Support values array created by autoprefixer, e.g.
      // {display: ["-webkit-box", "-ms-flexbox", "flex"]}
      // Set them one by one, and the browser will only set those it can recognize
      for (let i = 0, len = val.length; i < len; i++) {
        el.style[normalizedName!] = val[i]
      }
    } else {
      el.style[normalizedName!] = val
    }
  }
}

const vendorNames = ['Webkit', 'Moz', 'ms']

let emptyStyle
// 规范化style属性的名称
const normalize = cached(function (prop) {
  emptyStyle = emptyStyle || document.createElement('div').style
  prop = camelize(prop)
  if (prop !== 'filter' && prop in emptyStyle) {
    return prop
  }
  const capName = prop.charAt(0).toUpperCase() + prop.slice(1)
  // 添加前缀
  for (let i = 0; i < vendorNames.length; i++) {
    const name = vendorNames[i] + capName
    if (name in emptyStyle) {
      return name
    }
  }
})

// 更新dom上的style
function updateStyle(oldVnode: VNodeWithData, vnode: VNodeWithData) {
  const data = vnode.data
  const oldData = oldVnode.data
  // 如果都不存在内联内联style直接返回
  if (
    isUndef(data.staticStyle) &&
    isUndef(data.style) &&
    isUndef(oldData.staticStyle) &&
    isUndef(oldData.style)
  ) {
    return
  }

  let cur, name
  const el: any = vnode.elm
  const oldStaticStyle: any = oldData.staticStyle
  const oldStyleBinding: any = oldData.normalizedStyle || oldData.style || {}

  // if static style exists, stylebinding already merged into it when doing normalizeStyleData
  const oldStyle = oldStaticStyle || oldStyleBinding
  // 将style转化为对象形式
  const style = normalizeStyleBinding(vnode.data.style) || {}

  // store normalized style under a different key for next diff
  // make sure to clone it if it's reactive, since the user likely wants
  // to mutate it.
  vnode.data.normalizedStyle = isDef(style.__ob__) ? extend({}, style) : style

  // 获取当前标签的style属性(包括上层组件和下层组件)
  const newStyle = getStyle(vnode, true)

  // 移除新节点中没有的旧style属性
  for (name in oldStyle) {
    if (isUndef(newStyle[name])) {
      setProp(el, name, '')
    }
  }
  // 更新新节点的style属性
  for (name in newStyle) {
    cur = newStyle[name]
    if (cur !== oldStyle[name]) {
      // ie9 setting to null has no effect, must use empty string
      setProp(el, name, cur == null ? '' : cur)
    }
  }
}

export default {
  create: updateStyle,
  update: updateStyle
}
