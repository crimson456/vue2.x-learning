import {
  tip,
  hasOwn,
  isDef,
  isUndef,
  hyphenate,
  formatComponentName
} from 'core/util/index'
import type { Component } from 'types/component'
import type { VNodeData } from 'types/vnode'


// 遍历options.props，在data对象下的attrs、props字段对应值，并返回结果对象
// eg.  组件定义时:  props:['a','b','c']     ---->       返回值为   {a:xxx,b:xxx,c:xxx}
// 并且对驼峰命名做了兼容，对小写形式做了警告
export function extractPropsFromVNodeData(
  data: VNodeData,
  Ctor: typeof Component,
  tag?: string
): object | undefined {
  // we are only extracting raw values here.
  // validation and default values are handled in the child
  // component itself.
  const propOptions = Ctor.options.props
  if (isUndef(propOptions)) {
    return
  }
  const res = {}
  const { attrs, props } = data
  if (isDef(attrs) || isDef(props)) {
    // 遍历options.props中的每一个值
    for (const key in propOptions) {
      const altKey = hyphenate(key)
      if (__DEV__) {
        const keyInLowerCase = key.toLowerCase()
        if (key !== keyInLowerCase && attrs && hasOwn(attrs, keyInLowerCase)) {
          tip(
            `Prop "${keyInLowerCase}" is passed to component ` +
              `${formatComponentName(
                // @ts-expect-error tag is string
                tag || Ctor
              )}, but the declared prop name is` +
              ` "${key}". ` +
              `Note that HTML attributes are case-insensitive and camelCased ` +
              `props need to use their kebab-case equivalents when using in-DOM ` +
              `templates. You should probably use "${altKey}" instead of "${key}".`
          )
        }
      }
      // 将props和attrs中对应的key或altkey的只放入res中，props中保留对应字段，attrs中删除
      checkProp(res, props, key, altKey, true) ||
        checkProp(res, attrs, key, altKey, false)
    }
  }
  return res
}

// 将hash中对应key或altKey的字段存入res中，第五个参数表示是否在原hash对象中保留对应字段
function checkProp(
  res: Object,
  hash: Object | undefined,
  key: string,
  altKey: string,
  preserve: boolean
): boolean {
  if (isDef(hash)) {
    if (hasOwn(hash, key)) {
      res[key] = hash[key]
      if (!preserve) {
        delete hash[key]
      }
      return true
    } else if (hasOwn(hash, altKey)) {
      res[key] = hash[altKey]
      if (!preserve) {
        delete hash[altKey]
      }
      return true
    }
  }
  return false
}
