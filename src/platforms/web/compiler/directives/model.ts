import config from 'core/config'composing
import { addHandler, addProp, getBindingAttr } from 'compiler/helpers'
import { genComponentModel, genAssignmentCode } from 'compiler/directives/model'
import { ASTDirective, ASTElement, ASTModifiers } from 'types/compiler'

let warn

// in some cases, the event used has to be determined at runtime
// so we used some reserved tokens during compile.
export const RANGE_TOKEN = '__r'
export const CHECKBOX_RADIO_TOKEN = '__c'

export default function model(
  el: ASTElement,
  dir: ASTDirective,
  _warn: Function
): boolean | undefined {
  warn = _warn
  const value = dir.value
  const modifiers = dir.modifiers
  const tag = el.tag
  const type = el.attrsMap.type
  // 对input标签的file类型使用v-model做出警告
  if (__DEV__) {
    // inputs with type="file" are read only and setting the input's
    // value will throw an error.
    if (tag === 'input' && type === 'file') {
      warn(
        `<${el.tag} v-model="${value}" type="file">:\n` +
          `File inputs are read only. Use a v-on:change listener instead.`,
        el.rawAttrsMap['v-model']
      )
    }
  }

  // 不同的元素类型作不同的处理
  // 动态组件上的处理
  if (el.component) {
    genComponentModel(el, value, modifiers)
    // component v-model doesn't need extra runtime
    return false
  }
  // 处理选项框 
  else if (tag === 'select') {
    genSelect(el, value, modifiers)
  } 
  // 处理多选框
  else if (tag === 'input' && type === 'checkbox') {
    genCheckboxModel(el, value, modifiers)
  } 
  // 处理单选框
  else if (tag === 'input' && type === 'radio') {
    genRadioModel(el, value, modifiers)
  }
  // 其他input框的情况或者textarea框(主要是单行文本和多行文本) 
  else if (tag === 'input' || tag === 'textarea') {
    genDefaultModel(el, value, modifiers)
  } 
  // 组件上的处理
  else if (!config.isReservedTag(tag)) {
    genComponentModel(el, value, modifiers)
    // component v-model doesn't need extra runtime
    return false
  }
  // 对不支持v-model指令的标签使用的警告 
  else if (__DEV__) {
    warn(
      `<${el.tag} v-model="${value}">: ` +
        `v-model is not supported on this element type. ` +
        "If you are working with contenteditable, it's recommended to " +
        'wrap a library dedicated for that purpose inside a custom component.',
      el.rawAttrsMap['v-model']
    )
  }

  // ensure runtime directive metadata
  return true
}
// 处理多选框的情况
function genCheckboxModel(
  el: ASTElement,
  value: string,
  modifiers?: ASTModifiers | null
) {
  const number = modifiers && modifiers.number
  const valueBinding = getBindingAttr(el, 'value') || 'null'
  const trueValueBinding = getBindingAttr(el, 'true-value') || 'true'
  const falseValueBinding = getBindingAttr(el, 'false-value') || 'false'
  // 添加prop，类似v-bind:checked=xxx
  addProp(
    el,
    'checked',
    // 赋值语句，将checked绑定到v-model绑定的value(可能是数组)的数组的对应值上，如果没有则为false
    // Array.isArray(value)?_i(value,valueBinding)>-1:value
    // Array.isArray(value)?_i(value,valueBinding)>-1:_q(value,trueValueBinding)
    `Array.isArray(${value})` +
      `?_i(${value},${valueBinding})>-1` +
      (trueValueBinding === 'true'
        ? `:(${value})`
        : `:_q(${value},${trueValueBinding})`)
  )
  // 添加change事件
  addHandler(
    el,
    'change',
    // 绑定的事件处理函数：主要逻辑就是查找到数组上需要改变的位置，重新给v-model绑定的value赋值
    `var $$a=${value},` +
      '$$el=$event.target,' +
      `$$c=$$el.checked?(${trueValueBinding}):(${falseValueBinding});` +
      'if(Array.isArray($$a)){' +
      `var $$v=${number ? '_n(' + valueBinding + ')' : valueBinding},` +
      '$$i=_i($$a,$$v);' +
      `if($$el.checked){$$i<0&&(${genAssignmentCode(
        value,
        '$$a.concat([$$v])'
      )})}` +
      `else{$$i>-1&&(${genAssignmentCode(
        value,
        '$$a.slice(0,$$i).concat($$a.slice($$i+1))'
      )})}` +
      `}else{${genAssignmentCode(value, '$$c')}}`,
    null,
    true
  )
}
// 处理单选框的情况
function genRadioModel(
  el: ASTElement,
  value: string,
  modifiers?: ASTModifiers | null
) {
  const number = modifiers && modifiers.number
  let valueBinding = getBindingAttr(el, 'value') || 'null'
  valueBinding = number ? `_n(${valueBinding})` : valueBinding
  // 添加动态绑定
  addProp(el, 'checked', `_q(${value},${valueBinding})`)
  // 添加事件处理
  addHandler(el, 'change', genAssignmentCode(value, valueBinding), null, true)
}
// 处理选项框的情况
// 生成选项框的代码(过滤出选项框中选择的值)并添加到元素的change事件队列中
function genSelect(
  el: ASTElement,
  value: string,
  modifiers?: ASTModifiers | null
) {
  const number = modifiers && modifiers.number
  const selectedVal =
    `Array.prototype.filter` +
    `.call($event.target.options,function(o){return o.selected})` +
    `.map(function(o){var val = "_value" in o ? o._value : o.value;` +
    `return ${number ? '_n(val)' : 'val'}})`

  const assignment = '$event.target.multiple ? $$selectedVal : $$selectedVal[0]'
  let code = `var $$selectedVal = ${selectedVal};`
  code = `${code} ${genAssignmentCode(value, assignment)}`
  // code最后的值大致为：
  //  var $$selectedVal = Array.prototype.filter
  //    .call($event.target.options, function (o) {
  //      return o.selected
  //    })
  //    .map(function (o) {
  //      var val = '_value' in o ? o._value : o.value
  //      return val
  //    })
  //  value = $event.target.multiple ? $$selectedVal : $$selectedVal[0]
  addHandler(el, 'change', code, null, true)
}

// 其他情况的处理，一般对输入框和多行输入框
// 生成其他情况的代码，添加v-bind：value和输入框变化的事件处理函数
function genDefaultModel(
  el: ASTElement,
  value: string,
  modifiers?: ASTModifiers | null
): boolean | void {
  const type = el.attrsMap.type
  // 对v-model和v-bind：value冲突的警告，除非标签上有v-bind:type的情况
  if (__DEV__) {
    const value = el.attrsMap['v-bind:value'] || el.attrsMap[':value']
    const typeBinding = el.attrsMap['v-bind:type'] || el.attrsMap[':type']
    if (value && !typeBinding) {
      const binding = el.attrsMap['v-bind:value'] ? 'v-bind:value' : ':value'
      warn(
        `${binding}="${value}" conflicts with v-model on the same element ` +
          'because the latter already expands to a value binding internally',
        el.rawAttrsMap[binding]
      )
    }
  }
  // 获取修饰符
  const { lazy, number, trim } = modifiers || {}
  // 这个字段用于控制是否需要一次完整输入后触发更新数据
  // type为range表示控件为一个进度条
  const needCompositionGuard = !lazy && type !== 'range'
  // event可选值：change、__r、input
  const event = lazy ? 'change' : type === 'range' ? RANGE_TOKEN : 'input'

  let valueExpression = '$event.target.value'

  // 处理trim修饰符
  if (trim) {
    valueExpression = `$event.target.value.trim()`
  }
  // 处理number修饰符
  if (number) {
    valueExpression = `_n(${valueExpression})`
  }
  // 获得赋值语句的代码
  let code = genAssignmentCode(value, valueExpression)
  // 对需要完整输入控制的控件进行处理
  if (needCompositionGuard) {
    // composing字段表示输入还未结束
    code = `if($event.target.composing)return;${code}`
  }
  // 相当于v-bind：value
  addProp(el, 'value', `(${value})`)
  // 相当于v-on：change|input=function(){xxxxx}
  addHandler(el, event, code, null, true)
  if (trim || number) {
    addHandler(el, 'blur', '$forceUpdate()')
  }
}
