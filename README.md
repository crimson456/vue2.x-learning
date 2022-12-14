自学vue2.x使用  
  
源代码处添加注释  
  
目录结构  
  
vue2.x-learning  
|----scripts                 脚本文件，package.json中脚本设置入口相关  
|  |----config               通过rollup打包的配置  
|  |----build                通过运行node引入rollup进行打包的入口  
|  |----alias                解析时的路径别名  
|  
|  
|----src                     源码  
|  |  
|  |----compiler                模板编译相关  
|  |  |----index                编译入口，调用createCompilerCreator函数,传入baseCompile函数(编译的主流程)  
|  |  |----create-compiler      暴露createCompilerCreator函数  
|  |  |----to-function          调用compile函数并将拼接的字符串包裹成render函数  
|  |  |----codeframe            输出错误堆栈时代码位置的处理  
|  |  |----error-detector       对生成的ast的错误检测  
|  |  |----optimizer            AST优化，标记静态节点和静态根节点  
|  |  |----helpers              主要是parser中的操作虚拟节点上属性的辅助方法，用于html解析后生成AST  
|  |  |----codegen              AST转化render函数(虚拟节点)  
|  |  |  |----index             转化入口  
|  |  |  |----event             事件处理的函数生成，包括对各种修饰符的处理  
|  |  |  
|  |  |----directives           codegen阶段生成虚拟节点时对一些指令的处理  
|  |  |  |----index             处理入口  
|  |  |  |----bind              v-bind的对象语法的处理   v-bind={xxx}  
|  |  |  |----on                v-on的对象语法的处理   v-on={xxx}  
|  |  |  |----model             v-model在组件上生成的虚拟节点上字段的处理和多种写法的值的处理   v-model在不同的标签上可能有不同处理，具体在platform中实现  
|  |  |  
|  |  |----parser               模板编译成AST  
|  |  |  |----index             转化入口，主要进行AST操作  
|  |  |  |----html-parser       模板匹配的主要逻辑  
|  |  |  |----text-parser       对文本中的模板语法进行编译  
|  |  |  |----filter-parser     对模板语法中的过滤器语法进行编译  
|  |  |  |----entity-decoder      
|  |  
|  |  
|  |----core                    vue2核心代码  
|  |  |----index                入口文件，挂载全局API和环境相关的字段  
|  |  |----config               核心默认的配置，platform中有其他配置  
|  |  |  
|  |  |----instance             实例创建相关  
|  |  |  |----index             Vue的构造函数定义和初始化入口  
|  |  |  |----init              定义 _init 方法，构造函数的主逻辑  
|  |  |  |----inject            inject、provide字段的实现  
|  |  |  |----events            初始化自定义的事件(原生的在创建节点时处理)挂在???字段下，定义$on、$once、$off、$emit  
|  |  |  |----lifecycle         初始化声明周期相关字段和父子组件关系，定义$forceUpdate、$destroy、_update，定义挂载、更新子组件、keepAlive的组件切换逻辑  
|  |  |  |----proxy             渲染代理字段_renderProxy的声明  
|  |  |  |----render            初始化渲染相关的字段，定义$slots、$scopedSlots、$attrs、$listeners、$nextTick、_render,挂载其他渲染的辅助函数  
|  |  |  |----state             处理props、setup、method、data、computed、watch挂载对应字段并代理到vm上，定义$data、$props、$set、$delete、$watch  
|  |  |  |----render-helpers    渲染辅助函数  
|  |  |  |  |----index                          入口  
|  |  |  |  |----render-list                    v-for的渲染函数  
|  |  |  |  |----render-slot                    <slot>的渲染函数  
|  |  |  |  |----render-static                  v-once和静态树的渲染函数  
|  |  |  |  |----resolve-filter                 获取过滤器函数的辅助函数  
|  |  |  |  |----resolve-scoped-slots           作用域插槽的解析函数  
|  |  |  |  |----check-keycodes                 按键码匹配的辅助函数  
|  |  |  |  |----bind-object-props              添加属性(对象形式)到节点data的辅助函数  
|  |  |  |  |----bind-object-listeners          添加事件(对象形式)到节点data.on的辅助函数  
|  |  |  |  |----bind-dynamic-keys              处理动态属性名的辅助函数和处理事件修饰符前置符号的辅助函数  
|  |  |  |  |----resolve-slots                  解析对象插槽的函数，在初始化$slot调用  
|  |  |  
|  |  |----observer             数据劫持相关  
|  |  |  |----index             Observer类和defineReactive()实现    
|  |  |  |----dep               Dep类  
|  |  |  |----watcher           Watcher类  
|  |  |  |----array             Observer类中对数组进行的处理          
|  |  |  |----traverse          Watcher类下get()方法递归触发对象下所有属性的getter  
|  |  |  |----scheduler         一次任务循环中多次更改数据只有一次刷新视图(管理一个watchers队列用于控制一次刷新视图)        
|  |  |  
|  |  |----global-api           全局APi(Vue构造函数上的方法)相关  
|  |  |  |----index             入口文件  
|  |  |  |----mixin             Vue.mixin方法  
|  |  |  |----extend            Vue.extend方法  
|  |  |  |----use               Vue.use方法  
|  |  |  |----assets            Vue.component、Vue.directive、Vue.filter方法，用于存放对应资源函数  
|  |  |  
|  |  |----util                 工具函数相关  
|  |  |  |----index             入口文件  
|  |  |  |----next-tick         nextTick()方法的实现  
|  |  |  |----perf              perfomance API相关的不同处理  
|  |  |  |----env               导出环境相关的变量和方法  
|  |  |  |----lang              成员相关的工具函数  
|  |  |  |----debug             开发模式调试相关的工具函数  
|  |  |  |----options           mergeOptions相关的处理(根据合并策略合并)  
|  |  |  |----error             错误处理的工作函数  
|  |  |  |----props             父子传值props检验相关的工具函数  
|  |  |  
|  |  |----vdom                                         虚拟节点相关  
|  |  |  |----vnode                                     虚拟节点构造函数和创建、克隆  
|  |  |  |----patch                                     根据虚拟节点操作真实节点  
|  |  |  |----create-element                            创建虚拟节点的主逻辑  辅助函数 _c  
|  |  |  |----create-component                          创建组件的虚拟节点和实例  
|  |  |  |----create-functional-componet                创建函数式组件的虚拟节点和上下文  
|  |  |  |----modules                                   patch阶段不同模块的处理     platforms中还有  
|  |  |  |  |----index                                  入口  
|  |  |  |  |----directives                             自定义指令  
|  |  |  |  |----template-ref                           $ref属性  
|  |  |  |----helpers                                   辅助函数  
|  |  |  |  |----index                                  入口  
|  |  |  |  |----extract-props                          创建组件时从data中提取组件父子传值props  
|  |  |  |  |----get-first-component-child              获取第一个子组件类型的子节点的辅助函数(内置组件keepAlive、transition中使用)  
|  |  |  |  |----is-async-placeholder                   判断异步组件占位节点的辅助函数  
|  |  |  |  |----merge-hook                             合并钩子函数到虚拟节点上的辅助函数  
|  |  |  |  |----normalize-children                     创建虚拟节点时规范化子节点的辅助函数  
|  |  |  |  |----normalize-scoped-slots                 规范化作用域插槽的辅助函数，用于生成$scopedSlots  
|  |  |  |  |----resolve-async-component                异步组件的主逻辑  
|  |  |  |  |----update-listeners                       更新事件处理函数的辅助函数  
|  |  |  
|  |  |----components                                   通用内部组件  
|  |  |  |----index                                     入口  
|  |  |  |----keep-alive                                keepAlive组件声明  
|  |  
|  |  
|  |----platforms\web                           平台相关  
|  |  |----entry-runtime                        rollup不同版本编译入口  
|  |  |----entry-runtime-esm                      
|  |  |----entry-compiler                         
|  |  |----entry-runtime-with-compiler            
|  |  |----entry-runtime-with-compiler-esm        
|  |  |----runtime-with-compiler                带编译器的主入口  
|  |  |  
|  |  |----runtime                              运行时(patch)相关的代码  
|  |  |  |----index                             运行时的主入口  
|  |  |  |----patch                             patch函数的入口  
|  |  |  |----node-ops                          patch函数中操作原生DOM的方法封装  
|  |  |  |----class-util                        操作原生DOMclass的方法封装(transition组件中使用)  
|  |  |  |----transition-util                   transition组件的工具方法  
|  |  |  |----components                        web端的内置组件  
|  |  |  |  |----index                          入口  
|  |  |  |  |----transiton                      transition组件声明  
|  |  |  |  |----transiton-group                transitonGroup组件声明  
|  |  |  |----directives                        内置指令的运行时的处理(钩子)  
|  |  |  |  |----index                          入口  
|  |  |  |  |----model                          v-model在patch阶段兼容性处理，和代码生成阶段对应  
|  |  |  |  |----show                           v-show在patch阶段的处理  
|  |  |  |----modules                           运行时对不同属性模块的处理  
|  |  |  |  |----index                          入口  
|  |  |  |  |----attrs                          元素的attribute属性  
|  |  |  |  |----style                          style属性  
|  |  |  |  |----class                          class属性  
|  |  |  |  |----dom-props                      DOM property属性  
|  |  |  |  |----events                         事件监听  
|  |  |  |  |----transition                     transition组件  
|  |  |  
|  |  |----compiler                 编译时(compile)相关的代码  
|  |  |  |----index                 编译器入口  
|  |  |  |----options               编译相关的选项  
|  |  |  |----util                  模板编译时分类标签的工具函数  
|  |  |  |----directives            内置指令genCode阶段的处理  
|  |  |  |  |----index              入口  
|  |  |  |  |----model              v-model根据标签元素不同生成不同的处理代码  
|  |  |  |  |----html               v-html  
|  |  |  |  |----text               v-text  
|  |  |  |----modules               编译时对不同属性模块的处理  
|  |  |  |  |----index              入口  
|  |  |  |  |----class              AST编译和生成render函数阶段对class属性的处理  
|  |  |  |  |----style              AST编译和生成render函数阶段对style属性的处理  
|  |  |  |  |----model              对v-model语法结合动态绑定input的type属性的语法预处理  
|  |  |  
|  |  |----util                     工具函数  
|  |  |  |----index                 入口及query的定义  
|  |  |  |----attrs                 attrs相关的工具函数，用于patch阶段对应模块属性  
|  |  |  |----class                 class相关的工具函数，用于patch阶段对应模块属性  
|  |  |  |----style                 style相关的工具函数，用于patch阶段对应模块属性  
|  |  |  |----element               生成虚拟节点时标签类型判断相关的工具函数  
|  |  |  |----compat                兼容性处理的代码  
|  |    
|  |  
|  |----shared                      模块间共享的方法和常量  
|  |  |----util                     同于工具函数  
|  |  |----constants                常量  
|  |   
|  |   
|  |----types                       ts类型定义  
|  |    
|  |    
|  |----v3                            
|  |    
|  |    
|  |----global                      全局的类型定义  
|  
|  
|  
|----dist                    打包出口目录  
|----benchmarks              性能测试  
|----compiler-sfc            sfc(single file component)单文件组件编译相关  
|----packages                分离出来单独的包  
|----examples                示例  
|----test                    测试相关  
|----types                   ts定义  
  
  
源码学习从scripts/config中的入口开始  





