<script lang="ts" setup>
import type { ActivityParticipationStatus, ActivityStatus, IActivityDetail } from '@/api/types/activity'
import type { StatusTagType } from '@/components/StatusTag.vue'
import type { UvToastInstance } from '@/hooks/useApiException'
import { getActivityInfo, signUpActivity, withdrawActivitySignup } from '@/api/activity'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { useConfirm } from '@/hooks/useConfirm'
import { formatDateTimeRange, formatSmartDateTime } from '@/utils/format'

definePage({
  style: {
    navigationBarTitleText: '活动详情',
  },
})

interface MainAction {
  label: string
  kind: 'primary' | 'secondary'
  disabled: boolean
  onTap?: () => void
}

const activityId = ref<number | null>(null)
const activity = ref<IActivityDetail | null>(null)
const loading = ref(true)
const loadError = ref('')
const actionLoading = ref(false)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
const { confirm } = useConfirm()

const participationMeta: Record<ActivityParticipationStatus, { label: string, type: StatusTagType, description: string }> = {
  申请中: { label: '等待抽签', type: 'processing', description: '已提交报名，抽签结果将在报名截止后公布。' },
  活动申请失败: { label: '未中签', type: 'default', description: '本次抽签未中签。' },
  已报名: { label: '已报名', type: 'success', description: '报名成功，请按时参加活动。' },
  已参与: { label: '已签到', type: 'success', description: '你已完成本次活动签到。' },
  未签到: { label: '待签到', type: 'warning', description: '请在活动现场扫描组织者提供的签到码。' },
  放弃: { label: '已取消报名', type: 'default', description: '你已取消本次报名。' },
}

const participation = computed(() => {
  const status = activity.value?.participation_status
  return status ? participationMeta[status] : null
})

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

/** 底栏只有一个由状态驱动的主按钮；没有可执行动作时按钮只描述状态并禁用。 */
const mainAction = computed<MainAction>(() => {
  const data = activity.value
  if (!data)
    return { label: '', kind: 'secondary', disabled: true }
  if (canSignUp.value)
    return { label: data.bidding ? '参与抽签' : '报名', kind: 'primary', disabled: false, onTap: handleSignUp }

  const status = participation.value
  if (data.participation_status === '已参与' || data.participation_status === '未签到' || data.participation_status === '已报名' || data.participation_status === '申请中')
    return { label: status?.label ?? data.participation_status, kind: 'secondary', disabled: true }

  switch (data.status) {
    case '报名中':
      return { label: '无需报名', kind: 'secondary', disabled: true }
    case '等待中':
      return { label: '报名已截止', kind: 'secondary', disabled: true }
    case '进行中':
      return { label: '活动进行中', kind: 'secondary', disabled: true }
    case '已结束':
      return { label: '活动已结束', kind: 'secondary', disabled: true }
    case '已取消':
    case '已撤销':
      return { label: '活动已取消', kind: 'secondary', disabled: true }
    case '未过审':
      return { label: '活动未过审', kind: 'secondary', disabled: true }
    case '审核中':
    case '待发布':
      return { label: '暂未开放报名', kind: 'secondary', disabled: true }
    default:
      return { label: data.status_display || data.status, kind: 'secondary', disabled: true }
  }
})

async function fetchActivityInfo() {
  if (activityId.value === null)
    return
  loading.value = true
  loadError.value = ''
  try {
    activity.value = await getActivityInfo(activityId.value)
  }
  catch (error) {
    console.error('获取活动详情失败:', error)
    // 首屏加载失败只展示页内可重试的错误，不再叠加 toast
    loadError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    loading.value = false
  }
}

async function submitActivityAction(withdrawing: boolean) {
  if (activityId.value === null || actionLoading.value)
    return
  actionLoading.value = true
  try {
    const result = withdrawing
      ? await withdrawActivitySignup(activityId.value)
      : await signUpActivity(activityId.value)
    if (activity.value) {
      activity.value.participation_status = result.participation_status
      activity.value.current_participants = result.current_participants
    }
    showMessage(result.message, 'success')
  }
  catch (error) {
    console.error(withdrawing ? '取消报名失败:' : '报名失败:', error)
    handleApiException(error)
  }
  finally {
    actionLoading.value = false
  }
}

async function handleSignUp() {
  const data = activity.value
  if (!data || !canSignUp.value || actionLoading.value)
    return
  const ok = await confirm({
    title: data.bidding ? '参与抽签' : '报名活动',
    content: `确认${data.bidding ? '参与' : '报名'}「${data.title}」？`,
    confirmText: data.bidding ? '参与抽签' : '报名',
    cancelText: '再想想',
  })
  if (!ok)
    return
  await submitActivityAction(false)
}

async function handleWithdraw() {
  if (!canWithdraw.value || actionLoading.value)
    return
  const ok = await confirm({
    title: '取消报名',
    content: '取消后名额会立即释放，之后可能无法再次报名。',
    confirmText: '取消报名',
    cancelText: '保留报名',
    danger: true,
  })
  if (!ok)
    return
  await submitActivityAction(true)
}

function onMainTap() {
  if (mainAction.value.disabled || actionLoading.value)
    return
  mainAction.value.onTap?.()
}

function onRetry() {
  if (activityId.value === null)
    uni.navigateBack()
  else
    void fetchActivityInfo()
}

onLoad((options) => {
  const id = Number(options?.id)
  if (!Number.isInteger(id) || id <= 0) {
    loading.value = false
    loadError.value = '活动参数无效，无法打开详情'
    return
  }
  activityId.value = id
  void fetchActivityInfo()
})
</script>

<template>
  <view class="yp-page">
    <uv-toast ref="toastRef" />

    <PageState
      :loading="loading"
      :error="loadError"
      :retry-text="activityId === null ? '返回' : '重试'"
      @retry="onRetry"
    >
      <view v-if="activity" class="px-4 py-3">
        <!-- 标题与关键信息 -->
        <view class="yp-card-flat">
          <text class="block text-xl text-fg-1 font-semibold">{{ activity.title }}</text>
          <view class="mt-2 flex flex-wrap items-center gap-2">
            <StatusTag :type="activityStatusType(activity.status)" :text="activity.status_display || activity.status" size="md" />
            <StatusTag v-if="activity.category_display" :text="activity.category_display" />
            <StatusTag :text="activity.need_apply ? '需报名' : '无需报名'" />
            <StatusTag v-if="activity.inner" text="内部活动" />
            <StatusTag v-if="activity.bidding" text="抽签活动" />
            <StatusTag v-if="activity.need_checkin" text="需签到" />
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
            <view v-if="activity.capacity > 0" class="flex items-start gap-3">
              <view class="i-carbon-user-multiple mt-1 shrink-0 text-fg-3" />
              <view class="min-w-0 flex-1">
                <text class="block text-xs text-fg-3">名额</text>
                <text class="block text-sm text-fg-1">{{ activity.current_participants }} / {{ activity.capacity }}</text>
              </view>
            </view>
            <view v-if="activity.need_apply && activity.apply_end" class="flex items-start gap-3">
              <view class="i-carbon-calendar mt-1 shrink-0 text-fg-3" />
              <view class="min-w-0 flex-1">
                <text class="block text-xs text-fg-3">报名截止</text>
                <text class="block text-sm text-fg-1">{{ formatSmartDateTime(activity.apply_end) }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 我的参与状态 -->
        <view v-if="participation" class="mt-3 yp-card-flat">
          <view class="flex items-center justify-between gap-3">
            <text class="text-base text-fg-1 font-medium">我的参与状态</text>
            <StatusTag :type="participation.type" :text="participation.label" />
          </view>
          <text class="mt-2 block text-sm text-fg-2">{{ participation.description }}</text>
        </view>

        <!-- 签到方式 -->
        <view v-if="activity.need_checkin" class="mt-3 yp-card-flat">
          <text class="block text-base text-fg-1 font-medium">签到方式</text>
          <text class="mt-2 block text-sm text-fg-2">活动开始前 1 小时至活动结束前，在现场扫描组织者展示的签到码。</text>
        </view>

        <!-- 活动介绍 -->
        <view class="mt-3 yp-card-flat">
          <text class="block text-base text-fg-1 font-medium">活动介绍</text>
          <text v-if="activity.introduction" class="mt-2 block whitespace-pre-wrap text-sm text-fg-2 leading-relaxed">{{ activity.introduction }}</text>
          <text v-else class="mt-2 block text-sm text-fg-3">暂无活动介绍</text>
        </view>

        <!-- 固定底栏占位 -->
        <view class="pb-safe" :class="canWithdraw ? 'h-232rpx' : 'h-160rpx'" />
      </view>
    </PageState>

    <!-- 底栏：一个状态驱动的主按钮 + 可选的次级取消 -->
    <view v-if="activity && !loading" class="fixed bottom-0 left-0 right-0 z-10 bg-card shadow-float pb-safe">
      <view class="px-4 py-3">
        <view
          class="btn-block"
          :class="[mainAction.kind === 'primary' ? 'btn-primary' : 'btn-secondary', { 'opacity-50': mainAction.disabled || actionLoading }]"
          @click="onMainTap"
        >
          {{ actionLoading ? '处理中…' : mainAction.label }}
        </view>
        <view
          v-if="canWithdraw"
          class="mt-1 min-h-64rpx flex items-center justify-center text-sm text-error active:opacity-70"
          @click="handleWithdraw"
        >
          取消报名
        </view>
      </view>
    </view>
  </view>
</template>
