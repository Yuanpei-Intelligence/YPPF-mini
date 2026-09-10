import type { Binding, PkuConsentsIn, PkuLoginIn } from './types/pku'
import type { CustomRequestOptions } from '@/http/types'
import { http } from '@/http/http'

type RequestOptions = Pick<CustomRequestOptions, 'hideErrorToast'>

/**
 * 查询当前用户的北大账号绑定状态
 */
export function getBinding(options?: RequestOptions) {
  return http.get<Binding>('/api/v2/pku/binding/', undefined, undefined, options)
}

/**
 * 用北大账号登录门户并绑定到当前用户；密码只在本次请求中使用
 */
export function pkuLogin(payload: PkuLoginIn, options?: RequestOptions) {
  return http.post<Binding>('/api/v2/pku/login/', payload, undefined, undefined, options)
}

/**
 * 解除北大账号绑定（服务端同时删除门户会话），成功返回 204
 */
export function pkuUnbind(options?: RequestOptions) {
  return http.post<void>('/api/v2/pku/unbind/', undefined, undefined, undefined, options)
}

/**
 * 更新数据使用授权
 */
export function updateConsents(payload: PkuConsentsIn, options?: RequestOptions) {
  return http<Binding>({
    url: '/api/v2/pku/consents/',
    method: 'PATCH',
    data: payload,
    ...options,
  })
}
