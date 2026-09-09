<script lang="ts" setup>
import type { UvToastInstance } from '@/hooks/useApiException'
import { storeToRefs } from 'pinia'
import { useApiException } from '@/hooks/useApiException'
import { BIND_PAGE } from '@/router/config'
import { useUserStore } from '@/store'
import { useTokenStore } from '@/store/token'
import { setGlobalError } from '@/utils/globalError'
import { openWebview } from '@/utils/webview'

const userStore = useUserStore()
const tokenStore = useTokenStore()
// 使用storeToRefs解构userInfo
const { userInfo } = storeToRefs(userStore)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

const activityId = ref<string>('')

function handleNavigateToCheckin() {
  if (!activityId.value) {
    showMessage('请输入活动ID。', 'warning')
    return
  }
  uni.navigateTo({ url: `/pages/activity/checkin?scene=qd_${activityId.value}` })
}
async function handleForceRelogin() {
  const myUsername = userInfo.value.username
  try {
    const result = await tokenStore.wxLogin(myUsername)
    if (result.status === 'unbound') {
      await uni.navigateTo({
        url: `${BIND_PAGE}?signed_openid=${encodeURIComponent(result.signed_openid)}`,
      })
      return
    }
    showMessage('重新登录成功。', 'success')
  }
  catch (error) {
    handleApiException(error)
  }
}

function handleNavigateToWebview() {
  void openWebview({ uri: '/' })
}
</script>

<template>
  <view class="min-h-screen bg-gray-50 pb-10">
    <uv-toast ref="toastRef" />
    <view class="p-4">
      <view class="mb-4">
        <text class="text-lg font-bold">调试信息</text>
      </view>
      <view class="mb-4">
        <text>Token: {{ tokenStore.updateNowTime().validToken || '无' }}</text>
      </view>
      <view class="mb-4">
        <text>Token Status: {{ tokenStore.updateNowTime().validToken ? '有效' : '无效' }}</text>
      </view>
      <view class="mb-4">
        <text>account_id: {{ userStore.userInfo.account_id }}</text>
      </view>
      <view class="mb-4">
        <text>username: {{ userStore.userInfo.username }}</text>
      </view>
      <button
        class="rounded bg-red-500 px-4 py-2 text-white"
        @click="tokenStore.logout()"
      >
        清除Token
      </button>
      <button
        class="rounded bg-green-500 px-4 py-2 text-white"
        @click="() => {
          setGlobalError('test')
          uni.switchTab({ url: '/pages/appoint/appoint' },
          )
        }"
      >
        跳转预约页面(带错误信息)
      </button>
      <button
        class="rounded bg-green-500 px-4 py-2 text-white"
        @click="handleForceRelogin"
      >
        强制重新登录
      </button>
      <button
        class="rounded bg-green-500 px-4 py-2 text-white"
        @click="handleNavigateToWebview"
      >
        跳转Webview页面
      </button>
      <input v-model="activityId" type="text" placeholder="活动ID">
      <button
        class="rounded bg-green-500 px-4 py-2 text-white"
        @click="handleNavigateToCheckin"
      >
        跳转签到页面
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 可以在这里添加一些针对深色/浅色模式或特定细节的微调 */
button {
  &::after {
    border: none;
  }
}
</style>
