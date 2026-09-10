/**
 * 成绩契约，对应后端 `/api/v2/grades/`。
 * 只有在北大账号绑定里授权了 grades 时服务端才会存储成绩；撤销授权会同时删除已存储的成绩。
 */

export interface GradeRow {
  /** 门户学期码，如 '25-26-1'（1 秋、2 春、3 夏） */
  term_code: string
  course_code: string
  class_no: string
  name: string
  course_type: string
  credits: number | null
  /** 门户原始成绩文本，可能是 'P'、'合格'、'W' 等非数字 */
  score: string
  score_numeric: number | null
  gpa: number | null
}

export interface GradesSummary {
  credits: number
  /** 学分加权平均绩点；没有可计算的行时为 null */
  gpa: number | null
}

export interface GradesTerm {
  term_code: string
  summary: GradesSummary
  rows: GradeRow[]
}

export interface GradesOut {
  /** 本次返回的成绩是否已存储在服务端；未授权时 `sync/` 只返回实时数据 */
  stored: boolean
  fetched_at: string | null
  summary: GradesSummary
  terms: GradesTerm[]
}

/**
 * 成绩接口的稳定错误码（错误响应体为 `{code, message}`）。
 * - CONSENT_REQUIRED：403，未授权使用成绩数据
 * - NOT_BOUND：404，未绑定北大账号
 * - PKU_LOGIN_REQUIRED：409，门户会话失效
 * - PORTAL_UNREACHABLE：503
 */
export type GradesErrorCode = 'CONSENT_REQUIRED' | 'NOT_BOUND' | 'PKU_LOGIN_REQUIRED' | 'PORTAL_UNREACHABLE'
