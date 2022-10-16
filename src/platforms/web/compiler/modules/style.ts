import { parseText } from 'compiler/parser/text-parser'
import { parseStyleText } from 'web/util/style'
import { getAndRemoveAttr, getBindingAttr, baseWarn } from 'compiler/helpers'
import { ASTElement, CompilerOptions, ModuleOptions } from 'types/compiler'

//获取从attrsList中取出静态绑定和动态绑定的style值并挂载在element的staticStyle、styleBinding字段
function transformNode(el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  const staticStyle = getAndRemoveAttr(el, 'style')
  if (staticStyle) {
    // 对从 style 属性值文本中解析到了分隔符做出提示
    // 有分隔符的情况说明是一个动态绑定的 style 
    /* istanbul ignore if */
    if (__DEV__) {
      const res = parseText(staticStyle, options.delimiters)
      if (res) {
        warn(
          `style="${staticStyle}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div style="{{ val }}">, use <div :style="val">.',
          el.rawAttrsMap['style']
        )
      }
    }
    el.staticStyle = JSON.stringify(parseStyleText(staticStyle))
  }

  const styleBinding = getBindingAttr(el, 'style', false /* getStatic */)
  if (styleBinding) {
    el.styleBinding = styleBinding
  }
}

function genData(el: ASTElement): string {
  let data = ''
  if (el.staticStyle) {
    data += `staticStyle:${el.staticStyle},`
  }
  if (el.styleBinding) {
    data += `style:(${el.styleBinding}),`
  }
  return data
}

export default {
  staticKeys: ['staticStyle'],
  transformNode,
  genData
} as ModuleOptions
