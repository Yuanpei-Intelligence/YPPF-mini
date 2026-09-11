<script lang="ts" setup>
import type { IArrangeTimeResponse, IDayRange, ITimeSection } from '@/api/types/appoint'
import type { UvToastInstance } from '@/hooks/useApiException'
import { getArrangeByRoom } from '@/api/appoint'
import PageState from '@/components/PageState.vue'
import { useApiException } from '@/hooks/useApiException'
import { formatDateTimeRange, formatSmartDateTime, weekdayLabel } from '@/utils/format'

definePage({
  style: {
    navigationBarTitleText: '选择预约时段',
  },
})

interface UvPopupInstance {
  open: (mode?: string) => void
  close: () => void
}

const Rid = ref<string>('')
const loading = ref(false)
const loadError = ref<string | null>(null)
const data = ref<IArrangeTimeResponse>()
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

// 日期条当前展示的日期索引
const activeDayIndex = ref(0)

// 选中的日期索引（用于记录选中的是哪一天）
const selectedDayIndex = ref<number | null>(null)

// 选中的时间段（起始和结束）
const selectedStartId = ref<number | null>(null)
const selectedEndId = ref<number | null>(null)

const dayList = computed(() => data.value?.dayrange_list || [])

// 当前展示日期的时间段列表
const activeTimeSections = computed(() => {
  return dayList.value[activeDayIndex.value]?.timesection || []
})

// 当前选中的日期信息
const currentDay = computed(() => {
  if (selectedDayIndex.value === null || !dayList.value.length)
    return null
  return dayList.value[selectedDayIndex.value] ?? null
})

function dayToDate(day: IDayRange, time?: string): Date {
  const [hh, mm] = (time ?? '00:00').split(':').map(Number)
  return new Date(day.year, day.month - 1, day.day, hh || 0, mm || 0)
}

function isToday(day: IDayRange): boolean {
  const now = new Date()
  return day.year === now.getFullYear() && day.month === now.getMonth() + 1 && day.day === now.getDate()
}

// 日期条上方的文字：今天 / 周五
function dayChipLabel(day: IDayRange): string {
  return isToday(day) ? '今天' : weekdayLabel(dayToDate(day))
}

// 判断时间段是否可选（status === 0 表示可用）
function isTimeAvailable(section: ITimeSection): boolean {
  return section.status === 0
}

// 不可选时段的短标签：1 已过 / 2 已约 / 3 长期预约占用
function slotLabel(section: ITimeSection): string {
  switch (section.status) {
    case 0: return ''
    case 1: return '已过'
    case 2: return '已约'
    case 3: return '长期'
    default: return '不可约'
  }
}

// 判断时间段是否被选中（需要考虑日期）
function isTimeSelected(dayIndex: number, section: ITimeSection): boolean {
  if (selectedDayIndex.value !== dayIndex)
    return false
  if (selectedStartId.value === null)
    return false
  if (selectedEndId.value === null)
    return section.id === selectedStartId.value

  const daySections = dayList.value[dayIndex]?.timesection || []
  const startIdx = daySections.findIndex(s => s.id === selectedStartId.value)
  const endIdx = daySections.findIndex(s => s.id === selectedEndId.value)
  const currentIdx = daySections.findIndex(s => s.id === section.id)

  const minIdx = Math.min(startIdx, endIdx)
  const maxIdx = Math.max(startIdx, endIdx)

  return currentIdx >= minIdx && currentIdx <= maxIdx
}

// 判断是否为起始时间
function isStartTime(dayIndex: number, section: ITimeSection): boolean {
  return selectedDayIndex.value === dayIndex && section.id === selectedStartId.value
}

// 判断是否为结束时间
function isEndTime(dayIndex: number, section: ITimeSection): boolean {
  return selectedDayIndex.value === dayIndex
    && section.id === selectedEndId.value
    && selectedEndId.value !== selectedStartId.value
}

// 点击时间段
function onTimeClick(dayIndex: number, section: ITimeSection) {
  if (!isTimeAvailable(section))
    return

  const daySections = dayList.value[dayIndex]?.timesection || []

  // 如果没有选中起始时间，设置为起始时间
  if (selectedStartId.value === null) {
    selectedDayIndex.value = dayIndex
    selectedStartId.value = section.id
    selectedEndId.value = null
    return
  }

  // 如果点击的是不同日期，设置为起始时间
  if (selectedDayIndex.value !== dayIndex) {
    selectedDayIndex.value = dayIndex
    selectedStartId.value = section.id
    selectedEndId.value = null
    return
  }

  // 如果已经选了起始时间（同一天）
  if (selectedEndId.value === null) {
    // 点击同一个，取消选择
    if (section.id === selectedStartId.value) {
      selectedStartId.value = null
      selectedDayIndex.value = null
      return
    }

    // 点击起始时间前面的，将起始时间设置为当前时间
    if (section.id < selectedStartId.value) {
      selectedStartId.value = section.id
      return
    }

    // 检查选择范围内是否有不可用的时间段
    const startIdx = daySections.findIndex(s => s.id === selectedStartId.value)
    const endIdx = daySections.findIndex(s => s.id === section.id)
    const minIdx = Math.min(startIdx, endIdx)
    const maxIdx = Math.max(startIdx, endIdx)

    // 检查区间内是否都可用
    const hasUnavailable = daySections
      .slice(minIdx, maxIdx + 1)
      .some(s => !isTimeAvailable(s))

    if (hasUnavailable) {
      showMessage('选择范围内有不可用时段', 'warning')
      return
    }

    // 检查是个人预约是否超过该天的最大预约时长
    // 比如start=1, end=2, 时长为2 - 1 = 1*30mins
    if (!data.value?.has_longterm_permission) {
      const selectedCount = maxIdx - minIdx
      const dayInfo = dayList.value[dayIndex]
      const dayLimit = dayInfo?.weekday ? data.value?.available_hours?.[dayInfo.weekday] : null
      const maxLimit = dayLimit ?? data.value?.max_appoint_time
      if (maxLimit && selectedCount > maxLimit) {
        showMessage(`该天最多可预约 ${maxLimit / 2} 小时`, 'warning')
        return
      }
    }

    selectedEndId.value = section.id
    return
  }

  // 如果已经选了起始和结束时间，重新选择
  selectedDayIndex.value = dayIndex
  selectedStartId.value = section.id
  selectedEndId.value = null
}

// 选中区间的实际起止时间段（按 id 顺序归一化）
const selectedBounds = computed(() => {
  if (selectedStartId.value === null || selectedDayIndex.value === null)
    return null
  const daySections = dayList.value[selectedDayIndex.value]?.timesection || []
  const startIdx = daySections.findIndex(s => s.id === selectedStartId.value)
  if (startIdx < 0)
    return null
  if (selectedEndId.value === null)
    return { start: daySections[startIdx], end: null, slots: 0 }
  const endIdx = daySections.findIndex(s => s.id === selectedEndId.value)
  if (endIdx < 0)
    return null
  const minIdx = Math.min(startIdx, endIdx)
  const maxIdx = Math.max(startIdx, endIdx)
  return { start: daySections[minIdx], end: daySections[maxIdx], slots: maxIdx - minIdx }
})

// 传给 checkout 的时间范围文字（保持原有 query 格式）
const selectedTimeRange = computed(() => {
  const bounds = selectedBounds.value
  if (!bounds)
    return ''
  if (!bounds.end)
    return `${bounds.start.starttime} 起`
  return `${bounds.start.starttime} - ${bounds.end.starttime}`
})

// 底部栏摘要：「今天 14:00–15:30」「1.5 小时」
const summaryText = computed(() => {
  const bounds = selectedBounds.value
  const day = currentDay.value
  if (!bounds || !day)
    return ''
  if (!bounds.end)
    return `${formatSmartDateTime(dayToDate(day), false)} ${bounds.start.starttime} 起，请选择结束时间`
  return formatDateTimeRange(dayToDate(day, bounds.start.starttime), dayToDate(day, bounds.end.starttime))
})

const durationText = computed(() => {
  const slots = selectedBounds.value?.slots ?? 0
  return slots > 0 ? formatDurationText(slots * 30) : ''
})

function formatDurationText(minutes: number): string {
  if (minutes < 60)
    return `${minutes} 分钟`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`
}

// 是否可以提交
const canSubmit = computed(() => {
  return selectedStartId.value !== null && selectedEndId.value !== null && selectedDayIndex.value !== null
})

// 预约须知弹窗
const noticePopupRef = ref<UvPopupInstance | null>(null)

function openNoticePopup() {
  noticePopupRef.value?.open()
}

function closeNoticePopup() {
  noticePopupRef.value?.close()
}

// 前往 checkout 页面
function goToCheckout() {
  const bounds = selectedBounds.value
  if (!canSubmit.value || !currentDay.value || !bounds?.end)
    return

  uni.navigateTo({
    url: `/pages/appoint/checkout?Rid=${Rid.value}&startid=${bounds.start.id}&endid=${bounds.end.id}&weekday=${currentDay.value.weekday}&timestr=${selectedTimeRange.value}`,
  })
}

onLoad((options) => {
  if (options && options.Rid) {
    Rid.value = options.Rid
  }
  fetchData()
})

async function fetchData() {
  loading.value = true
  try {
    const res = await getArrangeByRoom({ Rid: Rid.value })
    data.value = res
    loadError.value = null
  }
  catch (error) {
    // 首屏失败只显示页内错误 + 重试，不再 toast
    loadError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    loading.value = false
  }
}

function openAgreement() {
  uni.navigateTo({
    url: `/pages/appoint/agreement`,
  })
}
</script>

<template>
  <uv-toast ref="toastRef" />

  <PageState :loading="loading && !data" :error="loadError" :empty="!loading && !loadError && !!data && dayList.length === 0" empty-text="还没有可预约的时段" @retry="fetchData">
    <view v-if="data" class="yp-page px-4 py-3 pb-40">
      <!-- 房间信息卡片 -->
      <view class="yp-card-flat">
        <view class="flex items-center justify-between gap-2">
          <view class="min-w-0 flex-1">
            <view class="text-lg text-fg-1 font-semibold">
              {{ data.room.Rtitle }}
            </view>
            <view class="mt-0.5 text-sm text-fg-2">
              {{ data.room.Rid }} · {{ data.room.Rmin }}–{{ data.room.Rmax }} 人 · 开放 {{ data.room.Rstart.slice(0, 5) }}–{{ data.room.Rfinish.slice(0, 5) }}
            </view>
          </view>
          <view class="btn-text shrink-0" @click="openNoticePopup">
            预约须知
          </view>
        </view>
      </view>

      <!-- 日期条 -->
      <scroll-view scroll-x class="mt-3 w-full" :show-scrollbar="false">
        <view class="flex gap-2">
          <view
            v-for="(day, dayIndex) in dayList"
            :key="dayIndex"
            class="relative h-112rpx w-124rpx flex shrink-0 flex-col items-center justify-center rounded-md"
            :class="activeDayIndex === dayIndex ? 'bg-primary text-white' : 'bg-fill text-fg-1 active:bg-fill-active'"
            @click="activeDayIndex = dayIndex"
          >
            <text class="text-xs" :class="activeDayIndex === dayIndex ? 'text-white' : 'text-fg-3'">
              {{ dayChipLabel(day) }}
            </text>
            <text class="mt-0.5 text-base font-medium">{{ day.month }}/{{ day.day }}</text>
            <!-- 已选时段在其它日期时的提示点 -->
            <view
              v-if="selectedDayIndex === dayIndex && activeDayIndex !== dayIndex"
              class="absolute right-2 top-2 h-10rpx w-10rpx rounded-full bg-primary"
            />
          </view>
        </view>
      </scroll-view>

      <!-- 说明 -->
      <view class="mt-3 text-xs text-fg-3">
        先点开始时间，再点结束时间；再次点开始时间可取消
      </view>

      <!-- 时段网格 -->
      <view class="grid grid-cols-4 mt-2 gap-2">
        <view
          v-for="section in activeTimeSections"
          :key="section.id"
          class="relative h-96rpx flex flex-col items-center justify-center border rounded-md text-sm"
          :class="[
            isTimeAvailable(section)
              ? isTimeSelected(activeDayIndex, section)
                ? 'border-primary bg-primary text-white font-medium'
                : 'border-line bg-card text-fg-1 active:bg-fill'
              : 'border-line-light bg-fill text-fg-4',
          ]"
          @click="onTimeClick(activeDayIndex, section)"
        >
          <!-- 起始 / 结束标记 -->
          <text
            v-if="isStartTime(activeDayIndex, section)"
            class="absolute left-1 top-0 text-2xs text-white"
          >
            起
          </text>
          <text
            v-if="isEndTime(activeDayIndex, section)"
            class="absolute right-1 top-0 text-2xs text-white"
          >
            止
          </text>

          <view class="flex items-center gap-0.5">
            <view v-if="isTimeSelected(activeDayIndex, section)" class="i-carbon-checkmark text-xs" />
            <text>{{ section.starttime }}</text>
          </view>
          <text v-if="!isTimeAvailable(section)" class="text-2xs leading-none">{{ slotLabel(section) }}</text>
        </view>
      </view>
      <!-- 底部固定栏的安全区占位 -->
      <view class="pb-safe" />
    </view>
  </PageState>

  <!-- 底部固定栏：已选摘要 + 主按钮 -->
  <view v-if="data" class="fixed bottom-0 left-0 right-0 z-50 bg-card px-4 pt-3 shadow-float pb-safe-3">
    <view class="flex items-center gap-3">
      <view class="min-w-0 flex-1">
        <template v-if="summaryText">
          <view class="truncate text-sm text-fg-1 font-medium">
            {{ summaryText }}
          </view>
          <view v-if="durationText" class="text-xs text-fg-3">
            {{ durationText }}
          </view>
        </template>
        <view v-else class="text-sm text-fg-3">
          请选择预约时段
        </view>
      </view>
      <button class="btn-primary shrink-0 px-6" :disabled="!canSubmit" @click="goToCheckout">
        下一步
      </button>
    </view>
  </view>

  <!-- 预约须知弹窗 -->
  <uv-popup ref="noticePopupRef" mode="bottom" :round="16" :safe-area-inset-bottom="true">
    <view class="px-4 pb-4 pt-5">
      <view class="text-center text-lg text-fg-1 font-semibold">
        预约须知
      </view>
      <view class="mt-4 text-sm text-fg-2 leading-relaxed">
        <view class="mb-2">
          1. 预约开始时间前后 15 分钟内始终无人刷卡使用，或预约时间段内超过 40% 时间房间内实际人数未达到房间预约人数一半以上，将被扣除信用分。
        </view>
        <view class="mb-2">
          2. 个人每天最多预约时长为 3 小时，同一时段不可预约多个房间。
        </view>
        <view class="mb-2">
          3. 小组账户可以长期预约，不受上述限制，长期预约时可以选择本周开始或者下周开始。
        </view>
        <view class="mb-2">
          4. 更多使用规则请参考<text class="text-primary" @click="openAgreement">《35楼地下室使用规范》</text>。
        </view>
        <view>5. 如果无法预约，可在应用界面尝试旧版预约，或在反馈中心进行反馈，我们会在后续更新中修复。</view>
      </view>
      <button class="btn-primary mt-5 btn-block" @click="closeNoticePopup">
        知道了
      </button>
    </view>
  </uv-popup>
</template>
