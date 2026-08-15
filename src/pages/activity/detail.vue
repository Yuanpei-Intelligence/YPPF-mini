<script lang="ts" setup>
import type { ActivityParticipationStatus, IActivityDetail } from '@/api/types/activity'
import { getActivityInfo, signUpActivity, withdrawActivitySignup } from '@/api/activity'

definePage({
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '活动详情',
  },
})

const activityId = ref<number | null>(null)
const activity = ref<IActivityDetail | null>(null)
const loading = ref(true)
const loadError = ref('')
const actionLoading = ref(false)

const participationMeta: Record<ActivityParticipationStatus, { label: string, className: string, description: string }> = {
  申请中: {
    label: '等待抽签',
    className: 'bg-purple-50 text-purple-600',
    description: '已提交报名，抽签结果将在报名截止后公布。',
  },
  活动申请失败: {
    label: '未中签',
    className: 'bg-gray-100 text-gray-500',
    description: '本次抽签未中签。',
  },
  已报名: {
    label: '已报名',
    className: 'bg-green-50 text-green-600',
    description: '报名成功，请按时参加活动。',
  },
  已参与: {
    label: '已签到',
    className: 'bg-green-50 text-green-600',
    description: '你已完成本次活动签到。',
  },
  未签到: {
    label: '待签到',
    className: 'bg-orange-50 text-orange-600',
    description: '请在活动现场扫描组织者提供的签到码。',
  },
  放弃: {
    label: '已取消报名',
    className: 'bg-gray-100 text-gray-500',
    description: '你已取消本次报名。',
  },
}

const participation = computed(() => {
  const status = activity.value?.participation_status
  return status ? participationMeta[status] : null
})

const canSignUp = computed(() => {
  const data = activity.value
  if (!data?.need_apply || data.status !== '报名中')
    return false
  return data.participation_status === null
    || data.participation_status === '放弃'
    || data.participation_status === '活动申请失败'
})

const canWithdraw = computed(() => {
  const data = activity.value
  if (!data || (data.status !== '报名中' && data.status !== '等待中'))
    return false
  return data.participation_status === '申请中' || data.participation_status === '已报名'
})

const hasAction = computed(() => canSignUp.value || canWithdraw.value)

const statusClass = computed(() => {
  const status = activity.value?.status
  if (status === '报名中' || status === '进行中')
    return 'bg-green-50 text-green-600'
  if (status === '等待中' || status === '待发布')
    return 'bg-blue-50 text-blue-600'
  if (status === '已取消' || status === '已撤销' || status === '未过审')
    return 'bg-red-50 text-red-500'
  if (status === '审核中')
    return 'bg-yellow-50 text-yellow-600'
  return 'bg-gray-100 text-gray-500'
})

function formatDateTime(dateTimeStr: string) {
  if (!dateTimeStr)
    return ''
  const date = new Date(dateTimeStr)
  if (Number.isNaN(date.getTime()))
    return dateTimeStr
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

async function fetchActivityInfo() {
  if (activityId.value === null)
    return
  loading.value = true
  loadError.value = ''
  try {
    activity.value = await getActivityInfo(activityId.value, true)
  }
  catch (error) {
    console.error('获取活动详情失败:', error)
    loadError.value = '暂时无法获取活动信息，请检查网络后重试。'
  }
  finally {
    loading.value = false
  }
}

async function handleActivityAction() {
  if (activityId.value === null || actionLoading.value)
    return

  const withdrawing = canWithdraw.value
  if (!withdrawing && !canSignUp.value)
    return

  if (withdrawing) {
    const modalResult = await uni.showModal({
      title: '是否确认取消报名？',
      content: '',
      cancelText: '否',
      confirmText: '是',
      confirmColor: '#ef4444',
    })
    if (!modalResult.confirm)
      return
  }

  actionLoading.value = true
  try {
    const result = withdrawing
      ? await withdrawActivitySignup(activityId.value)
      : await signUpActivity(activityId.value)

    if (activity.value) {
      activity.value.participation_status = result.participation_status
      activity.value.current_participants = result.current_participants
    }
    uni.showToast({
      title: result.message,
      icon: 'success',
    })
  }
  catch (error) {
    console.error(withdrawing ? '取消报名失败:' : '报名失败:', error)
    // 后端的具体错误由请求层统一显示。
  }
  finally {
    actionLoading.value = false
  }
}

function goBack() {
  uni.navigateBack()
}

onLoad((options) => {
  const id = Number(options?.id)
  if (!Number.isInteger(id) || id <= 0) {
    loading.value = false
    loadError.value = '活动参数无效，无法打开详情。'
    return
  }
  activityId.value = id
  void fetchActivityInfo()
})
</script>

<template>
  <view class="min-h-screen bg-gray-50 pb-safe">
    <uv-navbar
      title="活动详情"
      :safe-area-inset-top="true"
      :placeholder="true"
      left-icon="arrow-left"
      @left-click="goBack"
    />

    <view v-if="loading" class="flex flex-col items-center justify-center py-24 text-sm text-gray-400">
      <uv-loading-icon mode="circle" />
      <text class="mt-3">正在加载活动信息…</text>
    </view>

    <view v-else-if="loadError" class="flex flex-col items-center justify-center px-8 py-24 text-center">
      <text class="i-carbon-warning-alt mb-3 text-3xl text-gray-300" />
      <text class="text-sm text-gray-500 leading-6">{{ loadError }}</text>
      <button
        v-if="activityId !== null"
        class="mt-5 rounded-lg bg-blue-500 px-6 py-2 text-sm text-white"
        @click="fetchActivityInfo"
      >
        重试
      </button>
      <button v-else class="mt-5 rounded-lg bg-blue-500 px-6 py-2 text-sm text-white" @click="goBack">
        返回
      </button>
    </view>

    <view v-else-if="activity" class="px-4 pt-4" :class="hasAction ? 'pb-28' : 'pb-6'">
      <view class="overflow-hidden rounded-2xl bg-white shadow-sm">
        <view class="p-5">
          <view class="mb-4 flex items-start justify-between gap-3">
            <text class="flex-1 text-xl text-gray-900 font-bold leading-7">{{ activity.title }}</text>
            <view class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" :class="statusClass">
              {{ activity.status }}
            </view>
          </view>

          <view class="text-sm text-gray-600 space-y-3">
            <view class="flex items-start gap-2">
              <text class="i-carbon-user mt-0.5 text-base text-gray-400" />
              <text class="flex-1">{{ activity.organization_name }}</text>
            </view>
            <view class="flex items-start gap-2">
              <text class="i-carbon-time mt-0.5 text-base text-gray-400" />
              <view class="flex flex-col gap-1">
                <text>{{ formatDateTime(activity.start) }}</text>
                <text>至 {{ formatDateTime(activity.end) }}</text>
              </view>
            </view>
            <view v-if="activity.location" class="flex items-start gap-2">
              <text class="i-carbon-location mt-0.5 text-base text-gray-400" />
              <text class="flex-1">{{ activity.location }}</text>
            </view>
            <view v-if="activity.need_apply" class="flex items-start gap-2">
              <text class="i-carbon-calendar mt-0.5 text-base text-gray-400" />
              <text class="flex-1">报名截止：{{ formatDateTime(activity.apply_end) }}</text>
            </view>
            <view v-if="activity.capacity > 0" class="flex items-start gap-2">
              <text class="i-carbon-group mt-0.5 text-base text-gray-400" />
              <text class="flex-1">已报名 {{ activity.current_participants }} / {{ activity.capacity }} 人</text>
            </view>
          </view>

          <view class="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            <view class="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-600">
              {{ activity.category_display }}
            </view>
            <view v-if="activity.need_apply" class="rounded-lg bg-orange-50 px-2 py-1 text-xs text-orange-600">
              需报名
            </view>
            <view v-else class="rounded-lg bg-green-50 px-2 py-1 text-xs text-green-600">
              无需报名
            </view>
            <view v-if="activity.inner" class="rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-600">
              内部活动
            </view>
            <view v-if="activity.bidding" class="rounded-lg bg-purple-50 px-2 py-1 text-xs text-purple-600">
              抽签活动
            </view>
            <view v-if="activity.need_checkin" class="rounded-lg bg-cyan-50 px-2 py-1 text-xs text-cyan-600">
              需签到
            </view>
          </view>
        </view>
      </view>

      <view v-if="participation" class="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <view class="flex items-center justify-between gap-3">
          <text class="text-sm text-gray-800 font-medium">我的参与状态</text>
          <view class="rounded-full px-2.5 py-1 text-xs font-medium" :class="participation.className">
            {{ participation.label }}
          </view>
        </view>
        <text class="mt-2 block text-sm text-gray-500 leading-6">{{ participation.description }}</text>
      </view>

      <view v-if="activity.need_checkin" class="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <text class="text-sm text-gray-800 font-medium">签到方式</text>
        <text class="mt-2 block text-sm text-gray-500 leading-6">
          请在活动开始前一小时至活动结束前，到现场扫描组织者展示的签到二维码。
        </text>
      </view>

      <view class="mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <text class="text-base text-gray-900 font-semibold">活动介绍</text>
        <text v-if="activity.introduction" class="introduction mt-3 block text-sm text-gray-600 leading-6">
          {{ activity.introduction }}
        </text>
        <text v-else class="mt-3 block text-sm text-gray-400">暂无活动介绍</text>
      </view>
    </view>

    <view v-if="activity && hasAction" class="fixed bottom-0 left-0 right-0 z-50 bg-white px-4 pt-3 pb-safe shadow-lg">
      <button
        class="w-full rounded-lg py-3 text-base font-medium"
        :class="canWithdraw ? 'border border-red-200 bg-white text-red-500' : 'bg-blue-500 text-white'"
        :disabled="actionLoading"
        @click="handleActivityAction"
      >
        {{ actionLoading ? '处理中…' : (canWithdraw ? '取消报名' : (activity.bidding ? '参与抽签' : '立即报名')) }}
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.introduction {
  white-space: pre-wrap;
}
</style>
