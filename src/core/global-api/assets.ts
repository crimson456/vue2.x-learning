/*
Vue.component()：调用Vue.extend()将定义处理为构造函数，并在Vue.options.components上挂载组件的构造函数


Vue.directive
Vue.filter
同理也是处理后挂载在Vue.options上

*/



import { ASSET_TYPES } from 'shared/constants'
import type { GlobalAPI } from 'types/global-api'
import { isFunction, isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters(Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  ASSET_TYPES.forEach(type => {
    // @ts-expect-error function is not exact same type
    Vue[type] = function (
      id: string,
      definition?: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (__DEV__ && type === 'component') {
          validateComponentName(id)
        }
        // 组件的同步写法(第二个参数为一个options对象)，通过Vue.extend处理为子类构造函数存入
        if (type === 'component' && isPlainObject(definition)) {
          // @ts-expect-error
          definition.name = definition.name || id
          definition = this.options._base.extend(definition)
        }
        if (type === 'directive' && isFunction(definition)) {
          definition = { bind: definition, update: definition }
        }
        // 组件的异步写法(定义为工厂函数)，直接将工厂函数存入
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
