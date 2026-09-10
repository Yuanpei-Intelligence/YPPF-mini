<script lang="ts" setup>
import type { UvToastInstance } from '@/hooks/useApiException'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useApiException } from '@/hooks/useApiException'
import { useConfirm } from '@/hooks/useConfirm'
import { BIND_PAGE } from '@/router/config'
import { useUserStore } from '@/store'
import { useTokenStore } from '@/store/token'
import { setGlobalError } from '@/utils/globalError'
import { openWebview } from '@/utils/webview'

definePage({
  style: {
    navigationBarTitleText: '调试信息',
  },
})

const userStore = useUserStore()
const tokenStore = useTokenStore()
// 使用storeToRefs解构userInfo
const { userInfo } = storeToRefs(userStore)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
const { confirm } = useConfirm()

const activityId = ref<string>('')

function handleNavigateToCheckin() {
  if (!activityId.value) {
    showMessage('请输入活动 ID', 'warning')
    return
  }
  uni.navigateTo({ url: `/pages/activity/checkin?scene=qd_${activityId.value}` })
}

async function handleClearToken() {
  const ok = await confirm({
    title: '清除 Token',
    content: '清除后需要重新登录。',
    confirmText: '清除',
    cancelText: '保留',
    danger: true,
  })
  if (!ok)
    return
  await tokenStore.logout()
  showMessage('已清除', 'success')
}

async function handleForceRelogin() {
  const myUsername = userInfo.value.username
  try {
    const result = await tokenStore.wxLogin(myUsername)
    if (result.status === 'unbound') {
      await uni.navigateTo({
        url: `${BIND_PAGE}?signed_openid=${encodeURIComponent(result.signed_openid ?? '')}`,
      })
      return
    }
    showMessage('已重新登录', 'success')
  }
  catch (error) {
    handleApiException(error)
  }
}

function handleNavigateToAppoint() {
  setGlobalError('test')
  uni.switchTab({ url: '/pages/appoint/appoint' })
}

function handleNavigateToWebview() {
  void openWebview({ uri: '/' })
}
</script>

<template>
  <view class="yp-page px-4 py-3">
    <uv-toast ref="toastRef" />

    <view class="yp-card-flat">
      <text class="block yp-section-title">登录状态</text>
      <text class="mt-2 block break-all text-sm text-fg-2">Token: {{ tokenStore.updateNowTime().validToken || '无' }}</text>
      <text class="mt-1 block text-sm text-fg-2">Token 状态: {{ tokenStore.updateNowTime().validToken ? '有效' : '无效' }}</text>
      <text class="mt-1 block text-sm text-fg-2">account_id: {{ userStore.userInfo.account_id }}</text>
      <text class="mt-1 block text-sm text-fg-2">username: {{ userStore.userInfo.username }}</text>
    </view>

    <view class="mt-3 yp-card-flat">
      <text class="block yp-section-title">跳转</text>
      <button class="btn-outline mt-3 btn-block" @click="handleForceRelogin">
        强制重新登录
      </button>
      <button class="btn-outline mt-3 btn-block" @click="handleNavigateToAppoint">
        跳转预约页面（带错误信息）
      </button>
      <button class="btn-outline mt-3 btn-block" @click="handleNavigateToWebview">
        跳转 Webview 页面
      </button>
      <input v-model="activityId" class="mt-3 yp-input" type="text" placeholder="活动 ID">
      <button class="btn-outline mt-3 btn-block" @click="handleNavigateToCheckin">
        跳转签到页面
      </button>
    </view>

    <button class="btn-danger mt-6 btn-block" @click="handleClearToken">
      清除 Token
    </button>
  </view>
</template>
