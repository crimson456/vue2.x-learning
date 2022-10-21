import { ASTElementHandler, ASTElementHandlers } from 'types/compiler'

// 匹配是否为完整函数定义
const fnExpRE = /^([\w$_]+|\([^)]*?\))\s*=>|^function(?:\s+[\w$]+)?\s*\(/
// 匹配是否有函数调用
const fnInvokeRE = /\([^)]*?\);*$/
// 匹配是否为简单函数名
const simplePathRE =
  /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\['[^']*?']|\["[^"]*?"]|\[\d+]|\[[A-Za-z_$][\w$]*])*$/

// KeyboardEvent.keyCode aliases
const keyCodes: { [key: string]: number | Array<number> } = {
  esc: 27,
  tab: 9,
  enter: 13,
  space: 32,
  up: 38,
  left: 37,
  right: 39,
  down: 40,
  delete: [8, 46]
}

// KeyboardEvent.key aliases
const keyNames: { [key: string]: string | Array<string> } = {
  // #7880: IE11 and Edge use `Esc` for Escape key name.
  esc: ['Esc', 'Escape'],
  tab: 'Tab',
  enter: 'Enter',
  // #9112: IE11 uses `Spacebar` for Space key name.
  space: [' ', 'Spacebar'],
  // #7806: IE11 uses key names without `Arrow` prefix for arrow keys.
  up: ['Up', 'ArrowUp'],
  left: ['Left', 'ArrowLeft'],
  right: ['Right', 'ArrowRight'],
  down: ['Down', 'ArrowDown'],
  // #9112: IE11 uses `Del` for Delete key name.
  delete: ['Backspace', 'Delete', 'Del']
}

// #4868: modifiers that prevent the execution of the listener
// need to explicitly return null so that we can determine whether to remove
// the listener for .once
const genGuard = condition => `if(${condition})return null;`

const modifierCode: { [key: string]: string } = {
  stop: '$event.stopPropagation();',
  prevent: '$event.preventDefault();',
  self: genGuard(`$event.target !== $event.currentTarget`),
  ctrl: genGuard(`!$event.ctrlKey`),
  shift: genGuard(`!$event.shiftKey`),
  alt: genGuard(`!$event.altKey`),
  meta: genGuard(`!$event.metaKey`),
  left: genGuard(`'button' in $event && $event.button !== 0`),
  middle: genGuard(`'button' in $event && $event.button !== 1`),
  right: genGuard(`'button' in $event && $event.button !== 2`)
}


// genData()中调用genHandlers(el.events, false)和genHandlers(el.nativeEvents, true)时
// 传入的events,nativeEvents都是事件队列组成的数组，修饰符和时间名会转化为事件队列的名称
// 格式：events:[!~&name1:[{value:xxx,dynamic:xxx,modifiers:xxx},{},{}],name2:[{},...],...]
// 输出格式: 
// v-on事件:                      on:{!~&name1:[handler1,handler2],name2:handler3,...}
// 原生(.native修饰符)事件:        nativeOn:_d(!~&name1:[handler1,handler2],name2:handler3,...,[!~&name3,[handler4,handler5],name4,handler6])
export function genHandlers(
  events: ASTElementHandlers,
  isNative: boolean
): string {
  // 前缀
  const prefix = isNative ? 'nativeOn:' : 'on:'
  let staticHandlers = ``
  let dynamicHandlers = ``
  // 遍历每一个事件队列的(同一个时间名的根据不同修饰符可能在不同的队列)
  for (const name in events) {
    // 生成处理函数代码(可能是数组)
    const handlerCode = genHandler(events[name])
    //@ts-expect-error
    // 动态事件名的函数处理
    if (events[name] && events[name].dynamic) {
      dynamicHandlers += `${name},${handlerCode},`
    }
    // 静态事件名的函数处理 
    else {
      staticHandlers += `"${name}":${handlerCode},`
    }
  }
  // 去除结尾逗号
  staticHandlers = `{${staticHandlers.slice(0, -1)}}`
  // 添加前缀
  if (dynamicHandlers) {
    return prefix + `_d(${staticHandlers},[${dynamicHandlers.slice(0, -1)}])`
  } else {
    return prefix + staticHandlers
  }
}

// 生成处理函数
// 传入格式[{value:xxx,dynamic:xxx,modifiers:xxx},{},{}]
// 返回值格式: handler或[handler1,handeler2]
// 单个handler为函数字符串,格式大致为:
// `function($event){
// if(!$event.type.indexOf('key')&&_k($event.keyCode,"enter",13,$event.key,"Enter"))return null;
// $event.preventDefault();
// return onInput($event)}
function genHandler(
  handler: ASTElementHandler | Array<ASTElementHandler>
): string {
  // 没有传入的情况
  if (!handler) {
    return 'function(){}'
  }
  // 处理数组的情况，对每一个处理函数递归调用
  if (Array.isArray(handler)) {
    return `[${handler.map(handler => genHandler(handler)).join(',')}]`
  }
  // 判断事件后接的是不是一个简单的函数名(不带括号)
  const isMethodPath = simplePathRE.test(handler.value)
  // 判断事件后接的是不是一个函数表达式
  const isFunctionExpression = fnExpRE.test(handler.value)
  // 判断事件后接的是不是一个函数调用(带括号，最后一个参数如果为$event则是原生事件对象)
  const isFunctionInvocation = simplePathRE.test(
    handler.value.replace(fnInvokeRE, '')
  )
  // 没有修饰符的情况
  if (!handler.modifiers) {
    // 事件后接函数名或函数表达式的情况
    if (isMethodPath || isFunctionExpression) {
      return handler.value
    }
    // 不是函数名或表达式的情况
    return `function($event){${
      isFunctionInvocation ? `return ${handler.value}` : handler.value
    }}` // inline statement
  } 
  // 有修饰符的情况
  else {
    // code中存储的是过滤按键的代码
    let code = ''
    // genModifierCode中存储的是其他修饰符的处理代码
    let genModifierCode = ''
    const keys: string[] = []
    // 遍历所有修饰符
    for (const key in handler.modifiers) {
      // 处理部分修饰符和键盘码，此部分主要添加一些不触发的条件
      if (modifierCode[key]) {
        genModifierCode += modifierCode[key]
        // left/right
        if (keyCodes[key]) {
          keys.push(key)
        }
      } 
      // 处理exact修饰符
      // 用于控制 系统修饰符（.ctrl .alt .shift .meta）的精确触发
      else if (key === 'exact') {
        const modifiers = handler.modifiers
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            .filter(keyModifier => !modifiers[keyModifier])
            .map(keyModifier => `$event.${keyModifier}Key`)
            .join('||')
        )
      }
      // 处理其他键盘修饰符 
      else {
        keys.push(key)
      }
    }
    // 对按键修饰符的代码进行生成
    if (keys.length) {
      code += genKeyFilter(keys)
    }
    // Make sure modifiers like prevent and stop get executed after key filtering
    // 拼接其他修饰符的过滤代码
    if (genModifierCode) {
      code += genModifierCode
    }
    // 处理函数的主体
    const handlerCode = isMethodPath
      ? `return ${handler.value}.apply(null, arguments)`
      : isFunctionExpression
      ? `return (${handler.value}).apply(null, arguments)`
      : isFunctionInvocation
      ? `return ${handler.value}`
      : handler.value
    // 返回处理过各种修饰符和对应键位的函数执行代码
    return `function($event){${code}${handlerCode}}`
  }
}

// 返回一个字符串，包装对应按键事件片段的处理
function genKeyFilter(keys: Array<string>): string {
  return (
    // make sure the key filters only apply to KeyboardEvents
    // #9441: can't use 'keyCode' in $event because Chrome autofill fires fake
    // key events that do not have keyCode property...
    // 处理不是键盘事件且有键盘事件的修饰符的情况
    // 返回的字符串表示如果是键盘事件且不是对应按键触发，返回null
    // $event事件对象下的type属性如果不是keyup、keypress...(以key开头)等说明不是键盘事件
    `if(!$event.type.indexOf('key')&&` +
    `${keys.map(genFilterCode).join('&&')})return null;`
  )
}
// 处理按键码
function genFilterCode(key: string): string {
  const keyVal = parseInt(key, 10)
  // key为数字的情况
  if (keyVal) {
    return `$event.keyCode!==${keyVal}`
  }
  // key为别名的情况
  const keyCode = keyCodes[key]
  const keyName = keyNames[key]
  // 包装_k函数，作用配合前面的判断对按键码进行判断，如果不是对应按键触发，事件处理函数不会执行(执行返回null)
  return (
    `_k($event.keyCode,` +
    `${JSON.stringify(key)},` +
    `${JSON.stringify(keyCode)},` +
    `$event.key,` +
    `${JSON.stringify(keyName)}` +
    `)`
  )
}
