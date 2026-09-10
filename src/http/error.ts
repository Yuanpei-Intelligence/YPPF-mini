/**
 * 把 `http()` reject 出来的值整理成页面可以分支处理的结构。
 *
 * `http()` 对 HTTP 非 2xx 响应 reject 的是 uni.request 的原始结果（含 `statusCode` 与 `data`），
 * 后端规范错误体为 `{code, message, errors}`；对网络层失败 reject 的是 `{errMsg}`。
 */
export interface ApiErrorInfo {
  /** HTTP 状态码；网络层失败时为 null */
  statusCode: number | null
  /** 后端稳定错误码（如 `PKU_LOGIN_REQUIRED`）；无法识别时为空字符串 */
  code: string
  /** 可直接展示给用户的文案 */
  message: string
  /** 400 表单错误：字段名 -> 错误文案列表 */
  fieldErrors: Record<string, string[]>
}

const STATUS_FALLBACK: Record<number, string> = {
  401: '登录已过期，请重新登录',
  403: '没有权限执行此操作',
  404: '请求的内容不存在',
  429: '操作过于频繁，请稍后再试',
}

function firstString(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate)
      return candidate
  }
  return ''
}

/** 收集 `{field: ['msg', …]}` 形式里的全部文案 */
function collectMessages(dict: Record<string, unknown>): string {
  const parts: string[] = []
  for (const value of Object.values(dict)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = typeof item === 'string' ? item : String(item)
        if (text)
          parts.push(text)
      }
    }
    else if (typeof value === 'string' && value) {
      parts.push(value)
    }
  }
  return parts.join('；')
}

function statusFallback(statusCode: number, fallback: string): string {
  if (STATUS_FALLBACK[statusCode])
    return STATUS_FALLBACK[statusCode]
  if (statusCode >= 500)
    return '服务暂时不可用，请稍后重试'
  return fallback
}

/**
 * 解析请求失败原因
 * @param error `http()` reject 出来的值
 * @param fallback 无法从响应中得到文案时使用的兜底提示
 */
export function getApiError(error: unknown, fallback = '请求失败，请稍后重试'): ApiErrorInfo {
  const result: ApiErrorInfo = { statusCode: null, code: '', message: fallback, fieldErrors: {} }
  if (!error || typeof error !== 'object')
    return result

  const raw = error as Record<string, any>

  if (typeof raw.statusCode === 'number') {
    result.statusCode = raw.statusCode
    const data = raw.data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      result.code = typeof data.code === 'number' ? String(data.code) : firstString(data.code)
      const errors = data.errors
      if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
        for (const [field, value] of Object.entries(errors as Record<string, unknown>)) {
          if (Array.isArray(value))
            result.fieldErrors[field] = value.map(item => String(item))
          else if (typeof value === 'string')
            result.fieldErrors[field] = [value]
        }
      }
      // 规范错误体 -> DRF detail -> 字段错误汇总 -> 旧式字段字典 -> 状态码兜底
      const { code: _code, errors: _errors, ...legacyDict } = data
      result.message = firstString(data.message, data.msg, data.detail)
        || collectMessages(result.fieldErrors)
        || collectMessages(legacyDict)
        || statusFallback(result.statusCode, fallback)
    }
    else if (Array.isArray(data)) {
      result.message = data.map(item => String(item)).filter(Boolean).join('；')
        || statusFallback(result.statusCode, fallback)
    }
    else {
      result.message = statusFallback(result.statusCode, fallback)
    }
    return result
  }

  if (typeof raw.errMsg === 'string') {
    const timeout = raw.errMsg.includes('timeout') || raw.errMsg.includes('time out')
    result.code = timeout ? 'timeout' : 'network_error'
    result.message = timeout ? '请求超时，请稍后重试' : '网络连接失败，请稍后重试'
    return result
  }

  if (typeof raw.message === 'string' && raw.message)
    result.message = raw.message
  return result
}

/**
 * 判断失败是否为指定状态码 + 错误码
 */
export function isApiError(error: unknown, statusCode: number, code?: string): boolean {
  const info = getApiError(error)
  return info.statusCode === statusCode && (code === undefined || info.code === code)
}
