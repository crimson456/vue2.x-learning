/**

_c(tag,attrs,children,normalizationType)   createElement   创建元素节点

_s(value)  toString            转化为字符串(序列化)
_p(eventName,symbol)   prependModifier           修饰符给动态事件名添加前缀
_k(eventKeyCode,key,builtInKeyCode,eventKeyName,builtInKeyName)     checkKeyCodes        对比按键和事件绑定的键位并返回布尔值表示匹配是否成功
_n(value)      toNumber             转化为数字
_i(arr,value)           looseIndexOf                   返回 value 在 arr 中的索引
_q(value1,value2)        looseEqual                 对比两个值的形状(对象都有对应项或数组长度相同)相同就为true
_b(data,tag,value,asProp,isSync)       bindObjectProps       将第三个参数上的属性附加到第一个属性的attrs等字段上，用于 v-bind的对象写法合并到data对象上 和 v-bind的动态属性名属性合并一个空对象后合并到data对象上
_d(baseObj,value)         bindDynamicKeys                将第二个参数的数组每两项组成一个字段合并到第一项，用于将动态属性名的属性(事件)合并到普通属性名的属性(事件)的对象上
_g(data,value)       bindObjectListeners            将第二参数上的属性合并到第一个参数的on字段下，用于将v-on的对象写法合并到data上
_o(tree,index,key)       markOnce                     会在render()函数执行后生成的VNode上添加静态标记，区分optimize添加的静态标记是在ast上
_l(val,render)          renderList                    遍历val的每一项传入每一项的参数执行同一个render，用于生成v-for的代码
_t(slotName,fallback,props,bindObj)               renderSlot                根据组件上的$slot和$scopedSlots渲染插槽
_u(scopedSlotsData,res,hasDynamicKeys,contentHashKey)       resolveScopedSlots         用于生成虚拟节点的data.scopedSlots字段的值
_m(index,isInFor)                  renderStatic                   


 */


import { toNumber, toString, looseEqual, looseIndexOf } from 'shared/util'
import { createTextVNode, createEmptyVNode } from 'core/vdom/vnode'
import { renderList } from './render-list'
import { renderSlot } from './render-slot'
import { resolveFilter } from './resolve-filter'
import { checkKeyCodes } from './check-keycodes'
import { bindObjectProps } from './bind-object-props'
import { renderStatic, markOnce } from './render-static'
import { bindObjectListeners } from './bind-object-listeners'
import { resolveScopedSlots } from './resolve-scoped-slots'
import { bindDynamicKeys, prependModifier } from './bind-dynamic-keys'

export function installRenderHelpers(target: any) {
  target._o = markOnce                       x
  target._n = toNumber                       x
  target._s = toString                       x
  target._l = renderList                     x
  target._t = renderSlot                     x
  target._q = looseEqual                     x
  target._i = looseIndexOf                   x
  target._m = renderStatic                   
  target._f = resolveFilter                  
  target._k = checkKeyCodes                  x
  target._b = bindObjectProps                x
  target._v = createTextVNode                
  target._e = createEmptyVNode               
  target._u = resolveScopedSlots             x
  target._g = bindObjectListeners            x
  target._d = bindDynamicKeys                x
  target._p = prependModifier                x
}
