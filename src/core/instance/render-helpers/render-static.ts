import VNode from 'core/vdom/vnode'
import { isArray } from 'core/util'

/**
 * Runtime helper for rendering static trees.
 */
// `_m(index, true or '')` 
// 
export function renderStatic(
  index: number,
  isInFor: boolean
): VNode | Array<VNode> {
  const cached = this._staticTrees || (this._staticTrees = [])
  let tree = cached[index]
  // if has already-rendered static tree and not inside v-for,
  // we can reuse the same tree.
  if (tree && !isInFor) {
    return tree
  }
  // otherwise, render a fresh tree.
  tree = cached[index] = this.$options.staticRenderFns[index].call(
    this._renderProxy,
    this._c,
    this // for render fns generated for functional component templates
  )
  markStatic(tree, `__static__${index}`, false)
  return tree
}

/**
 * Runtime helper for v-once.
 * Effectively it means marking the node as static with a unique key.
 */
// `_o(${genElement(el, state)},${state.onceId++},${key})`
// 为第一个参数为需要标记的节点(数组情况应该是v-for和v-once一起使用的时候))，添加第二个参数和第三个参数拼接的标记
export function markOnce(
  tree: VNode | Array<VNode>,
  index: number,
  key: string
) {
  // el,`__once__0name`,true
  markStatic(tree, `__once__${index}${key ? `_${key}` : ``}`, true)
  return tree
}

function markStatic(tree: VNode | Array<VNode>, key: string, isOnce: boolean) {
  if (isArray(tree)) {
    for (let i = 0; i < tree.length; i++) {
      if (tree[i] && typeof tree[i] !== 'string') {
        markStaticNode(tree[i], `${key}_${i}`, isOnce)
      }
    }
  } else {
    markStaticNode(tree, key, isOnce)
  }
}

function markStaticNode(node, key, isOnce) {
  node.isStatic = true
  node.key = key
  node.isOnce = isOnce
}
