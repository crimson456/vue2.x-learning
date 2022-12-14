import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'
import type { GlobalAPI } from 'types/global-api'


//Vue构造函数
function Vue(options) {
  if (__DEV__ && !(this instanceof Vue)) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}


//initMixin： _init
//@ts-expect-error Vue has function type
initMixin(Vue)

//stateMixin： $data、$props、$set、$del、$watch
//@ts-expect-error Vue has function type
stateMixin(Vue)

//eventsMixin： $on、$once、$off、$emit
//@ts-expect-error Vue has function type
eventsMixin(Vue)

//lifecycleMixin： _update、$forceUpdate、$destroy
//@ts-expect-error Vue has function type
lifecycleMixin(Vue)

//renderMixin： $nextTick、_render
//@ts-expect-error Vue has function type
renderMixin(Vue)

export default Vue as unknown as GlobalAPI
