/**
 * parseText(text,dilimiters):用于解析及其中的模板语法，返回用辅助函数包装过的字符串和用对象包裹处理过后的数组对象
 */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'
//默认的模板分隔符
const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g
//匹配需要转义的字符
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string
  tokens: Array<string | { '@binding': string }>
}
// 
export function parseText(
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  //@ts-expect-error
  //获取使用的分隔符
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  if (!tagRE.test(text)) {
    //如果模板中没有对应分隔符，则直接返回
    return
  }
  // 普通文本不处理，分隔符之间内容用_s()处理过后的数组对象
  const tokens: string[] = []
  // 普通文本不处理，分隔符之间内容用对象包裹处理过后的数组对象
  const rawTokens: any[] = []
  let lastIndex = (tagRE.lastIndex = 0)
  let match, index, tokenValue
  while ((match = tagRE.exec(text))) {
    index = match.index
    //普通文本的处理
    if (index > lastIndex) {
      rawTokens.push((tokenValue = text.slice(lastIndex, index)))
      tokens.push(JSON.stringify(tokenValue))
    }
    //分隔符之间的文本处理
    //处理过滤器语法
    const exp = parseFilters(match[1].trim())
    tokens.push(`_s(${exp})`)
    rawTokens.push({ '@binding': exp })
    lastIndex = index + match[0].length
  }
  // 结尾的文本处理
  if (lastIndex < text.length) {
    rawTokens.push((tokenValue = text.slice(lastIndex)))
    tokens.push(JSON.stringify(tokenValue))
  }
  return {
    // 表达式可以再Vue中同辅助函数执行
    expression: tokens.join('+'),
    // ???
    tokens: rawTokens
  }
}
