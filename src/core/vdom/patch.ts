/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, { cloneVNode } from './vnode'
import config from '../config'
import { SSR_ATTR } from 'shared/constants'
import { registerRef } from './modules/template-ref'
import { traverse } from '../observer/traverse'
import { activeInstance } from '../instance/lifecycle'
import { isTextInputType } from 'web/util/element'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isArray,
  makeMap,
  isRegExp,
  isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, [])

const hooks = ['create', 'activate', 'update', 'remove', 'destroy']

// 比较两个节点是否相同
// 条件:key相同，且如果是异步组件则工厂函数相同，
function sameVnode(a, b) {
  return (
    a.key === b.key &&
    a.asyncFactory === b.asyncFactory &&
    ((a.tag === b.tag &&
      a.isComment === b.isComment &&
      isDef(a.data) === isDef(b.data) &&
      sameInputType(a, b)) ||
      (isTrue(a.isAsyncPlaceholder) && isUndef(b.asyncFactory.error)))
  )
}
// 对比input标签的type属性
function sameInputType(a, b) {
  if (a.tag !== 'input') return true
  let i
  const typeA = isDef((i = a.data)) && isDef((i = i.attrs)) && i.type
  const typeB = isDef((i = b.data)) && isDef((i = i.attrs)) && i.type
  return typeA === typeB || (isTextInputType(typeA) && isTextInputType(typeB))
}

// 创建第一个参数children中从beginIdx到endIdx之间所有key值为成员名index为成员值的对象
function createKeyToOldIdx(children, beginIdx, endIdx) {
  let i, key
  const map = {}
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key
    if (isDef(key)) map[key] = i
  }
  return map
}

export function createPatchFunction(backend) {
  let i, j
  const cbs: any = {}

  const { modules, nodeOps } = backend

  // 获得所有模块的钩子
  // 存放位置为：cbs.hookName，且为数组形式
  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]])
      }
    }
  }
  // 根据真实节点创建一个空的虚拟节点
  function emptyNodeAt(elm) {
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
  }
  // 返回一个rm函数对象，对象上存在一个数字类型listener，每次调用rm函数会让listeners减1，如果listeners减到0，则删除创建时传入的节点
  function createRmCb(childElm, listeners) {
    function remove() {
      if (--remove.listeners === 0) {
        removeNode(childElm)
      }
    }
    remove.listeners = listeners
    return remove
  }
  // 调用原生DOM方法删除节点
  function removeNode(el) {
    const parent = nodeOps.parentNode(el)
    // element may have already been removed due to v-html / v-text
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el)
    }
  }

  function isUnknownElement(vnode, inVPre) {
    return (
      !inVPre &&
      !vnode.ns &&
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag
        })
      ) &&
      config.isUnknownElement(vnode.tag)
    )
  }

  let creatingElmInVPre = 0

  // 创建元素???
  // 组件初次渲染时:createElm(vnode, insertedVnodeQueue)
  // 创建子节点时：createElm( children[i], insertedVnodeQueue, vnode.elm, null, true, children, i)
  // Vue挂载、或新旧组件不同时：createElm( vnode, insertedVnodeQueue, oldElm._leaveCb ? null : parentElm, nodeOps.nextSibling(oldElm))
  function createElm(
    vnode,
    insertedVnodeQueue,
    parentElm?: any,
    refElm?: any,
    nested?: any,
    ownerArray?: any,
    index?: any
  ) {
    // 如果节点已经存在真实DOM则需要将此节点进行克隆后再进行重写
    // 似乎是patch已经存在的真实节点可能会发生潜在错误
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // This vnode was used in a previous render!
      // now it's used as a new node, overwriting its elm would cause
      // potential patch errors down the road when it's used as an insertion
      // reference node. Instead, we clone the node on-demand before creating
      // associated DOM element for it.
      vnode = ownerArray[index] = cloneVNode(vnode)
    }
    // ???
    vnode.isRootInsert = !nested // for transition enter check

    // 如果是组件节点，则创建组件，其他节点什么也不做
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return
    }

    const data = vnode.data
    const children = vnode.children
    const tag = vnode.tag
    // 有标签名的节点
    if (isDef(tag)) {
      // 提示未知组件(配置文件中为no)
      if (__DEV__) {
        if (data && data.pre) {
          creatingElmInVPre++
        }
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          warn(
            'Unknown custom element: <' +
              tag +
              '> - did you ' +
              'register the component correctly? For recursive components, ' +
              'make sure to provide the "name" option.',
            vnode.context
          )
        }
      }

      // 创建元素挂载在elm字段上(兼容处理有命名空间的标签)
      vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag)
        : nodeOps.createElement(tag, vnode)
      // 添加css作用域的属性名
      setScope(vnode)
      // 创建子元素节点
      createChildren(vnode, children, insertedVnodeQueue)
      // 调用模块的create钩子和data上的create钩子
      // 模块的create钩子在真实DOM上挂载了attrs,class,events,domProps,style
      // data上的create钩子 ???
      if (isDef(data)) {
        invokeCreateHooks(vnode, insertedVnodeQueue)
      }
      // 插入节点
      insert(parentElm, vnode.elm, refElm)

      if (__DEV__ && data && data.pre) {
        creatingElmInVPre--
      }
    } 
    // 注释节点
    else if (isTrue(vnode.isComment)) {
      vnode.elm = nodeOps.createComment(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    } 
    // 文本节点
    else {
      vnode.elm = nodeOps.createTextNode(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    }
  }

  // 调用组件节点的hook.init创建组建的实例并且挂载到
  function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    // 组件才会定义data.hook字段
    let i = vnode.data
    if (isDef(i)) {
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
      // 调用组件data.hook下挂载的init钩子
      // 调用init钩子后会在vnode下挂载componentInstance，此字段为组件的vm实例
      if (isDef((i = i.hook)) && isDef((i = i.init))) {
        i(vnode, false /* hydrating */)
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      if (isDef(vnode.componentInstance)) {
        // 拼接组件内部的片段到虚拟节点的elm字段，并调用create钩子处理了组件节点上的属性到真实根元素
        initComponent(vnode, insertedVnodeQueue)
        // 插入节点，初次渲染时parentElm，refElm都未传入，不作处理
        insert(parentElm, vnode.elm, refElm)
        // 如果组件在keepAlive组件中的情况
        // ???
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
  }

  // 将组件内部渲染的内容挂载在elm上，调用模块上和组件上的create钩子
  function initComponent(vnode, insertedVnodeQueue) {
    // ???
    if (isDef(vnode.data.pendingInsert)) {
      insertedVnodeQueue.push.apply(
        insertedVnodeQueue,
        vnode.data.pendingInsert
      )
      vnode.data.pendingInsert = null
    }
    // vnode.componentInstance.$el为根据组件创建真实节点片段的根节点
    // 将节点片段接入DOM树
    vnode.elm = vnode.componentInstance.$el
    // 递归到组件内层节点，判断组件是否能patch
    if (isPatchable(vnode)) {
      // 调用模块上和组件上的create钩子
      invokeCreateHooks(vnode, insertedVnodeQueue)
      // 设置css作用域的类名
      setScope(vnode)
    } 
    // 组件不能patch，说明内层为节点没有标签，为文本或注释 ???
    else {
      // empty component root.
      // skip all element-related modules except for ref (#3455)
      // 注册节点的ref到组件实例的$refs
      registerRef(vnode)
      // make sure to invoke the insert hook
      insertedVnodeQueue.push(vnode)
    }
  }
  // keepAlive组件中的组件的处理 ???
  function reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    let innerNode = vnode
    // 递归组件内部的片段的根节点
    while (innerNode.componentInstance) {
      innerNode = innerNode.componentInstance._vnode
      // 如果节点上有data.transition字段则并执行模块中的activate钩子并跳出循环
      if (isDef((i = innerNode.data)) && isDef((i = i.transition))) {
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode)
        }
        insertedVnodeQueue.push(innerNode)
        break
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    // ???
    insert(parentElm, vnode.elm, refElm)
  }

  // 组件初次渲染时没有定义parent，ref，不作处理
  // children渲染时定义parent未定义ref，将节点插入在父节点的所有子节点后
  // Vue挂载、或新旧组件不同时定义parent，ref为nodeOps.nextSibling(oldElm)，会将节点插入父节点下ref节点之前
  function insert(parent, elm, ref) {
    if (isDef(parent)) {
      if (isDef(ref)) {
        // 如果定义了ref节点，且ref节点的父节点和当前节点相同，则插入在ref节点之前
        if (nodeOps.parentNode(ref) === parent) {
          nodeOps.insertBefore(parent, elm, ref)
        }
      } 
      // 没有定义ref时，DOM操作直接在父节点的所有子节点后添加
      else {
        nodeOps.appendChild(parent, elm)
      }
    }
  }
  // 创建普通(非组件)节点的子节点
  function createChildren(vnode, children, insertedVnodeQueue) {
    // 子节点为数组的情况：递归调用createElm()创建节点的元素
    if (isArray(children)) {
      // 子节点中重复的key值报错
      if (__DEV__) {
        checkDuplicateKeys(children)
      }
      for (let i = 0; i < children.length; ++i) {
        // 递归创建子节点
        createElm( children[i], insertedVnodeQueue, vnode.elm, null, true, children, i)
      }
    } 
    // 当前节点为文本节点的情况
    else if (isPrimitive(vnode.text)) {
      nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)))
    }
  }
  // 判断节点是否能进行patch
  function isPatchable(vnode) {
    // 此while循环处理的似乎是组件直接嵌套组件的情况，确保组件嵌套之后的最内层是以标签起始的，如果是文本类型的节点，说明不能patch
    while (vnode.componentInstance) {
      vnode = vnode.componentInstance._vnode
    }
    return isDef(vnode.tag)
  }
  // 调用模块的create钩子和data上的create钩子
  function invokeCreateHooks(vnode, insertedVnodeQueue) {
    // 调用所有模块的create钩子
    // 模块的create钩子函数在真实DOM上挂载了attrs,class,events,domProps,style，并且对transition(???)进行了处理
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode)
    }
    // 调用组件上的create钩子(???组件上似乎没有create钩子)
    i = vnode.data.hook // Reuse variable
    if (isDef(i)) {
      if (isDef(i.create)) i.create(emptyNode, vnode)
      // 将有insert钩子的组件推入队列
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode)
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  // 添加css的作用域
  // 本质是为元素添加一个独特的类名，对应的css代码会编译成对应类名选择器的代码
  function setScope(vnode) {
    let i
    // 虚拟节点上有fnScopeId字段
    if (isDef((i = vnode.fnScopeId))) {
      // 在真实节点上添加属性名为fnScopeId的空属性
      nodeOps.setStyleScope(vnode.elm, i)
    } 
    // 虚拟节点上没有定义fnScopeId字段
    // 遍历祖先节点的vm实例(只有组件)
    // 添加所有祖先组件的vm.$options._scopeId为属性名的空属性
    else {
      let ancestor = vnode
      while (ancestor) {
        if (isDef((i = ancestor.context)) && isDef((i = i.$options._scopeId))) {
          nodeOps.setStyleScope(vnode.elm, i)
        }
        ancestor = ancestor.parent
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    // 似乎是插槽内容渲染时的css类名
    // 如果定义了activeInstance且和当前的节点的vm实例或fnContext不同
    // 添加activeInstance.$options._scopeId为属性名的空属性
    if (
      isDef((i = activeInstance)) &&
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef((i = i.$options._scopeId))
    ) {
      nodeOps.setStyleScope(vnode.elm, i)
    }
  }

  // 递归从开始到结束索引之间的虚拟节点,创建真实DOM
  function addVnodes(
    parentElm,
    refElm,
    vnodes,
    startIdx,
    endIdx,
    insertedVnodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(
        vnodes[startIdx],
        insertedVnodeQueue,
        parentElm,
        refElm,
        false,
        vnodes,
        startIdx
      )
    }
  }
  // 调用自己和子孙节点上的destroy钩子  ???
  function invokeDestroyHook(vnode) {
    let i, j
    const data = vnode.data
    // 调用destroy钩子
    if (isDef(data)) {
      // 调用组件节点的data上的destroy钩子(只有组件会有)
      if (isDef((i = data.hook)) && isDef((i = i.destroy))) i(vnode)
      // 调用所有模块上的destroy钩子
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
    }
    // 递归子节点
    if (isDef((i = vnode.children))) {
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j])
      }
    }
  }
  // 移除节点，如果是元素、组件节点并调用对应钩子
  function removeVnodes(vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (isDef(ch)) {
        // 元素节点
        if (isDef(ch.tag)) {
          // 调用remove钩子并调用DOM移除节点
          removeAndInvokeRemoveHook(ch)
          // 调用destroy钩子
          invokeDestroyHook(ch)
        } 
        // 文本类节点直接删除
        else {
          // Text node
          removeNode(ch.elm)
        }
      }
    }
  }
  // 递归调用模块和节点(包括内层)的remove钩子
  function removeAndInvokeRemoveHook(vnode, rm?: any) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i
      const listeners = cbs.remove.length + 1
      if (isDef(rm)) {
        // we have a recursively passed down rm callback
        // increase the listeners count
        rm.listeners += listeners
      } else {
        // directly removing
        rm = createRmCb(vnode.elm, listeners)
      }
      // recursively invoke hooks on child component root node
      // 递归组件内层根节点并且传入rm函数对象
      if (
        isDef((i = vnode.componentInstance)) &&
        isDef((i = i._vnode)) &&
        isDef(i.data)
      ) {
        removeAndInvokeRemoveHook(i, rm)
      }
      // 调用模块上的remove钩子，并传入rm函数对象
      for (i = 0; i < cbs.remove.length; ++i) {
        cbs.remove[i](vnode, rm)
      }
      // 调用元素上data.hook上的remove钩子，并传入rm函数对象
      if (isDef((i = vnode.data.hook)) && isDef((i = i.remove))) {
        i(vnode, rm)
      } 
      // 元素上没有data.hook上的remove钩子，调用rm函数对象
      else {
        rm()
      }
    } 
    else {
      removeNode(vnode.elm)
    }
  }

  function updateChildren(
    parentElm,
    oldCh,
    newCh,
    insertedVnodeQueue,
    removeOnly
  ) {
    let oldStartIdx = 0
    let newStartIdx = 0
    let oldEndIdx = oldCh.length - 1
    let oldStartVnode = oldCh[0]
    let oldEndVnode = oldCh[oldEndIdx]
    let newEndIdx = newCh.length - 1
    let newStartVnode = newCh[0]
    let newEndVnode = newCh[newEndIdx]
    let oldKeyToIdx, idxInOld, vnodeToMove, refElm

    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    const canMove = !removeOnly

    if (__DEV__) {
      checkDuplicateKeys(newCh)
    }
    // diff算法核心
    // 依次比较：旧前新前、旧后新后、旧前新后、旧后新前，比对成功则递归调用patchVnode()，并且移动索引，操作DOM
    // 都匹配失败进行暴力对比
    // 
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      
      if (isUndef(oldStartVnode)) {
        oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
      } 
      
      else if (isUndef(oldEndVnode)) {
        oldEndVnode = oldCh[--oldEndIdx]
      } 
      // 旧前新前
      else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(
          oldStartVnode,
          newStartVnode,
          insertedVnodeQueue,
          newCh,
          newStartIdx
        )
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } 
      // 旧后新后
      else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(
          oldEndVnode,
          newEndVnode,
          insertedVnodeQueue,
          newCh,
          newEndIdx
        )
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } 
      // 旧前新后
      else if (sameVnode(oldStartVnode, newEndVnode)) {
        // Vnode moved right
        patchVnode(
          oldStartVnode,
          newEndVnode,
          insertedVnodeQueue,
          newCh,
          newEndIdx
        )
        // 将旧前的真实节点插入到旧后之后
        canMove &&
          nodeOps.insertBefore(
            parentElm,
            oldStartVnode.elm,
            nodeOps.nextSibling(oldEndVnode.elm)
          )
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } 
      // 旧后新前
      else if (sameVnode(oldEndVnode, newStartVnode)) {
        // Vnode moved left
        patchVnode(
          oldEndVnode,
          newStartVnode,
          insertedVnodeQueue,
          newCh,
          newStartIdx
        )
        // 将旧后的真实节点插入到旧前的真实节点之前
        canMove &&
          nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } 
      // 暴力对比
      else {
        // 创建从旧后到旧前的所有存在key值的节点生成的{key:index}形式的对象
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        // 获取对应旧子节点中对应key值的节点，如果没有定义key值，则依次查找比对
        idxInOld = isDef(newStartVnode.key) ? oldKeyToIdx[newStartVnode.key] : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
        // 没有查询到对应的节点，则对应节点比对失败
        if (isUndef(idxInOld)) {
          // New element
          createElm(
            newStartVnode,
            insertedVnodeQueue,
            parentElm,
            oldStartVnode.elm,
            false,
            newCh,
            newStartIdx
          )
        } 
        // 对应节点比对成功(可能只是key值相同)
        else {
          vnodeToMove = oldCh[idxInOld]
          // 节点相同，此处才代表是相同的节点
          if (sameVnode(vnodeToMove, newStartVnode)) {
            patchVnode(
              vnodeToMove,
              newStartVnode,
              insertedVnodeQueue,
              newCh,
              newStartIdx
            )
            // 将旧子节点中对应位置值置为undefined占位
            oldCh[idxInOld] = undefined
            // 将匹配的旧节点的真实节点插入到旧前节点之前
            canMove &&
              nodeOps.insertBefore(
                parentElm,
                vnodeToMove.elm,
                oldStartVnode.elm
              )
          } 
          // 节点不同
          else {
            // same key but different element. treat as new element
            createElm(
              newStartVnode,
              insertedVnodeQueue,
              parentElm,
              oldStartVnode.elm,
              false,
              newCh,
              newStartIdx
            )
          }
        }
        newStartVnode = newCh[++newStartIdx]
      }
    }
    // 旧子节点匹配结束,将新子节点中剩余的节点添加到真实DOM
    if (oldStartIdx > oldEndIdx) {
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
      addVnodes(
        parentElm,
        refElm,
        newCh,
        newStartIdx,
        newEndIdx,
        insertedVnodeQueue
      )
    } 
    // 新节点匹配结束,将旧子节点中剩余节点的真实节点删除
    else if (newStartIdx > newEndIdx) {
      removeVnodes(oldCh, oldStartIdx, oldEndIdx)
    }
  }
  // 检查子节点中重复的key值报错
  function checkDuplicateKeys(children) {
    const seenKeys = {}
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i]
      const key = vnode.key
      if (isDef(key)) {
        if (seenKeys[key]) {
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          )
        } else {
          seenKeys[key] = true
        }
      }
    }
  }
  // 查询旧前和旧后之间所有节点是否有相同的节点，相同则返回对应的索引
  function findIdxInOld(node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i]
      if (isDef(c) && sameVnode(node, c)) return i
    }
  }

  // patch主逻辑，对比两个相同的节点
  // patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
  function patchVnode(
    oldVnode,
    vnode,
    insertedVnodeQueue,
    ownerArray,
    index,
    removeOnly?: any
  ) {
    // 节点完全相同则直接返回
    if (oldVnode === vnode) {
      return
    }
    // 克隆重用的节点   为何???
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // clone reused vnode
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    const elm = (vnode.elm = oldVnode.elm)

    // 似乎是异步组件更新时更新完成注入组件
    if (isTrue(oldVnode.isAsyncPlaceholder)) {
      if (isDef(vnode.asyncFactory.resolved)) {
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
      } else {
        vnode.isAsyncPlaceholder = true
      }
      return
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    // 静态组件的实例直接复用
    if (
      isTrue(vnode.isStatic) &&
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key &&
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance
      return
    }

    let i
    const data = vnode.data

    // 调用节点data.hook下的prepatch钩子(只有组件节点才有)
    // patchVnode会递归调用，所以这里传入的节点只有子组件的节点
    if (isDef(data) && isDef((i = data.hook)) && isDef((i = i.prepatch))) {
      i(oldVnode, vnode)
    }

    const oldCh = oldVnode.children
    const ch = vnode.children


    // 如果节点是组件外层节点，调用模块和组件上的update钩子(组件上似乎没有)
    // update钩子主要是对当前节点的自身属性处理
    if (isDef(data) && isPatchable(vnode)) {
      // 模块上的update钩子用于更新真实DOM上的attrs,class,events,domProps,style
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      // 调用组件data.hook上的update钩子(似乎没有???)
      if (isDef((i = data.hook)) && isDef((i = i.update))) i(oldVnode, vnode)
    }

    // 子节点的处理
    // 新节点没有text属性，说明是元素节点或组件节点
    if (isUndef(vnode.text)) {
      // 新旧节点都有定义子节点
      if (isDef(oldCh) && isDef(ch)) {
        // 新旧节点不同，则更新子元素???
        if (oldCh !== ch)
          updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
      } 
      // 新节点有定义子节点，旧节点没有定义子节点
      else if (isDef(ch)) {
        // 确保子节点没有相同的key值
        if (__DEV__) {
          checkDuplicateKeys(ch)
        }
        // 旧节点为文本节点，将真实DOM的文本内容置为空
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
        // ???
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } 
      // 旧节点有定义子节点，新节点没有定义子节点
      else if (isDef(oldCh)) {
        // ???
        removeVnodes(oldCh, 0, oldCh.length - 1)
      } 
      // 新旧节点都没有定义子节点，且旧节点为文本节点
      else if (isDef(oldVnode.text)) {
        nodeOps.setTextContent(elm, '')
      }
    } 
    // 新节点有text属性，文本节点或者注释节点
    // 且新旧节点文本不同，直接更新DOM文本内容
    else if (oldVnode.text !== vnode.text) {
      nodeOps.setTextContent(elm, vnode.text)
    }
    // 调用节点的data.hook上的postpatch钩子
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.postpatch))) i(oldVnode, vnode)
    }

  }

  // 用于patch结束对插入的节点依次调用data.hook上的insert钩子
  function invokeInsertHook(vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    if (isTrue(initial) && isDef(vnode.parent)) {
      vnode.parent.data.pendingInsert = queue
    } else {
      for (let i = 0; i < queue.length; ++i) {
        queue[i].data.hook.insert(queue[i])
      }
    }
  }

  let hydrationBailed = false
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  function hydrate(elm, vnode, insertedVnodeQueue, inVPre?: boolean) {
    let i
    const { tag, data, children } = vnode
    inVPre = inVPre || (data && data.pre)
    vnode.elm = elm

    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true
      return true
    }
    // assert node match
    if (__DEV__) {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false
      }
    }
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.init)))
        i(vnode, true /* hydrating */)
      if (isDef((i = vnode.componentInstance))) {
        // child component. it should have hydrated its own tree.
        initComponent(vnode, insertedVnodeQueue)
        return true
      }
    }
    if (isDef(tag)) {
      if (isDef(children)) {
        // empty element, allow client to pick up and populate children
        if (!elm.hasChildNodes()) {
          createChildren(vnode, children, insertedVnodeQueue)
        } else {
          // v-html and domProps: innerHTML
          if (
            isDef((i = data)) &&
            isDef((i = i.domProps)) &&
            isDef((i = i.innerHTML))
          ) {
            if (i !== elm.innerHTML) {
              /* istanbul ignore if */
              if (
                __DEV__ &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('server innerHTML: ', i)
                console.warn('client innerHTML: ', elm.innerHTML)
              }
              return false
            }
          } else {
            // iterate and compare children lists
            let childrenMatch = true
            let childNode = elm.firstChild
            for (let i = 0; i < children.length; i++) {
              if (
                !childNode ||
                !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)
              ) {
                childrenMatch = false
                break
              }
              childNode = childNode.nextSibling
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            if (!childrenMatch || childNode) {
              /* istanbul ignore if */
              if (
                __DEV__ &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn(
                  'Mismatching childNodes vs. VNodes: ',
                  elm.childNodes,
                  children
                )
              }
              return false
            }
          }
        }
      }
      if (isDef(data)) {
        let fullInvoke = false
        for (const key in data) {
          if (!isRenderedModule(key)) {
            fullInvoke = true
            invokeCreateHooks(vnode, insertedVnodeQueue)
            break
          }
        }
        if (!fullInvoke && data['class']) {
          // ensure collecting deps for deep class bindings for future updates
          traverse(data['class'])
        }
      }
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text
    }
    return true
  }

  function assertNodeMatch(node, vnode, inVPre) {
    if (isDef(vnode.tag)) {
      return (
        vnode.tag.indexOf('vue-component') === 0 ||
        (!isUnknownElement(vnode, inVPre) &&
          vnode.tag.toLowerCase() ===
            (node.tagName && node.tagName.toLowerCase()))
      )
    } else {
      return node.nodeType === (vnode.isComment ? 8 : 3)
    }
  }

  return function patch(oldVnode, vnode, hydrating, removeOnly) {

    // 如果新节点不存在，老节点存在，则调用老节点data上的destroy钩子和模块上的destroy钩子
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    let isInitialPatch = false
    const insertedVnodeQueue: any[] = []

    // 老节点不存在的情况
    // 即组件的初次渲染，vm.$el为undefined
    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      isInitialPatch = true
      createElm(vnode, insertedVnodeQueue)
    } 

    // 老节点存在节点的情况,根组件挂载和组件更新在此分支上
    else {
      // 调用真实DOM上的属性判断入参的oldVnode是否为真实节点
      const isRealElement = isDef(oldVnode.nodeType)

      // 老节点不是真实节点且新旧节点相同则执行patchVnode
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
      } 

      // 老节点为真实节点或新旧节点不同的情况(此处老节点如果为真实节点，新节点一定为虚拟节点，则新旧节点必不同)
      // 1.老节点是真实节点，新旧节点不同：Vue根元素初次渲染
      // 2.老节点不为真实节点，新旧节点不同：组件更新时根节点不同，直接替换
      else {
        // 老节点为真实节点，初次挂载Vue实例的情况
        // 老节点为真实节点的情况创建空的虚拟节点作为代替
        if (isRealElement) {
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          // nodeType === 1 代表元素节点   此处为服务端渲染相关
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (__DEV__) {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                  'server-rendered content. This is likely caused by incorrect ' +
                  'HTML markup, for example nesting block-level elements inside ' +
                  '<p>, or missing <tbody>. Bailing hydration and performing ' +
                  'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          // 将老节点置为根据节点标签创建的虚拟节点
          oldVnode = emptyNodeAt(oldVnode)
        }

        // replacing existing element
        const oldElm = oldVnode.elm
        const parentElm = nodeOps.parentNode(oldElm)

        // create new node
        // 创建新节点的真实DOM
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        // update parent placeholder node element, recursively
        // 依次更新外壳节点
        if (isDef(vnode.parent)) {
          let ancestor = vnode.parent
          const patchable = isPatchable(vnode)
          // 递归组件节点的外层节点(只有组件根节点有)
          while (ancestor) {
            // 对组件外层调用模块中的destroy钩子
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor)
            }
            // 将外层节点的真实DOM赋值为内层节点真实DOM
            ancestor.elm = vnode.elm
            if (patchable) {
              // 对组件外层调用模块中的create钩子
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              // ???
              const insert = ancestor.data.hook.insert
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]()
                }
              }
            } 
            // 如果节点内层为文本节点注释节点等空节点，则只向组件实例注册ref
            else {
              registerRef(ancestor)
            }
            ancestor = ancestor.parent
          }
        }

        // destroy old node
        // 移除旧节点
        // 如果旧节点存在父节点则进行transition相关处理???
        if (isDef(parentElm)) {
          removeVnodes([oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          invokeDestroyHook(oldVnode)
        }
      }
    }
    // 最后统一根据元素插入顺序调用元素data.hook上的insert钩子
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    return vnode.elm
  }
}
