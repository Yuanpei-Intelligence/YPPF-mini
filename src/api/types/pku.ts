/**
 * 北大账号（IAAA / 门户）绑定契约，对应后端 `/api/v2/pku/`。
 */

/** 服务端保存的门户会话状态 */
export interface PkuSession {
  /** 会话是否可用；服务端尚未探测过时为 null */
  alive: boolean | null
  last_ok_at: string | null
  invalid_reason: string
}

/** 数据使用授权 */
export interface PkuConsents {
  timetable: boolean
  grades: boolean
}

/** 绑定信息（`GET binding/`、`POST login/`、`PATCH consents/` 的响应） */
export interface Binding {
  bound: boolean
  pku_username: string | null
  verified_at: string | null
  last_login_at: string | null
  last_sync_at: string | null
  session: PkuSession
  consents: PkuConsents
  locked_until: string | null
}

/** `POST login/` 请求体；密码只用于本次登录，服务端不会保存 */
export interface PkuLoginIn {
  username: string
  password: string
  consent_timetable?: boolean
  consent_grades?: boolean
}

/** `PATCH consents/` 请求体 */
export interface PkuConsentsIn {
  timetable?: boolean
  grades?: boolean
}

/**
 * 北大账号相关接口的稳定错误码（错误响应体为 `{code, message}`）。
 * - IAAA_ERROR / OTP_REQUIRED / CAPTCHA_REQUIRED：400
 * - CONSENT_REQUIRED：403
 * - ALREADY_BOUND_ELSEWHERE / PKU_LOGIN_REQUIRED：409
 * - LOCKED：429
 * - PORTAL_DISABLED：503
 */
export type PkuErrorCode
  = | 'IAAA_ERROR'
    | 'OTP_REQUIRED'
    | 'CAPTCHA_REQUIRED'
    | 'CONSENT_REQUIRED'
    | 'ALREADY_BOUND_ELSEWHERE'
    | 'PKU_LOGIN_REQUIRED'
    | 'LOCKED'
    | 'PORTAL_DISABLED'
