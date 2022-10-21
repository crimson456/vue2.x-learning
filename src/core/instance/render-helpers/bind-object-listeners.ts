import { warn, extend, isPlainObject } from 'core/util/index'
import type { VNodeData } from 'types/vnode'


// 将v-on的对象形式写法的事件添加到data数据上
export function bindObjectListeners(data: any, value: any): VNodeData {
  if (value) {
    // v-on对象形式如果值不为对象则提示
    if (!isPlainObject(value)) {
      __DEV__ && warn('v-on without argument expects an Object value', this)
    } 
    else {
      // 在on上拼接事件队列
      const on = (data.on = data.on ? extend({}, data.on) : {})
      for (const key in value) {
        const existing = on[key]
        const ours = value[key]
        on[key] = existing ? [].concat(existing, ours) : ours
      }
    }
  }
  return data
}
