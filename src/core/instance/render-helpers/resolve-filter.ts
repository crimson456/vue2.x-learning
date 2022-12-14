import { identity, resolveAsset } from 'core/util/index'

/**
 * Runtime helper for resolving filters
 */
// 获取$options.filters下对应的过滤器函数
export function resolveFilter(id: string): Function {
  return resolveAsset(this.$options, 'filters', id, true) || identity
}
