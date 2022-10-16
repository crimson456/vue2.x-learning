import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'
import { CompilerOptions } from 'types/compiler'

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,//对模板中类和样式的解析
  directives,//包括model（v-model）、html（v-html）、text(v-text)三个指令的解析
  isPreTag,//是否是pre标签
  isUnaryTag,//是否是单标签
  mustUseProp,//需要使用DOM prop 作为值的标签属性，比如单复选框....
  canBeLeftOpenTag,//可以不闭合的标签
  isReservedTag,//是否为保留标签
  getTagNamespace,//获取命名空间
  staticKeys: genStaticKeys(modules)//静态关键词
}
