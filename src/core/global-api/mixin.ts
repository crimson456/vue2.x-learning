/*
挂载Vue.mixin()
Vue.mixin():通过mergeOptions()方法合并传入的options，自定义的策略

*/

import type { GlobalAPI } from 'types/global-api'
import { mergeOptions } from '../util/index'

export function initMixin(Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
