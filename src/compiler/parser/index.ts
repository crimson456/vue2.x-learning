import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize, hyphenate } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex
} from '../helpers'

import {
  ASTAttr,
  ASTElement,
  ASTIfCondition,
  ASTNode,
  ASTText,
  CompilerOptions
} from 'types/compiler'
//匹配@或v-on开头的属性
export const onRE = /^@|^v-on:/
//匹配v-或@或:开头的属性
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/
  : /^v-|^@|^:|^#/
//匹配v-for指令(分为三个部分)
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/
//匹配v-for中in|of前最后可以有三个逗号分隔的参数
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
//
const stripParensRE = /^\(|\)$/g
//匹配v-slot中是否为动态插槽名
const dynamicArgRE = /^\[.*\]$/

//匹配并捕获:开头的属性
const argRE = /:(.*)$/
//匹配:或v-bind开头的属性
export const bindRE = /^:|^\.|^v-bind:/
//
const propBindRE = /^\./
//匹配属性中的修饰符
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g

//匹配v-slot指令的值
const slotRE = /^v-slot(:|$)|^#/

//
const lineBreakRE = /[\r\n]/
//
const whitespaceRE = /[ \f\t\r\n]+/g

//
const invalidAttributeRE = /[\s"'<>\/=]/

const decodeHTMLCached = cached(he.decode)

export const emptySlotScopeToken = `_empty_`

// configurable state
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
let maybeComponent

export function createASTElement(
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    rawAttrsMap: {},
    parent,
    children: []
  }
}

/**
 * Convert HTML string to AST.
 */
export function parse(template: string, options: CompilerOptions): ASTElement {
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no
  const isReservedTag = options.isReservedTag || no
  maybeComponent = (el: ASTElement) =>
    !!(
      el.component ||
      el.attrsMap[':is'] ||
      el.attrsMap['v-bind:is'] ||
      !(el.attrsMap.is ? isReservedTag(el.attrsMap.is) : isReservedTag(el.tag))
    )
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  const stack: any[] = []
  const preserveWhitespace = options.preserveWhitespace !== false
  const whitespaceOption = options.whitespace
  let root
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  function warnOnce(msg, range) {
    if (!warned) {
      warned = true
      warn(msg, range)
    }
  }

  function closeElement(element) {
    //去掉空白的结尾文本节点
    trimEndingWhitespace(element)
    //如果没有v-pre指令，正常进行处理
    if (!inVPre && !element.processed) {
      element = processElement(element, options)
    }
    // 处理如果不止一个根元素的情况
    if (!stack.length && element !== root) {
      // 允许根元素用v-if, v-else-if and v-else定义
      if (root.if && (element.elseif || element.else)) {
        if (__DEV__) {
          //每个分支都进行限制
          checkRootConstraints(element)
        }
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        })
      } else if (__DEV__) {
        warnOnce(
          `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`,
          { start: element.start }
        )
      }
    }
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent)
      } else {
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[
            name
          ] = element
        }
        currentParent.children.push(element)
        element.parent = currentParent
      }
    }

    // final children cleanup
    // filter out scoped slots
    element.children = element.children.filter(c => !c.slotScope)
    // remove trailing whitespace node again
    trimEndingWhitespace(element)

    // check pre state
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }
  //去掉空白的结尾文本节点
  function trimEndingWhitespace(el) {
    // remove trailing whitespace node
    if (!inPre) {
      let lastNode
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === ' '
      ) {
        el.children.pop()
      }
    }
  }
  //处理根节点的限制
  function checkRootConstraints(el) {
    //根节点不能使用template标签和slot标签
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
          'contain multiple nodes.',
        { start: el.start }
      )
    }
    //根节点不能添加v-for指令
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
          'it renders multiple elements.',
        el.rawAttrsMap['v-for']
      )
    }
  }

  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,
    //处理开始标签
    start(tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      const ns =
        (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }
      //创建为开始标签创建一个AST元素
      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      //ns(nameSpace为SVG或MathML相关的处理)
      if (ns) {
        element.ns = ns
      }
      //开发环境下的提示
      if (__DEV__) {
        //将属性数组解析成 { attrName: { name: attrName, value: attrVal, start, end }, ... } 形式的对象
        if (options.outputSourceRange) {
          element.start = start
          element.end = end
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr
            return cumulated
          }, {})
        }
        //验证属性是否有效（属性名不能包含: spaces, quotes, <, >, / or =.)
        attrs.forEach(attr => {
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
                `spaces, quotes, <, >, / or =.`,
              options.outputSourceRange
                ? {
                    start: attr.start! + attr.name.indexOf(`[`),
                    end: attr.start! + attr.name.length
                  }
                : undefined
            )
          }
        })
      }
      // 非服务端渲染的情况下，模版中不应该出现 style、script 标签
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        __DEV__ &&
          warn(
            'Templates should only be responsible for mapping the state to the ' +
              'UI. Avoid placing tags with side-effects in your templates, such as ' +
              `<${tag}>` +
              ', as they will not be parsed.',
            { start: element.start }
          )
      }
      /**
      * 为 element 对象分别执行 class、style、model 模块中的 preTransformNode 方法
      * 不过 web 平台只有 model 模块有 preTransformNode 方法
      * 用来处理存在 v-model 的 input 标签，但没处理 v-model 属性
      * 分别处理了 input 为 checkbox、radio 和 其它的情况
      */
      // apply pre-transforms
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }
      //如果存在v-pre指令，新增element.pre = true 且防止同一个标签下重复处理
      //v-pre指令：不处理内部的模板
      if (!inVPre) {
        processPre(element)
        if (element.pre) {
          inVPre = true
        }
      }
      // 处理pre标签
      // pre标签：原格式输出标签内的内容
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) {
        // 如果标签上存在 v-pre 指令，这样的节点只会渲染一次
        // 直接将节点上的属性都设置到 el.attrs 数组对象中，作为静态属性，数据更新时不会渲染这部分内容
        // 设置 el.attrs 数组对象，每个元素都是一个属性对象 { name: attrName, value: attrVal, start, end }
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives
        // 处理v-for指令，在el上挂载for、alias、iterator1、iterator2字段
        processFor(element)
        // 处理v-if、v-else-if、v-else指令，在el上挂载if、elseif、else、ifConditions字段
        processIf(element)
        // 处理v-once指令，在el上挂载once字段
        processOnce(element)
      }
      //第一个处理的开始标签置为根节点
      if (!root) {
        root = element
        if (__DEV__) {
          //处理根节点的限制
          checkRootConstraints(root)
        }
      }
      //根据标签是否闭合分别处理
      if (!unary) {
        //双标签
        //将当前标签置为下一个开标签的父节点，并且保存在栈结构中
        currentParent = element
        stack.push(element)
      } else {
        //单闭合标签
        //处理标签闭合
        closeElement(element)
      }
    },

    end(tag, start, end) {
      const element = stack[stack.length - 1]
      // pop stack
      stack.length -= 1
      currentParent = stack[stack.length - 1]
      if (__DEV__ && options.outputSourceRange) {
        element.end = end
      }
      closeElement(element)
    },

    chars(text: string, start?: number, end?: number) {
      if (!currentParent) {
        if (__DEV__) {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start }
            )
          } else if ((text = text.trim())) {
            warnOnce(`text "${text}" outside root element will be ignored.`, {
              start
            })
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (
        isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      if (inPre || text.trim()) {
        text = isTextTag(currentParent)
          ? text
          : (decodeHTMLCached(text) as string)
      } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        text = ''
      } else if (whitespaceOption) {
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' '
        } else {
          text = ' '
        }
      } else {
        text = preserveWhitespace ? ' ' : ''
      }
      if (text) {
        if (!inPre && whitespaceOption === 'condense') {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, ' ')
        }
        let res
        let child: ASTNode | undefined
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          }
        } else if (
          text !== ' ' ||
          !children.length ||
          children[children.length - 1].text !== ' '
        ) {
          child = {
            type: 3,
            text
          }
        }
        if (child) {
          if (__DEV__ && options.outputSourceRange) {
            child.start = start
            child.end = end
          }
          children.push(child)
        }
      }
    },
    comment(text: string, start, end) {
      // adding anything as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      if (currentParent) {
        const child: ASTText = {
          type: 3,
          text,
          isComment: true
        }
        if (__DEV__ && options.outputSourceRange) {
          child.start = start
          child.end = end
        }
        currentParent.children.push(child)
      }
    }
  })
  return root
}

// 处理各种指令、属性的函数

// 处理v-pre指令
function processPre(el) {
  // 如果标签上存在v-pre指令，添加 el.pre 标志位
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

// 将el.attrsList上的属性直接挂在el.attrs上，不作特殊处理(v-pre指令使用)
function processRawAttrs(el) {
  const list = el.attrsList
  const len = list.length
  if (len) {
    const attrs: Array<ASTAttr> = (el.attrs = new Array(len))
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value)
      }
      if (list[i].start != null) {
        attrs[i].start = list[i].start
        attrs[i].end = list[i].end
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true
  }
}

export function processElement(element: ASTElement, options: CompilerOptions) {
  // 处理动态绑定的key属性值，在element上挂载key字段
  processKey(element)
  // determine whether this is a plain element after
  // removing structural attributes
  // 挂载element.plain用于标识el是否是一个普通元素    ???
  element.plain = !element.key && !element.scopedSlots && !element.attrsList.length
  // 获取ref值并挂载到element.ref上，检查父元素上是否有for字段挂载到element.refInFor字段
  processRef(element)
  // 处理插槽内容，父组件端使用时的部分，在element上挂载slotTarget、slotTargetDynamic、slotScope字段
  processSlotContent(element)
  // 处理slot标签的闭合，在element上挂载slotName字段
  processSlotOutlet(element)
  // 处理动态组件和组件的内联模板，在element上挂载component、inlineTemplate字段
  processComponent(element)
  // 执行 class、style、model 模块中的 transformNode 方法
  // web 平台只有 class、style 模块有 transformNode 方法，分别用来处理 class 属性和 style 属性
  // 在element上挂载staticStyle、styleBinding、staticClass、classBinding字段
  // 分别存放静态 style 属性的值、动态 style 属性的值，以及静态 class 属性的值和动态 class 属性的值
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  /**
   * 处理元素上的所有属性：
   * v-bind 指令变成：el.attrs 或 el.dynamicAttrs = [{ name, value, start, end, dynamic }, ...]，
   *                或者是必须使用 props 的属性，变成了 el.props = [{ name, value, start, end, dynamic }, ...]
   * v-on 指令变成：el.events 或 el.nativeEvents = { name: [{ value, start, end, modifiers, dynamic }, ...] }
   * 其它指令：el.directives = [{name, rawName, value, arg, isDynamicArg, modifier, start, end }, ...]
   * 原生属性：el.attrs = [{ name, value, start, end }]，或者一些必须使用 props 的属性，变成了：
   *         el.props = [{ name, value: true, start, end, dynamic }]
   */
  processAttrs(element)
  return element
}
// 处理 :key (动态绑定的key)值
function processKey(el) {
  const exp = getBindingAttr(el, 'key')
  if (exp) {
    if (__DEV__) {
      if (el.tag === 'template') {
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, 'key')
        )
      }
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1
        const parent = el.parent
        if (
          iterator &&
          iterator === exp &&
          parent &&
          parent.tag === 'transition-group'
        ) {
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
              `this is the same as not using keys.`,
            getRawBindingAttr(el, 'key'),
            true /* tip */
          )
        }
      }
    }
    el.key = exp
  }
}
// 处理 :ref (动态绑定的ref)值
function processRef(el) {
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref
    el.refInFor = checkInFor(el)
  }
}
//处理v-for指令
export function processFor(el: ASTElement) {
  let exp
  //如果存在v-for指令，获取v-for指令的值
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    //解析v-for指令，返回一个对象
    const res = parseFor(exp)
    if (res) {
      //将对象合并到el上
      extend(el, res)
    } else if (__DEV__) {
      warn(`Invalid v-for expression: ${exp}`, el.rawAttrsMap['v-for'])
    }
  }
}
//解析v-for结果对象类型
type ForParseResult = {
  for: string
  alias: string
  iterator1?: string
  iterator2?: string
}
//解析v-for指令，并生成一个参数结果对象
export function parseFor(exp: string): ForParseResult | undefined {
  //捕获v-for中的参数
  const inMatch = exp.match(forAliasRE)
  if (!inMatch) return
  const res: any = {}
  //捕获要遍历的对象
  res.for = inMatch[2].trim()
  //捕获当前使用遍历的每一项(可能包括三项item,key,index)
  const alias = inMatch[1].trim().replace(stripParensRE, '')
  const iteratorMatch = alias.match(forIteratorRE)
  if (iteratorMatch) {
    //捕获每一项使用的别名
    res.alias = alias.replace(forIteratorRE, '').trim()
    //捕获属性中的其他两项
    res.iterator1 = iteratorMatch[1].trim()
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim()
    }
  } else {
    res.alias = alias
  }
  return res
}
//处理v-if、v-else-if、v-else指令
function processIf(el) {
  const exp = getAndRemoveAttr(el, 'v-if')
  if (exp) {
    el.if = exp
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}

function processIfConditions(el, parent) {
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (__DEV__) {
    warn(
      `v-${el.elseif ? 'else-if="' + el.elseif + '"' : 'else'} ` +
        `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    )
  }
}

function findPrevElement(children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (__DEV__ && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
            `will be ignored.`,
          children[i]
        )
      }
      children.pop()
    }
  }
}
//向el的ifConditions字段数组上推入
export function addIfCondition(el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}
//处理v-once指令
function processOnce(el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
// 处理插槽内容
function processSlotContent(el) {
  let slotScope
  // 获取slot-scope属性(或template标签上的scope属性)并挂载在element.slotScope字段上
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope')
    /* istanbul ignore if */
    if (__DEV__ && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
        el.rawAttrsMap['scope'],
        true
      )
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    if (__DEV__ && el.attrsMap['v-for']) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
          `(v-for takes higher priority). Use a wrapper <template> for the ` +
          `scoped slot to make it clearer.`,
        el.rawAttrsMap['slot-scope'],
        true
      )
    }
    el.slotScope = slotScope
  }

  // slot="xxx"
  // 获取slot属性并挂载在element.slotTarget或el.slotTargetDynamic字段上
  const slotTarget = getBindingAttr(el, 'slot')
  if (slotTarget) {
    // 静态绑定插槽名
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
    // 是否为动态插槽
    el.slotTargetDynamic = !!(
      el.attrsMap[':slot'] || el.attrsMap['v-bind:slot']
    )
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    // ??? 如果不是template标签且没有slotScope字段，为element.attr添加静态绑定slot对象
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'))
    }
  }

  // 2.6 v-slot syntax
  // 新语法v-slot，v-slot指令只能用于template标签和组件标签
  if (process.env.NEW_SLOT_SYNTAX) {
    if (el.tag === 'template') {
      // v-slot 在 tempalte 标签上
      // 得到 v-slot 属性项
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (__DEV__) {
          // 两种语法重用提示
          if (el.slotTarget || el.slotScope) {
            warn(`Unexpected mixed usage of different slot syntaxes.`, el)
          }
          // v-slot不在根组件的直接子元素上的提示
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              `<template v-slot> can only appear at the root level inside ` +
                `the receiving component`,
              el
            )
          }
        }
        // 从属性项解析处插槽名称和是否为动态插槽
        const { name, dynamic } = getSlotName(slotBinding)
        el.slotTarget = name
        el.slotTargetDynamic = dynamic
        // 作用域插槽的值
        el.slotScope = slotBinding.value || emptySlotScopeToken // force it into a scoped slot for perf
      }
    } else {
      // v-slot在组件标签上
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (__DEV__) {
          //v-slot用于其他标签的提示
          if (!maybeComponent(el)) {
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            )
          }
          //两种语法重用的提示
          if (el.slotScope || el.slotTarget) {
            warn(`Unexpected mixed usage of different slot syntaxes.`, el)
          }
          // 为了避免作用域歧义，当存在其他命名插槽时，默认槽也应该使用<template>语法
          // 作用原理：当一个有el.slotScope属性的元素闭合时，会给父元素添加el.scopedSlots属性，父元素闭合时(此处)就会检查
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
                `<template> syntax when there are other named slots.`,
              slotBinding
            )
          }
        }
        // add the component's children to its default slot
        const slots = el.scopedSlots || (el.scopedSlots = {})
        // 从属性项解析处插槽名称和是否为动态插槽
        const { name, dynamic } = getSlotName(slotBinding)
        // 创建一个template元素用于放置插槽，相当于多添加了一层template标签，其他和前面的情况相同
        const slotContainer = (slots[name] = createASTElement(
          'template',
          [],
          el
        ))
        slotContainer.slotTarget = name
        slotContainer.slotTargetDynamic = dynamic
        //遍历子组件，让他们的父组件都添加上新的template标签
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer
            return true
          }
        })
        // 作用域插槽的值
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken
        // remove children as they are returned from scopedSlots now
        el.children = []
        // mark el non-plain so data gets generated
        el.plain = false
      }
    }
  }
}
// 解析v-slot指令语句，返回名称和是否为动态插槽的对象
function getSlotName(binding) {
  let name = binding.name.replace(slotRE, '')
  if (!name) {
    if (binding.name[0] !== '#') {
      name = 'default'
    } else if (__DEV__) {
      warn(`v-slot shorthand syntax requires a slot name.`, binding)
    }
  }
  return dynamicArgRE.test(name)
    ? // dynamic [name]
      { name: name.slice(1, -1), dynamic: true }
    : // static name
      { name: `"${name}"`, dynamic: false }
}

// handle <slot/> outlets
function processSlotOutlet(el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name')
    if (__DEV__ && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
          `and can possibly expand into multiple elements. ` +
          `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, 'key')
      )
    }
  }
}
// 处理动态组件和组件的内联模板
function processComponent(el) {
  let binding
  // 获取is属性的值，挂载el.component
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  // 获取inline-template属性的值，挂载el.inlineTemplate
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

function processAttrs(el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name
    value = list[i].value
    if (dirRE.test(name)) {
      // mark element as dynamic
      el.hasBindings = true
      // modifiers
      modifiers = parseModifiers(name.replace(dirRE, ''))
      // support .foo shorthand syntax for the .prop modifier
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        ;(modifiers || (modifiers = {})).prop = true
        name = `.` + name.slice(1).replace(modifierRE, '')
      } else if (modifiers) {
        name = name.replace(modifierRE, '')
      }
      if (bindRE.test(name)) {
        // v-bind
        name = name.replace(bindRE, '')
        value = parseFilters(value)
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        if (__DEV__ && value.trim().length === 0) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          )
        }
        if (modifiers) {
          if (modifiers.prop && !isDynamic) {
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          if (modifiers.camel && !isDynamic) {
            name = camelize(name)
          }
          if (modifiers.sync) {
            syncGen = genAssignmentCode(value, `$event`)
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              )
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                )
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              )
            }
          }
        }
        if (
          (modifiers && modifiers.prop) ||
          (!el.component && platformMustUseProp(el.tag, el.attrsMap.type, name))
        ) {
          addProp(el, name, value, list[i], isDynamic)
        } else {
          addAttr(el, name, value, list[i], isDynamic)
        }
      } else if (onRE.test(name)) {
        // v-on
        name = name.replace(onRE, '')
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic)
      } else {
        // normal directives
        name = name.replace(dirRE, '')
        // parse arg
        const argMatch = name.match(argRE)
        let arg = argMatch && argMatch[1]
        isDynamic = false
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1)
            isDynamic = true
          }
        }
        addDirective(
          el,
          name,
          rawName,
          value,
          arg,
          isDynamic,
          modifiers,
          list[i]
        )
        if (__DEV__ && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute
      if (__DEV__) {
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
              'Interpolation inside attributes has been removed. ' +
              'Use v-bind or the colon shorthand instead. For example, ' +
              'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          )
        }
      }
      addAttr(el, name, JSON.stringify(value), list[i])
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (
        !el.component &&
        name === 'muted' &&
        platformMustUseProp(el.tag, el.attrsMap.type, name)
      ) {
        addProp(el, name, 'true', list[i])
      }
    }
  }
}
// 返回父元素中for字段是否为true
function checkInFor(el: ASTElement): boolean {
  let parent: ASTElement | void = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function parseModifiers(name: string): Object | void {
  const match = name.match(modifierRE)
  if (match) {
    const ret = {}
    match.forEach(m => {
      ret[m.slice(1)] = true
    })
    return ret
  }
}

function makeAttrsMap(attrs: Array<Record<string, any>>): Record<string, any> {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (__DEV__ && map[attrs[i].name] && !isIE && !isEdge) {
      warn('duplicate attribute: ' + attrs[i].name, attrs[i])
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag(el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}

function isForbiddenTag(el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' &&
      (!el.attrsMap.type || el.attrsMap.type === 'text/javascript'))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug(attrs) {
  const res: any[] = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

function checkForAliasModel(el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
          `You are binding v-model directly to a v-for iteration alias. ` +
          `This will not be able to modify the v-for source array because ` +
          `writing to the alias is like modifying a function local variable. ` +
          `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap['v-model']
      )
    }
    _el = _el.parent
  }
}
