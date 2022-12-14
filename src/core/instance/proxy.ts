/**
 * initProxy()：对vm创建了一个Proxy，拦截渲染时访问vm上的属性，以处理属性不存在的情况
 */



/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'

let initProxy

if (__DEV__) {
  // 允许使用的全局对象和变量
  const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
      'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
      'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,' +
      'require' // for Webpack/Browserify
  )
  // 提示属性不存在
  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
        'referenced during render. Make sure that this property is reactive, ' +
        'either in the data option, or for class-based components, by ' +
        'initializing the property. ' +
        'See: https://v2.vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
      target
    )
  }
  // 提示属性在$data字段下
  const warnReservedPrefix = (target, key) => {
    warn(
      `Property "${key}" must be accessed with "$data.${key}" because ` +
        'properties starting with "$" or "_" are not proxied in the Vue instance to ' +
        'prevent conflicts with Vue internals. ' +
        'See: https://v2.vuejs.org/v2/api/#data',
      target
    )
  }

  const hasProxy = typeof Proxy !== 'undefined' && isNative(Proxy)

  if (hasProxy) {
    const isBuiltInModifier = makeMap(
      'stop,prevent,self,ctrl,shift,alt,meta,exact'
    )
    // 对默认的config下的keyCodes字段设置作拦截，如果是内置的键位名则提示不允许修改
    config.keyCodes = new Proxy(config.keyCodes, {
      set(target, key: string, value) {
        if (isBuiltInModifier(key)) {
          warn(
            `Avoid overwriting built-in modifier in config.keyCodes: .${key}`
          )
          return false
        } else {
          target[key] = value
          return true
        }
      }
    })
  }

  // 两个处理函数功能都是拦截render函数中访问vm下的属性，如果访问的属性不存在或者在$data上就做出提示
  const hasHandler = {
    has(target, key) {
      // key为访问的属性，target为访问的目标
      // has判断目标上是否有此字段
      const has = key in target
      // 如果 key 在 allowedGlobals 之内，或者 key 是以下划线 _ 开头且不在对象(vm._renderProxy)的$data字段下的字符串，则为真
      // allowedGlobals中包含浏览器全局定义的一些对象和常量
      const isAllowed = allowedGlobals(key) || (typeof key === 'string' && key.charAt(0) === '_' && !(key in target.$data))
      // 如果没有此字段并且key为非法字段
      if (!has && !isAllowed) {
        // 提示在$data字段上，访问需要添加$data字段
        if (key in target.$data) warnReservedPrefix(target, key)
        // 提示目标不存在此属性
        else warnNonPresent(target, key)
      }
      return has || !isAllowed
    }
  }

  const getHandler = {
    get(target, key) {
      // 如果访问的属性key不在目标对象上做出提示
      if (typeof key === 'string' && !(key in target)) {
        // 提示在$data字段上，访问需要添加$data字段
        if (key in target.$data) warnReservedPrefix(target, key)
        // 提示目标不存在此属性
        else warnNonPresent(target, key)
      }
      return target[key]
    }
  }

  initProxy = function initProxy(vm) {
    // 判断是否支持Proxy语法
    if (hasProxy) {
      // determine which proxy handler to use
      const options = vm.$options
      // 表示使用那种拦截方式
      // 一般来说除了手写添加，_withStripped为false，使用hasHandler拦截,拦截的是with(vm){}语法
      // vue-loader配合单文件组件编译时为true，使用getHandler拦截，拦截的是普通取值操作
      const handlers = options.render && options.render._withStripped ? getHandler : hasHandler
      vm._renderProxy = new Proxy(vm, handlers)
    } else {
      vm._renderProxy = vm
    }
  }
}

export { initProxy }
