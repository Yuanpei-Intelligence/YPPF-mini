<script lang="ts" setup>
import type { IAccount } from '@/api/types/login'
import type { UvToastInstance } from '@/hooks/useApiException'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { getMyAccounts } from '@/api/login'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { useUserStore } from '@/store'
import { useTokenStore } from '@/store/token'
import { tokens } from '@/style/tokens'
import { toBackendURL } from '@/utils'

definePage({
  style: {
    navigationBarTitleText: '切换账户',
  },
})

const tokenStore = useTokenStore()
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

const accounts = ref<IAccount[]>([])
const currentAccountId = ref<string>('')
const loading = ref(false)
/** 首屏加载失败的页内错误；已有数据时失败只 toast */
const loadError = ref('')
const switchingUsername = ref<string | null>(null)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

const defaultAvatar = '/static/images/default-avatar.png'
const currentAvatar = computed(() => toBackendURL(userInfo.value.avatar_url || userInfo.value.avatar || defaultAvatar))
const currentName = computed(() => userInfo.value.name || userInfo.value.username || '未设置昵称')

// 加载账户列表
async function loadAccounts() {
  if (!tokenStore.hasLogin) {
    showMessage('请先登录', 'warning')
    return
  }

  loading.value = true
  try {
    const res = await getMyAccounts()
    currentAccountId.value = res.account_id
    // 过滤掉当前用户，不能切换到自己
    accounts.value = res.accounts.filter(
      account => account.username !== userInfo.value.username,
    )
    loadError.value = ''
  }
  catch (error) {
    console.error('加载账户列表失败:', error)
    if (accounts.value.length > 0)
      handleApiException(error)
    else
      loadError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    loading.value = false
  }
}

// 切换账户
async function switchAccount(account: IAccount) {
  if (switchingUsername.value)
    return
  if (account.username === userInfo.value.username) {
    showMessage('已是当前账户', 'warning')
    return
  }

  switchingUsername.value = account.username
  try {
    await tokenStore.wxLogin(account.username)
    showMessage('已切换', 'success')
    // 切换成功后返回上一页
    setTimeout(() => {
      uni.navigateBack()
    }, 600)
  }
  catch (error) {
    console.error('切换账户失败:', error)
    handleApiException(error)
  }
  finally {
    switchingUsername.value = null
  }
}

// 获取账户类型显示文本
function getAccountTypeText(type: 'person' | 'org') {
  return type === 'person' ? '个人' : '小组'
}

onMounted(() => {
  loadAccounts()
})
</script>

<template>
  <view class="yp-page">
    <uv-toast ref="toastRef" />

    <!-- 当前账户 -->
    <view v-if="tokenStore.hasLogin" class="bg-card">
      <text class="block px-4 pt-3 text-xs text-fg-3">当前账户</text>
      <view class="yp-list-item">
        <view class="h-80rpx w-80rpx shrink-0 overflow-hidden rounded-full bg-fill">
          <image :src="currentAvatar" class="h-full w-full" mode="aspectFill" />
        </view>
        <view class="min-w-0 flex-1">
          <text class="block truncate text-base text-fg-1 font-medium">{{ currentName }}</text>
          <text v-if="userInfo.username" class="block truncate text-xs text-fg-3">{{ userInfo.username }}</text>
        </view>
        <StatusTag type="processing" text="当前" />
      </view>
    </view>

    <!-- 可切换的账户 -->
    <view class="mt-3">
      <text class="block px-4 pb-2 text-xs text-fg-3">可切换的账户</text>
      <PageState
        :loading="loading && accounts.length === 0"
        :error="loadError"
        :empty="accounts.length === 0"
        empty-icon="i-carbon-user"
        empty-text="还没有其他账户"
        @retry="loadAccounts"
      >
        <view class="bg-card">
          <template v-for="(account, index) in accounts" :key="account.username">
            <view v-if="index > 0" class="yp-divider" />
            <view class="yp-list-item" @click="switchAccount(account)">
              <view class="h-80rpx w-80rpx shrink-0 overflow-hidden rounded-full bg-fill">
                <image :src="toBackendURL(account.avatar)" class="h-full w-full" mode="aspectFill" />
              </view>
              <view class="min-w-0 flex-1">
                <text class="block truncate text-base text-fg-1 font-medium">{{ account.name || account.username }}</text>
                <text class="block truncate text-xs text-fg-3">{{ account.username }}</text>
              </view>
              <StatusTag type="default" :text="getAccountTypeText(account.type)" />
              <uv-loading-icon
                v-if="switchingUsername === account.username"
                mode="circle"
                :color="tokens.primary"
                size="18"
              />
              <view v-else class="i-carbon-chevron-right text-base text-fg-4" />
            </view>
          </template>
        </view>
      </PageState>
    </view>
  </view>
</template>
