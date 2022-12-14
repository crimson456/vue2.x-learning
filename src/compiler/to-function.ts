import { noop, extend } from 'shared/util'
import { warn as baseWarn, tip } from 'core/util/debug'
import { generateCodeFrame } from './codeframe'
import type { Component } from 'types/component'
import { CompilerOptions } from 'types/compiler'

type CompiledFunctionResult = {
  render: Function
  staticRenderFns: Array<Function>
}

function createFunction(code, errors) {
  try {
    return new Function(code)
  } catch (err: any) {
    errors.push({ err, code })
    return noop
  }
}

export function createCompileToFunctionFn(compile: Function): Function {
  // 使用闭包缓存编译的结果，键值为[分隔符+模板]
  const cache = Object.create(null)
  return function compileToFunctions(
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {
    options = extend({}, options)
    const warn = options.warn || baseWarn
    delete options.warn

    /* istanbul ignore if */
    if (__DEV__) {
      // detect possible CSP(Content Security Policy) restriction
      // 验证安全策略是否支持new Function的语法
      try {
        new Function('return 1')
      } catch (e: any) {
        if (e.toString().match(/unsafe-eval|CSP/)) {
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
              'environment with Content Security Policy that prohibits unsafe-eval. ' +
              'The template compiler cannot work in this environment. Consider ' +
              'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
              'templates into render functions.'
          )
        }
      }
    }

    // check cache
    // 设置缓存，将编译的结果缓存在闭包中cache对象下的 [分隔符+模板] 字段下
    const key = options.delimiters
      ? String(options.delimiters) + template
      : template
    // 如果已经编译过直接从缓存中获取结果
    if (cache[key]) {
      return cache[key]
    }

    // compile
    // compiled格式: { ast , render , staticRenderFns , errors , tips }
    const compiled = compile(template, options)

    // check compilation errors/tips
    // 将编译过程中的错误堆栈和提示信息取出并进行输出
    if (__DEV__) {
      if (compiled.errors && compiled.errors.length) {
        if (options.outputSourceRange) {
          compiled.errors.forEach(e => {
            warn(
              `Error compiling template:\n\n${e.msg}\n\n` +
                generateCodeFrame(template, e.start, e.end),
              vm
            )
          })
        } else {
          warn(
            `Error compiling template:\n\n${template}\n\n` +
              compiled.errors.map(e => `- ${e}`).join('\n') +
              '\n',
            vm
          )
        }
      }
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) {
          compiled.tips.forEach(e => tip(e.msg, vm))
        } else {
          compiled.tips.forEach(msg => tip(msg, vm))
        }
      }
    }

    // turn code into functions
    // 将编译的代码字符串生成函数
    const res: any = {}
    const fnGenErrors: any[] = []
    res.render = createFunction(compiled.render, fnGenErrors)
    res.staticRenderFns = compiled.staticRenderFns.map(code => {
      return createFunction(code, fnGenErrors)
    })

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    /* istanbul ignore if */
    // 处理代码生成函数的错误并输出
    if (__DEV__) {
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        warn(
          `Failed to generate render function:\n\n` +
            fnGenErrors
              .map(
                ({ err, code }) => `${(err as any).toString()} in\n\n${code}\n`
              )
              .join('\n'),
          vm
        )
      }
    }
    // 缓存结果并输出
    // 结果格式:{ render , staticRenderFns }
    return (cache[key] = res)
  }
}
