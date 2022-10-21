import config from 'core/config'
import { hyphenate, isArray } from 'shared/util'

function isKeyNotMatch<T>(expect: T | Array<T>, actual: T): boolean {
  if (isArray(expect)) {
    return expect.indexOf(actual) === -1
  } else {
    return expect !== actual
  }
}

/**
 * Runtime helper for checking keyCodes from config.
 * exposed as Vue.prototype._k
 * passing in eventKeyName as last argument separately for backwards compat
 */

/**
 * 参数解释：(注意key是修饰符的名称，不是特定的按键名)
 * eventKeyCode         事件对象的keyCode字段
 * key                  修饰符名(字符串，可以是vue定义的，也可以是自定义的)
 * builtInKeyCode       vue定义的对应key的按键码
 * eventKeyName         事件对象的keyCode字段
 * builtInKeyName       vue定义的对应key的按键别名
 */
// 用于匹配修饰符对应的按键，如果匹配成功返回false，失败返回true
export function checkKeyCodes(
  eventKeyCode: number,
  key: string,
  builtInKeyCode?: number | Array<number>,
  eventKeyName?: string,
  builtInKeyName?: string | Array<string>
): boolean | null | undefined {
  // 获取自定义的键位的按键码
  const mappedKeyCode = config.keyCodes[key] || builtInKeyCode
  // 匹配vue定义的按键名(没有自定义的按键码的情况)
  if (builtInKeyName && eventKeyName && !config.keyCodes[key]) {
    return isKeyNotMatch(builtInKeyName, eventKeyName)
  } 
  // 匹配自定义的键位的按键码
  else if (mappedKeyCode) {
    return isKeyNotMatch(mappedKeyCode, eventKeyCode)
  } 
  // 匹配原生的按键名
  else if (eventKeyName) {
    return hyphenate(eventKeyName) !== key
  }
  // ???
  // 都未匹配则返回false
  return eventKeyCode === undefined
}
