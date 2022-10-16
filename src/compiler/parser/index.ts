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
//匹配是否为动态参数名 eg. <div :[id]="test"></div>
const dynamicArgRE = /^\[.*\]$/

//匹配并捕获指令的参数  v-dir:arg="xxx"
const argRE = /:(.*)$/
//匹配:或v-bind开头的属性
export const bindRE = /^:|^\.|^v-bind:/
//匹配.prop修饰符的简写形式 .xxx
const propBindRE = /^\./
//匹配属性中的修饰符
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g

//匹配v-slot指令的值
const slotRE = /^v-slot(:|$)|^#/

//匹配换行符，用于文本处理时是否将 换行符处理为一个空白
const lineBreakRE = /[\r\n]/
//匹配所有空白符
const whitespaceRE = /[ \f\t\r\n]+/g

//匹配字符spaces, quotes, <, >, / ， =，用于验证标签上的属性是否有效
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
  // 处理对应元素的结束标签的主逻辑
  function closeElement(element) {
    //去掉空白的结尾文本节点
    trimEndingWhitespace(element)
    //如果没有v-pre指令，正常进行处理元素关闭
    if (!inVPre && !element.processed) {
      // 处理元素上的各种属性
      element = processElement(element, options)
    }
    // 处理如果不止一个根元素的情况
    if (!stack.length && element !== root) {
      // 允许有多个根元素用v-if, v-else-if,v-else定义
      if (root.if && (element.elseif || element.else)) {
        if (__DEV__) {
          //每个分支都进行限制
          checkRootConstraints(element)
        }
        // 给根元素添加ifCondition字段 ???这段处理的意义是什么
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        })
      }
      // 提示根元素v-if指令必须和 v-else-if, v-else同用，确保一定有一个根元素
      else if (__DEV__) {
        warnOnce(
          `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`,
          { start: element.start }
        )
      }
    }
    // 处理节点之间的关系
    if (currentParent && !element.forbidden) {
      // 如果存在v-else-if或v-else指令，则向对应v-if指令的元素ifConditions字段添加一项  ???作用
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent)
      } 
      else {
        // 如果当前元素为作用域插槽，将其slotTarget字段记录在父元素的scopedSlots字段下
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          const name = element.slotTarget || '"default"';
          (currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        }
        // 将自己放到父元素的 children 数组中，然后设置自己的 parent 属性为 currentParent
        currentParent.children.push(element)
        element.parent = currentParent
      }
    }
    //去除子节点中所有作用域插槽
    element.children = element.children.filter(c => !c.slotScope)
    //去掉空白的结尾文本节点
    trimEndingWhitespace(element)

    // 处理有v-pre指令标签的闭合
    if (element.pre) {
      inVPre = false
    }
    // 处理pre标签的闭合
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // 分别为 element 执行 model、class、style 三个模块的 postTransform 方法
    // 但是 web 平台没有提供该方法
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
    outputSourceRange: options.outputSourceRange,     //options.outputSourceRange === __DEV__
    // 处理开始标签
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
        //验证属性是否有效（属性名不能包含: spaces, quotes, <, >, / or =)
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
    // 处理标签结束
    end(tag, start, end) {
      const element = stack[stack.length - 1]
      // 出栈
      stack.length -= 1
      currentParent = stack[stack.length - 1]
      // options.outputSourceRange === __DEV__
      if (__DEV__ && options.outputSourceRange) {
        // 更新结束位置
        element.end = end
      }
      // 处理标签结束
      closeElement(element)
    },
    // 解析文本内容
    chars(text: string, start?: number, end?: number) {
      // 文本没有父元素,异常处理
      if (!currentParent) {
        if (__DEV__) {
          // 对没有根标签的情况进行提示
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start }
            )
          } 
          // 对根元素外有文本的情况进行提示
          else if ((text = text.trim())) {
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
      // 处理在pre标签中文本、非空白文本的解码和空白文本处理问题(初步处理)
      if (inPre || text.trim()) {
        // 在pre标签中,或者文本不是空白的情况
        text = isTextTag(currentParent)
        // style和script标签中文本不需要解码
          ? text
          : (decodeHTMLCached(text) as string)
      } else if (!children.length) {
        // 不在pre标签,且文本是空白的情况,且前面有闭合的子元素
        text = ''
      } else if (whitespaceOption) {
        // 不在pre标签,且文本是空白的情况,且前面没有闭合的子元素,且存在whitespaceOption的情况
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' '
        } else {
          text = ' '
        }
      } else {
        // 不在pre标签,且文本是空白的情况,且前面没有闭合的子元素,且不存在whitespaceOption的情况
        text = preserveWhitespace ? ' ' : ''
      }
      // 经过初步处理后文本还存在
      if (text) {
        // 不在pre标签中且有压缩选项，则将连续空白压缩为单个
        if (!inPre && whitespaceOption === 'condense') {
          text = text.replace(whitespaceRE, ' ')
        }
        let res
        let child: ASTNode | undefined
        // 处理为表达式节点
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          // 不在v-pre指令中，且文本不为单个空白，且匹配到模板分隔符
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          }
        } 
        // 处理为纯文本节点
        else if (
          text !== ' ' ||
          !children.length ||
          children[children.length - 1].text !== ' '
        ) {
          // 在v-pre指令中，或文本为单个空白，或未匹配到模板语法
          // 且满足文本不为单个空白，或前面没有闭合的同级节点，或前面的同级节点文本为单个空白
          // 此处逻辑复杂，可从单个空白入手整理，可为：
          // 1.文本为单个空白，前面没有闭合同级节点或同级节点文本为单个空白
          // 2.文本不为单个空白，处于v-pre指令中或没有模板语法
          child = {
            type: 3,
            text
          }
        }
        // 入栈
        if (child) {
          if (__DEV__ && options.outputSourceRange) {
            child.start = start
            child.end = end
          }
          children.push(child)
        }
      }
    },
    // 处理注释标签
    comment(text: string, start, end) {
      // adding anything as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      // 生成文本节点并入栈
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
// 正常处理元素关闭
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
  // 在element上挂载staticStyle、styleBinding、staticClass、classBinding字段，分别存放静态和动态绑定的 style、class 属性的值
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  // 处理元素上的其他所有属性：
  // 动态绑定、事件绑定、指令、普通属性
  // element上挂载attrs、dynamicAttrs、props、events、nativeEvents、directives
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
  // 查找前一个元素节点
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    // 给前一个元素添加ifConditions字段
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } 
  // 提示v-else-if或v-else指令没有对应的v-if指令
  else if (__DEV__) {
    warn(
      `v-${el.elseif ? 'else-if="' + el.elseif + '"' : 'else'} ` +
        `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    )
  }
}

// 遍历寻找数组中前一个元素节点
function findPrevElement(children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      // 如果不是元素节点，且节点text字段为空，则删除此节点并提示
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
// 处理插槽内容相关
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

// 处理slot标签结束 </slot>
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
// 处理剩下的其他属性，也就是正常的用户定义的和指令无关属性(前面使用的属性都从attrsList中取出)
// 挂载
function processAttrs(el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic
  // 遍历剩下的所有属性
  for (i = 0, l = list.length; i < l; i++) {
    // 属性名，name后面用作不包括修饰符的属性名
    name = rawName = list[i].name
    // 属性值
    value = list[i].value
    // 属性是否为指令(以 v- @ # . ：开头为指令)
    if (dirRE.test(name)) {
      // mark element as dynamic
      // 如果元素上存在指令，则标记为动态元素
      el.hasBindings = true
      // 获取修饰符
      modifiers = parseModifiers(name.replace(dirRE, ''))

      // 处理有修饰符的情况下，获取不包括修饰符的属性名
      // support .foo shorthand syntax for the .prop modifier
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        // 处理 修饰符.prop时的 简写形式 ，好像没有写入文档 v3.2加入文档
        ;(modifiers || (modifiers = {})).prop = true
        name = `.` + name.slice(1).replace(modifierRE, '')
      } else if (modifiers) {
        name = name.replace(modifierRE, '')
      }

      // 处理动态绑定的属性(以 : v-bind: . 开头为动态绑定)
      // 挂载element上的props、attrs、dynamicAttrs字段
      if (bindRE.test(name)) {
        // 属性名
        name = name.replace(bindRE, '')
        // 属性值，进行过滤器处理
        value = parseFilters(value)
        // 处理动态的属性名 eg.  <div :[id]="test"></div>
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        // 提示动态绑定属性值不能为空
        if (__DEV__ && value.trim().length === 0) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          )
        }
        // 存在修饰符的情况，处理修饰符命名转换，以方便后续转换使用
        if (modifiers) {
          // 处理.prop修饰符 
          if (modifiers.prop && !isDynamic) {
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          // 处理.camel修饰符
          if (modifiers.camel && !isDynamic) {
            name = camelize(name)
          }
          // 处理.sync修饰符  sync修饰符是事件绑定的语法糖
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
        // 判断需要转化为attribute还是property(attribute是html标签中的属性，property是dom层面的js属性)
        // 其中最显著的就是输入框中的值，需要取的DOM中的值才行，所以必须处理为prop
        if (
          // 有.prop修饰符
          (modifiers && modifiers.prop) ||
          // 标签中必须要使用 DOM属性才能生效的属性
          (!el.component && platformMustUseProp(el.tag, el.attrsMap.type, name))
        ) {
          // 向el.props数组添加一项
          addProp(el, name, value, list[i], isDynamic)
        } else {
          // 向el.attrs或el.dynamicAttrs数组添加一项
          addAttr(el, name, value, list[i], isDynamic)
        }
      } 
      // 处理事件绑定的属性(以 @ v-on: 开头为事件绑定)
      // 挂载element上的events、nativeEvents字段
      else if (onRE.test(name)) {
        // 事件名
        name = name.replace(onRE, '')
        // 动态绑定名称
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        // 处理事件属性，将事件属性添加到el的events、nativeEvents字段
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic)
      } 
      // 其他指令的处理
      else {
        // 指令名
        name = name.replace(dirRE, '')
        // 参数
        const argMatch = name.match(argRE)
        let arg = argMatch && argMatch[1]
        isDynamic = false
        // 处理有参数的情况
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
          // 处理动态参数的情况
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1)
            isDynamic = true
          }
        }
        // 挂载element上的directives字段上
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
        // 对v-model双向绑定当前元素或祖先元素中的v-for指令使用的别名做出警告
        if (__DEV__ && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // 对属性中解析到分隔符做出提示应该使用动态绑定语法
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
      // 静态绑定的属性直接添加到el.attrs
      addAttr(el, name, JSON.stringify(value), list[i])
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      // 将需要修改DOM prop上属性添加到el.props
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
// 返回指令的修饰符名组成的对象
// 传入的参数要去掉指令开头
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

// 判断是否为纯文本标签,纯文本标签内容不需要解码???
function isTextTag(el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}
// 在非服务端渲染的情况下，是否为禁用的标签
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
// 对v-model双向绑定当前元素或祖先元素中的v-for指令使用的别名做出警告
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
