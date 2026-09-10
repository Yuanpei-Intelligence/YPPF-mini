<script lang="ts" setup>
import type { IAccount } from '@/api/types/login'
import type { UvToastInstance } from '@/hooks/useApiException'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import { getMyAccounts } from '@/api/login'
import { useApiException } from '@/hooks/useApiException'
import { useUserStore } from '@/store'
import { useTokenStore } from '@/store/token'
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
const switchingUsername = ref<string | null>(null)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

// 加载账户列表
async function loadAccounts() {
  if (!tokenStore.hasLogin) {
    showMessage('请先登录。', 'warning')
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
  }
  catch (error) {
    console.error('加载账户列表失败:', error)
    handleApiException(error)
  }
  finally {
    loading.value = false
  }
}

// 切换账户
async function switchAccount(account: IAccount) {
  if (account.username === userInfo.value.username) {
    showMessage('不能切换到当前账户。', 'warning')
    return
  }

  switchingUsername.value = account.username

  try {
    await tokenStore.wxLogin(account.username)
    showMessage('切换成功。', 'success')
    // 切换成功后返回上一页
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
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
  return type === 'person' ? '个人' : '组织'
}

onMounted(() => {
  loadAccounts()
})
</script>

<template>
  <uv-toast ref="toastRef" />
  <view class="min-h-screen bg-gray-50">
    <!-- 当前账户信息 -->
    <view v-if="tokenStore.hasLogin" class="mx-4 mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
      <view class="border-b border-gray-50 px-4 py-3">
        <view class="text-sm text-gray-500">
          当前账户
        </view>
      </view>
      <view class="flex items-center justify-between px-4 py-4">
        <view class="flex-1">
          <view class="text-lg text-gray-800 font-semibold">
            {{ userInfo.name || userInfo.username || '未设置昵称' }}
          </view>
        </view>
        <view class="ml-4 rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-600">
          当前
        </view>
      </view>
    </view>

    <!-- 账户列表 -->
    <view class="mx-4 mt-4">
      <view v-if="loading" class="flex items-center justify-center py-20">
        <view class="text-gray-400">
          加载中...
        </view>
      </view>

      <view v-else-if="accounts.length === 0" class="flex items-center justify-center py-20">
        <view class="text-gray-400">
          暂无其他账户
        </view>
      </view>

      <view v-else class="overflow-hidden rounded-2xl bg-white shadow-sm">
        <view
          v-for="(account) in accounts"
          :key="account.username"
          class="flex items-center justify-between border-b border-gray-50 px-4 py-4 last:border-none active:bg-gray-50"
          @click="switchAccount(account)"
        >
          <view class="flex-1">
            <view class="flex items-center">
              <view class="h-10 w-10 flex-shrink-0 overflow-hidden border-4 border-white/20 rounded-full bg-white shadow-sm">
                <image :src="toBackendURL(account.avatar)" class="h-full w-full" mode="aspectFill" />
              </view>
              <view class="pl-4 text-lg text-gray-800 font-semibold">
                {{ account.name || account.username }}
              </view>
              <view class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {{ getAccountTypeText(account.type) }}
              </view>
            </view>
          </view>
          <view class="i-carbon-chevron-right ml-4 text-sm text-gray-300" />
          <uv-loading-icon v-if="switchingUsername === account.username" mode="circle" size="18" />
        </view>
      </view>
    </view>
  </view>
</template>
