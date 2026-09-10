import type { GradesOut } from './types/grades'
import type { CustomRequestOptions } from '@/http/types'
import { http } from '@/http/http'

type RequestOptions = Pick<CustomRequestOptions, 'hideErrorToast'>

const BASE = '/api/v2/grades'

/**
 * 服务端已存储的成绩；未授权时返回 403 `{code: 'CONSENT_REQUIRED'}`
 */
export function getGrades(options?: RequestOptions) {
  return http.get<GradesOut>(`${BASE}/`, undefined, undefined, options)
}

/**
 * 从门户实时抓取成绩，已授权时同时存储。
 * 未绑定 404 `NOT_BOUND`，会话失效 409 `PKU_LOGIN_REQUIRED`，门户不可达 503 `PORTAL_UNREACHABLE`
 */
export function syncGrades(options?: RequestOptions) {
  return http.post<GradesOut>(`${BASE}/sync/`, undefined, undefined, undefined, options)
}

/**
 * 删除服务端存储的全部成绩，成功返回 204
 */
export function deleteGrades(options?: RequestOptions) {
  return http.delete<void>(`${BASE}/`, undefined, undefined, options)
}
