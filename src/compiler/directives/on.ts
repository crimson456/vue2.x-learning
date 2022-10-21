// 此处是处理 v-on=xxx 的情况

import { warn } from 'core/util/index'
import { ASTDirective, ASTElement } from 'types/compiler'

export default function on(el: ASTElement, dir: ASTDirective) {
  // v-on的对象写法不支持修饰符的提示
  if (__DEV__ && dir.modifiers) {
    warn(`v-on without argument does not support modifiers.`)
  }
  el.wrapListeners = (code: string) => `_g(${code},${dir.value})`
}
