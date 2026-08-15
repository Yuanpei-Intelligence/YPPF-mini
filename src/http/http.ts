import type { IDoubleTokenRes } from '@/api/types/login'
import type { CustomRequestOptions, IResponse } from '@/http/types'
import { nextTick } from 'vue'
import { BIND_PAGE, LOGIN_PAGE_LIST } from '@/router/config'
import { useTokenStore } from '@/store/token'
import { isDoubleTokenMode } from '@/utils'
import { toLoginPage } from '@/utils/toLoginPage'
import { ResultEnum } from './tools/enum'

/**
 * 将接口返回的错误 data 整理成可展示的字符串
 * 这是为了兼容DRF ValidationError和朴素API实现方式的格式
 * - 朴素API：若有 msg / message 直接使用；若为数组，用分号拼接
 * - DRF：若为dict且值为数组，如 {"字段名":["error1"]}，
 *        按 "key: value" 展开后用分号拼接
 */
function formatErrorData(data: any): string {
  // 默认
  if (data == null)
    return '请求错误'
  // 朴素API
  if (typeof data.msg === 'string' && data.msg)
    return data.msg
  if (typeof data.message === 'string' && data.message)
    return data.message
  if (Array.isArray(data)) {
    const list = data.map(item => (typeof item === 'string' ? item : String(item)))
    return list.length ? list.join('；') : '请求错误'
  }
  // DRF
  if (typeof data === 'object') {
    const parts: string[] = []
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const text = typeof item === 'string' ? item : String(item)
          if (text)
            parts.push(text)
        }
      }
      else if (value != null && value !== '') {
        parts.push(String(value))
      }
    }
    return parts.length ? parts.join('；') : '请求错误'
  }
  // 其他情况
  return '请求错误'
}

// 刷新 token 状态管理
let refreshing = false // 防止重复刷新 token 标识
let taskQueue: (() => void)[] = [] // 刷新 token 请求队列
const NO_RETRY_PATHS = [
  '/pages/login/index',
  '/auth/wx/bind', // 防止死锁
  '/auth/wx/login',
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
        const responseData = res.data as IResponse<T>
        const { code } = responseData

        // 检查是否是401 Authentication Error
        const isTokenExpired = res.statusCode === 401 || code === 401
        const requestPath = options.url || ''

        if (isTokenExpired && !NO_RETRY_PATHS.includes(requestPath)) {
          const tokenStore = useTokenStore()
          if (!isDoubleTokenMode) {
            // #ifdef MP-WEIXIN
            console.log('token 过期，尝试重新登录')
            const res = await tokenStore.wxLogin()
            // 未绑定账号，跳转到绑定页面，防止死锁
            if (res.status === 'unbound') {
              uni.navigateTo({
                url: `${BIND_PAGE}?signed_openid=${encodeURIComponent(res.signed_openid)}`,
              })
              return reject(res)
            }
            // 绑定的账号，说明登录了，重新尝试发送请求
            return resolve(http<T>(options))
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
        if (!options.hideErrorToast) {
          uni.showToast({
            icon: 'none',
            title: formatErrorData(res.data),
          })
        }
        reject(res)
      },
      // 响应失败
      fail(err) {
        if (!options.hideErrorToast) {
          uni.showToast({
            icon: 'none',
            title: '网络错误，换个网络试试',
          })
        }
        reject(err)
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
