/**
 * optimize() 进行优化：标记静态节点和静态根节点
 * 
 * 静态节点主要依据：
 *    静态节点：文本节点、v-pre、原生普通标签、属性全为静态属性
 *    动态节点：表达式节点、v-for、v-if、<slot>、<template>、<template v-for=xxx>的直接子标签
 * 
 * 静态根节点主要依据：节点本身是静态节点，而且有子节点，而且子节点不是只有一个文本节点
 * 
 * 挂载static、staticRoot、staticInFor字段
 */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'
import { ASTElement, CompilerOptions, ASTNode } from 'types/compiler'

let isStaticKey
let isPlatformReservedTag

// 此处使用缓存可以缓存遇到过的标签属性调用isStaticKey的返回结果，反复调用节约性能
const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
export function optimize(
  root: ASTElement | null | undefined,
  options: CompilerOptions
) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 标记每个节点是否为静态节点，挂载node.static
  markStatic(root)
  // second pass: mark static roots.
  markStaticRoots(root, false)
}


// 返回一个函数，验证元素上的属性是否为静态属性
function genStaticKeys(keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
      (keys ? ',' + keys : '')
  )
}

// 标记每个节点是否为静态节点，挂载node.static
function markStatic(node: ASTNode) {
  // 判断节点是否为静态节点，并挂载static属性
  node.static = isStatic(node)
  if (node.type === 1) {
    // 不要将组件的插槽内容设置为静态节点，这样可以避免：
    // 1、组件不能改变插槽节点
    // 2、静态插槽内容在热重载时失败

    // 递归终止条件:不是平台保留标签且不是 slot 标签且不是内联模版
    // 组件标签中不会有静态标签，都是插槽

    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }
    // 遍历子节点调用递归调用markStatic标记静态节点
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) {
        node.static = false
      }
    }
    // 对ifConditions字段的block调用markStatic标记其中的静态节点
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}
// 标记静态根节点，挂载node.staticRoot、node.staticInFor
function markStaticRoots(node: ASTNode, isInFor: boolean) {
  // 静态根只会对元素节点，文本、表达式节点都不会标记静态根
  if (node.type === 1) {
    // 对在v-for指令内的静态节点和有v-once指令的节点标记node.staticInFor=true
    // 对在v-for指令外的静态节点和有v-once指令的节点标记node.staticInFor=false
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // 节点本身是静态节点，而且有子节点，而且子节点不是只有一个文本节点，则标记为静态根
    if (
      node.static &&
      node.children.length &&
      !(node.children.length === 1 && node.children[0].type === 3)
    ) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

// 判断是否为静态节点
function isStatic(node: ASTNode): boolean {
  // 表达式节点为动态节点
  if (node.type === 2) {
    // expression
    return false
  }
  // 文本节点为静态节点
  if (node.type === 3) {
    // text
    return true
  }
  // 元素节点的情况
  return !!(
    // 节点上有v-pre指令或
    node.pre ||
    // 节点上没有动态绑定
    (!node.hasBindings && 
      // 没有v-if、v-for指令
      !node.if &&
      !node.for && 
      // 不是内建标签slot或template
      !isBuiltInTag(node.tag) && 
      // 需为平台保留标签(这里条的含义是排除用户定义的组件标签)
      isPlatformReservedTag(node.tag) && 
      // 不是有v-for指令的template标签的直接子元素
      !isDirectChildOfTemplateFor(node) &&
      // 属性全为静态属性
      Object.keys(node).every(isStaticKey))
  )
}

// 检查元素的父元素是否为有v-for的template标签
function isDirectChildOfTemplateFor(node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
