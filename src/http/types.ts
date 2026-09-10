/**
 * 在 uniapp 的 RequestOptions 和 IUniUploadFileOptions 基础上，添加自定义参数
 */
/** 支持的请求方法（UniApp 未声明 PATCH，但运行时支持） */
export type HttpMethod = UniApp.RequestOptions['method'] | 'PATCH'

export type CustomRequestOptions = Omit<UniApp.RequestOptions, 'method'> & {
  method?: HttpMethod
  query?: Record<string, any>
  /** @deprecated 新代码使用 errorPresentation: 'manual'。 */
  hideErrorToast?: boolean
  /**
   * legacy-auto 维持尚未迁移模块的原生提示；manual 由页面使用统一异常展示层处理。
   */
  errorPresentation?: 'legacy-auto' | 'manual'
} & IUniUploadFileOptions // 添加uni.uploadFile参数类型

/** 主要提供给 openapi-ts-request 生成的代码使用 */
export type CustomRequestOptions_ = Omit<CustomRequestOptions, 'url'>

export interface HttpRequestResult<T> {
  promise: Promise<T>
  requestTask: UniApp.RequestTask
}

// 通用响应格式（兼容 msg + message 字段）
export type IResponse<T = any> = {
  code: number
  data: T
  message: string
  [key: string]: any // 允许额外属性
} | {
  code: number
  data: T
  msg: string
  [key: string]: any // 允许额外属性
}

// 分页请求参数
export interface PageParams {
  page: number
  pageSize: number
  [key: string]: any
}

// 分页响应数据
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
