import {
  remove,
  isDef,
  hasOwn,
  isArray,
  isFunction,
  invokeWithErrorHandling,
  warn
} from 'core/util'
import type { VNodeWithData } from 'types/vnode'
import { Component } from 'types/component'
import { isRef } from 'v3'

export default {
  create(_: any, vnode: VNodeWithData) {
    registerRef(vnode)
  },
  update(oldVnode: VNodeWithData, vnode: VNodeWithData) {
    if (oldVnode.data.ref !== vnode.data.ref) {
      registerRef(oldVnode, true)
      registerRef(vnode)
    }
  },
  destroy(vnode: VNodeWithData) {
    registerRef(vnode, true)
  }
}

// 设置组件的$refs字段
export function registerRef(vnode: VNodeWithData, isRemoval?: boolean) {
  const ref = vnode.data.ref
  // 没有定义ref属性则直接返回
  if (!isDef(ref)) return

  // 获取节点所在的组件实例
  const vm = vnode.context
  // ref对应的值为当前组件实例，或者元素
  const refValue = vnode.componentInstance || vnode.elm
  // 如果是移除ref则定义为null
  const value = isRemoval ? null : refValue
  const $refsValue = isRemoval ? undefined : refValue

  // 如果ref定义为函数则直接调用并返回
  if (isFunction(ref)) {
    invokeWithErrorHandling(ref, vm, [value], vm, `template ref function`)
    return
  }

  const isFor = vnode.data.refInFor
  const _isString = typeof ref === 'string' || typeof ref === 'number'
  const _isRef = isRef(ref)
  const refs = vm.$refs

  // 如果ref字段为字符串或数字类型，或者对象类型下__v_isRef字段为true，则对ref进行处理
  if (_isString || _isRef) {
    // 在v-for指令中的ref
    // v-for指令和ref属性通用时，对应vm.$refs中的ref为数组
    if (isFor) {
      // 在$refs中查询对应的ref值的节点对象
      const existing = _isString ? refs[ref] : ref.value
      // 移除数组中对应ref值
      if (isRemoval) {
        isArray(existing) && remove(existing, refValue)
      } 
      // 修改或添加ref值
      else {
        // 如果不存在对应ref，则创建ref并处理为数组
        if (!isArray(existing)) {
          // 如果ref字段为字符串或数字类型的处理，
          if (_isString) {
            // 将ref处理为数组
            refs[ref] = [refValue]
            setSetupRef(vm, ref, refs[ref])
          } else {
            ref.value = [refValue]
          }
        } 
        // 如果存在对应ref且不重复，则向ref数组中推入当前组件实例或节点
        else if (!existing.includes(refValue)) {
          existing.push(refValue)
        }
      }
    } 
    // 没有在v-for指令中
    // ref为字符串或数字类型
    else if (_isString) {
      // 如果是移除的情况，且refs中对应ref值不为当前节点直接返回  ???为何
      if (isRemoval && refs[ref] !== refValue) {
        return
      }
      // 设值refs的值
      refs[ref] = $refsValue
      setSetupRef(vm, ref, value)
    } 
    // 对象类型下__v_isRef字段为true(似乎是v3中的用法)
    else if (_isRef) {
      if (isRemoval && ref.value !== refValue) {
        return
      }
      ref.value = value
    } 
    // 其他类型则报错
    else if (__DEV__) {
      warn(`Invalid template ref type: ${typeof ref}`)
    }
  }
}

// 似乎是对setup语法的ref的处理
function setSetupRef(
  { _setupState }: Component,
  key: string | number,
  val: any
) {
  if (_setupState && hasOwn(_setupState, key as string)) {
    if (isRef(_setupState[key])) {
      _setupState[key].value = val
    } else {
      _setupState[key] = val
    }
  }
}
