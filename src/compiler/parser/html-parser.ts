/*
将模板解析成AST的主流程：（匹配流程类似mustuche.js中的流程）
此部分主要使用正则进行模板匹配
*/


import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'
import { ASTAttr, CompilerOptions } from 'types/compiler'
//Vue2 使用正则匹配生成AST
//匹配静态属性
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
//匹配动态属性（含有 v-xxx:, :, @, # 的属性）
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
//匹配以a-zA-Z_开头，然后是0或多个a-zA-Z_、-或.
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
//匹配ncname开头，紧跟着一个冒号，然后又跟着一个ncname，捕获整体匹配的内容
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
//匹配开始标签开始部分
const startTagOpen = new RegExp(`^<${qnameCapture}`)
//匹配开始标签结束部分
const startTagClose = /^\s*(\/?)>/
//匹配结束标签
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
//匹配DOCTYPE声明
const doctype = /^<!DOCTYPE [^>]+>/i
//匹配注释(<!--和-->)
const comment = /^<!\--/
//匹配条件注释(<![和]>)
const conditionalComment = /^<!\[/


// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// 忽略pre和textarea标签的第一个换行符   (和浏览器默认行为保持一致)
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) =>
  tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr(value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export interface HTMLParserOptions extends CompilerOptions {
  start?: (
    tag: string,
    attrs: ASTAttr[],
    unary: boolean,
    start: number,
    end: number
  ) => void
  end?: (tag: string, start: number, end: number) => void
  chars?: (text: string, start?: number, end?: number) => void
  comment?: (content: string, start: number, end: number) => void
}

export function parseHTML(html, options: HTMLParserOptions) {
  const stack: any[] = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  //标签已读取的位置
  let index = 0
  //
  let last, lastTag
  while (html) {
    last = html
    // 判断是否在 script、style、textarea 这样的纯文本元素中
    // 不是纯文本的元素正常对内部标签进行解析
    if (!lastTag || !isPlainTextElement(lastTag)) {
      //不是纯文本(内部可能有其他标签)
      let textEnd = html.indexOf('<')
      // 判断是否以标签开头
      if (textEnd === 0) {
        //以标签开头
        //处理注释
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment && options.comment) {
              options.comment(
                html.substring(4, commentEnd),
                index,
                index + commentEnd + 3
              )
            }
            advance(commentEnd + 3)
            continue
          }
        }
        //处理条件注释
        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        //处理DOCTYPE声明   <!DOCTYPE html>
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // 匹配结束标签，包括处理单闭合标签   </div>
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          // 处理标签结束
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        //处理标签开始   <div id='xxx'>
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          // 处理开始标签match对象，生成ast并执行预处理
          handleStartTag(startTagMatch)
          // 忽略pre和textarea标签的第一个换行符
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }
      // 以文本开头的情况
      let text, rest, next
      if (textEnd >= 0) {
        // 截取到'<'的位置
        rest = html.slice(textEnd)
        while (
          // 没有匹配到结束标签、开始标签、注释、条件注释，说明'<'符号处于文本内容中
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // 寻找下一个'<'，再进行判断，直到匹配到标签，注释，或者不再有'<'
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        // 获取当前段所有文本内容
        text = html.substring(0, textEnd)
      }
      // 标签中为没有'<'符号的纯文本
      if (textEnd < 0) {
        text = html
      }
      // 在html剩余部分中去掉文本部分
      if (text) {
        advance(text.length)
      }
      // 对前面获取的文本进行解析
      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    }
    // 纯文本元素就不需要对标签进行解析了，可以节约性能
    else {
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      // 获取对应标签闭合的正则
      const reStackedTag =
        reCache[stackedTag] ||
        (reCache[stackedTag] = new RegExp(
          '([\\s\\S]*?)(</' + stackedTag + '[^>]*>)',
          'i'
        ))
      // 处理标签内部的文本，并截取
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      // 处理标签闭合
      parseEndTag(stackedTag, index - endTagLength, index)
    }
    // 处理剩下文本的情况
    if (html === last) {
      options.chars && options.chars(html)
      // 对堆栈中存在元素的情况进行警告(有些标签没有闭合)
      if (__DEV__ && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, {
          start: index + html.length
        })
      }
      break
    }
  }

  // 闭合剩下的没有闭合的元素
  parseEndTag()

  //封装工具函数：
  //HTML剩余指针前进n步
  function advance(n) {
    index += n
    html = html.substring(n)
  }
  // 匹配一个开始标签，并生成一个match对象，包括标签名和标签上的每一个属性的捕获组及位置组成的数组
  function parseStartTag() {
    //匹配标签起始部分，不包括属性
    const start = html.match(startTagOpen)
    if (start) {
      const match: any = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length)
      let end, attr
      //匹配标签中的每一个属性或者动态属性
      while (
        !(end = html.match(startTagClose)) &&
        (attr = html.match(dynamicArgAttribute) || html.match(attribute))
      ) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      //匹配开始标签结束
      if (end) {
        //是否为单标签
        match.unarySlash = end[1]
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }
  // 对开始标签的match对象进行解析，
  function handleStartTag(match) {
    const tagName = match.tagName
    // 自闭合标签
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash
    //处理标签的属性，将每个属性推入attrs数组中
    const l = match.attrs.length
    const attrs: ASTAttr[] = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines =
        tagName === 'a' && args[1] === 'href'
          ? options.shouldDecodeNewlinesForHref
          : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (__DEV__ && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }
    //入栈
    if (!unary) {
      stack.push({
        tag: tagName,
        lowerCasedTag: tagName.toLowerCase(),
        attrs: attrs,
        start: match.start,
        end: match.end
      })
      lastTag = tagName
    }
    //调用传入的start函数处理开始标签,生成ast树并对一些指令进行预处理(一般调用end后全部处理完成)
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }
  // 处理结束标签
  function parseEndTag(tagName?: any, start?: any, end?: any) {
    // pos用于标记栈中位置
    let pos, lowerCasedTagName
    // 对可以不闭合标签的闭合处理(如p标签不闭合)，对没有开始和结束参数进行处理
    if (start == null) start = index
    if (end == null) end = index

    // 如果传入标签名，则查询栈中最近的同名开标签
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    }
    // 如果不传入标签名，直接将pos置为0 
    else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // 遍历栈中在该标签之上的元素，全部进行闭合(中间如果有其他元素，则为异常闭合)
      for (let i = stack.length - 1; i >= pos; i--) {
        // 对异常闭合标签做出提示
        if (__DEV__ && (i > pos || !tagName) && options.warn) {
          options.warn(`tag <${stack[i].tag}> has no matching end tag.`, {
            start: stack[i].start,
            end: stack[i].end
          })
        }
        // 处理标签闭合
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }
      // 出栈
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } 
    // 处理单独的</br>标签
    else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } 
    // 处理单独的</p>标签
    else if (lowerCasedTagName === 'p') {
      // 处理为双标签的形式，相当于添加了<p>标签
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
