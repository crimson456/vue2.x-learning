import config from 'core/config'

import {
  warn,
  isObject,
  toObject,
  isReservedAttribute,
  camelize,
  hyphenate,
  isArray
} from 'core/util/index'
import type { VNodeData } from 'types/vnode'

/**
 * Runtime helper for merging v-bind="object" into a VNode's data.
 */
// _d({name1:value1,name2:value2....},[name3,value3,name4,value4....])
// _b(${code},'${el.tag}',${dir.value},
// _b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})
// 将第三个参数上的属性附加到第一个属性的attrs等字段上，用于将动态绑定的属性附加在data对象上
export function bindObjectProps(
  data: any,
  tag: string,
  value: any,
  asProp: boolean,
  isSync?: boolean
): VNodeData {
  if (value) {
    // 动态绑定的值没有参数且值不是对象或数组的警告   v-bind
    if (!isObject(value)) {
      __DEV__ &&
        warn('v-bind without argument expects an Object or Array value', this)
    } else {
      // 绑定的值如果是数组则合并将数组每一项为一个对象
      if (isArray(value)) {
        value = toObject(value)
      }
      let hash
      for (const key in value) {
        // 保留属性包括key,ref,slot,slot-scope,is
        // 此处hash为存储对应属性的对象，一些在data对象下，一些在data.attrs下
        if (key === 'class' || key === 'style' || isReservedAttribute(key)) {
          hash = data
        } 
        else {
          const type = data.attrs && data.attrs.type
          hash =
            asProp || config.mustUseProp(tag, type, key)
              ? data.domProps || (data.domProps = {})
              : data.attrs || (data.attrs = {})
        }
        // 在存储对象下将对应的动态名的值缓存起来
        const camelizedKey = camelize(key)
        const hyphenatedKey = hyphenate(key)
        if (!(camelizedKey in hash) && !(hyphenatedKey in hash)) {
          hash[key] = value[key]

          if (isSync) {
            const on = data.on || (data.on = {})
            on[`update:${key}`] = function ($event) {
              value[key] = $event
            }
          }
        }
      }
    }
  }
  return data
}
