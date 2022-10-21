import { isObject, isDef, hasSymbol, isArray } from 'core/util/index'
import VNode from 'core/vdom/vnode'

/**
 * Runtime helper for rendering v-for lists.
 */
//  `_l(exp,function(alias,iterator1,iterator2){return block_render()}))`

// 生成包裹v-for中每项render函数的代码，执行结果会返回一个节点数组
// 调用后会生成v-for元素的节点数组
export function renderList(
  val: any,
  render: (val: any, keyOrIndex: string | number, index?: number) => VNode
): Array<VNode> | null {
  let ret: Array<VNode> | null = null,
    i,
    l,
    keys,
    key
  // 处理遍历的值为数组的情况
  if (isArray(val) || typeof val === 'string') {
    ret = new Array(val.length)
    for (i = 0, l = val.length; i < l; i++) {
      ret[i] = render(val[i], i)
    }
  } 
  // 处理遍历的值为数字的情况
  else if (typeof val === 'number') {
    ret = new Array(val)
    for (i = 0; i < val; i++) {
      ret[i] = render(i + 1, i)
    }
  } 
  // 处理遍历的值为对象的情况
  else if (isObject(val)) {
    if (hasSymbol && val[Symbol.iterator]) {
      ret = []
      const iterator: Iterator<any> = val[Symbol.iterator]()
      let result = iterator.next()
      while (!result.done) {
        ret.push(render(result.value, ret.length))
        result = iterator.next()
      }
    } else {
      keys = Object.keys(val)
      ret = new Array(keys.length)
      for (i = 0, l = keys.length; i < l; i++) {
        key = keys[i]
        ret[i] = render(val[key], key, i)
      }
    }
  }
  if (!isDef(ret)) {
    ret = []
  }
  ;(ret as any)._isVList = true
  return ret
}
