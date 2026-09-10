// 认证模式类型
export type AuthMode = 'single' | 'double'

// 单Token响应类型
export interface ISingleTokenRes {
  token: string
  expiresIn: number // 有效期(秒)
}

// 双Token响应类型
export interface IDoubleTokenRes {
  accessToken: string
  refreshToken: string
  accessExpiresIn: number // 访问令牌有效期(秒)
  refreshExpiresIn: number // 刷新令牌有效期(秒)
}

/**
 * 登录返回的信息，其实就是 token 信息
 */
export type IAuthLoginRes = ISingleTokenRes | IDoubleTokenRes

/**
 * 微信/后端登录通用状态响应
 */
export interface IWxLoginRes {
  status: 'bound' | 'unbound'
  // status=bound
  token?: string
  token_type?: string
  account_id?: string // 主账号
  username?: string // 主账号或小组账号
  name?: string // 名字，不是账号
  // status=unbound
  signed_openid?: string
  expires_in: number
}

/**
 * 绑定接口响应
 */
export interface IWxBindRes {
  status: 'bound'
  token: string
  token_type: string
  account_id: string
  username: string
  expires_in: number
}

/**
 * 用户信息
 */
export interface IUserProfile {
  nickname?: string | null
  gender?: number | null
  birthday?: string | null
  email?: string | null
  telephone?: string | null
  biography?: string | null
  identity?: number | null
  status?: number | boolean | null
  stu_class?: string | null
  stu_major?: string | null
  stu_grade?: string | null
  stu_dorm?: string | null
  inform_share?: boolean | null
  oname?: string | null
  introduction?: string | null
}

export interface IUserInfoRes {
  id: number
  userId?: number // keeping for backward compatibility if used elsewhere
  account_id?: string
  username: string
  nickname?: string
  name: string
  utype: string
  active: boolean
  is_staff: boolean
  is_person: boolean
  is_org: boolean
  avatar?: string
  avatar_url: string
  wallpaper_url: string
  absolute_url: string
  profile: IUserProfile
}

// 认证存储数据结构
export interface AuthStorage {
  mode: AuthMode
  tokens: ISingleTokenRes | IDoubleTokenRes
  userInfo?: IUserInfoRes
  loginTime: number // 登录时间戳
}

/**
 * 获取验证码
 */
export interface ICaptcha {
  captchaEnabled: boolean
  uuid: string
  image: string
}
/**
 * 上传成功的信息
 */
export interface IUploadSuccessInfo {
  fileId: number
  originalName: string
  fileName: string
  storagePath: string
  fileHash: string
  fileType: string
  fileBusinessType: string
  fileSize: number
}
/**
 * 更新用户信息
 */
export interface IUpdateInfo {
  id: number
  name: string
  sex: string
}
/**
 * 更新用户信息
 */
export interface IUpdatePassword {
  id: number
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

/**
 * 判断是否为单Token响应
 * @param tokenRes 登录响应数据
 * @returns 是否为单Token响应
 */
export function isSingleTokenRes(tokenRes: IAuthLoginRes): tokenRes is ISingleTokenRes {
  return 'token' in tokenRes && !('refreshToken' in tokenRes)
}

/**
 * 判断是否为双Token响应
 * @param tokenRes 登录响应数据
 * @returns 是否为双Token响应
 */
export function isDoubleTokenRes(tokenRes: IAuthLoginRes): tokenRes is IDoubleTokenRes {
  return 'accessToken' in tokenRes && 'refreshToken' in tokenRes
}

export interface IEverydaySignInRes {
  message: string
}

export interface IMyAccountsRes {
  account_id: string
  accounts: IAccount[]
}

export interface IAccount {
  username: string
  name: string
  type: 'person' | 'org'
  avatar: string
}

export interface ICheckLoginRes {
  is_login: boolean
  username: string
  name: string
  type: 'person' | 'org'
}

export interface ITicketRes {
  ticket: string
  expires_in: number
}
