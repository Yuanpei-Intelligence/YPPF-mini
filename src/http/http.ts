import type { IDoubleTokenRes } from '@/api/types/login'
import type { CustomRequestOptions, IResponse } from '@/http/types'
import { nextTick } from 'vue'
import { BIND_PAGE, LOGIN_PAGE_LIST } from '@/router/config'
import { useTokenStore } from '@/store/token'
import { isDoubleTokenMode } from '@/utils'
import { toLoginPage } from '@/utils/toLoginPage'
import { createNetworkError, createResponseError, toRequestError } from './errors'
import { ResultEnum } from './tools/enum'

/** 判断错误是否由采用新异常契约的页面自行展示。 */
function usesManualErrorPresentation(options: CustomRequestOptions): boolean {
  return options.errorPresentation === 'manual' || options.hideErrorToast === true
}

/** 内部标记：这次请求是 401 重登后的重试，不再进入重登流程 */
type RetryAwareOptions = CustomRequestOptions & { __retried401?: boolean }

// 刷新 token 状态管理
let refreshing = false // 防止重复刷新 token 标识
let bindNavigating = false // 正在跳转绑定页，避免并发 401 重复跳转
let taskQueue: (() => void)[] = [] // 刷新 token 请求队列
const NO_RETRY_PATHS = [
  '/pages/login/index',
  '/api/v2/auth/wx/bind/', // 匿名绑定端点的 401 是凭据错误，不能触发微信重登
  '/api/v2/auth/wx/login/',
  ...LOGIN_PAGE_LIST,
]

export function http<T>(options: CustomRequestOptions) {
  // 1. 返回 Promise 对象
  return new Promise<T>((resolve, reject) => {
    // uni.request 类型未包含 PATCH，运行时支持，故做类型断言
    uni.request({
      ...options,
      dataType: 'json',
      // #ifndef MP-WEIXIN
      responseType: 'json',
      // #endif
      // 响应成功
      success: async (res) => {
        // 204 等无响应体时 res.data 可能为空；兜底成空对象，避免解构抛错导致 Promise 永不结束
        const responseData = (res.data ?? {}) as IResponse<T>
        const { code } = responseData

        // 检查是否是401 Authentication Error
        const isTokenExpired = res.statusCode === 401 || code === 401
        const requestPath = options.url || ''

        if (isTokenExpired && !NO_RETRY_PATHS.includes(requestPath)) {
          // 重登成功后只重试一次：仍然 401 说明不是 token 过期（账号被停用、时钟偏差、后端异常），
          // 不能无限递归重试
          if ((options as RetryAwareOptions).__retried401) {
            return reject(createResponseError(401, {
              code: 'auth.unauthorized',
              message: '登录状态无效，请重新登录。',
              errors: {},
            }))
          }
          const tokenStore = useTokenStore()
          if (!isDoubleTokenMode) {
            // #ifdef MP-WEIXIN
            console.log('token 过期，尝试重新登录')
            let loginResult: Awaited<ReturnType<typeof tokenStore.wxLogin>>
            try {
              loginResult = await tokenStore.wxLogin()
            }
            catch (error) {
              // wx.login / 换 openid 失败也要以 RequestError 抛出，保持“所有失败都是 RequestError”的约定
              return reject(toRequestError(error))
            }
            // 未绑定账号，跳转到绑定页面，防止死锁
            if (loginResult.status === 'unbound') {
              // 多个请求同时 401 时只跳一次，避免把绑定页叠开好几层
              if (!bindNavigating) {
                bindNavigating = true
                uni.navigateTo({
                  url: `${BIND_PAGE}?signed_openid=${encodeURIComponent(loginResult.signed_openid)}`,
                  complete: () => {
                    setTimeout(() => {
                      bindNavigating = false
                    }, 1500)
                  },
                })
              }
              return reject(createResponseError(401, {
                code: 'auth.binding_required',
                message: '请先绑定微信账号。',
                errors: {},
              }))
            }
            // 绑定的账号，说明登录了，重新尝试发送请求（只重试这一次）
            return resolve(http<T>({ ...options, __retried401: true } as RetryAwareOptions))
            // #endif
            // 其他平台走正常流程
            tokenStore.logout()
            toLoginPage()
            return reject(res)
          }

          /* -------- 无感刷新 token ----------- */
          // 我们不使用以下代码，但是保留了为了将来升级
          const { refreshToken } = tokenStore.tokenInfo as IDoubleTokenRes || {}
          // token 失效的，且有刷新 token 的，才放到请求队列里
          if (refreshToken) {
            taskQueue.push(() => {
              resolve(http<T>(options))
            })
          }

          // 如果有 refreshToken 且未在刷新中，发起刷新 token 请求
          if (refreshToken && !refreshing) {
            refreshing = true
            try {
              // 发起刷新 token 请求（使用 store 的 refreshToken 方法）
              await tokenStore.refreshToken()
              // 刷新 token 成功
              refreshing = false
              nextTick(() => {
                // 关闭其他弹窗
                uni.hideToast()
                uni.showToast({
                  title: 'token 刷新成功',
                  icon: 'none',
                })
              })
              // 将任务队列的所有任务重新请求
              taskQueue.forEach(task => task())
            }
            catch (refreshErr) {
              console.error('刷新 token 失败:', refreshErr)
              refreshing = false
              // 刷新 token 失败，跳转到登录页
              nextTick(() => {
                // 关闭其他弹窗
                uni.hideToast()
                uni.showToast({
                  title: '登录已过期，请重新登录',
                  icon: 'none',
                })
              })
              // 清除用户信息
              await tokenStore.logout()
              // 跳转到登录页
              setTimeout(() => {
                toLoginPage()
              }, 2000)
            }
            finally {
              // 不管刷新 token 成功与否，都清空任务队列
              taskQueue = []
            }
          }

          return reject(res)
        }

        // 处理其他成功状态（HTTP状态码200-299）
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 兼容非标准格式：如果没有 code 且没有 data 字段，认为整个 responseData 就是数据
          if (responseData.code === undefined && responseData.data === undefined) {
            return resolve(responseData as unknown as T)
          }

          // 处理业务逻辑错误
          if (code !== ResultEnum.Success0 && code !== ResultEnum.Success200) {
            uni.showToast({
              icon: 'none',
              title: responseData.msg || responseData.message || '请求错误',
            })
          }
          return resolve(responseData.data)
        }

        // 处理其他错误（401以外的）
        const requestError = createResponseError(res.statusCode, res.data)
        if (!usesManualErrorPresentation(options)) {
          uni.showToast({
            icon: 'none',
            title: requestError.message,
          })
        }
        reject(requestError)
      },
      // 响应失败
      fail(err) {
        const requestError = createNetworkError(err)
        if (!usesManualErrorPresentation(options)) {
          uni.showToast({
            icon: 'none',
            title: requestError.message,
          })
        }
        reject(requestError)
      },
    } as UniApp.RequestOptions)
  })
}

/**
 * GET 请求
 * @param url 后台地址
 * @param query 请求query参数
 * @param header 请求头，默认为json格式
 * @returns
 */
export function httpGet<T>(url: string, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({
    url,
    query,
    method: 'GET',
    header,
    ...options,
  })
}

/**
 * POST 请求
 * @param url 后台地址
 * @param data 请求body参数
 * @param query 请求query参数，post请求也支持query，很多微信接口都需要
 * @param header 请求头，默认为json格式
 * @returns
 */
export function httpPost<T>(url: string, data?: Record<string, any>, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({
    url,
    query,
    data,
    method: 'POST',
    header,
    ...options,
  })
}
/**
 * PUT 请求
 */
export function httpPut<T>(url: string, data?: Record<string, any>, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({
    url,
    data,
    query,
    method: 'PUT',
    header,
    ...options,
  })
}

/**
 * DELETE 请求（无请求体，仅 query）
 */
export function httpDelete<T>(url: string, query?: Record<string, any>, header?: Record<string, any>, options?: Partial<CustomRequestOptions>) {
  return http<T>({
    url,
    query,
    method: 'DELETE',
    header,
    ...options,
  })
}

// 支持与 axios 类似的API调用
http.get = httpGet
http.post = httpPost
http.put = httpPut
http.delete = httpDelete

// 支持与 alovaJS 类似的API调用
http.Get = httpGet
http.Post = httpPost
http.Put = httpPut
http.Delete = httpDelete
