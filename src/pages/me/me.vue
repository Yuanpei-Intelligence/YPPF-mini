<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import {
  getNotificationStatistics,
} from '@/api/notification'
import { usePageRefresh } from '@/hooks/usePageRefresh'
import { LOGIN_PAGE } from '@/router/config'
import { useUserStore } from '@/store'
import { useTokenStore } from '@/store/token'
import { toBackendURL } from '@/utils'
import { openWebview } from '@/utils/webview'

definePage({
  style: {
    navigationBarTitleText: '我的',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
  },
})

const userStore = useUserStore()
const tokenStore = useTokenStore()
const { userInfo } = storeToRefs(userStore)

// 默认头像
const defaultAvatar = '/static/images/default-avatar.png'
// 只有登录到主账号的时候才显示解绑按钮
const showUnbind = computed(() => userInfo.value.account_id === userInfo.value.username)

// 微信小程序下登录
async function handleLogin() {
  // #ifdef MP-WEIXIN
  // 微信登录
  await tokenStore.wxLogin()
  // #endif
  // #ifndef MP-WEIXIN
  uni.navigateTo({
    url: `${LOGIN_PAGE}`,
  })
  // #endif
}

function handleUnbind() {
  uni.showModal({
    title: '提示',
    content: '确定要解除绑定吗？',
    success: (res) => {
      if (res.confirm) {
        tokenStore.unbind()
        uni.showToast({
          title: '已解除绑定',
          icon: 'success',
        })
      }
    },
  })
}

async function handleGotoMain() {
  try {
    await tokenStore.wxLogin(userInfo.value.account_id)
    uni.showToast({
      title: '切换成功',
      icon: 'success',
    })
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/me/me' })
    }, 1500)
  }
  catch (error) {
    console.error('切换账户失败:', error)
    uni.showToast({
      title: '切换失败，请重试',
      icon: 'error',
    })
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
const totalUnread = computed(() => (statistics.value.unread > 99 ? '99+' : statistics.value.unread))

async function loadStatistics() {
  try {
    statistics.value = await getNotificationStatistics()
  }
  catch (error) {
    console.error('加载统计失败:', error)
  }
}

// 页面自动刷新：从其他页面返回时自动更新数据，还挺巧妙哈
// 用页面栈长度判断的捏
usePageRefresh(
  async () => {
    // 加载未读信息数
    await loadStatistics()
    // 更新用户信息，如头像等
    await userStore.fetchUserInfo()
  },
  {
    shouldRefresh: () => tokenStore.hasLogin,
    minInterval: 2000,
  },
)

// 菜单项
const menuItems = [
  { title: '我的预约', icon: 'i-carbon-calendar', onClick: () => uni.navigateTo({ url: '/pages/me/my-appointments' }) },
  { title: '信用分记录', icon: 'i-carbon-star', onClick: () => uni.navigateTo({ url: '/pages/me/my-violations' }) },
  // { title: '设置', icon: 'i-carbon-settings', onClick: handleNothing },
  // { title: '常见问题', icon: 'i-carbon-help', onClick: handleNothing },
  // { title: '关于我们', icon: 'i-carbon-information', onClick: handleNothing },
  { title: '切换账户', icon: 'i-carbon-collaborate', onClick: () => uni.navigateTo({ url: '/pages/me/my-accounts' }) },
  { title: '编辑个人资料', icon: 'i-carbon-user-profile', onClick: () => openWebview({ uri: '/userAccountSetting' }) },
  // Un-comment to debug
  // { title: '调试信息', icon: 'i-carbon-debug', onClick: () => uni.navigateTo({ url: '/pages/me/debug' }) },
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
    uni.showToast({
      title: '您没有主页',
      icon: 'error',
    })
  }
}
</script>

<template>
  <view class="min-h-screen bg-gray-50 pb-10">
    <!-- 顶部用户信息 -->
    <view class="relative bg-blue-600 px-6 pb-14 pt-10">
      <view class="flex items-center">
        <!-- 头像容器 -->
        <view class="h-18 w-18 flex-shrink-0 overflow-hidden border-4 border-white/20 rounded-full bg-white shadow-sm">
          <image
            class="h-full w-full"
            :src="tokenStore.hasLogin ? toBackendURL(userInfo.avatar_url || userInfo.avatar || defaultAvatar) : defaultAvatar"
            mode="aspectFill"
          />
        </view>

        <!-- 文字信息 -->
        <view class="ml-4 flex-1 overflow-hidden">
          <template v-if="tokenStore.hasLogin">
            <view class="flex items-center justify-between">
              <view class="">
                <view class="truncate text-2xl text-white font-bold">
                  {{ userInfo.name || userInfo.username || '未设置昵称' }}
                </view>
                <view class="mt-1 truncate text-sm text-blue-100 opacity-80">
                  {{ userInfo.profile?.email || '暂无邮箱' }}
                </view>
              </view>
              <view class="i-carbon-chevron-right px-4 text-lg text-white" @click="handleProfile" />
            </view>
          </template>
          <template v-else>
            <view class="text-2xl text-white font-bold" @click="handleLogin">
              点击登录
            </view>
            <view class="mt-1 text-sm text-blue-100 opacity-80">
              登录后查看个人信息
            </view>
          </template>
        </view>
      </view>
    </view>

    <!-- 功能卡片区 -->
    <view class="mx-4">
      <!-- 列表卡片 -->
      <view class="overflow-hidden rounded-2xl bg-white shadow-sm">
        <view
          class="flex items-center justify-between border-b border-gray-50 p-4 last:border-none active:bg-gray-50"
          @click="() => uni.navigateTo({ url: '/pages/me/notifications' })"
        >
          <view class="flex items-center">
            <view class="i-carbon-email mr-3 text-xl text-blue-600" />
            <text class="text-base text-gray-800">我的通知</text>
            <view
              v-if="totalUnread > 0"
              class="ml-2 inline-block rounded-full bg-red-500 px-2 py-0.5 text-xs text-white"
            >
              {{ totalUnread }}
            </view>
          </view>
          <view class="i-carbon-chevron-right text-sm text-gray-300" />
        </view>
        <view
          v-for="(item, index) in menuItems"
          :key="index"
          class="flex items-center justify-between border-b border-gray-50 p-4 last:border-none active:bg-gray-50"
          @click="item.onClick"
        >
          <view class="flex items-center">
            <view :class="item.icon" class="mr-3 text-xl text-blue-600" />
            <text class="text-base text-gray-800">{{ item.title }}</text>
          </view>
          <view class="i-carbon-chevron-right text-sm text-gray-300" />
        </view>
      </view>

      <!-- 解绑按钮 -->
      <template v-if="tokenStore.hasLogin">
        <view v-if="showUnbind" class="mt-8 px-2">
          <button
            class="w-full rounded-xl border-none bg-white py-3 text-center text-lg text-red-500 font-medium transition-opacity shadow-sm active:opacity-70"
            @click="handleUnbind"
          >
            解除绑定
          </button>
        </view>
        <view v-else class="mt-8 px-2">
          <button
            class="w-full rounded-xl border-none bg-white py-3 text-center text-lg text-blue-500 font-medium transition-opacity shadow-sm active:opacity-70"
            @click="handleGotoMain"
          >
            返回主账号
          </button>
        </view>
      </template>
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
