import { isDef, isUndef, extend, toNumber, isTrue } from 'shared/util'
import type { VNodeWithData } from 'types/vnode'
import { isSVG } from 'web/util/index'

let svgContainer

// 更新真实DOM的properties属性
function updateDOMProps(oldVnode: VNodeWithData, vnode: VNodeWithData) {
  // 新旧节点都不存在data.domProps字段直接返回
  if (isUndef(oldVnode.data.domProps) && isUndef(vnode.data.domProps)) {
    return
  }
  let key, cur
  const elm: any = vnode.elm
  const oldProps = oldVnode.data.domProps || {}
  let props = vnode.data.domProps || {}
  // clone observed objects, as the user probably wants to mutate it
  // ???
  if (isDef(props.__ob__) || isTrue(props._v_attr_proxy)) {
    props = vnode.data.domProps = extend({}, props)
  }
  // 删除DOM上多余的旧属性
  for (key in oldProps) {
    if (!(key in props)) {
      elm[key] = ''
    }
  }
  // 处理新的DOM属性
  for (key in props) {
    cur = props[key]
    // ignore children if the node has textContent or innerHTML,
    // as these will throw away existing DOM nodes and cause removal errors
    // on subsequent patches (#3360)

    // textContent、innerHTML的处理：删除子节点
    if (key === 'textContent' || key === 'innerHTML') {
      if (vnode.children) vnode.children.length = 0
      if (cur === oldProps[key]) continue
      // #6601 work around Chrome version <= 55 bug where single textNode
      // replaced by innerHTML/textContent retains its parentNode property
      if (elm.childNodes.length === 1) {
        elm.removeChild(elm.childNodes[0])
      }
    }
    // 如果值为value，且不为progress标签的处理:在真实节点的_value字段上挂载原值，value字段上进行判断后挂载字符串值
    if (key === 'value' && elm.tagName !== 'PROGRESS') {
      // store value as _value as well since
      // non-string values will be stringified
      elm._value = cur
      // avoid resetting cursor position when value is the same
      const strCur = isUndef(cur) ? '' : String(cur)
      // ???
      if (shouldUpdateValue(elm, strCur)) {
        elm.value = strCur
      }
    } 
    // svg元素的innerHTML属性的IE兼容处理
    else if (
      key === 'innerHTML' &&
      isSVG(elm.tagName) &&
      isUndef(elm.innerHTML)
    ) {
      // IE doesn't support innerHTML for SVG elements
      svgContainer = svgContainer || document.createElement('div')
      svgContainer.innerHTML = `<svg>${cur}</svg>`
      const svg = svgContainer.firstChild
      while (elm.firstChild) {
        elm.removeChild(elm.firstChild)
      }
      while (svg.firstChild) {
        elm.appendChild(svg.firstChild)
      }
    } 
    // 新旧值不相同的处理(相同的情况直接跳过不进行处理):DOM赋值
    else if (
      // skip the update if old and new VDOM state is the same.
      // `value` is handled separately because the DOM value may be temporarily
      // out of sync with VDOM state due to focus, composition and modifiers.
      // This  #4521 by skipping the unnecessary `checked` update.
      cur !== oldProps[key]
    ) {
      // some property updates can throw
      // e.g. `value` on <progress> w/ non-finite value
      try {
        elm[key] = cur
      } catch (e: any) {}
    }
  }
}

// check platforms/web/util/attrs.js acceptValue
type acceptValueElm = HTMLInputElement | HTMLSelectElement | HTMLOptionElement

// 判断value值是否需要更新???
function shouldUpdateValue(elm: acceptValueElm, checkVal: string): boolean {
  return (
    //@ts-expect-error
    !elm.composing &&
    (elm.tagName === 'OPTION' ||
      isNotInFocusAndDirty(elm, checkVal) ||
      isDirtyWithModifiers(elm, checkVal))
  )
}

function isNotInFocusAndDirty(elm: acceptValueElm, checkVal: string): boolean {
  // return true when textbox (.number and .trim) loses focus and its value is
  // not equal to the updated value
  let notInFocus = true
  // #6157
  // work around IE bug when accessing document.activeElement in an iframe
  try {
    notInFocus = document.activeElement !== elm
  } catch (e: any) {}
  return notInFocus && elm.value !== checkVal
}

function isDirtyWithModifiers(elm: any, newVal: string): boolean {
  const value = elm.value
  const modifiers = elm._vModifiers // injected by v-model runtime
  if (isDef(modifiers)) {
    if (modifiers.number) {
      return toNumber(value) !== toNumber(newVal)
    }
    if (modifiers.trim) {
      return value.trim() !== newVal.trim()
    }
  }
  return value !== newVal
}

export default {
  create: updateDOMProps,
  update: updateDOMProps
}
 