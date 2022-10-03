/*
initGlobalAPI扩展的属性方法：
Vue.config                  
Vue.util              暴露一些内部方法
  Vue.util.warn
  Vue.util.extend
  Vue.util.mergeOptions
  Vue.util.defineReactive
Vue.set
Vue.delete
Vue.nextTick                
Vue.observable    通过observe()方法观察某个对象
Vue.options
  Vue.options.components
    Vue.options.components.keepAlive   内置的keepAlive组件
  Vue.options.directives
  Vue.options.filters
  Vue.options._base      定义一个全局的位置获取Vue构造函数

Vue.use 下载插件
Vue.mixin 合并选项(通过mergeOptions())
Vue.extend 扩展一个Vue的子类并返回

Vue.component 用Vue.extend扩展一个子类并记录在Vue.options.components下
Vue.directive
Vue.filter

*/

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'
import type { GlobalAPI } from 'types/global-api'

export function initGlobalAPI(Vue: GlobalAPI) {
  // config
  const configDef: Record<string, any> = {}
  configDef.get = () => config
  if (__DEV__) {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  /*
  暴露了内部的几个方法
    warn：用于？？
    extend：简单的合并对象
    mergeOptions：用自定义的策略合并选项
    defineReactive：将对象的一个成员定义为响应式的
  */
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  //ASSET_TYPES:['component', 'directive', 'filter']
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue

  //扩展内置的组件，keepAlive
  extend(Vue.options.components, builtInComponents)

  initUse(Vue)
  initMixin(Vue)
  initExtend(Vue)
  initAssetRegisters(Vue)
}
