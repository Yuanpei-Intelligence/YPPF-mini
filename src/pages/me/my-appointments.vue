<script lang="ts" setup>
import type { IAppointDisplay, ILongtermAppointDisplay, IMyAppointmentsResponse } from '@/api/types/appoint'
import type { StatusTagType } from '@/components/StatusTag.vue'
import type { UvToastInstance } from '@/hooks/useApiException'
import { cancelAppoint, getMyAppointments, renewLongtermAppoint } from '@/api/appoint'
import ApiFieldError from '@/components/ApiFieldError.vue'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { useConfirm } from '@/hooks/useConfirm'
import { tokens } from '@/style/tokens'
import { formatChineseDate, formatDateTimeRange, formatTimeRange, weekdayLabel } from '@/utils/format'

definePage({
  style: {
    navigationBarTitleText: '我的预约',
    enablePullDownRefresh: true,
  },
})

interface UvPopupInstance {
  open: () => void
  close: () => void
}

type TabKey = 'future' | 'past' | 'longterm'

interface TabItem {
  name: string
  key: TabKey
}

// 后端状态文案 → 状态胶囊语义（保持后端文案原样展示）
const APPOINT_STATUS_TYPE: Record<string, StatusTagType> = {
  已预约: 'processing',
  进行中: 'processing',
  等待确认: 'warning',
  已确认: 'success',
  申诉成功: 'success',
  违约: 'error',
  已取消: 'default',
}

const LONGTERM_STATUS_TYPE: Record<string, StatusTagType> = {
  审核中: 'warning',
  已通过: 'success',
  已取消: 'default',
  未通过: 'default',
}

const tabIndex = ref<number>(0)
const showLongterm = ref<boolean>(true)
const appointments = ref<IMyAppointmentsResponse>()
const loading = ref<boolean>(false)
const loadError = ref<string | null>(null)

// 续约相关
const currentRenewLongtermId = ref<number | null>(null)
const selectedWeeks = ref<number>(1)
const renewLoading = ref<boolean>(false)
const renewPopupRef = ref<UvPopupInstance | null>(null)
const cancelingId = ref<number | null>(null)
const toastRef = ref<UvToastInstance | null>(null)
const { clearFieldError, getFieldMessages, handleApiException, setFieldError, showMessage } = useApiException(toastRef)
const { confirm } = useConfirm()

const futureList = computed(() => appointments.value?.appoint_list_future || [])
const pastList = computed(() => appointments.value?.appoint_list_past || [])
const longtermList = computed(() => appointments.value?.appoint_list_longterm || [])
const hasLongtermPermission = computed(() => appointments.value?.has_longterm_permission || false)

const tabs = computed<TabItem[]>(() => {
  const items: TabItem[] = [
    { name: '待进行', key: 'future' },
    { name: '历史', key: 'past' },
  ]
  if (hasLongtermPermission.value)
    items.push({ name: '长期', key: 'longterm' })
  return items
})

const currentKey = computed<TabKey>(() => tabs.value[tabIndex.value]?.key ?? 'future')

// 待进行列表，根据开关过滤长期预约的场次
const normalAppointList = computed(() => {
  if (showLongterm.value) {
    return futureList.value
  }
  // 过滤掉 Atype 为长期的预约
  return futureList.value.filter(item => item.Atype !== '长期预约')
})

const currentAppointList = computed<IAppointDisplay[]>(() => {
  return currentKey.value === 'past' ? pastList.value : normalAppointList.value
})

const isEmpty = computed(() => {
  if (!appointments.value)
    return false
  if (currentKey.value === 'longterm')
    return longtermList.value.length === 0
  return currentAppointList.value.length === 0
})

const emptyText = computed(() => {
  switch (currentKey.value) {
    case 'past': return '还没有历史预约'
    case 'longterm': return '还没有长期预约'
    default: return '还没有待进行的预约'
  }
})

function appointStatusType(status?: string): StatusTagType {
  return (status && APPOINT_STATUS_TYPE[status]) || 'default'
}

function longtermStatusType(status?: string): StatusTagType {
  return (status && LONGTERM_STATUS_TYPE[status]) || 'default'
}

function roomLabel(item: IAppointDisplay): string {
  return [item.Rid, item.Rtitle].filter(Boolean).join(' ')
}

// 「每周五 14:00–15:30」
function longtermScheduleText(longterm: ILongtermAppointDisplay): string {
  const { Astart, Afinish } = longterm.appoint
  return `每${weekdayLabel(Astart)} ${formatTimeRange(Astart, Afinish)}`
}

function longtermIntervalText(longterm: ILongtermAppointDisplay): string {
  if (longterm.interval === 1)
    return '每周一次'
  if (longterm.interval === 2)
    return '隔周一次'
  return `每 ${longterm.interval} 周一次`
}

async function fetchData(options: { silent?: boolean } = {}) {
  if (!options.silent)
    loading.value = true
  try {
    const res = await getMyAppointments()
    appointments.value = res
    loadError.value = null
  }
  catch (error) {
    console.error(error)
    if (appointments.value) {
      // 已有数据的后台刷新失败：保留数据，只 toast 一次
      handleApiException(error)
    }
    else {
      loadError.value = handleApiException(error, { showToast: false }).message
    }
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  fetchData({ silent: !!appointments.value })
})

onPullDownRefresh(async () => {
  await fetchData({ silent: true })
  uni.stopPullDownRefresh()
})

function onTabChange(params: { index: number }) {
  tabIndex.value = params.index
}

function goAppoint() {
  uni.switchTab({ url: '/pages/appoint/appoint' })
}

// ---- 续约 ------------------------------------------------------------------

function handleRenewLongterm(longterm_id: number) {
  currentRenewLongtermId.value = longterm_id
  selectedWeeks.value = 1
  clearFieldError('times')
  nextTick(() => {
    renewPopupRef.value?.open()
  })
}

function closeRenewPopup() {
  renewPopupRef.value?.close()
  currentRenewLongtermId.value = null
  selectedWeeks.value = 1
}

function stepWeeks(delta: number) {
  selectedWeeks.value = Math.max(1, selectedWeeks.value + delta)
  clearFieldError('times')
}

async function confirmRenew() {
  if (renewLoading.value)
    return
  // 本地校验只用内联字段错误，不叠加 toast
  if (!currentRenewLongtermId.value) {
    setFieldError('times', '请选择续约周数', 'required')
    return
  }
  if (selectedWeeks.value <= 0) {
    setFieldError('times', '续约周数必须大于 0', 'min_value')
    return
  }

  renewLoading.value = true
  try {
    await renewLongtermAppoint({
      longterm_id: currentRenewLongtermId.value,
      times: selectedWeeks.value,
    })
    showMessage('续约成功', 'success')
    closeRenewPopup()
    fetchData({ silent: true })
  }
  catch (error) {
    handleApiException(error)
  }
  finally {
    renewLoading.value = false
  }
}

// ---- 取消 ------------------------------------------------------------------

async function handleCancelAppoint(item: IAppointDisplay) {
  const ok = await confirm({
    title: '取消预约',
    content: `将取消 ${roomLabel(item)} ${formatDateTimeRange(item.Astart, item.Afinish)} 的预约。`,
    confirmText: '取消预约',
    cancelText: '保留预约',
    danger: true,
  })
  if (!ok)
    return
  await _cancelAppoint(item.Aid, false)
}

async function handleCancelLongterm(longterm: ILongtermAppointDisplay) {
  const ok = await confirm({
    title: '取消长期预约',
    content: `将取消 ${roomLabel(longterm.appoint)} ${longtermScheduleText(longterm)} 的长期预约，尚未开始的场次一并取消。`,
    confirmText: '取消预约',
    cancelText: '保留预约',
    danger: true,
  })
  if (!ok)
    return
  await _cancelAppoint(longterm.longterm_id, true)
}

async function _cancelAppoint(id: number, isLongterm: boolean) {
  if (cancelingId.value !== null)
    return
  cancelingId.value = id
  try {
    await cancelAppoint({
      type: isLongterm ? 'longterm' : 'appoint',
      cancel_id: id,
    })
    showMessage('已取消预约', 'success')
    await fetchData({ silent: true })
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
  }
  finally {
    cancelingId.value = null
  }
}
</script>

<template>
  <uv-toast ref="toastRef" />
  <view class="yp-page">
    <!-- 顶部筛选 -->
    <view class="sticky top-0 z-10 bg-card">
      <uv-tabs
        :list="tabs"
        :current="tabIndex"
        :scrollable="false"
        :line-color="tokens.primary"
        :active-style="{ color: tokens.text1, fontWeight: 600 }"
        :inactive-style="{ color: tokens.text2 }"
        @change="onTabChange"
      />
      <view v-if="currentKey === 'future' && appointments" class="flex items-center justify-between border-t border-line-light px-4 py-2">
        <text class="text-sm text-fg-2">显示长期预约的场次</text>
        <uv-switch v-model="showLongterm" size="22" :active-color="tokens.primary" />
      </view>
    </view>

    <view class="px-4 py-3">
      <PageState
        :loading="loading && !appointments"
        :error="loadError"
        :empty="!loading && !loadError && isEmpty"
        :empty-text="emptyText"
        empty-icon="i-carbon-event-schedule"
        @retry="fetchData()"
      >
        <template #action>
          <button v-if="currentKey === 'future'" class="btn-secondary mt-4 btn-sm" @click="goAppoint">
            去预约
          </button>
        </template>

        <!-- 长期预约卡片 -->
        <template v-if="currentKey === 'longterm'">
          <view
            v-for="longterm in longtermList"
            :key="longterm.longterm_id"
            class="mb-3 yp-card-flat"
          >
            <view class="flex items-start justify-between gap-2">
              <view class="min-w-0 flex-1">
                <view class="text-lg text-fg-1 font-semibold">
                  {{ roomLabel(longterm.appoint) }}
                </view>
                <view class="mt-0.5 text-sm text-fg-2">
                  {{ longtermScheduleText(longterm) }}
                </view>
              </view>
              <StatusTag :type="longtermStatusType(longterm.status)" :text="longterm.status" dot />
            </view>

            <view class="mt-2 text-xs text-fg-3">
              {{ longtermIntervalText(longterm) }} · 共 {{ longterm.times }} 次 · {{ formatChineseDate(longterm.appoint.Astart) }} 起
            </view>

            <view v-if="longterm.appoint.Ausage" class="mt-2 text-sm text-fg-2">
              用途：{{ longterm.appoint.Ausage }}
            </view>

            <view v-if="longterm.appoint.Aannouncement" class="mt-2 rounded-sm bg-warning-light px-3 py-2 text-xs text-warning-dark">
              {{ longterm.appoint.Aannouncement }}
            </view>

            <!-- 审核意见（未通过时） -->
            <view v-if="longterm.status === '未通过' && longterm.review_comment" class="mt-2 text-xs text-error">
              审核意见：{{ longterm.review_comment }}
            </view>

            <!-- 操作 -->
            <view
              v-if="(longterm.status === '已通过' && longterm.renewable) || (longterm.status !== '已取消' && longterm.status !== '未通过')"
              class="mt-3 flex items-center justify-end gap-2"
            >
              <button
                v-if="longterm.status !== '已取消' && longterm.status !== '未通过'"
                class="btn-danger btn-sm"
                :disabled="cancelingId === longterm.longterm_id"
                @click="handleCancelLongterm(longterm)"
              >
                取消预约
              </button>
              <button
                v-if="longterm.status === '已通过' && longterm.renewable"
                class="btn-secondary btn-sm"
                @click="handleRenewLongterm(longterm.longterm_id)"
              >
                续约
              </button>
            </view>
          </view>
        </template>

        <!-- 普通预约卡片 -->
        <template v-else>
          <view
            v-for="item in currentAppointList"
            :key="item.Aid"
            class="mb-3 yp-card-flat"
          >
            <view class="flex items-start justify-between gap-2">
              <view class="min-w-0 flex-1">
                <view class="text-lg text-fg-1 font-semibold">
                  {{ roomLabel(item) }}
                </view>
                <view class="mt-0.5 text-sm text-fg-2">
                  {{ formatDateTimeRange(item.Astart, item.Afinish) }}
                </view>
              </view>
              <StatusTag v-if="item.Astatus" :type="appointStatusType(item.Astatus)" :text="item.Astatus" dot />
            </view>

            <view class="mt-2 text-xs text-fg-3">
              <text v-if="item.Atype">{{ item.Atype }} · </text>
              <text>本院 {{ item.yp_num ?? 0 }} 人 · 外院 {{ item.non_yp_num ?? 0 }} 人</text>
              <text v-if="item.major_student?.Sname"> · 发起人 {{ item.major_student.Sname }}</text>
            </view>

            <view v-if="item.Ausage" class="mt-2 text-sm text-fg-2">
              用途：{{ item.Ausage }}
            </view>

            <view v-if="item.Aannouncement" class="mt-2 rounded-sm bg-warning-light px-3 py-2 text-xs text-warning-dark">
              {{ item.Aannouncement }}
            </view>

            <!-- 操作：只有可取消时显示 -->
            <view v-if="item.can_cancel" class="mt-3 flex items-center justify-between gap-2">
              <text class="text-xs text-fg-3">不再使用请及时取消</text>
              <button
                class="btn-danger btn-sm"
                :disabled="cancelingId === item.Aid"
                @click="handleCancelAppoint(item)"
              >
                取消预约
              </button>
            </view>
          </view>
        </template>
      </PageState>
    </view>
  </view>

  <!-- 续约弹窗 -->
  <uv-popup ref="renewPopupRef" mode="bottom" :round="16" :safe-area-inset-bottom="true" :close-on-click-overlay="true" @close="closeRenewPopup">
    <view class="px-4 pb-4 pt-5">
      <view class="text-center text-lg text-fg-1 font-semibold">
        续约长期预约
      </view>
      <view class="mt-1 text-center text-sm text-fg-3">
        选择续约周数
      </view>

      <view class="mt-6 flex items-center justify-center gap-6">
        <button
          class="btn-outline h-88rpx w-88rpx rounded-full p-0 text-xl"
          :disabled="selectedWeeks <= 1"
          @click="stepWeeks(-1)"
        >
          −
        </button>
        <view class="min-w-160rpx text-center">
          <text class="text-2xl text-fg-1 font-semibold">{{ selectedWeeks }}</text>
          <text class="ml-1 text-base text-fg-2">周</text>
        </view>
        <button
          class="btn-outline h-88rpx w-88rpx rounded-full p-0 text-xl"
          @click="stepWeeks(1)"
        >
          +
        </button>
      </view>
      <ApiFieldError class="text-center" :messages="getFieldMessages('times')" />

      <view class="mt-6 flex gap-3">
        <button class="btn-outline flex-1" :disabled="renewLoading" @click="closeRenewPopup">
          暂不续约
        </button>
        <button class="btn-primary flex-1" :loading="renewLoading" :disabled="renewLoading" @click="confirmRenew">
          确认续约
        </button>
      </view>
    </view>
  </uv-popup>
</template>
