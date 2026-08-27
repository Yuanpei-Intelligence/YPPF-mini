/**
 * 活动状态枚举
 */
export type ActivityStatus = '审核中' | '已撤销' | '未过审' | '已取消' | '报名中' | '待发布' | '等待中' | '进行中' | '已结束'

/**
 * 活动类别枚举
 */
export type ActivityCategory = 0 | 1 // 0: 普通活动, 1: 课程活动

/**
 * 活动摘要信息
 */
export interface IActivitySummary {
  id: number
  title: string
  organization_id: number
  organization_name: string
  start: string // date-time
  end: string // date-time
  location: string
  introduction: string
  status: ActivityStatus
  status_display: string
  need_apply: boolean
  apply_end: string // date-time
  bidding: boolean
  need_checkin: boolean
  inner: boolean
  capacity: number
  current_participants: number
  url: string // uri
  category: ActivityCategory
  category_display: string
  has_tag: boolean
  popular_level: number // 0: normal, 1: popular, 2: full
}

/**
 * 今日活动项
 */
export interface ITodayActivity {
  activity: IActivitySummary
  start_time: string // HH:MM format
}

/**
 * 报名截止活动项
 */
export interface ISignupActivity {
  activity: IActivitySummary
  apply_end: string // date-time
  hours_until_deadline: number // Hours until signup deadline (rounded to 0.1h)
}

/**
 * 活动首页数据响应
 */
export interface IActivityHomepage {
  recent_activities: IActivitySummary[] // 开始时间在前后一周内的活动（排除取消和审核中的活动），按时间逆序排序
  today_activities: ITodayActivity[] // 开始时间在今天的活动（不展示已结束的活动），按开始时间由近到远排序
  newly_released_activities: IActivitySummary[] // 最新一周内发布的活动，按发布时间逆序
  prepare_times: number[] // 报名截止时间配置列表 [1, 24, 72, 168]（一小时，一天，三天，一周）
  signup_activities: ISignupActivity[] // 即将截止报名的活动，按截止时间正序，最多返回10条
}

/**
 * 签到结果响应
 * 失败统一由 RequestError 表示，并保留标准 API 错误码和字段错误。
 */
export interface ICheckInRes {
  message: string
}
