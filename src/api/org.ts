import type {
  SubscriptionListResponse,
  SubscriptionUpdatePayload,
  SubscriptionUpdateResponse,
} from './types/org'
import { http } from '@/http/http'

/** 获取当前账号可见的小组订阅列表。 */
export function getOrganizationSubscriptions() {
  return http.get<SubscriptionListResponse>(
    '/api/v2/org/subscriptions/',
    undefined,
    undefined,
    { errorPresentation: 'manual' },
  )
}

/** 更新单个小组或某一类小组的订阅状态。 */
export function updateOrganizationSubscription(payload: SubscriptionUpdatePayload) {
  return http.post<SubscriptionUpdateResponse>(
    '/api/v2/org/subscriptions/update/',
    payload,
    undefined,
    undefined,
    { errorPresentation: 'manual' },
  )
}
