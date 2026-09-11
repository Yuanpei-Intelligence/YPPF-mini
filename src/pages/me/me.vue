<script lang="ts" setup>
import type { UvToastInstance } from '@/hooks/useApiException'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { getNotificationStatistics } from '@/api/notification'
import { useApiException } from '@/hooks/useApiException'
import { useConfirm } from '@/hooks/useConfirm'
import { usePageRefresh } from '@/hooks/usePageRefresh'
import { BIND_PAGE, LOGIN_PAGE } from '@/router/config'
import { useUserStore } from '@/store'
import { useTokenStore } from '@/store/token'
import { toBackendURL } from '@/utils'
import { openWebview } from '@/utils/webview'

definePage({
  style: {
    navigationBarTitleText: '我的',
  },
})

interface MenuItem {
  key: string
  title: string
  icon: string
  onClick: () => void
}

const userStore = useUserStore()
const tokenStore = useTokenStore()
const { userInfo } = storeToRefs(userStore)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
const { confirm } = useConfirm()

// 默认头像
const defaultAvatar = '/static/images/default-avatar.png'
// 只有登录到主账号的时候才显示解绑按钮
const showUnbind = computed(() => userInfo.value.account_id === userInfo.value.username)
const unbinding = ref(false)
const switchingToMain = ref(false)

const avatarSrc = computed(() => (
  tokenStore.hasLogin
    ? toBackendURL(userInfo.value.avatar_url || userInfo.value.avatar || defaultAvatar)
    : defaultAvatar
))
const displayName = computed(() => userInfo.value.name || userInfo.value.username || '未设置昵称')
/** 身份行：学生显示学号，小组账号显示账号名 */
const identityText = computed(() => {
  const username = userInfo.value.username
  if (!username)
    return ''
  return userInfo.value.is_org ? `小组账号 ${username}` : `学号 ${username}`
})

// 微信小程序下登录
async function handleLogin() {
  // #ifdef MP-WEIXIN
  try {
    const result = await tokenStore.wxLogin()
    if (result.status === 'unbound') {
      uni.navigateTo({
        url: `${BIND_PAGE}?signed_openid=${encodeURIComponent(result.signed_openid ?? '')}`,
      })
    }
  }
  catch (error) {
    handleApiException(error)
  }
  // #endif
  // #ifndef MP-WEIXIN
  uni.navigateTo({
    url: `${LOGIN_PAGE}`,
  })
  // #endif
}

/** 解绑后重新走一次微信登录拿绑定凭据，直接进入绑定页，而不是停留在已登出的「我的」 */
async function goBindPage() {
  try {
    const result = await tokenStore.wxLogin()
    if (result.status === 'unbound') {
      uni.reLaunch({
        url: `${BIND_PAGE}?signed_openid=${encodeURIComponent(result.signed_openid ?? '')}`,
      })
      return
    }
  }
  catch (error) {
    // 首页会在拉取用户信息时再次触发 401 → 绑定页跳转
    handleApiException(error, { showToast: false })
  }
  uni.reLaunch({ url: '/pages/index/index' })
}

async function handleUnbind() {
  if (unbinding.value)
    return
  const ok = await confirm({
    title: '解除绑定',
    content: '解除后本微信将无法使用 YPPF 小程序，需要重新绑定账号。',
    confirmText: '解除绑定',
    cancelText: '暂不解除',
    danger: true,
  })
  if (!ok)
    return
  unbinding.value = true
  try {
    await tokenStore.unbind()
  }
  catch (error) {
    handleApiException(error)
    return
  }
  finally {
    unbinding.value = false
  }
  await goBindPage()
}

async function handleGotoMain() {
  if (switchingToMain.value)
    return
  switchingToMain.value = true
  try {
    await tokenStore.wxLogin(userInfo.value.account_id)
    showMessage('已返回主账号', 'success')
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/me/me' })
    }, 600)
  }
  catch (error) {
    console.error('切换账户失败:', error)
    handleApiException(error)
  }
  finally {
    switchingToMain.value = false
  }
}

/* 通知红点显示逻辑 */
const statistics = ref({
  total: 0,
  unread: 0,
  read: 0,
  need_read: 0,
  need_do: 0,
})
const totalUnread = computed(() => (statistics.value.unread > 99 ? '99+' : String(statistics.value.unread)))

/** 等待请求；返回失败原因（成功为 null），供并行请求合并成一次提示 */
async function settle(request: Promise<unknown>): Promise<unknown> {
  try {
    await request
    return null
  }
  catch (error) {
    return error
  }
}

async function loadStatistics() {
  statistics.value = await getNotificationStatistics()
}

// 页面自动刷新：从其他页面返回时自动更新未读数与用户信息（头像等），两路失败只提示一次
usePageRefresh(
  async () => {
    const failures = await Promise.all([
      settle(loadStatistics()),
      settle(userStore.fetchUserInfo()),
    ])
    const failure = failures.find(Boolean)
    if (failure) {
      console.error('加载「我的」页数据失败:', failure)
      handleApiException(failure)
    }
  },
  {
    shouldRefresh: () => tokenStore.hasLogin,
    minInterval: 2000,
  },
)

// 菜单项：入口名与目标页标题一致
const primaryMenu: MenuItem[] = [
  { key: 'notifications', title: '通知中心', icon: 'i-carbon-notification', onClick: () => uni.navigateTo({ url: '/pages/me/notifications' }) },
  { key: 'timetable', title: '我的课表', icon: 'i-carbon-calendar-heat-map', onClick: () => uni.navigateTo({ url: '/pages/timetable/index' }) },
  { key: 'grades', title: '我的成绩', icon: 'i-carbon-report', onClick: () => uni.navigateTo({ url: '/pages-timetable/grades' }) },
  { key: 'appointments', title: '我的预约', icon: 'i-carbon-event-schedule', onClick: () => uni.navigateTo({ url: '/pages/me/my-appointments' }) },
  { key: 'violations', title: '信用分记录', icon: 'i-carbon-star', onClick: () => uni.navigateTo({ url: '/pages/me/my-violations' }) },
]

const accountMenu: MenuItem[] = [
  { key: 'accounts', title: '切换账户', icon: 'i-carbon-user-multiple', onClick: () => uni.navigateTo({ url: '/pages/me/my-accounts' }) },
  { key: 'profile', title: '编辑个人资料', icon: 'i-carbon-user-profile', onClick: () => openWebview({ uri: '/userAccountSetting' }) },
  // Un-comment to debug
  // { key: 'debug', title: '调试信息', icon: 'i-carbon-debug', onClick: () => uni.navigateTo({ url: '/pages/me/debug' }) },
]

function handleProfile() {
  /* TODO: 把这个改成原生的 */
  if (userInfo.value.is_person) {
    void openWebview({ uri: '/stuinfo' })
  }
  else if (userInfo.value.is_org) {
    void openWebview({ uri: '/orginfo' })
  }
  else {
    showMessage('当前账号没有主页', 'warning')
  }
}

function handleHeaderClick() {
  if (tokenStore.hasLogin)
    handleProfile()
  else
    handleLogin()
}
</script>

<template>
  <view class="yp-page">
    <uv-toast ref="toastRef" />

    <!-- 头像区：整块可点，进入个人主页（未登录时登录） -->
    <view class="flex items-center gap-4 bg-card px-4 py-5 active:bg-fill" @click="handleHeaderClick">
      <view class="h-96rpx w-96rpx shrink-0 overflow-hidden rounded-full bg-fill">
        <image class="h-full w-full" :src="avatarSrc" mode="aspectFill" />
      </view>
      <view class="min-w-0 flex-1">
        <template v-if="tokenStore.hasLogin">
          <text class="block truncate text-lg text-fg-1 font-semibold">{{ displayName }}</text>
          <text v-if="identityText" class="mt-0.5 block truncate text-sm text-fg-3">{{ identityText }}</text>
        </template>
        <template v-else>
          <text class="block text-lg text-fg-1 font-semibold">点击登录</text>
          <text class="mt-0.5 block text-sm text-fg-3">登录后查看个人信息</text>
        </template>
      </view>
      <view class="i-carbon-chevron-right shrink-0 text-lg text-fg-4" />
    </view>

    <!-- 功能入口 -->
    <view class="mt-3 bg-card">
      <template v-for="(item, index) in primaryMenu" :key="item.key">
        <view v-if="index > 0" class="yp-divider" />
        <view class="yp-list-item" @click="item.onClick">
          <view :class="item.icon" class="text-xl text-fg-2" />
          <text class="min-w-0 flex-1 text-base text-fg-1">{{ item.title }}</text>
          <view
            v-if="item.key === 'notifications' && statistics.unread > 0"
            class="rounded-full bg-error px-2 text-2xs text-white leading-relaxed tabular-nums"
          >
            {{ totalUnread }}
          </view>
          <view class="i-carbon-chevron-right text-base text-fg-4" />
        </view>
      </template>
    </view>

    <!-- 账户 -->
    <view class="mt-3 bg-card">
      <template v-for="(item, index) in accountMenu" :key="item.key">
        <view v-if="index > 0" class="yp-divider" />
        <view class="yp-list-item" @click="item.onClick">
          <view :class="item.icon" class="text-xl text-fg-2" />
          <text class="min-w-0 flex-1 text-base text-fg-1">{{ item.title }}</text>
          <view class="i-carbon-chevron-right text-base text-fg-4" />
        </view>
      </template>
    </view>

    <!-- 危险操作单独放最底部 -->
    <view v-if="tokenStore.hasLogin" class="mt-6 px-4 pb-6">
      <button
        v-if="showUnbind"
        class="btn-danger btn-block"
        :disabled="unbinding"
        @click="handleUnbind"
      >
        解除绑定
      </button>
      <button
        v-else
        class="btn-outline btn-block"
        :loading="switchingToMain"
        :disabled="switchingToMain"
        @click="handleGotoMain"
      >
        返回主账号
      </button>
    </view>
  </view>
</template>
