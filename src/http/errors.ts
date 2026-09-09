export interface ApiFieldError {
  code: string
  message: string
}

export type ApiFieldErrors = Record<string, ApiFieldError[]>

export interface ApiErrorResponse {
  code: string
  message: string
  errors: ApiFieldErrors
}

export type RequestErrorKind
  = | 'network'
    | 'authentication'
    | 'permission'
    | 'business'
    | 'server'
    | 'unknown'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isApiFieldError(value: unknown): value is ApiFieldError {
  return isRecord(value)
    && typeof value.code === 'string'
    && typeof value.message === 'string'
}

/**
 * 单个字段的错误列表。规范格式为 `[{code, message}]`；
 * 仍按 DRF 原生格式返回的端点给的是 `['msg']` 或 `'msg'`，统一成规范格式（code 记为 `invalid`）。
 */
function parseFieldErrorItems(value: unknown): ApiFieldError[] | null {
  if (typeof value === 'string')
    return [{ code: 'invalid', message: value }]
  if (!Array.isArray(value))
    return null

  const items: ApiFieldError[] = []
  for (const item of value) {
    if (isApiFieldError(item))
      items.push({ code: item.code, message: item.message })
    else if (typeof item === 'string')
      items.push({ code: 'invalid', message: item })
    else
      return null
  }
  return items
}

function parseFieldErrors(value: unknown): ApiFieldErrors | null {
  // 没有字段错误的端点可以省略 errors
  if (value === undefined || value === null)
    return {}
  if (!isRecord(value))
    return null

  const result: ApiFieldErrors = {}
  for (const [field, items] of Object.entries(value)) {
    const parsed = parseFieldErrorItems(items)
    // 形状未知的字段值（如嵌套对象）跳过该字段即可，不要让整个 {code, message} 信封解析失败
    if (parsed === null)
      continue
    result[field] = parsed
  }
  return result
}

export function parseApiErrorResponse(value: unknown): ApiErrorResponse | null {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.message !== 'string')
    return null

  const errors = parseFieldErrors(value.errors)
  if (errors === null)
    return null

  return {
    code: value.code,
    message: value.message,
    errors,
  }
}

function classifyStatus(statusCode: number): RequestErrorKind {
  if (statusCode === 401)
    return 'authentication'
  if (statusCode === 403)
    return 'permission'
  if (statusCode >= 400 && statusCode < 500)
    return 'business'
  if (statusCode >= 500)
    return 'server'
  return 'unknown'
}

export class RequestError extends Error {
  readonly kind: RequestErrorKind
  readonly code: string
  readonly statusCode?: number
  readonly errors: ApiFieldErrors
  readonly original: unknown

  constructor(options: {
    kind: RequestErrorKind
    code: string
    message: string
    statusCode?: number
    errors?: ApiFieldErrors
    original?: unknown
  }) {
    super(options.message)
    this.name = 'RequestError'
    this.kind = options.kind
    this.code = options.code
    this.statusCode = options.statusCode
    this.errors = options.errors ?? {}
    this.original = options.original
  }
}

export function createResponseError(statusCode: number, data: unknown): RequestError {
  const response = parseApiErrorResponse(data)
  return new RequestError({
    kind: classifyStatus(statusCode),
    code: response?.code ?? 'invalid_error_response',
    message: response?.message ?? '服务器返回了无法识别的错误。',
    statusCode,
    errors: response?.errors,
    original: data,
  })
}

export function createNetworkError(original: unknown): RequestError {
  return new RequestError({
    kind: 'network',
    code: 'network_error',
    message: '网络连接失败，请检查网络后重试。',
    original,
  })
}

export function toRequestError(error: unknown): RequestError {
  if (error instanceof RequestError)
    return error
  return new RequestError({
    kind: 'unknown',
    code: 'unknown_error',
    message: '请求未能完成，请稍后重试。',
    original: error,
  })
}
