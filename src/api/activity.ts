import type { IActivityActionResult, IActivityDetail, IActivityHomepage, ICheckInRes } from './types/activity'
import { http } from '@/http/http'

/**
 * 获取活动首页数据
 *
 * 返回数据包括：
 * - recent_activities: 开始时间在前后一周内的活动（排除取消和审核中的活动），按时间逆序排序
 * - today_activities: 开始时间在今天的活动（不展示已结束的活动），按开始时间由近到远排序
 * - newly_released_activities: 最新一周内发布的活动，按发布时间逆序
 * - prepare_times: 报名截止时间配置列表 [1, 24, 72, 168]（一小时，一天，三天，一周）
 * - signup_activities: 即将截止报名的活动，按截止时间正序，最多返回10条
 */
export function getActivityOverview() {
  return http.get<IActivityHomepage>('/api/v2/activity/overview/')
}

/**
 * 获取指定活动的信息
 * @param id 活动ID
 * @returns 活动信息
 */
export function getActivityInfo(id: number, hideErrorToast = false) {
  return http.get<IActivityDetail>(`/api/v2/activity/${id}/`, undefined, undefined, { hideErrorToast })
}

/**
 * 报名指定活动
 * @param id 活动ID
 */
export function signUpActivity(id: number) {
  return http.post<IActivityActionResult>(`/api/v2/activity/${id}/signup/`)
}

/**
 * 取消指定活动的报名
 * @param id 活动ID
 */
export function withdrawActivitySignup(id: number) {
  return http.delete<IActivityActionResult>(`/api/v2/activity/${id}/signup/`)
}

/**
 * 签到指定活动
 * @param id 活动ID
 * @returns 签到结果
 */
export function checkInActivity(id: number) {
  return http.post<ICheckInRes>(`/api/v2/activity/checkin/`, { aid: id })
}
