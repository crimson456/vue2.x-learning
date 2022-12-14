import { emptyNode } from 'core/vdom/patch'
import { resolveAsset, handleError } from 'core/util/index'
import { mergeVNodeHook } from 'core/vdom/helpers/index'
import type { VNodeDirective, VNodeWithData } from 'types/vnode'
import type { Component } from 'types/component'

export default {
  create: updateDirectives,
  update: updateDirectives,
  destroy: function unbindDirectives(vnode: VNodeWithData) {
    // @ts-expect-error emptyNode is not VNodeWithData
    updateDirectives(vnode, emptyNode)
  }
}

function updateDirectives(oldVnode: VNodeWithData, vnode: VNodeWithData) {
  // 如果老节点元素data.directives字段上有值，则进行更新
  if (oldVnode.data.directives || vnode.data.directives) {
    _update(oldVnode, vnode)
  }
}

function _update(oldVnode, vnode) {
  const isCreate = oldVnode === emptyNode
  const isDestroy = vnode === emptyNode
  // 获取新旧节点data上的其他指令
  // 格式为：{ rawName:{ name, rawName, value, arg, expression, modifiers, def } , ... }
  const oldDirs = normalizeDirectives(oldVnode.data.directives, oldVnode.context)
  const newDirs = normalizeDirectives(vnode.data.directives, vnode.context)

  const dirsWithInsert: any[] = []
  const dirsWithPostpatch: any[] = []

  let key, oldDir, dir
  // 遍历所有指令
  for (key in newDirs) {
    oldDir = oldDirs[key]
    dir = newDirs[key]
    // 旧节点中不存在对应指令的情况，挂载指令
    if (!oldDir) {
      // new directive, bind
      // 调用指令中的bind钩子
      callHook(dir, 'bind', vnode, oldVnode)
      if (dir.def && dir.def.inserted) {
        dirsWithInsert.push(dir)
      }
    } 
    // 旧节点中存在指令的情况，更新指令
    else {
      // existing directive, update
      dir.oldValue = oldDir.value
      dir.oldArg = oldDir.arg
      // 调用指令中的update钩子
      callHook(dir, 'update', vnode, oldVnode)
      if (dir.def && dir.def.componentUpdated) {
        dirsWithPostpatch.push(dir)
      }
    }
  }

  if (dirsWithInsert.length) {
    // 调用所有新节点中指令的inserted钩子
    const callInsert = () => {
      for (let i = 0; i < dirsWithInsert.length; i++) {
        callHook(dirsWithInsert[i], 'inserted', vnode, oldVnode)
      }
    }
    // 创建节点的情况将所有指令定义的inserted钩子放入节点的insert钩子函数队列中
    if (isCreate) {
      mergeVNodeHook(vnode, 'insert', callInsert)
    } 
    // 更新节点的情况直接调用所有新指令插入的inserted钩子
    else {
      callInsert()
    }
  }

  if (dirsWithPostpatch.length) {
    // 将所有指令定义的componentUpdated钩子放入节点的postpatch钩子函数队列中
    mergeVNodeHook(vnode, 'postpatch', () => {
      for (let i = 0; i < dirsWithPostpatch.length; i++) {
        callHook(dirsWithPostpatch[i], 'componentUpdated', vnode, oldVnode)
      }
    })
  }

  // 调用所有更新节点时去掉的指令的unbind钩子
  if (!isCreate) {
    for (key in oldDirs) {
      if (!newDirs[key]) {
        // no longer present, unbind
        callHook(oldDirs[key], 'unbind', oldVnode, oldVnode, isDestroy)
      }
    }
  }
}

const emptyModifiers = Object.create(null)

// 返回指令规范化的结果
// 结果为：{ rawName:{ name, rawName, value, arg, expression, modifiers, def } , ... }
function normalizeDirectives(
  dirs: Array<VNodeDirective> | undefined,
  vm: Component
): { [key: string]: VNodeDirective } {
  const res = Object.create(null)
  // data.directives不存在直接返回
  if (!dirs) {
    // $flow-disable-line
    return res
  }
  let i: number, dir: VNodeDirective
  for (i = 0; i < dirs.length; i++) {
    dir = dirs[i]
    // 处理修饰符不存在的情况
    if (!dir.modifiers) {
      // $flow-disable-line
      dir.modifiers = emptyModifiers
    }
    res[getRawDirName(dir)] = dir
    // setupAPI相关
    if (vm._setupState && vm._setupState.__sfc) {
      const setupDef = dir.def || resolveAsset(vm, '_setupState', 'v-' + dir.name)
      if (typeof setupDef === 'function') {
        dir.def = {
          bind: setupDef,
          update: setupDef,
        }
      } else {
        dir.def = setupDef
      }
    }
    dir.def = dir.def || resolveAsset(vm.$options, 'directives', dir.name, true)
  }
  // $flow-disable-line
  return res
}
// 获取指令未处理的名称(v-xxx.xxx.xxx,包括修饰符)
function getRawDirName(dir: VNodeDirective): string {
  return (
    dir.rawName || `${dir.name}.${Object.keys(dir.modifiers || {}).join('.')}`
  )
}

// 调用指令的对应的钩子
function callHook(dir, hook, vnode, oldVnode, isDestroy?: any) {
  const fn = dir.def && dir.def[hook]
  if (fn) {
    try {
      fn(vnode.elm, dir, vnode, oldVnode, isDestroy)
    } catch (e: any) {
      handleError(e, vnode.context, `directive ${dir.name} ${hook} hook`)
    }
  }
}
