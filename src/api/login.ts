import type {
  IAuthLoginRes,
  ICaptcha,
  ICheckLoginRes,
  IDoubleTokenRes,
  IEverydaySignInRes,
  IMyAccountsRes,
  ITicketRes,
  IUserInfoRes,
  IWxBindRes,
  IWxLoginRes,
} from './types/login'
import { http } from '@/http/http'

/**
 * 登录表单
 */
export interface ILoginForm {
  username: string
  password: string
}

/**
 * 微信账号绑定表单
 */
export interface IWxBindForm {
  username: string
  password: string
  signed_openid: string
}

/**
 * 获取验证码
 * @returns ICaptcha 验证码
 */
export function getCode() {
  throw new Error('Not implemented.')
  return http.get<ICaptcha>('/user/getCode')
}

/**
 * 用户登录
 * @param loginForm 登录表单
 */
export function login(loginForm: ILoginForm) {
  throw new Error('Not implemented.')
  return http.post<IAuthLoginRes>('/auth/login', loginForm)
}

/**
 * 微信小程序登录
 * @param code 微信登录凭证
 * @param username 用户名，如果没有则登录主用户
 * 返回一个jwt token
 */
export function wxLogin(code: string, username?: string) {
  if (username) {
    return http.post<IWxLoginRes>('/api/v2/auth/wx/login/', { code, username })
  }
  else {
    return http.post<IWxLoginRes>('/api/v2/auth/wx/login/', { code })
  }
}

/**
 * 微信账号绑定
 * @param bindForm 绑定表单
 */
export function wxBind(bindForm: IWxBindForm) {
  return http.post<IWxBindRes>('/api/v2/auth/wx/bind/', bindForm)
}

/**
 * 微信账号解除绑定
 */
export function wxUnbind() {
  return http.post<null>('/api/v2/auth/wx/unbind/')
}

/**
 * 刷新token
 * @param refreshToken 刷新token
 * @warns 该接口仅在双token模式下可用
 */
export function refreshToken(refreshToken: string) {
  throw new Error('Not implemented.')
  return http.post<IDoubleTokenRes>('/api/v2/auth/refreshToken', { refreshToken })
}

/**
 * 获取当前登录用户信息
 * @returns IUserInfoRes 用户信息
 */
export function getUserMe() {
  return http.get<IUserInfoRes>('/api/v2/user/me/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取微信登录凭证
 * @returns Promise 包含微信登录凭证(code)
 */
export function getWxCode() {
  return new Promise<UniApp.LoginRes>((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: res => resolve(res),
      fail: err => reject(new Error(err)),
    })
  })
}

/**
 * 每日签到领元气值
 * @returns IEverydaySignInRes 文案和获得的数量
 */
export function everydaySignIn() {
  return http.post<IEverydaySignInRes>(
    '/api/v2/user/daily-login/',
    undefined,
    undefined,
    undefined,
    { errorPresentation: 'manual' },
  )
}

/**
 * 获取当前可登录的账户列表
 * @returns IMyAccountsRes 账户列表
 */
export function getMyAccounts() {
  return http.get<IMyAccountsRes>('/api/v2/auth/my-accounts/')
}

/**
 * 检查当前账号是否登录，token是否还有效
 * 因为webView这类页面的请求不会被hook，所以需要手动检查并更新token
 * 如果token无效的话，会401，然后tokenStore会自动更新token
 * @returns ICheckLoginRes 是否登录，用户名，用户类型
 * @deprecated
 */
export function checkLogin() {
  return http.get<ICheckLoginRes>('/api/v2/auth/check-login/')
}

/**
 * 用JWT token获取ticket
 * @returns ITicketRes ticket和过期时间
 */
export function getTicket() {
  return http.post<ITicketRes>('/api/v2/auth/ticket/')
}
