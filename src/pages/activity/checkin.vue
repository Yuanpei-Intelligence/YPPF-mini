<script lang="ts" setup>
import type { ActivityStatus, IActivityDetail } from '@/api/types/activity'
import type { StatusTagType } from '@/components/StatusTag.vue'
import type { UvToastInstance } from '@/hooks/useApiException'
import { checkInActivity, getActivityInfo } from '@/api/activity'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { formatDateTimeRange } from '@/utils/format'

definePage({
  style: {
    navigationBarTitleText: '活动签到',
  },
})

interface CheckInResult {
  ok: boolean
  title: string
  message: string
}

const activityId = ref(-1)
const activity = ref<IActivityDetail | null>(null)
const loading = ref(true)
const loadError = ref('')
const checkingIn = ref(false)
// 签到结果页：成功 / 失败 / 已签到过，都用整页结果而不是 toast
const result = ref<CheckInResult | null>(null)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException } = useApiException(toastRef)

function hasValidActivityId() {
  return Number.isInteger(activityId.value) && activityId.value > 0
}

function activityStatusType(status: ActivityStatus): StatusTagType {
  if (status === '报名中' || status === '进行中')
    return 'success'
  if (status === '等待中' || status === '待发布')
    return 'processing'
  if (status === '审核中')
    return 'warning'
  if (status === '已取消' || status === '已撤销' || status === '未过审')
    return 'error'
  return 'default'
}

async function fetchActivityInfo() {
  if (!hasValidActivityId())
    return
  loading.value = true
  loadError.value = ''
  try {
    activity.value = await getActivityInfo(activityId.value)
    if (activity.value.participation_status === '已参与')
      result.value = { ok: true, title: '你已签到过', message: '无需重复签到' }
  }
  catch (error) {
    console.error('获取活动签到信息失败:', error)
    // 首屏加载失败只展示页内可重试的错误，不再叠加 toast
    loadError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    loading.value = false
  }
}

async function handleCheckIn() {
  if (!hasValidActivityId() || checkingIn.value || result.value?.ok)
    return
  checkingIn.value = true
  try {
    const res = await checkInActivity(activityId.value)
    if (activity.value)
      activity.value.participation_status = '已参与'
    result.value = { ok: true, title: '签到成功', message: res.message || '' }
  }
  catch (error) {
    console.error('签到失败:', error)
    const requestError = handleApiException(error, { showToast: false })
    result.value = { ok: false, title: '签到失败', message: requestError.message }
  }
  finally {
    checkingIn.value = false
  }
}

function retryCheckIn() {
  result.value = null
}

function goDetail() {
  uni.redirectTo({ url: `/pages/activity/detail?id=${activityId.value}` })
}

function goHome() {
  uni.reLaunch({ url: '/pages/index/index' })
}

function onRetry() {
  if (hasValidActivityId())
    void fetchActivityInfo()
  else
    goHome()
}

onLoad((options) => {
  // 支持 scene（扫码）和 id（直接跳转）两种方式
  if (options?.scene) {
    const aidStr = options.scene.split('_')[1]
    if (aidStr)
      activityId.value = Number(aidStr)
  }
  if (options?.id !== undefined && activityId.value === -1)
    activityId.value = Number(options.id)

  if (!hasValidActivityId()) {
    activityId.value = -1
    loading.value = false
    loadError.value = '签到码无效，无法获取活动信息'
    return
  }
  void fetchActivityInfo()
})
</script>

<template>
  <view class="yp-page">
    <uv-toast ref="toastRef" />

    <PageState
      :loading="loading"
      :error="loadError"
      :retry-text="activityId === -1 ? '回到首页' : '重试'"
      @retry="onRetry"
    >
      <!-- 结果页 -->
      <view v-if="result" class="flex flex-col items-center px-4 pt-20 text-center">
        <view class="text-120rpx" :class="result.ok ? 'i-carbon-checkmark-filled text-success' : 'i-carbon-close-filled text-error'" />
        <text class="mt-4 block text-xl text-fg-1 font-semibold">{{ result.title }}</text>
        <text v-if="result.message" class="mt-2 block text-sm text-fg-2">{{ result.message }}</text>

        <view v-if="activity" class="mt-6 w-full yp-card-flat text-left">
          <text class="block text-base text-fg-1 font-medium">{{ activity.title }}</text>
          <text class="mt-1 block text-xs text-fg-3">{{ formatDateTimeRange(activity.start, activity.end) }}</text>
          <text v-if="activity.location" class="mt-1 block text-xs text-fg-3">{{ activity.location }}</text>
        </view>

        <view class="mt-8 w-full">
          <view v-if="result.ok" class="btn-primary btn-block" @click="goDetail">
            查看活动
          </view>
          <template v-else>
            <view class="btn-primary btn-block" @click="retryCheckIn">
              重新签到
            </view>
            <view class="btn-ghost mt-2 btn-block" @click="goDetail">
              查看活动
            </view>
          </template>
        </view>
      </view>

      <!-- 签到前：活动摘要 -->
      <view v-else-if="activity" class="px-4 py-3">
        <view class="yp-card-flat">
          <view class="flex items-start justify-between gap-2">
            <text class="flex-1 text-lg text-fg-1 font-semibold">{{ activity.title }}</text>
            <StatusTag :type="activityStatusType(activity.status)" :text="activity.status_display || activity.status" />
          </view>
          <view class="mt-4 flex flex-col gap-3">
            <view class="flex items-start gap-3">
              <view class="i-carbon-time mt-1 shrink-0 text-fg-3" />
              <view class="min-w-0 flex-1">
                <text class="block text-xs text-fg-3">时间</text>
                <text class="block text-sm text-fg-1">{{ formatDateTimeRange(activity.start, activity.end) }}</text>
              </view>
            </view>
            <view v-if="activity.location" class="flex items-start gap-3">
              <view class="i-carbon-location mt-1 shrink-0 text-fg-3" />
              <view class="min-w-0 flex-1">
                <text class="block text-xs text-fg-3">地点</text>
                <text class="block text-sm text-fg-1">{{ activity.location }}</text>
              </view>
            </view>
            <view class="flex items-start gap-3">
              <view class="i-carbon-group mt-1 shrink-0 text-fg-3" />
              <view class="min-w-0 flex-1">
                <text class="block text-xs text-fg-3">主办</text>
                <text class="block text-sm text-fg-1">{{ activity.organization_name }}</text>
              </view>
            </view>
          </view>
        </view>

        <view v-if="!activity.need_checkin" class="mt-3 yp-card-flat">
          <text class="block text-sm text-fg-2">本活动无需签到。</text>
        </view>

        <!-- 固定底栏占位 -->
        <view class="h-160rpx pb-safe" />
      </view>
    </PageState>

    <view v-if="!loading && !loadError && !result && activity?.need_checkin" class="fixed bottom-0 left-0 right-0 z-10 bg-card shadow-float pb-safe">
      <view class="px-4 py-3">
        <view
          class="btn-primary btn-block"
          :class="{ 'opacity-50': checkingIn }"
          @click="handleCheckIn"
        >
          {{ checkingIn ? '签到中…' : '签到' }}
        </view>
      </view>
    </view>
  </view>
</template>
