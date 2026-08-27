import type {
  Feedback,
  FeedbackCreate,
  FeedbackListQuery,
  FeedbackType,
  OrganizationInfoResponse,
  PatchedFeedbackUpdate,
} from './types/feedback'
import { http } from '@/http/http'

/**
 * 反馈列表：个人为「我发出的反馈」，组织为「收到的反馈」
 */
export function listFeedback(query?: FeedbackListQuery) {
  return http.get<Feedback[]>('/api/v2/feedback/', query, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 创建反馈（保存草稿或直接提交），仅个人账号
 */
export function createFeedback(data: FeedbackCreate) {
  return http.post<Feedback>('/api/v2/feedback/', data, undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取单条反馈详情（需有访问权限）
 */
export function getFeedback(id: string) {
  return http.get<Feedback>(`/api/v2/feedback/${id}/`, undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 修改草稿或提交草稿（仅发布者对草稿可操作）
 */
export function partialUpdateFeedback(id: string, payload: PatchedFeedbackUpdate) {
  return http<Feedback>({
    url: `/api/v2/feedback/${id}/`,
    method: 'PATCH',
    data: payload,
    errorPresentation: 'manual',
  })
}

/**
 * 删除草稿（仅发布者对草稿可删）
 */
export function deleteFeedback(id: string) {
  return http.delete<void>(`/api/v2/feedback/${id}/`, undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取所有反馈类型（表单选项）
 */
export function getFeedbackTypes() {
  return http.get<FeedbackType[]>('/api/v2/feedback/types/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取所有公开的反馈（公示栏用）
 * 返回所有已解决/无法解决且公开的反馈，不限制用户
 */
export function listPublicFeedback(query?: { ordering?: string }) {
  return http.get<Feedback[]>('/api/v2/feedback/public/', query, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取当前用户"进行中"的反馈列表
 * 规则：issue_status=已发布，且解决状态为【解决中】或【未标记】
 * 仅个人账号可访问
 */
export function listInProgressFeedback(query?: { ordering?: string }) {
  return http.get<Feedback[]>('/api/v2/feedback/in-progress/', query, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取当前用户"已结束"的反馈列表
 * 规则：issue_status=已发布，且解决状态为【已解决】或【无法解决】
 * 仅个人账号可访问
 */
export function listDoneFeedback(query?: { ordering?: string }) {
  return http.get<Feedback[]>('/api/v2/feedback/done/', query, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取组织信息（组织类型、组织列表、映射关系等）
 */
export function getOrganizationInfo() {
  return http.get<OrganizationInfoResponse>('/api/v2/feedback/org-mapping/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}
