import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'
import type { GlobalAPI } from 'types/global-api'


//Vue的构造函数
function Vue(options) {
  if (__DEV__ && !(this instanceof Vue)) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}

//@ts-expect-error Vue has function type
//挂载了Vue.prototype._init
initMixin(Vue)
//@ts-expect-error Vue has function type
stateMixin(Vue)
//@ts-expect-error Vue has function type
eventsMixin(Vue)
//@ts-expect-error Vue has function type
lifecycleMixin(Vue)
//@ts-expect-error Vue has function type
renderMixin(Vue)

export default Vue as unknown as GlobalAPI







// ???  
// ???  
// ???  stateMixin： 给Vue原型对象设置属性$data、$props、$set、$del
// ???  eventsMixin： 给Vue原型对象设置属性$on、$once、$off、$emit
// ???  lifecycleMixin： 给Vue原型对象设置属性_update、$forceUpdate、$destroy、$emit
// ???  renderMixin： 给Vue原型对象设置属性$nextTick、_render