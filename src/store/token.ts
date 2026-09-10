import type {
  ILoginForm,
} from '@/api/login'
import type { IAuthLoginRes, IWxLoginRes } from '@/api/types/login'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue' // 修复：导入 computed
import {
  login as _login,
  refreshToken as _refreshToken,
  wxLogin as _wxLogin,
  wxUnbind as _wxUnbind,
  getWxCode,
} from '@/api/login'
import { isDoubleTokenRes, isSingleTokenRes } from '@/api/types/login'
import { isDoubleTokenMode } from '@/utils'
import { clearAgendaCache } from '@/utils/agenda-cache'
import { useUserStore } from './user'

// 初始化状态
const tokenInfoState = isDoubleTokenMode
  ? {
      accessToken: '',
      accessExpiresIn: 0,
      refreshToken: '',
      refreshExpiresIn: 0,
    }
  : {
      token: '',
      expiresIn: 0,
    }

export const useTokenStore = defineStore(
  'token',
  () => {
    // 定义用户信息
    const tokenInfo = ref<IAuthLoginRes>({ ...tokenInfoState })

    // 添加一个时间戳 ref 作为响应式依赖
    const nowTime = ref(Date.now())
    /**
     * 更新响应式数据:now
     * 确保isTokenExpired/isRefreshTokenExpired重新计算,而不是用错误过期缓存值
     * 可useTokenStore内部适时调用;也可链式调用:tokenStore.updateNowTime().hasLogin
     * @returns 最新的tokenStore实例
     */
    const updateNowTime = () => {
      nowTime.value = Date.now()
      return useTokenStore()
    }

    // 设置用户信息
    const setTokenInfo = (val: IAuthLoginRes) => {
      updateNowTime()
      tokenInfo.value = val

      // 计算并存储过期时间
      const now = Date.now()
      if (isSingleTokenRes(val)) {
        // 单token模式
        const expireTime = now + val.expiresIn * 1000
        uni.setStorageSync('accessTokenExpireTime', expireTime)
      }
      else if (isDoubleTokenRes(val)) {
        // 双token模式
        const accessExpireTime = now + val.accessExpiresIn * 1000
        const refreshExpireTime = now + val.refreshExpiresIn * 1000
        uni.setStorageSync('accessTokenExpireTime', accessExpireTime)
        uni.setStorageSync('refreshTokenExpireTime', refreshExpireTime)
      }
    }

    /**
     * 判断token是否过期
     */
    const isTokenExpired = computed(() => {
      if (!tokenInfo.value) {
        return true
      }

      const now = nowTime.value
      const expireTime = uni.getStorageSync('accessTokenExpireTime')

      if (!expireTime)
        return true
      return now >= expireTime
    })

    /**
     * 判断refreshToken是否过期
     */
    const isRefreshTokenExpired = computed(() => {
      if (!isDoubleTokenMode)
        return true

      const now = nowTime.value
      const refreshExpireTime = uni.getStorageSync('refreshTokenExpireTime')

      if (!refreshExpireTime)
        return true
      return now >= refreshExpireTime
    })

    /**
     * 登录成功后处理逻辑，设置token和username
     * username可以是该wxcode绑定的主账户，或者这个主账号管理的小组账号
     * @param tokenInfo 登录返回的token信息
     */
    async function _postLogin(tokenInfo: IWxLoginRes) {
      // 保存token
      const tokenData = {
        token: tokenInfo.token!,
        expiresIn: tokenInfo.expires_in,
      }
      setTokenInfo(tokenData)
      // 设置用户名，以供后续请求使用
      const userStore = useUserStore()
      userStore.userInfo.account_id = tokenInfo.account_id!
      userStore.userInfo.username = tokenInfo.username!
      userStore.userInfo.name = tokenInfo.name!
    }

    /**
     * 用户登录
     * 有的时候后端会用一个接口返回token和用户信息，有的时候会分开2个接口，一个获取token，一个获取用户信息
     * （各有利弊，看业务场景和系统复杂度），这里使用2个接口返回的来模拟
     * @param loginForm 登录参数
     * @returns 登录结果
     */
    const login = async (loginForm: ILoginForm) => {
      try {
        const res = await _login(loginForm)
        console.log('普通登录-res: ', res)
        await _postLogin(res)
        uni.showToast({
          title: '登录成功',
          icon: 'success',
        })
        return res
      }
      catch (error) {
        console.error('登录失败:', error)
        uni.showToast({
          title: '登录失败，请重试',
          icon: 'error',
        })
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 微信登录，如果wxcode没有绑定，则绑定，同时返回一个res，防止http 401尝试重新登录的时候死锁
     * 如果wxcode已绑定，则储存username，因为一个账号可以登录主账号和其管理的小组账号，所以需要
     * username来判断当前登录的是哪一个，后续token过期了刷新的时候，还需要这个username来续期
     * @returns 登录结果，如果status=unbound则是没绑定
     */
    const _wxLoginOnce = async (username?: string) => {
      try {
        // 获取微信小程序登录的code
        // 首先从微信API获取code
        const resWxCode = await getWxCode()
        const code = resWxCode.code
        console.log('微信登录-code: ', code)
        // 然后从后端换取jwt token，如果指定了username，则是切换到子用户
        // 如果没有，则就是续期，或者首次登陆
        if (!username) {
          const userStore = useUserStore()
          username = userStore.userInfo.username
        }
        console.log('微信登录-username: ', username)
        const res = await _wxLogin(code, username)
        if (res.status === 'unbound') {
          return res
        }
        // 如果成功，储存token和用户名
        await _postLogin(res)
        console.log('微信登录-res: ', res)
        console.log('成功登录，token已刷新')
        return res
      }
      catch (error) {
        console.error('微信登录失败:', error)
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 微信登录（单飞）：启动时的登录和多个请求同时 401 触发的重登只共用一次 wx.login。
     * 后端对同一 openid 重新签发 signed_openid 会把之前的凭据作废，并发调用会让先打开的绑定页拿到已失效的凭据。
     */
    let wxLoginInFlight: Promise<IWxLoginRes> | null = null
    const wxLogin = (username?: string): Promise<IWxLoginRes> => {
      if (!wxLoginInFlight) {
        wxLoginInFlight = _wxLoginOnce(username).finally(() => {
          wxLoginInFlight = null
        })
      }
      return wxLoginInFlight
    }

    /**
     * 退出登录 并 删除用户信息
     */
    const logout = async () => {
      try {
        // 单token，直接清除前端信息即可
        // 主要是删除username
        const userStore = useUserStore()
        userStore.clearUserInfo()
        // 双token模式下，建议调用后端登出接口，清理服务端refreshToken
        // await _logout()
      }
      catch (error) {
        console.error('退出登录失败:', error)
      }
      finally {
        updateNowTime()

        // 无论成功失败，都需要清除本地token信息
        // 清除存储的过期时间
        uni.removeStorageSync('accessTokenExpireTime')
        uni.removeStorageSync('refreshTokenExpireTime')
        tokenInfo.value = { ...tokenInfoState }
        uni.removeStorageSync('token')
        // The home agenda cache holds this account's schedule
        clearAgendaCache()
      }
    }

    /**
     * 解除绑定并且退出登录
     */
    const unbind = async () => {
      try {
        await _wxUnbind()
        await logout()
      }
      catch (error) {
        console.error('解除绑定失败:', error)
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 刷新token
     * @returns 刷新结果
     */
    const refreshToken = async () => {
      if (!isDoubleTokenMode) {
        console.error('单token模式不支持刷新token')
        throw new Error('单token模式不支持刷新token')
      }

      try {
        // 安全检查，确保refreshToken存在
        if (!isDoubleTokenRes(tokenInfo.value) || !tokenInfo.value.refreshToken) {
          throw new Error('无效的refreshToken')
        }

        const refreshToken = tokenInfo.value.refreshToken
        const res = await _refreshToken(refreshToken)
        console.log('刷新token-res: ', res)
        setTokenInfo(res)
        return res
      }
      catch (error) {
        console.error('刷新token失败:', error)
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 获取有效的token
     * 注意：在computed中不直接调用异步函数，只做状态判断
     * 实际的刷新操作应由调用方处理
     * 建议这样使用 tokenStore.updateNowTime().validToken
     */
    const getValidToken = computed(() => {
      // token已过期，返回空
      if (isTokenExpired.value) {
        return ''
      }

      if (!isDoubleTokenMode) {
        return isSingleTokenRes(tokenInfo.value) ? tokenInfo.value.token : ''
      }
      else {
        return isDoubleTokenRes(tokenInfo.value) ? tokenInfo.value.accessToken : ''
      }
    })

    /**
     * 检查是否有登录信息（不考虑token是否过期）
     */
    const hasLoginInfo = computed(() => {
      if (!tokenInfo.value) {
        return false
      }
      if (isDoubleTokenMode) {
        return isDoubleTokenRes(tokenInfo.value) && !!tokenInfo.value.accessToken
      }
      else {
        return isSingleTokenRes(tokenInfo.value) && !!tokenInfo.value.token
      }
    })

    /**
     * 检查是否已登录且token有效
     * 建议这样使用tokenStore.updateNowTime().hasLogin
     */
    const hasValidLogin = computed(() => {
      console.log('hasValidLogin', hasLoginInfo.value, !isTokenExpired.value)
      return hasLoginInfo.value && !isTokenExpired.value
    })

    /**
     * 尝试获取有效的token，如果过期且可刷新，则刷新token
     * @returns 有效的token或空字符串
     */
    const tryGetValidToken = async (): Promise<string> => {
      updateNowTime()
      if (!getValidToken.value && isDoubleTokenMode && !isRefreshTokenExpired.value) {
        try {
          await refreshToken()
          return getValidToken.value
        }
        catch (error) {
          console.error('尝试刷新token失败:', error)
          return ''
        }
      }
      return getValidToken.value
    }

    return {
      // 核心API方法
      login,
      wxLogin,
      logout,
      unbind,

      // 认证状态判断（最常用的）
      hasLogin: hasValidLogin,

      // 内部系统使用的方法
      refreshToken,
      tryGetValidToken,
      validToken: getValidToken,

      // 调试或特殊场景可能需要直接访问的信息
      tokenInfo,
      setTokenInfo,
      updateNowTime,
    }
  },
  {
    // 添加持久化配置，确保刷新页面后token信息不丢失
    persist: true,
  },
)
