import type { RolloutErrorCode, RolloutState } from './types/rollout'
import { RequestError } from '@/http/errors'
import { http } from '@/http/http'

const FEATURE_NOT_ENABLED: RolloutErrorCode = 'feature_not_enabled'

/**
 * 获取当前账号的功能开关、体验中的功能、体验通道状态和体验反馈目标
 */
export function getRolloutState() {
  return http.get<RolloutState>('/api/v2/rollout/features/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 加入体验通道，重复加入没有影响。
 * 不能加入时以 403 拒绝，code 为 PreviewJoinBlockCode 之一。
 */
export function joinPreview() {
  return http.post<RolloutState>('/api/v2/rollout/preview/', undefined, undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 退出体验通道，未加入时没有影响
 */
export function leavePreview() {
  return http.delete<RolloutState>('/api/v2/rollout/preview/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 判断请求是否因为功能没有对当前账号开放而被拒绝（HTTP 403，code 为 feature_not_enabled）
 */
export function isFeatureNotEnabledError(error: unknown): error is RequestError {
  return error instanceof RequestError && error.code === FEATURE_NOT_ENABLED
}
