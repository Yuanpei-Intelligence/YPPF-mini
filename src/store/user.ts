import type { IUserInfoRes } from '@/api/types/login'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserMe } from '@/api/login'

// 初始化状态
const userInfoState: IUserInfoRes = {
  id: -1,
  userId: -1,
  username: '',
  account_id: '',
  nickname: '',
  name: '',
  utype: '',
  active: false,
  is_staff: false,
  is_person: false,
  is_org: false,
  avatar: '/static/images/default-avatar.png',
  avatar_url: '',
  wallpaper_url: '',
  absolute_url: '',
  profile: {},
}

export const useUserStore = defineStore(
  'user',
  () => {
    // 定义用户信息
    const userInfo = ref<IUserInfoRes>({ ...userInfoState })
    // 设置用户信息（创建新对象，确保 account_id 等字段正确持久化）
    // account_id 从绑定到解绑都不应该改变
    const setUserInfo = (val: IUserInfoRes) => {
      const next = {
        ...userInfoState,
        ...val,
        avatar: val.avatar || userInfoState.avatar,
        account_id: val.account_id ?? userInfo.value.account_id ?? '',
        username: val.username ?? userInfo.value.username ?? '',
      }
      userInfo.value = next
    }
    const setUserAvatar = (avatar: string) => {
      userInfo.value.avatar = avatar
      console.log('设置用户头像', avatar)
      console.log('userInfo', userInfo.value)
    }
    // 删除用户信息
    const clearUserInfo = () => {
      userInfo.value = { ...userInfoState }
      uni.removeStorageSync('user')
    }

    /**
     * 获取用户信息
     */
    const fetchUserInfo = async () => {
      const res = await getUserMe()
      setUserInfo(res)
      return res
    }

    return {
      userInfo,
      clearUserInfo,
      fetchUserInfo,
      setUserInfo,
      setUserAvatar,
    }
  },
  {
    persist: true,
  },
)
