import { remove } from '../util/index'
import config from '../config'
import { DebuggerOptions, DebuggerEventExtraInfo } from 'v3'

let uid = 0

/**
 * @internal
 */
export interface DepTarget extends DebuggerOptions {
  id: number
  addDep(dep: Dep): void
  update(): void
}

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * @internal
 */
// dep实例的使用
// 1. 在创建响应式成员defineReactive()的闭包中创建
// 2. 被观察的对象下的对象或数组类型的__ob__.dep字段
export default class Dep {
  static target?: DepTarget | null
  id: number
  subs: Array<DepTarget>

  constructor() {
    this.id = uid++
    // 订阅的watcher数组
    this.subs = []
  }
  // 将watcher添加到订阅数组
  addSub(sub: DepTarget) {
    this.subs.push(sub)
  }

  removeSub(sub: DepTarget) {
    remove(this.subs, sub)
  }

  // 依赖收集主逻辑：调用watcher上的addDep方法
  depend(info?: DebuggerEventExtraInfo) {
    if (Dep.target) {
      Dep.target.addDep(this)
      if (__DEV__ && info && Dep.target.onTrack) {
        Dep.target.onTrack({
          effect: Dep.target,
          ...info
        })
      }
    }
  }

  // 派发更新主逻辑
  notify(info?: DebuggerEventExtraInfo) {
    // stabilize the subscriber list first
    // 浅复制
    const subs = this.subs.slice()
    // 根据id排序watcher
    if (__DEV__ && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    // 依次触发watcher上的update方法
    for (let i = 0, l = subs.length; i < l; i++) {
      if (__DEV__ && info) {
        const sub = subs[i]
        sub.onTrigger &&
          sub.onTrigger({
            effect: subs[i],
            ...info
          })
      }
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
// Dep.target为一个全局字段用于保存当前正在进行渲染的watcher，Dep实例可以通过保存此字段进行依赖收集
Dep.target = null
const targetStack: Array<DepTarget | null | undefined> = []

export function pushTarget(target?: DepTarget | null) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget() {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
