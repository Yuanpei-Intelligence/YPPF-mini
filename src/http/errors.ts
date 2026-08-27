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

function parseFieldErrors(value: unknown): ApiFieldErrors | null {
  if (!isRecord(value))
    return null

  const result: ApiFieldErrors = {}
  for (const [field, items] of Object.entries(value)) {
    if (!Array.isArray(items) || !items.every(isApiFieldError))
      return null
    result[field] = items.map(item => ({ code: item.code, message: item.message }))
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
