<script lang="ts" setup>
import type { IArrangeTimeResponse, ITimeSection } from '@/api/types/appoint'
import type { UvToastInstance } from '@/hooks/useApiException'
import { getArrangeByRoom } from '@/api/appoint'
import { useApiException } from '@/hooks/useApiException'

definePage({
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '预约房间',
  },
})

const Rid = ref<string>('')
const loading = ref(false)
const data = ref<IArrangeTimeResponse>()
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

// 选中的日期索引（用于记录选中的是哪一天）
const selectedDayIndex = ref<number | null>(null)

// 选中的时间段（起始和结束）
const selectedStartId = ref<number | null>(null)
const selectedEndId = ref<number | null>(null)

// 当前选中日期的时间段列表
const currentTimeSections = computed(() => {
  if (selectedDayIndex.value === null || !data.value?.dayrange_list?.length)
    return []
  return data.value.dayrange_list[selectedDayIndex.value]?.timesection || []
})

// 当前选中的日期信息
const currentDay = computed(() => {
  if (selectedDayIndex.value === null || !data.value?.dayrange_list?.length)
    return null
  return data.value.dayrange_list[selectedDayIndex.value]
})

// 判断时间段是否可选（status === 0 表示可用）
function isTimeAvailable(section: ITimeSection): boolean {
  return section.status === 0
}

// 判断时间段是否被选中（需要考虑日期）
function isTimeSelected(dayIndex: number, section: ITimeSection): boolean {
  if (selectedDayIndex.value !== dayIndex)
    return false
  if (selectedStartId.value === null)
    return false
  if (selectedEndId.value === null)
    return section.id === selectedStartId.value

  const daySections = data.value?.dayrange_list[dayIndex]?.timesection || []
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

  const daySections = data.value?.dayrange_list[dayIndex]?.timesection || []

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
      showMessage('选择范围内有不可用时段。', 'warning')
      return
    }

    // 检查是个人预约是否超过该天的最大预约时长
    // 比如start=1, end=2, 时长为2 - 1 = 1*30mins
    if (!data.value?.has_longterm_permission) {
      const selectedCount = maxIdx - minIdx
      const dayInfo = data.value?.dayrange_list[dayIndex]
      const dayLimit = dayInfo?.weekday ? data.value?.available_hours?.[dayInfo.weekday] : null
      const maxLimit = dayLimit ?? data.value?.max_appoint_time
      if (maxLimit && selectedCount > maxLimit) {
        showMessage(`该天最多可预约 ${maxLimit / 2} 小时。`, 'warning')
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

// 获取选中的时间范围文字
const selectedTimeRange = computed(() => {
  if (selectedStartId.value === null || selectedDayIndex.value === null)
    return ''

  const daySections = data.value?.dayrange_list[selectedDayIndex.value]?.timesection || []
  const startSection = daySections.find(s => s.id === selectedStartId.value)
  if (!startSection)
    return ''

  if (selectedEndId.value === null) {
    return `${startSection.starttime} 起`
  }

  const endSection = daySections.find(s => s.id === selectedEndId.value)
  if (!endSection)
    return ''

  // 计算实际的开始和结束时间
  const startIdx = daySections.findIndex(s => s.id === selectedStartId.value)
  const endIdx = daySections.findIndex(s => s.id === selectedEndId.value)
  const actualStartIdx = Math.min(startIdx, endIdx)
  const actualEndIdx = Math.max(startIdx, endIdx)

  const actualStart = daySections[actualStartIdx]
  const actualEnd = daySections[actualEndIdx]

  return `${actualStart.starttime} - ${actualEnd.starttime}`
})

// 是否可以提交
const canSubmit = computed(() => {
  return selectedStartId.value !== null && selectedEndId.value !== null && selectedDayIndex.value !== null
})

// 预约须知弹窗
const noticePopupRef = ref()

function openNoticePopup() {
  noticePopupRef.value?.open('center')
}

function closeNoticePopup() {
  noticePopupRef.value?.close()
}

// 返回上一页
function goBack() {
  uni.navigateBack()
}

// 前往 checkout 页面
function goToCheckout() {
  if (!canSubmit.value || !currentDay.value || selectedDayIndex.value === null)
    return

  const daySections = data.value?.dayrange_list[selectedDayIndex.value]?.timesection || []

  // 计算实际的开始和结束 id
  const startIdx = daySections.findIndex(s => s.id === selectedStartId.value)
  const endIdx = daySections.findIndex(s => s.id === selectedEndId.value)
  const actualStartIdx = Math.min(startIdx, endIdx)
  const actualEndIdx = Math.max(startIdx, endIdx)

  const startid = daySections[actualStartIdx].id
  const endid = daySections[actualEndIdx].id

  uni.navigateTo({
    url: `/pages/appoint/checkout?Rid=${Rid.value}&startid=${startid}&endid=${endid}&weekday=${currentDay.value.weekday}&timestr=${selectedTimeRange.value}`,
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
    console.log(data.value)
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
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
  <!-- 自定义导航栏 -->
  <uv-navbar
    title="选择预约时段"
    :safe-area-inset-top="true"
    :placeholder="true"
    left-icon="arrow-left"
    @left-click="goBack"
  />
  <uv-toast ref="toastRef" />

  <!-- 加载状态 -->
  <view v-if="loading" class="flex items-center justify-center py-20">
    <uv-loading-icon mode="circle" />
  </view>

  <view v-else-if="data" class="min-h-screen bg-gray-50 pb-safe">
    <!-- 房间信息卡片 -->
    <view class="mx-3 mt-3 rounded-lg bg-white p-4 shadow-sm">
      <view class="text-lg text-gray-800 font-bold">
        {{ data.room.Rtitle }}
      </view>
      <view class="mt-1 text-sm text-gray-500">
        {{ data.room.Rid }} · {{ data.room.Rmin }}-{{ data.room.Rmax }}人
      </view>
      <view class="mt-1 text-sm text-gray-500">
        开放时间：{{ data.room.Rstart }} - {{ data.room.Rfinish }}
      </view>
    </view>

    <!-- 选择提示 -->
    <view class="mx-3 mt-3 flex items-center justify-between text-sm">
      <view class="text-gray-500">
        <text>轻触选择，点击开始时间可取消选择</text>
      </view>
      <view class="text-blue-500" @click="openNoticePopup">
        <text>预约须知</text>
      </view>
    </view>

    <!-- 图例说明 -->
    <view class="mx-3 mt-2 flex items-center gap-4 text-xs text-gray-500">
      <view class="flex items-center gap-1">
        <view class="h-3 w-3 border border-gray-200 rounded bg-white" />
        <text>可选</text>
      </view>
      <view class="flex items-center gap-1">
        <view class="h-3 w-3 rounded bg-blue-500" />
        <text>已选</text>
      </view>
      <view class="flex items-center gap-1">
        <view class="h-3 w-3 rounded bg-gray-200" />
        <text>不可选</text>
      </view>
    </view>

    <!-- 时间段表格（每天一列，横向滚动） -->
    <scroll-view scroll-x class="mt-3" :show-scrollbar="false">
      <view class="flex gap-2 px-3 pb-32">
        <!-- 每一天为一列 -->
        <view
          v-for="(day, dayIndex) in data.dayrange_list"
          :key="dayIndex"
          class="flex flex-shrink-0 flex-col"
          :style="{ width: '80px' }"
        >
          <!-- 日期标题（固定在顶部） -->
          <view
            class="sticky top-0 z-10 mb-2 rounded-lg py-2 text-center"
            :class="selectedDayIndex === dayIndex ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 shadow-sm'"
          >
            <text class="text-sm font-medium">{{ day.weekday }}</text>
            <view class="text-xs" :class="selectedDayIndex === dayIndex ? 'text-blue-100' : 'text-gray-400'">
              {{ day.month }}/{{ day.day }}
            </view>
          </view>

          <!-- 该天的时间段列表 -->
          <view class="flex flex-col gap-1.5">
            <view
              v-for="section in day.timesection"
              :key="section.id"
              class="relative flex items-center justify-center border rounded-lg py-2.5 transition-all"
              :class="[
                isTimeAvailable(section)
                  ? isTimeSelected(dayIndex, section)
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50'
                  : 'border-gray-100 bg-gray-200 text-gray-400',
              ]"
              @click="onTimeClick(dayIndex, section)"
            >
              <!-- 起始标记 -->
              <view
                v-if="isStartTime(dayIndex, section)"
                class="absolute left-1 top-0.5 text-xs"
                :class="isTimeSelected(dayIndex, section) ? 'text-blue-200' : 'text-blue-500'"
              >
                起
              </view>
              <!-- 结束标记 -->
              <view
                v-if="isEndTime(dayIndex, section)"
                class="absolute right-1 top-0.5 text-xs"
                :class="isTimeSelected(dayIndex, section) ? 'text-blue-200' : 'text-blue-500'"
              >
                止
              </view>

              <!-- 时间显示 -->
              <text class="text-sm font-medium">{{ section.starttime }}</text>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 底部确认按钮 -->
    <view class="fixed bottom-0 left-0 right-0 bg-white px-4 pt-3 pb-safe shadow-lg">
      <view class="mb-2 text-center text-sm text-gray-600">
        <text v-if="selectedTimeRange">{{ currentDay?.weekday }} {{ selectedTimeRange }}</text>
        <text v-else class="text-gray-400">请选择预约时段</text>
      </view>
      <button
        class="w-full rounded-lg py-3 text-base font-medium"
        :class="canSubmit ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'"
        :disabled="!canSubmit"
        @click="goToCheckout"
      >
        确认选择
      </button>
    </view>
  </view>

  <!-- 无数据状态 -->
  <view v-else class="flex flex-col items-center justify-center py-20">
    <text class="text-gray-400">暂无数据</text>
    <button class="mt-4 rounded-lg bg-blue-500 px-6 py-2 text-white" @click="fetchData">
      重新加载
    </button>
  </view>

  <!-- 预约须知弹窗 -->
  <uv-popup ref="noticePopupRef" mode="center" :round="12">
    <view class="w-72 rounded-xl bg-white p-5">
      <view class="mb-4 text-center text-lg text-gray-800 font-bold">
        预约须知
      </view>
      <view class="text-sm text-gray-600 leading-relaxed">
        <view class="mb-2">
          1. 预约开始时间前后15分钟内始终无人刷卡使用，或预约时间段内超过 40% 时间房间内实际人数未达到房间预约人数一半以上，将被扣除信用分。
        </view>
        <view class="mb-2">
          2. 个人每天最多预约时长为3小时，同一时段不可预约多个房间。
        </view>
        <view class="mb-2">
          3. 小组账户可以长期预约，不受上述限制，长期预约时可以选择本周开始或者下周开始。
        </view>
        <view class="mb-2">
          4. 更多使用规则请参考<text class="text-blue-500" @click="openAgreement">《35楼地下室使用规范》</text>。
        </view>
        <view>5. 如果无法预约，可在应用界面尝试旧版预约，或在反馈中心进行反馈，我们会在后续更新中修复。</view>
      </view>
      <button
        class="mt-5 w-full rounded-lg bg-blue-500 py-2.5 text-white"
        @click="closeNoticePopup"
      >
        我知道了
      </button>
    </view>
  </uv-popup>
</template>

<style lang="scss" scoped>
// 安全区域底部内边距
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
