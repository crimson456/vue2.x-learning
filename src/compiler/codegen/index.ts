/**
 * generate()函数生成render()函数并返回
 * render()函数调用会生成虚拟DOM
 * 
 * 
 * 
 * 
 */


import { genHandlers } from './events'
import baseDirectives from '../directives/index'
import { camelize, no, extend, capitalize } from 'shared/util'
import { baseWarn, pluckModuleFunction } from '../helpers'
import { emptySlotScopeToken } from '../parser/index'
import {
  ASTAttr,
  ASTDirective,
  ASTElement,
  ASTExpression,
  ASTIfConditions,
  ASTNode,
  ASTText,
  CompilerOptions
} from 'types/compiler'
import { BindingMetadata, BindingTypes } from 'sfc/types'

type TransformFunction = (el: ASTElement, code: string) => string
type DataGenFunction = (el: ASTElement) => string
type DirectiveFunction = (
  el: ASTElement,
  dir: ASTDirective,
  warn: Function
) => boolean

export class CodegenState {
  options: CompilerOptions
  warn: Function
  transforms: Array<TransformFunction>
  dataGenFns: Array<DataGenFunction>
  directives: { [key: string]: DirectiveFunction }
  maybeComponent: (el: ASTElement) => boolean
  onceId: number
  staticRenderFns: Array<string>
  pre: boolean

  constructor(options: CompilerOptions) {
    this.options = options
    this.warn = options.warn || baseWarn
    this.transforms = pluckModuleFunction(options.modules, 'transformCode')
    this.dataGenFns = pluckModuleFunction(options.modules, 'genData')
    // baseDirectives包括对v-on，v-bind，v-cloak的处理， options.directives包括对v-model、v-html、v-text的处理
    this.directives = extend(extend({}, baseDirectives), options.directives)
    const isReservedTag = options.isReservedTag || no
    this.maybeComponent = (el: ASTElement) =>
      !!el.component || !isReservedTag(el.tag)
    this.onceId = 0
    this.staticRenderFns = []
    this.pre = false
  }
}

export type CodegenResult = {
  render: string
  staticRenderFns: Array<string>
}

export function generate(
  ast: ASTElement | void,
  options: CompilerOptions
): CodegenResult {
  const state = new CodegenState(options)
  // fix #11483, Root level <script> tags should not be rendered.
  // 生成code，如果没有传入ast，则生成'_c("div")'，如果根节点是script标签，则生成'null'
  // 主逻辑在genElement()函数中
  const code = ast
    ? ast.tag === 'script'
      ? 'null'
      : genElement(ast, state)
    : '_c("div")'
  return {
    render: `with(this){return ${code}}`,
    staticRenderFns: state.staticRenderFns
  }
}

// ast生成render函数的主逻辑
export function genElement(el: ASTElement, state: CodegenState): string {
  // 使用pre字段标志元素是否处于v-pre指令中
  if (el.parent) {
    el.pre = el.pre || el.parent.pre
  }

  if (el.staticRoot && !el.staticProcessed) {
    // 处理静态根节点 
    return genStatic(el, state)
  } else if (el.once && !el.onceProcessed) {
    // 生成v-once的标签代码，如果在v-for中打上静态标记，如果不在，处理为静态节点
    return genOnce(el, state)
  } else if (el.for && !el.forProcessed) {
    // 生成v-for的标签代码
    return genFor(el, state)
  } else if (el.if && !el.ifProcessed) {
    // 生成v-if的标签代码
    return genIf(el, state)
  } else if (el.tag === 'template' && !el.slotTarget && !state.pre) {
    // 生成普通template(不对应插槽且不在v-pre中)的标签代码
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') {
    // 生成插槽的代码
    return genSlot(el, state)
  } else {
    // component or element
    let code
    // 动态组件的代码生成
    if (el.component) {
      code = genComponent(el.component, el, state)
    } 
    // 原生标签和自定义组件的代码生成
    else {
      let data
      const maybeComponent = state.maybeComponent(el)
      // 有修饰的元素或使用v-pre指令的自定义组件，生成data的代码串
      // 无修饰的元素不需要，因为本身没有各种属性
      if (!el.plain || (el.pre && maybeComponent)) {
        data = genData(el, state)
      }

      let tag: string | undefined
      // check if this is a component in <script setup>
      // ???单文件组件相关
      const bindings = state.options.bindings
      if (maybeComponent && bindings && bindings.__isScriptSetup !== false) {
        tag = checkBindingType(bindings, el.tag)
      }
      if (!tag) tag = `'${el.tag}'`
      // 生成children的代码
      const children = el.inlineTemplate ? null : genChildren(el, state, true)
      // 生成代码格式大致为
      // `_c(tag,{data},[_c(xxx),_v(exp),_e(text)....],normalizationType)`
      code = `_c(${tag}${
        data ? `,${data}` : '' // data
      }${
        children ? `,${children}` : '' // children
      })`
    }
    // module transforms
    for (let i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code)
    }
    return code
  }
}

function checkBindingType(bindings: BindingMetadata, key: string) {
  const camelName = camelize(key)
  const PascalName = capitalize(camelName)
  const checkType = (type) => {
    if (bindings[key] === type) {
      return key
    }
    if (bindings[camelName] === type) {
      return camelName
    }
    if (bindings[PascalName] === type) {
      return PascalName
    }
  }
  const fromConst =
    checkType(BindingTypes.SETUP_CONST) ||
    checkType(BindingTypes.SETUP_REACTIVE_CONST)
  if (fromConst) {
    return fromConst
  }

  const fromMaybeRef =
    checkType(BindingTypes.SETUP_LET) ||
    checkType(BindingTypes.SETUP_REF) ||
    checkType(BindingTypes.SETUP_MAYBE_REF)
  if (fromMaybeRef) {
    return fromMaybeRef
  }
}

// 处理静态根节点
// 1、将当前静态节点的渲染函数放到 staticRenderFns 数组中
// 2、生成字符串 `_m(index, true or '')` 
// 辅助函数_m()会调用staticRenderFns数组中index对应渲染函数
function genStatic(el: ASTElement, state: CodegenState): string {
  // 执行一次正常的处理流程后将渲染函数存储到staticRenderFns数组中，并返回对应_m(idx, true or '')调用渲染函数
  el.staticProcessed = true
  // Some elements (templates) need to behave differently inside of a v-pre
  // node.  All pre nodes are static roots, so we can use this as a location to
  // wrap a state change and reset it upon exiting the pre node.
  // 为什么要保留state.pre ???
  const originalPreState = state.pre
  if (el.pre) {
    state.pre = el.pre
  }
  state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`)
  state.pre = originalPreState
  return `_m(${state.staticRenderFns.length - 1}${
    el.staticInFor ? ',true' : ''
  })`
}

// 生成v-once的标签代码
// 如果在v-for范围内，打上静态节点标记
function genOnce(el: ASTElement, state: CodegenState): string {
  el.onceProcessed = true
  // v-if的情况
  if (el.if && !el.ifProcessed) {
    return genIf(el, state)
  } 
  // 对v-for内的情况
  else if (el.staticInFor) {
    // 获取在v-for中的分支的key值
    let key = ''
    let parent = el.parent
    while (parent) {
      if (parent.for) {
        key = parent.key!
        break
      }
      parent = parent.parent
    }
    // 对v-for没有key值的警告，并且不对v-once做处理
    if (!key) {
      __DEV__ &&
        state.warn(
          `v-once can only be used inside v-for that is keyed. `,
          el.rawAttrsMap['v-once']
        )
      return genElement(el, state)
    }
    // 对有key值的正常处理节点并在VNode上打上静态标记
    return `_o(${genElement(el, state)},${state.onceId++},${key})`
  }
  // 其他情况，直接处理为静态节点
  else {
    return genStatic(el, state)
  }
}

// 生成v-if的标签代码，三元表达式语法
export function genIf(
  el: any,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  el.ifProcessed = true // avoid recursion
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty)
}

// 生成从ifCondition字段代表的分支
function genIfConditions(
  conditions: ASTIfConditions,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  if (!conditions.length) {
    return altEmpty || '_e()'
  }
  // 生成每一个condition的代码
  // 格式大致为`(exp1)?block1:(exp2)?block2:exp3?block3:......`
  const condition = conditions.shift()!
  if (condition.exp) {
    return `(${condition.exp})?${genTernaryExp(
      condition.block
    )}:${genIfConditions(conditions, state, altGen, altEmpty)}`
  } else {
    return `${genTernaryExp(condition.block)}`
  }

  // 生成三元表达式中的一项
  function genTernaryExp(el) {
    return altGen
      ? altGen(el, state)
      // block中可能存在v-once
      : el.once
      ? genOnce(el, state)
      : genElement(el, state)
  }
}

// 生成v-for的标签代码，用_l包裹，执行时生成对应节点数组
export function genFor(
  el: any,
  state: CodegenState,
  altGen?: Function,
  altHelper?: string
): string {
  const exp = el.for
  const alias = el.alias
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : ''
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''

  // 对组件上使用v-for必须添加key值作警告
  if (
    __DEV__ &&
    state.maybeComponent(el) &&
    el.tag !== 'slot' &&
    el.tag !== 'template' &&
    !el.key
  ) {
    state.warn(
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
        `v-for should have explicit keys. ` +
        `See https://vuejs.org/guide/list.html#key for more info.`,
      el.rawAttrsMap['v-for'],
      true /* tip */
    )
  }

  el.forProcessed = true // avoid recursion
  // 返回值格式：`_l(exp,function(alias,iterator1,iterator2){return restcode}))`
  return (
    `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
    `return ${(altGen || genElement)(el, state)}` +
    '})'
  )
}

// 生成属性字符串,data的格式主要为：
// `{
// directives:[{ name, rawName, value, arg, expression , modifiers }, ...],
// key:xxx,
// ref:xxx,
// refInFor:true,
// pre:true,
// tag:xxx,
// staticClass: xxx, 
// class: xxx,
// staticStyle: xxx, 
// style: xxx,
// attrs:{name1:value1,name2:value2....}，
// domProps:{name1:value1,name2:value2....}，
// on:{!~&name1:[handler1,handler2],name2:handler3,...}，
// nativeOn:_d(!~&name1:[handler1,handler2],name2:handler3,...,[!~&name3,[handler4,handler5],name4,handler6]),
// slot:slotTarget,
// scopedSlots:{ $stable:xxx, $key:xxx, slotTarget:fn, ... },
// model:{value:xxx,callback:x,expression:xxx},
// inlineTemplate:{render:xxx,staticRenderFns:xxx}
// }`
export function genData(el: ASTElement, state: CodegenState): string {
  let data = '{'

  // directives first.
  // directives may mutate the el's other properties before they are generated.
  const dirs = genDirectives(el, state)
  if (dirs) data += dirs + ','

  // key
  if (el.key) {
    data += `key:${el.key},`
  }
  // ref
  if (el.ref) {
    data += `ref:${el.ref},`
  }
  if (el.refInFor) {
    data += `refInFor:true,`
  }
  // pre
  if (el.pre) {
    data += `pre:true,`
  }
  // record original tag name for components using "is" attribute
  if (el.component) {
    data += `tag:"${el.tag}",`
  }
  // 调用platform中模块下的genData方法
  for (let i = 0; i < state.dataGenFns.length; i++) {
    data += state.dataGenFns[i](el)
  }
  // attributes
  if (el.attrs) {
    data += `attrs:${genProps(el.attrs)},`
  }
  // DOM props
  if (el.props) {
    data += `domProps:${genProps(el.props)},`
  }
  // event handlers
  if (el.events) {
    data += `${genHandlers(el.events, false)},`
  }
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true)},`
  }
  // slot target
  // only for non-scoped slots
  // 普通插槽的插槽目标名
  if (el.slotTarget && !el.slotScope) {
    data += `slot:${el.slotTarget},`
  }
  // scoped slots
  // 作用域插槽对应的渲染函数
  if (el.scopedSlots) {
    data += `${genScopedSlots(el, el.scopedSlots, state)},`
  }
  // 组件上的v-model
  if (el.model) {
    data += `model:{value:${el.model.value},callback:${el.model.callback},expression:${el.model.expression}},`
  }
  // inline-template
  if (el.inlineTemplate) {
    const inlineTemplate = genInlineTemplate(el, state)
    if (inlineTemplate) {
      data += `${inlineTemplate},`
    }
  }
  // 去掉末尾的逗号添加}
  data = data.replace(/,$/, '') + '}'
  // v-bind dynamic argument wrap
  // v-bind with dynamic arguments must be applied using the same v-bind object
  // merge helper so that class/style/mustUseProp attrs are handled correctly.
  // 处理动态属性名的属性附加在data上
  if (el.dynamicAttrs) {
    data = `_b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})`
  }
  // 将v-bind的对象语法的形式的数据包装到data上
  if (el.wrapData) {
    data = el.wrapData(data)
  }
  // 将v-on的对象语法的形式的事件包装到data上
  if (el.wrapListeners) {
    data = el.wrapListeners(data)
  }
  return data
}

// 对v-on、v-bind、v-cloak、v-html、v-text执行一些函数挂载处理(不需要运行时)
// v-model的处理：在组件上的挂载el.model(不需要运行时)，在input元素上的挂载对应的事件和属性绑定(需要运行时)
// 需要运行时的指令会进行代码拼接返回
// 返回值格式：directives:[{ name, rawName, value, expression , arg, modifiers }, ...]
function genDirectives(el: ASTElement, state: CodegenState): string | void {
  const dirs = el.directives
  if (!dirs) return
  let res = 'directives:['
  // 标记，用于标记指令是否需要在运行时完成的任务，比如 v-model 的 input 事件
  let hasRuntime = false
  let i, l, dir, needRuntime
  // 遍历el.directives下的所有指令
  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i]
    needRuntime = true
    const gen: DirectiveFunction = state.directives[dir.name]
    // 执行vue定义的指令处理函数
    if (gen) {
      // 执行指令的编译方法，如果指令还需要运行时完成一部分任务，则返回 true，如v-model(v-model在组件上时也不需要运行时)
      // 如果只是在元素上挂载一些包裹字符串的方法，则返回false，如v-on、v-bind、v-cloak、v-html、v-text
      // compile-time directive that manipulates AST.
      // returns true if it also needs a runtime counterpart.
      needRuntime = !!gen(el, dir, state.warn)
    }
    // 除了v-on、v-bind、v-cloak、v-html、v-text都会执行
    if (needRuntime) {
      hasRuntime = true
      // 拼接单个指令{ name, rawName, value, expression , arg, modifiers }, 
      res += `{name:"${dir.name}",rawName:"${dir.rawName}"${
        dir.value
          ? `,value:(${dir.value}),expression:${JSON.stringify(dir.value)}`
          : ''
      }${dir.arg ? `,arg:${dir.isDynamicArg ? dir.arg : `"${dir.arg}"`}` : ''}${
        dir.modifiers ? `,modifiers:${JSON.stringify(dir.modifiers)}` : ''
      }},`
    }
  }
  if (hasRuntime) {
    // 只有指令存在运行时任务时，才需要返回 res，其他的会在genData时调用挂载的对应函数处理
    return res.slice(0, -1) + ']'
  }
}

// 生成内联模板并且保存data下的inlineTemplate字段下
function genInlineTemplate(
  el: ASTElement,
  state: CodegenState
): string | undefined {
  const ast = el.children[0]
  // 内联模板必须只有一个元素子节点，其他情况做出警告
  if (__DEV__ && (el.children.length !== 1 || ast.type !== 1)) {
    state.warn(
      'Inline-template components must have exactly one child element.',
      { start: el.start }
    )
  }
  // 生成内联模板并拼接成render函数调用的形式
  if (ast && ast.type === 1) {
    const inlineRenderFns = generate(ast, state.options)
    return `inlineTemplate:{render:function(){${
      inlineRenderFns.render
    }},staticRenderFns:[${inlineRenderFns.staticRenderFns
      .map(code => `function(){${code}}`)
      .join(',')}]}`
  }
}
// 生成data字段下的scopedSlots字段
// data += `${genScopedSlots(el, el.scopedSlots, state)},`
function genScopedSlots(
  el: ASTElement,
  slots: { [key: string]: ASTElement },
  state: CodegenState
): string {
  // by default scoped slots are considered "stable", this allows child
  // components with only scoped slots to skip forced updates from parent.
  // but in some cases we have to bail-out of this optimization
  // for example if the slot contains dynamic names, has v-if or v-for on them...
  // 是否需要强制更新
  let needsForceUpdate =
    el.for ||
    Object.keys(slots).some(key => {
      const slot = slots[key]
      return (
        slot.slotTargetDynamic || slot.if || slot.for || containsSlotChild(slot) // is passing down slot from parent which may be dynamic
      )
    })

  // #9534: if a component with scoped slots is inside a conditional branch,
  // it's possible for the same component to be reused but with different
  // compiled slot content. To avoid that, we generate a unique key based on
  // the generated code of all the slot contents.
  let needsKey = !!el.if

  // OR when it is inside another scoped slot or v-for (the reactivity may be
  // disconnected due to the intermediate scope variable)
  // #9438, #9506
  // TODO: this can be further optimized by properly analyzing in-scope bindings
  // and skip force updating ones that do not actually use scope variables.
  if (!needsForceUpdate) {
    let parent = el.parent
    // 递归父节点
    while (parent) {
      // 如果节点处于另一个作用域插槽内或处于for的某个分支下，则需要强制更新???
      if (
        (parent.slotScope && parent.slotScope !== emptySlotScopeToken) ||
        parent.for
      ) {
        needsForceUpdate = true
        break
      }
      // 如果节点处于if的某个分支，则需要key???
      if (parent.if) {
        needsKey = true
      }
      parent = parent.parent
    }
  }
  // 生成每个作用域插槽的代码
  // generatedSlots 结果形式为：{ key:xxx, fn:xxx } 对象，或以此对象为成员的数组 以逗号拼接组成的字符串
  const generatedSlots = Object.keys(slots)
    .map(key => genScopedSlot(slots[key], state))
    .join(',')

  return `scopedSlots:_u([${generatedSlots}]${
    needsForceUpdate ? `,null,true` : ``
  }${
    !needsForceUpdate && needsKey ? `,null,false,${hash(generatedSlots)}` : ``
  })`
}

function hash(str) {
  let hash = 5381
  let i = str.length
  while (i) {
    hash = (hash * 33) ^ str.charCodeAt(--i)
  }
  return hash >>> 0
}

// 返回元素是否有slot子元素
function containsSlotChild(el: ASTNode): boolean {
  if (el.type === 1) {
    if (el.tag === 'slot') {
      return true
    }
    return el.children.some(containsSlotChild)
  }
  return false
}

// 生成单个作用域插槽的代码
// 返回值形式为 { key:xxx, fn:xxx } 对象，或以此对象为成员的数组
// key表示插槽目标，fn表示插槽的render函数
function genScopedSlot(el: ASTElement, state: CodegenState): string {
  const isLegacySyntax = el.attrsMap['slot-scope']
  // 插槽上有v-if语法，生成三元表达式语法
  // 此处三元表达式后调用会产生一个对象，形式为{ key:xxx, fn:xxx } 
  if (el.if && !el.ifProcessed && !isLegacySyntax) {
    return genIf(el, state, genScopedSlot, `null`)
  }
  // 插槽上有v-for语法，生成_l函数包裹的代码
  // 此处_l函数调用后会生成一个对象数组，其中的成员都为 { key:xxx, fn:xxx } 形式
  if (el.for && !el.forProcessed) {
    return genFor(el, state, genScopedSlot)
  }
  // 作用域插槽使用的代名
  const slotScope = el.slotScope === emptySlotScopeToken ? `` : String(el.slotScope)
  const fn =
    `function(${slotScope}){` +
    `return ${
      el.tag === 'template'
        ? el.if && isLegacySyntax
          ? `(${el.if})?${genChildren(el, state) || 'undefined'}:undefined`
          : genChildren(el, state) || 'undefined'
        : genElement(el, state)
    }}`
  // reverse proxy v-slot without scope on this.$slots
  const reverseProxy = slotScope ? `` : `,proxy:true`
  return `{key:${el.slotTarget || `"default"`},fn:${fn}${reverseProxy}}`
}


// 生成子节点的数组字符串，格式大致为
// `[_c(xxx),_v(exp),_e(text)....],normalizationType`
export function genChildren(
  el: ASTElement,
  state: CodegenState,
  checkSkip?: boolean,
  altGenElement?: Function,
  altGenNode?: Function
): string | void {
  const children = el.children
  if (children.length) {
    const el: any = children[0]
    // 只有一个不为template、slot，且有v-for指令的子节点
    // 返回字符串 `genElement(el, state)的结果,normalizationType`
    if (
      children.length === 1 &&
      el.for &&
      el.tag !== 'template' &&
      el.tag !== 'slot'
    ) {
      const normalizationType = checkSkip
        ? state.maybeComponent(el)
          ? `,1`
          : `,0`
        : ``
      return `${(altGenElement || genElement)(el, state)}${normalizationType}`
    }
    // 其他情况的子节点
    const normalizationType = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0
    // 
    const gen = altGenNode || genNode
    // 文本节点和注释节点直接生成，元素节点递归
    return `[${children.map(c => gen(c, state)).join(',')}]${
      normalizationType ? `,${normalizationType}` : ''
    }`
  }
}

// determine the normalization needed for the children array.
// 0: no normalization needed
// 1: simple normalization needed (possible 1-level deep nested array)
// 2: full normalization needed
// normalizationType一共有三个可选值
function getNormalizationType(
  children: Array<ASTNode>,
  maybeComponent: (el: ASTElement) => boolean
): number {
  let res = 0
  // 所有遍历子节点
  for (let i = 0; i < children.length; i++) {
    const el: ASTNode = children[i]
    // 只查询元素节点
    if (el.type !== 1) {
      continue
    }
    // 元素或元素下的ifConditions的block有v-for或template标签、slot标签 返回值2
    if (
      needsNormalization(el) ||
      (el.ifConditions &&
        el.ifConditions.some(c => needsNormalization(c.block)))
    ) {
      res = 2
      break
    }
    // 元素或元素下的ifConditions的block为组件标签 返回值1
    if (
      maybeComponent(el) ||
      (el.ifConditions && el.ifConditions.some(c => maybeComponent(c.block)))
    ) {
      res = 1
    }
  }
  // 都不存在 返回值0
  return res
}
// 需要规范化的条件：有v-for或template标签、slot标签
function needsNormalization(el: ASTElement): boolean {
  return el.for !== undefined || el.tag === 'template' || el.tag === 'slot'
}

// 根据节点类型生成元素、文本、注释节点
function genNode(node: ASTNode, state: CodegenState): string {
  if (node.type === 1) {
    return genElement(node, state)
  } else if (node.type === 3 && node.isComment) {
    return genComment(node)
  } else {
    return genText(node)
  }
}
// 生成文本节点
export function genText(text: ASTText | ASTExpression): string {
  return `_v(${
    text.type === 2
      ? text.expression // no need for () because already wrapped in _s()
      : transformSpecialNewlines(JSON.stringify(text.text))
  })`
}
// 生成注释节点的代码
// 返回格式:_t(slotName, children, attrs, bind) 
export function genComment(comment: ASTText): string {
  return `_e(${JSON.stringify(comment.text)})`
}

// 生成插槽的代码
function genSlot(el: ASTElement, state: CodegenState): string {
  const slotName = el.slotName || '"default"'
  const children = genChildren(el, state)
  let res = `_t(${slotName}${children ? `,function(){return ${children}}` : ''}`
  // 获取属性
  const attrs =
    el.attrs || el.dynamicAttrs
      ? genProps(
          (el.attrs || []).concat(el.dynamicAttrs || []).map(attr => ({
            // slot props are camelized
            name: camelize(attr.name),
            value: attr.value,
            dynamic: attr.dynamic
          }))
        )
      : null
  // 获取v-bind后面直接跟对象的情况的属性
  const bind = el.attrsMap['v-bind']
  if ((attrs || bind) && !children) {
    res += `,null`
  }
  if (attrs) {
    res += `,${attrs}`
  }
  if (bind) {
    res += `${attrs ? '' : ',null'},${bind}`
  }
  // _t(slotName, children, attrs, bind) 
  // 缺少的参数用null填补
  return res + ')'
}

// componentName is el.component, take it as argument to shun flow's pessimistic refinement
// 生成动态组件的代码
function genComponent(
  componentName: string,
  el: ASTElement,
  state: CodegenState
): string {
  const children = el.inlineTemplate ? null : genChildren(el, state, true)
  return `_c(${componentName},${genData(el, state)}${
    children ? `,${children}` : ''
  })`
}

// 传入属性对象，生成给定属性的字符串，处理动态属性名,最后处理为一个对象
// 返回格式：`_d({name1:value1,name2:value2....},[name3,value3,name4,value4....])`
function genProps(props: Array<ASTAttr>): string {
  let staticProps = ``
  // 用于存放动态属性名的字符串
  let dynamicProps = ``
  // 遍历所有属性
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]
    const value = transformSpecialNewlines(prop.value)
    if (prop.dynamic) {
      dynamicProps += `${prop.name},${value},`
    } else {
      staticProps += `"${prop.name}":${value},`
    }
  }
  // slice(0,-1)去掉最后一个逗号
  staticProps = `{${staticProps.slice(0, -1)}}`
  if (dynamicProps) {
    return `_d(${staticProps},[${dynamicProps.slice(0, -1)}])`
  } else {
    return staticProps
  }
}

// #3895, #4268
function transformSpecialNewlines(text: string): string {
  return text.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
