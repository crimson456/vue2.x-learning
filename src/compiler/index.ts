import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'
import { CompilerOptions, CompiledResult } from 'types/compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile(
  template: string,
  options: CompilerOptions
): CompiledResult {
  //模板生成ast
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  //ast转化render函数
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})


/*
AST元素下的属性：

type                                           节点类型，三个可选值：1(元素)、2(表达式)、3(文本或注释)
expression                                     
tokens                                         
tag                                            标签名
attrsList                                      从模板上匹配到的属性(处理前)，形式为：
attrsMap                                       从模板上匹配到的属性(处理前)，形式为
attrs                                          处理后的属性存放位置
props                                          处理后的DOM property存放位置
pre                                            v-pre指令(是否存在)
ns                                             命名空间，SVG、MathML中的标签有此字段
forbidden                                      标记为非服务端渲染时的禁用标签(一般为false，表示除了style和script标签外的标签)
parent                                         父元素
children                                       子元素

slotName                                       (slot标签特有)插槽名
slotTarget                                     (组件元素之间的元素特有)目标插槽名
slotScope                                      (作用域插槽特有)存储作用域插槽的值
scopedSlots                                    子插槽，处理后的带有v-slot属性的元素和slot元素都会从children字段移出放在这个字段下

for、alias、iterator1、iterator2               v-for指令的参数

if、elseif、else、ifConditions                 v-if指令的参数

once                                           v-once指令(是否存在)

key                                            标签上的key属性

ref                                            标签上的ref属性
refInFor                                       标识此有ref属性的元素的父元素是否有v-for指令

component                                      动态组件名
inlineTemplate                                 组件是否使用内联模板

hasBindings                                    动态元素(元素上是否有指令)
events、nativeEvents                           v-on的事件队列

directives                                     除了处理过的指令之外的其他指令

staticClass、classBinding                      静态、动态绑定class值
staticStyle、styleBinding                      静态、动态绑定style值

plain                                          标记是否为
isComment                                      标记是否为注释节点




*/
