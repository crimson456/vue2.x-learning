import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isArray,
  isObject,
  isFunction,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'
import type { Component } from 'types/component'

type PropOptions = {
  type: Function | Array<Function> | null
  default: any
  required?: boolean
  validator?: Function
}

// 对propsData做默认值的处理和类型监测
export function validateProp(
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  const prop = propOptions[key]
  // 获取propsData中对应的props值
  const absent = !hasOwn(propsData, key)
  let value = propsData[key]
  // boolean casting
  // 获取props类型验证数组中Boolean类型的索引
  const booleanIndex = getTypeIndex(Boolean, prop.type)

  // 此处似乎是做一些布尔类型检查的默认赋值
  // 声明props时类型检查有布尔值
  if (booleanIndex > -1) {
    // 如果传入的值不存在，且没有设置默认值，则将值置为false
    if (absent && !hasOwn(prop, 'default')) {
      value = false
    }
    // 如果传入的值存在或设置了默认值，且传入的值为空或为键名的xx-xx形式的字符串
    // eg. <x nameAbc="name-abc" age>
    else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      // 获取props类型验证数组中String类型的索引
      const stringIndex = getTypeIndex(String, prop.type)
      // 不允许String类型,或者String类型在Boolean类型之后
      // eg. [ Boolean , Arrary , String ]
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }
  // check default value
  // 添加默认值
  if (value === undefined) {
    // 获取默认值,如果重新渲染,直接获取上次渲染的默认值
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    // 观察新的默认props值
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    observe(value)
    toggleObserving(prevShouldObserve)
  }
  // 验证type和validator是否满足
  if (__DEV__) {
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue(
  vm: Component | undefined,
  prop: PropOptions,
  key: string
): any {
  // no default, return undefined
  // 没有定义默认值
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  // 警告对象或数组的默认值必须从一个工厂函数返回
  if (__DEV__ && isObject(def)) {
    warn(
      'Invalid default value for prop "' +
        key +
        '": ' +
        'Props with type Object/Array must use a factory function ' +
        'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  // ???  没有解析出新props的情况下,直接使用上一次的props的值   还未走到过
  if (
    vm &&
    vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // 执行工厂函数得到默认值
  return isFunction(def) && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 */
function assertProp(
  prop: PropOptions,
  name: string,
  value: any,
  vm?: Component,
  absent?: boolean
) {
  // 对定义有required字段但没有提供值的prop作出警告并返回
  if (prop.required && absent) {
    warn('Missing required prop: "' + name + '"', vm)
    return
  }
  // 如果没有定义required字段,且没有值则直接返回
  if (value == null && !prop.required) {
    return
  }
  let type = prop.type
  let valid = !type || (type as any) === true
  const expectedTypes: string[] = []
  if (type) {
    // 统一成数组形式
    if (!isArray(type)) {
      type = [type]
    }
    // 遍历数组，直到遇到合法的类型跳出循环
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i], vm)
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }
  // 似乎是用于验证是否存在type验证，如果存在才进行类型提示，因为valid默认为false，不加会直接进入判定
  // 不存在，再执行后方的validator验证
  const haveExpectedTypes = expectedTypes.some(t => t)
  if (!valid && haveExpectedTypes) {
    warn(getInvalidTypeMessage(name, value, expectedTypes), vm)
    return
  }
  // 执行validator的验证
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol|BigInt)$/

// 返回一个对象，包含类型是否相同，和比较的类型
function assertType(
  value: any,
  type: Function,
  vm?: Component
): {
  valid: boolean
  expectedType: string
} {
  let valid
  const expectedType = getType(type)
  // 验证类型是否相同，分为简单类别，对象，数组，其他构造函数
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = isArray(value)
  } else {
    try {
      valid = value instanceof type
    } catch (e: any) {
      warn('Invalid prop type: "' + String(type) + '" is not a constructor', vm)
      valid = false
    }
  }
  return {
    valid,
    expectedType
  }
}

const functionTypeCheckRE = /^\s*function (\w+)/

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
// 用于获取基础类型
//  Number.toString()     --->     function Number() { [native code] }
function getType(fn) {
  const match = fn && fn.toString().match(functionTypeCheckRE)
  return match ? match[1] : ''
}
// 比较两个类型是否相同
function isSameType(a, b) {
  return getType(a) === getType(b)
}

// 查询允许的props类型数组中对应类型的索引号,如果不存在，则为-1
// eg. props：{a:{type:[Boolean,String,...],required:true}}
function getTypeIndex(type, expectedTypes): number {
  if (!isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

// 拼接不合类型验证的警告字符串
function getInvalidTypeMessage(name, value, expectedTypes) {
  let message =
    `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    isExplicable(typeof value) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${styleValue(value, expectedType)}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${styleValue(value, receivedType)}.`
  }
  return message
}

function styleValue(value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

const EXPLICABLE_TYPES = ['string', 'number', 'boolean']
function isExplicable(value) {
  return EXPLICABLE_TYPES.some(elem => value.toLowerCase() === elem)
}

function isBoolean(...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
