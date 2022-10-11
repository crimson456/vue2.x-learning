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


type                                           节点类型
expression                                     
tokens                                         
tag                                            标签名
attrsList                                      从模板上匹配到的属性，形式为：
attrsMap                                       
attrs                                          v-pre指令会在处理开始标签时直接存入
props                                          
pre                                            v-pre指令
ns                                             命名空间，SVG、MathML中的标签有此字段
forbidden                                      
parent                                         父元素
children                                       子元素
ifConditions                                   

slotName                                       (slot标签特有)插槽名
slotTarget                                     (组件元素之间的元素特有)目标插槽名
slotScope                                      (作用域插槽特有)存储作用域插槽的值
scopedSlots                                    子插槽，处理后的带有v-slot属性的元素和slot元素都会从children字段移出放在这个字段下

for、alias、iterator1、iterator2               v-for指令的参数

if、elseif、else                               

once                                           v-once指令(是否存在)
key                                            标签上的key属性
ref                                            标签上的ref属性
refInFor                                       标识此有ref属性的元素的父元素是否有v-for指令
component                                      动态组件名
inlineTemplate                                 组件是否使用内联模板
hasBindings                                    
events、nativeEvents                           
directives                                     
staticClass                                    
classBinding                                   
staticStyle、styleBinding                      
plain                                          
isComment                                      









*/
