自学vue2.x使用

源代码处添加注释



目录结构

vue2.x-learning
|----scripts                 脚本文件，package.json中脚本设置入口相关
|  |----config               通过rollup打包的配置
|  |----build                通过运行node引入rollup进行打包的入口
|  |----alias                解析时的路径别名
|
|----src                     源码
|  |----compiler                模板编译相关
|  |  |----index                编译入口
|  |  |----codeframe
|  |  |----create-compiler
|  |  |----error-detector
|  |  |----helpers
|  |  |----optimizer
|  |  |----to-function
|  |  |----codegen
|  |  |  |----
|  |  |  |----
|  |  |  |----
|  |  |----directives
|  |  |  |----
|  |  |  |----
|  |  |  |----
|  |  |----parser               模板编译成AST
|  |  |  |----index             入口，主要进行AST操作
|  |  |  |----html-parser       模板匹配的主要逻辑
|  |  |  |----text-parser       对文本中的模板语法进行编译
|  |  |  |----filter-parser     对模板语法中的过滤器语法进行编译
|  |  |  |----entity-decoder    
|  |  |
|  |----core                    vue2核心代码
|  |  |----instance                 实例创建相关
|  |  |  |----index                 
|  |  |  |----init
|  |  |  |----inject
|  |  |  |----events
|  |  |  |----lifecycle
|  |  |  |----proxy
|  |  |  |----render
|  |  |  |----state
|  |  |
|  |  |----observer                 数据劫持相关
|  |  |  |----index               Observer类和defineReactive()实现  
|  |  |  |----dep                 Dep类
|  |  |  |----watcher             Watcher类  
|  |  |  |----array               Observer类中对数组进行的处理        
|  |  |  |----traverse            Watcher类下get()方法递归触发对象下所有属性的getter
|  |  |  |----scheduler           一次任务循环中多次更改数据只有一次刷新视图(管理一个watchers队列用于控制一次刷新视图)      
|  |  |
|  |  |----global-api               全局APi相关
|  |  |  |----index               所有全局API的挂载
|  |  |  |----mixin
|  |  |  |----extend
|  |  |  |----use
|  |  |  |----assets              Vue.component、Vue.directive、Vue.filter的具体实现
|  |  |
|  |  |----util                     工具函数相关
|  |  |  |----next-tick           nextTick()方法的实现
|  |  |  |----perf                perfomance API相关的不同处理
|  |  |  |----env                 导出环境相关的变量和方法
|  |  |  |----
|  |  |  |----
|  |  |  |----
|  |  |  |----
|  |  |  |----
|  |  |
|  |  |----vdom
|  |----platforms\web                 平台相关
|  |  |----
|  |  |----
|  |  |----
|  |----shared                    模块间共享属性和方法
|  |----v3                          
|  |----global.d.ts                  
|
|----dist                    打包出口目录
|----benchmarks              性能测试
|----compiler-sfc            sfc(single file component)单文件组件编译相关
|----packages                分离出来单独的包
|----examples                示例
|----test                    测试相关
|----types                   ts定义


源码学习从scripts/config中的入口开始





