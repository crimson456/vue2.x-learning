import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  isArray,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering,
  hasChanged,
  noop
} from '../util/index'
import { isReadonly, isRef, TrackOpTypes, TriggerOpTypes } from '../../v3'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

const NO_INIITIAL_VALUE = {}

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving(value: boolean) {
  shouldObserve = value
}

// ssr mock dep
const mockDep = {
  notify: noop,
  depend: noop,
  addSub: noop,
  removeSub: noop
} as Dep

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  dep: Dep
  vmCount: number // number of vms that have this object as root $data
  
  constructor(public value: any, public shallow = false, public mock = false) {
    // this.value = value
    // 此处的dep用于数组方法中通知更新
    this.dep = mock ? mockDep : new Dep()
    this.vmCount = 0
    // 为对象挂载 __ob__ 字段
    def(value, '__ob__', this)
    // 被观察的对象为数组的情况
    if (isArray(value)) {
      if (!mock) {
        // 有原型的情况,在原型上挂载方法
        if (hasProto) {
          /* eslint-disable no-proto */
          ;(value as any).__proto__ = arrayMethods
          /* eslint-enable no-proto */
        } 
        // 没有原型的情况下,在对象的上直接定义方法
        else {
          for (let i = 0, l = arrayKeys.length; i < l; i++) {
            const key = arrayKeys[i]
            def(value, key, arrayMethods[key])
          }
        }
      }
      // 深层观察的情况,递归观察数组每一个成员
      if (!shallow) {
        this.observeArray(value)
      }
    } 
    // 被观察的对象为普通对象的情况
    else {
      /**
       * Walk through all properties and convert them into
       * getter/setters. This method should only be called when
       * value type is Object.
       */
      // 对对象的每个成员调用defineReactive
      const keys = Object.keys(value)
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        defineReactive(value, key, NO_INIITIAL_VALUE, undefined, shallow, mock)
      }
    }
  }

  /**
   * Observe a list of Array items.
   */
  // 递归观察数组的每一个成员
  observeArray(value: any[]) {
    for (let i = 0, l = value.length; i < l; i++) {
      observe(value[i], false, this.mock)
    }
  }
}

// helpers

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// 观察一个对象，递归为对象或数组类型的成员创建 __ob__ 字段
// 注意观察一个对象会创建两种dep实例
// 1.每个成员都会在defineReactive函数闭包中存在一个Dep实例                    此实例用于 修改 时的收集依赖和派发更新
// 2.每个对象、数组成员(或者对象本身)的 __ob__ 字段下会存在一个Dep实例         此实例用于 数组方法调用、修改 时的收集依赖和 数组方法调用、增删($set、$delete) 时的派发更新
export function observe(
  value: any,
  shallow?: boolean,
  ssrMockReactivity?: boolean
): Observer | void {
  // 要观察的值不为对象或者是ref或者为虚拟节点时不进行处理
  if (!isObject(value) || isRef(value) || value instanceof VNode) {
    return
  }

  let ob: Observer | void
  // 对象上已经被观察(定义__ob__字段为Observer实例)则直接获取此实例
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } 
  // 对象没有被观察,且是应该被观察的情况，创建Observer实例
  else if (
    shouldObserve &&
    (ssrMockReactivity || !isServerRendering()) &&
    (isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value.__v_skip /* ReactiveFlags.SKIP */
  ) {
    ob = new Observer(value, shallow, ssrMockReactivity)
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
// 定义对象上的一个响应式成员
export function defineReactive(
  obj: object,
  key: string,
  val?: any,
  customSetter?: Function | null,
  shallow?: boolean,
  mock?: boolean
) {
  // 每个成员都在闭包中创建一个Dep实例
  // 此处的dep实例存放的读取当前成员值(或子孙成员)产生的依赖
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  // 属性不可配置直接返回
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // 获取原本的getter和setter
  const getter = property && property.get
  const setter = property && property.set
  // 获取对象上对应key值的value值(因为可能不传入)
  if ((!getter || setter) &&(val === NO_INIITIAL_VALUE || arguments.length === 2) ) {
    val = obj[key]
  }
  // 递归观察对象下的成员
  let childOb = !shallow && observe(val, false, mock)
  // 自定义getter和setter进行依赖收集
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // 此处getter和setter注意：如果成员是对象，更改成员对象下的属性(也就是修改深层的属性)也会触发外层的setter和getter，触发依赖收集 
    get: function reactiveGetter() {
      // 调用原本getter
      const value = getter ? getter.call(obj) : val
      // 触发当前属性的依赖收集
      if (Dep.target) {
        // 此处的dep是每个成员闭包中的dep
        // 此处dep收集对象成员修改时需要的依赖
        if (__DEV__) {
          dep.depend({
            target: obj,
            type: TrackOpTypes.GET,
            key
          })
        } else {
          dep.depend()
        }
        // 此处的dep是对象类型成员才有的dep，Observer实例的dep
        // 此处dep收集数组方法修改和$set、$delete方法时需要的依赖
        if (childOb) {
          childOb.dep.depend()
          // 成员值为数组或高阶数组的情况，递归内部所有成员的 __ob__.dep 进行依赖收集
          // 理解：数组成员被读取时，要把数组中的每一项都递归添加上依赖，因为用重写的数组方法修改数组时，需要触发所有使用了此数组的依赖
          if (isArray(value)) {
            dependArray(value)
          }
        }
      }
      // 此处在非ref的定义中返回value
      return isRef(value) && !shallow ? value.value : value
    },
    set: function reactiveSetter(newVal) {
      // 调用原本getter获取原始值
      const value = getter ? getter.call(obj) : val
      // 对比不变则直接返回
      if (!hasChanged(value, newVal)) {
        return
      }
      // 调用自定义传出的setter函数
      if (__DEV__ && customSetter) {
        customSetter()
      }
      // 调用原本setter或者setter不存在的赋值
      if (setter) {
        setter.call(obj, newVal)
      } else if (getter) {
        // #7981: for accessor properties without setter
        return
      } else if (!shallow && isRef(value) && !isRef(newVal)) {
        value.value = newVal
        return
      } else {
        val = newVal
      }
      // 观察新值
      childOb = !shallow && observe(newVal, false, mock)
      // 通知dep上的渲染watcher更新，派发更新
      if (__DEV__) {
        dep.notify({
          type: TriggerOpTypes.SET,
          target: obj,
          key,
          newValue: newVal,
          oldValue: value
        })
      } else {
        dep.notify()
      }
    }
  })

  return dep
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
// 定义了$set方法，用于在对象上新增一个响应式成员，并触发对象 __ob__.dep Observer实例对象下的dep实例的notify方法派发更新
export function set<T>(array: T[], key: number, value: T): T
export function set<T>(object: object, key: string | number, value: T): T
export function set(
  target: any[] | Record<string, any>,
  key: any,
  val: any
): any {
  //处理undefined
  if (__DEV__ && (isUndef(target) || isPrimitive(target))) {
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${target}`
    )
  }
  //处理只读的属性
  if (isReadonly(target)) {
    __DEV__ && warn(`Set operation on key "${key}" failed: target is readonly.`)
    return
  }
  const ob = (target as any).__ob__
  //处理目标为数组:更改数组长度，调用改写过的方法触发添加响应式
  if (isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    // when mocking for SSR, array methods are not hijacked
    if (ob && !ob.shallow && ob.mock) {
      observe(val, false, true)
    }
    return val
  }
  //处理目标对象上已经有该属性的情况：直接赋值
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  //警告将Vue构造函数作为对象的情况
  if ((target as any)._isVue || (ob && ob.vmCount)) {
    __DEV__ &&
      warn(
        'Avoid adding reactive properties to a Vue instance or its root $data ' +
          'at runtime - declare it upfront in the data option.'
      )
    return val
  }
  //处理目标不被观察的情况：不进行响应式处理
  if (!ob) {
    target[key] = val
    return val
  }
  //处理为响应式并且触发依赖收集
  defineReactive(ob.value, key, val, undefined, ob.shallow, ob.mock)
  if (__DEV__) {
    ob.dep.notify({
      type: TriggerOpTypes.ADD,
      target: target,
      key,
      newValue: val,
      oldValue: undefined
    })
  } else {
    ob.dep.notify()
  }
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
// 定义了$delete方法，用于在对象上删除一个响应式成员，并触发对象 __ob__.dep Observer实例对象下的dep实例的notify方法派发更新
export function del<T>(array: T[], key: number): void
export function del(object: object, key: string | number): void
export function del(target: any[] | object, key: any) {
  //处理undefined
  if (__DEV__ && (isUndef(target) || isPrimitive(target))) {
    warn(
      `Cannot delete reactive property on undefined, null, or primitive value: ${target}`
    )
  }
  //处理数组的情况：调用重写的方法
  if (isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target as any).__ob__
  //警告将Vue构造函数作为对象的情况
  if ((target as any)._isVue || (ob && ob.vmCount)) {
    __DEV__ &&
      warn(
        'Avoid deleting properties on a Vue instance or its root $data ' +
          '- just set it to null.'
      )
    return
  }
  //处理只读的情况
  if (isReadonly(target)) {
    __DEV__ &&
      warn(`Delete operation on key "${key}" failed: target is readonly.`)
    return
  }
  //对象上没有该属性则返回
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  //不是响应式对象则什么也不做
  if (!ob) {
    return
  }
  //响应式对象触发依赖的视图更新
  if (__DEV__) {
    ob.dep.notify({
      type: TriggerOpTypes.DELETE,
      target: target,
      key
    })
  } else {
    ob.dep.notify()
  }
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
// 定义setter方法时值为数组或高阶数组时，触发所有数组下的所有Observer实例对象下的dep实例的depend方法收集依赖
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    if (e && e.__ob__) {
      e.__ob__.dep.depend()
    }
    if (isArray(e)) {
      dependArray(e)
    }
  }
}
