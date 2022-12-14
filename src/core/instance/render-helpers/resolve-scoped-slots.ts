import type { ScopedSlotsData } from 'types/vnode'
import { isArray } from 'core/util'

// _u( [${generatedSlots}] , null , false , ${hash(generatedSlots)} )
// 解析作用域插槽的代码
// 返回值的形式为： { $stable:xxx, $key:xxx, slotTarget:fn, ... }
export function resolveScopedSlots(
  fns: ScopedSlotsData,                                //此项为 { key:xxx, fn:xxx } 对象，或以此对象为成员的数组 组成的数组
  res?: Record<string, any>,                           //此项为结果，用于递归调用时生成在一个结果中
  // the following are added in 2.6
  hasDynamicKeys?: boolean,                            //此项用于判断结果对象是否稳定，在解析时是否可以沿用
  contentHashKey?: number                              //此项为以第一个参数生成的hash值
): { $stable: boolean } & { [key: string]: Function } {
  // ??? 似乎是某些情况如动态slot名或者有条件渲染的情况更新时需要此标志位进行判断
  res = res || { $stable: !hasDynamicKeys }
  // 遍历数组每一项
  for (let i = 0; i < fns.length; i++) {
    const slot = fns[i]
    // 对成员为 [{ key:xxx, fn:xxx },{ key:xxx, fn:xxx }...] 数组的情况进行递归调用，主要是有v-for指令的插槽中会返回数组
    if (isArray(slot)) {
      resolveScopedSlots(slot, res, hasDynamicKeys)
    } 
    // 对成员为 { key:xxx, fn:xxx } 的情况，此分支为主逻辑
    else if (slot) {
      // marker for reverse proxying v-slot without scope on this.$slots
      // @ts-expect-error
      // 将proxy字段挂载fn下
      if (slot.proxy) {
        // @ts-expect-error
        slot.fn.proxy = true
      }
      // 将fns对象中所有的作用域插槽展开，以slotTarget为成员名，插槽的render函数为成员值放入res对象中
      res[slot.key] = slot.fn
    }
  }
  // 在$key字段上保存一个hash值
  if (contentHashKey) {
    ;(res as any).$key = contentHashKey
  }
  return res as any
}
