/**
 * parseFilters(exp):将过滤器表达式包装成辅助函数处理的表达式
 */

//匹配字母数字及列出的字符，具体用途是判断表达式是不是正则时用到
const validDivisionCharRE = /[\w).+\-_$\]]/

export function parseFilters(exp: string): string {
  // 单引号
  let inSingle = false
  // 双引号
  let inDouble = false
  // 反引号
  let inTemplateString = false
  // 正则符号 
  let inRegex = false
  // 花括号
  let curly = 0
  // 方括号
  let square = 0
  // 圆括号
  let paren = 0
  // 上一个过滤器结束位置
  let lastFilterIndex = 0
  // c为当前字符，prev为上一个字符，i为字符索引，expression为原表达式，filters为过滤器表达式数组
  let c, prev, i, expression, filters

  // 一个字符一个字符的匹配
  for (i = 0; i < exp.length; i++) {
    prev = c
    c = exp.charCodeAt(i)
    // 单引号闭合
    if (inSingle) {
      // 0x5c 为 反斜杠 \
      if (c === 0x27 && prev !== 0x5c) inSingle = false
    } 
    // 双引号闭合
    else if (inDouble) {
      if (c === 0x22 && prev !== 0x5c) inDouble = false
    } 
    // 反引号闭合
    else if (inTemplateString) {
      if (c === 0x60 && prev !== 0x5c) inTemplateString = false
    } 
    // 正则闭合
    else if (inRegex) {
      if (c === 0x2f && prev !== 0x5c) inRegex = false
    } 
    // 匹配到管道符
    else if (
      // 当前字符为管道符   '|'   编号为0x7c
      c === 0x7c && // pipe
      // 前后字符不为管道符，确保不是或运算符   '||'
      exp.charCodeAt(i + 1) !== 0x7c &&
      exp.charCodeAt(i - 1) !== 0x7c &&
      // 不包括在各种括号之内
      !curly &&
      !square &&
      !paren
    ) {
      // 第一次匹配，分割原本表达式和过滤器的表达式
      if (expression === undefined) {
        // 过滤器开始位置
        lastFilterIndex = i + 1
        // 获取表达式的值
        expression = exp.slice(0, i).trim()
      } else {
        pushFilter()
      }
    } 
    
    else {
      // 匹配到各个符号起始和括号
      switch (c) {
        case 0x22:
          inDouble = true
          break // "
        case 0x27:
          inSingle = true
          break // '
        case 0x60:
          inTemplateString = true
          break // `
        case 0x28:
          paren++
          break // (
        case 0x29:
          paren--
          break // )
        case 0x5b:
          square++
          break // [
        case 0x5d:
          square--
          break // ]
        case 0x7b:
          curly++
          break // {
        case 0x7d:
          curly--
          break // }
      }
      // 匹配到斜杠
      if (c === 0x2f) {
        // /
        let j = i - 1
        let p
        // find first non-whitespace prev char
        for (; j >= 0; j--) {
          p = exp.charAt(j)
          if (p !== ' ') break
        }
        if (!p || !validDivisionCharRE.test(p)) {
          inRegex = true
        }
      }
    }
  }
  // 处理结尾
  if (expression === undefined) {
    expression = exp.slice(0, i).trim()
  } else if (lastFilterIndex !== 0) {
    pushFilter()
  }
  // 将过滤器的表达式(上一个过滤器表达式结束索引到当前索引之间的字符)存入过滤器数组filters
  function pushFilter() {
    ;(filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim())
    lastFilterIndex = i + 1
  }
  // 用过滤器包装原表达式
  if (filters) {
    for (i = 0; i < filters.length; i++) {
      expression = wrapFilter(expression, filters[i])
    }
  }

  return expression
}

// 包装表达式
function wrapFilter(exp: string, filter: string): string {
  const i = filter.indexOf('(')
  if (i < 0) {
  // 没有括号的情况，只有原表达式作为唯一参数
  // eg.
  // exp|filter1|filter2          =>      _f("filter2")(_f("filter1")(exp))
    return `_f("${filter}")(${exp})`
  } else {
    // 有括号的情况
    // name为表达式名，args为参数名
    // eg.
    // exp|filter(arg1,arg2)                =>    _f("filter")(exp,arg1,arg2)
    // 包装两次：
    // exp|filter1()|filter2(arg1,arg2)     =>    _f("filter2")((_f("filter1")(exp)),arg1,arg2)
    const name = filter.slice(0, i)
    const args = filter.slice(i + 1)
    return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`
  }
}
