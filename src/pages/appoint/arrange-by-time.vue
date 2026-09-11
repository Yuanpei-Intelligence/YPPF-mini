<script lang="ts" setup>
import type { IArrangeTimeResponse, IIndexResponse, IRoom, ITimeSection } from '@/api/types/appoint'
import type { UvToastInstance } from '@/hooks/useApiException'
import { getArrangeByRoom, getIndexStatus } from '@/api/appoint'
import PageState from '@/components/PageState.vue'
import { useApiException } from '@/hooks/useApiException'
import { formatDateTimeRange, weekdayLabel } from '@/utils/format'

definePage({
  style: {
    navigationBarTitleText: '按时间预约',
  },
})

interface WeekDay {
  label: string
  date: Date
  year: number
  month: number
  day: number
}

const loading = ref(false)
const loadError = ref<string | null>(null)
const roomsData = ref<IIndexResponse>()
const roomsArrangementData = ref<Map<string, IArrangeTimeResponse>>(new Map())
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

// 生成接下来一周的日期列表（今天起）
const weekDays = computed<WeekDay[]>(() => {
  const days: WeekDay[] = []
  const today = new Date()

  for (let i = 0; i < 7; i++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    days.push({
      label: i === 0 ? '今天' : weekdayLabel(date),
      date,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    })
  }

  return days
})

// 选中的日期索引
const selectedDayIndex = ref<number>(0)

// 当前选中的日期
const currentDay = computed(() => {
  return weekDays.value[selectedDayIndex.value]
})

// 所有房间列表（合并功能房、研讨室、俄文楼）
const allRooms = computed(() => {
  const rooms: IRoom[] = []
  if (roomsData.value?.function_room_list) {
    rooms.push(...roomsData.value.function_room_list)
  }
  if (roomsData.value?.talk_room_list) {
    rooms.push(...roomsData.value.talk_room_list)
  }
  if (roomsData.value?.russian_room_list) {
    rooms.push(...roomsData.value.russian_room_list)
  }
  return rooms
})

// 某房间在当前选中日期的时间段列表
function getDaySections(roomId: string): ITimeSection[] {
  const arrangement = roomsArrangementData.value.get(roomId)
  if (!arrangement?.dayrange_list)
    return []
  const dayData = arrangement.dayrange_list.find(
    day => day.year === currentDay.value.year
      && day.month === currentDay.value.month
      && day.day === currentDay.value.day,
  )
  return dayData?.timesection || []
}

// 获取当前选中日期对应的所有时间段ID（合并所有房间的时间段）
const allTimeSectionIds = computed(() => {
  const timeIdSet = new Set<number>()
  allRooms.value.forEach((room) => {
    getDaySections(room.Rid).forEach(section => timeIdSet.add(section.id))
  })
  // 按 id 排序
  return Array.from(timeIdSet).sort((a, b) => a - b)
})

// 网格：每个房间一列，每个时间段一格（缺失的时间段为 null）
const columns = computed(() => {
  return allRooms.value.map((room) => {
    const sections = getDaySections(room.Rid)
    return {
      room,
      cells: allTimeSectionIds.value.map(timeId => sections.find(s => s.id === timeId) ?? null),
    }
  })
})

// 选中的房间ID
const selectedRoomId = ref<string | null>(null)

// 选中的时间段（起始和结束）
const selectedStartId = ref<number | null>(null)
const selectedEndId = ref<number | null>(null)

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

// 判断时间段是否被选中
function isTimeSelected(roomId: string, section: ITimeSection): boolean {
  if (selectedRoomId.value !== roomId)
    return false
  if (selectedStartId.value === null)
    return false
  if (selectedEndId.value === null)
    return section.id === selectedStartId.value

  const daySections = getDaySections(roomId)
  const startIdx = daySections.findIndex(s => s.id === selectedStartId.value)
  const endIdx = daySections.findIndex(s => s.id === selectedEndId.value)
  const currentIdx = daySections.findIndex(s => s.id === section.id)

  const minIdx = Math.min(startIdx, endIdx)
  const maxIdx = Math.max(startIdx, endIdx)

  return currentIdx >= minIdx && currentIdx <= maxIdx
}

// 判断是否为起始时间
function isStartTime(roomId: string, section: ITimeSection): boolean {
  return selectedRoomId.value === roomId && section.id === selectedStartId.value
}

// 判断是否为结束时间
function isEndTime(roomId: string, section: ITimeSection): boolean {
  return selectedRoomId.value === roomId
    && section.id === selectedEndId.value
    && selectedEndId.value !== selectedStartId.value
}

// 点击时间段
function onTimeClick(roomId: string, section: ITimeSection) {
  if (!isTimeAvailable(section))
    return

  const daySections = getDaySections(roomId)
  if (daySections.length === 0)
    return

  // 如果没有选中起始时间，设置为起始时间
  if (selectedStartId.value === null) {
    selectedRoomId.value = roomId
    selectedStartId.value = section.id
    selectedEndId.value = null
    return
  }

  // 如果点击的是不同房间，设置为起始时间
  if (selectedRoomId.value !== roomId) {
    selectedRoomId.value = roomId
    selectedStartId.value = section.id
    selectedEndId.value = null
    return
  }

  // 如果已经选了起始时间（同一房间）
  if (selectedEndId.value === null) {
    // 点击同一个，取消选择
    if (section.id === selectedStartId.value) {
      selectedStartId.value = null
      selectedRoomId.value = null
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

    // 检查是否超过该天的最大预约时长
    const arrangement = roomsArrangementData.value.get(roomId)
    if (arrangement && !arrangement.has_longterm_permission) {
      const selectedCount = maxIdx - minIdx
      const maxLimit = arrangement.max_appoint_time
      if (maxLimit && selectedCount > maxLimit) {
        showMessage(`该天最多可预约 ${maxLimit / 2} 小时`, 'warning')
        return
      }
    }

    selectedEndId.value = section.id
    return
  }

  // 如果已经选了起始和结束时间，重新选择
  selectedRoomId.value = roomId
  selectedStartId.value = section.id
  selectedEndId.value = null
}

// 获取选中房间的信息
const selectedRoom = computed(() => {
  if (!selectedRoomId.value)
    return null
  return allRooms.value.find(r => r.Rid === selectedRoomId.value) || null
})

// 选中区间的实际起止时间段（按 id 顺序归一化）
const selectedBounds = computed(() => {
  if (selectedStartId.value === null || selectedRoomId.value === null)
    return null
  const daySections = getDaySections(selectedRoomId.value)
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

function withTime(base: Date, time: string): Date {
  const [hh, mm] = time.split(':').map(Number)
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh || 0, mm || 0)
}

// 底部栏摘要：「今天 14:00–15:30」
const summaryText = computed(() => {
  const bounds = selectedBounds.value
  if (!bounds)
    return ''
  if (!bounds.end)
    return `${currentDay.value.label} ${bounds.start.starttime} 起，请选择结束时间`
  return formatDateTimeRange(withTime(currentDay.value.date, bounds.start.starttime), withTime(currentDay.value.date, bounds.end.starttime))
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
  return selectedStartId.value !== null && selectedEndId.value !== null && selectedRoomId.value !== null
})

// 前往 checkout 页面
function goToCheckout() {
  const bounds = selectedBounds.value
  if (!canSubmit.value || !selectedRoom.value || selectedRoomId.value === null || !bounds?.end)
    return

  const arrangement = roomsArrangementData.value.get(selectedRoomId.value)
  const dayData = arrangement?.dayrange_list?.find(
    day => day.year === currentDay.value.year
      && day.month === currentDay.value.month
      && day.day === currentDay.value.day,
  )
  if (!dayData)
    return

  uni.navigateTo({
    url: `/pages/appoint/checkout?Rid=${selectedRoomId.value}&startid=${bounds.start.id}&endid=${bounds.end.id}&weekday=${dayData.weekday}&timestr=${selectedTimeRange.value}`,
  })
}

// 选择日期
function selectDay(index: number) {
  selectedDayIndex.value = index
  // 重置选择
  selectedRoomId.value = null
  selectedStartId.value = null
  selectedEndId.value = null
  // 不需要重新加载，因为 API 已经返回了一周的数据
}

// 获取所有房间的时间安排；全部失败 → 页内错误，部分失败 → 保留数据只 toast 一次
async function fetchRoomsArrangement() {
  if (!roomsData.value || allRooms.value.length === 0)
    return

  let firstError: unknown
  const promises = allRooms.value.map(async (room) => {
    try {
      const res = await getArrangeByRoom({ Rid: room.Rid })
      roomsArrangementData.value.set(room.Rid, res)
    }
    catch (error) {
      console.error(`加载房间 ${room.Rid} 的时间安排失败:`, error)
      firstError ??= error
    }
  })

  await Promise.all(promises)
  if (firstError) {
    if (roomsArrangementData.value.size === 0)
      loadError.value = handleApiException(firstError, { showToast: false }).message
    else
      handleApiException(firstError)
  }
}

// 首屏加载：房间列表 → 各房间时间安排
async function load() {
  loading.value = true
  loadError.value = null
  try {
    roomsData.value = await getIndexStatus()
  }
  catch (error) {
    loadError.value = handleApiException(error, { showToast: false }).message
    loading.value = false
    return
  }
  await fetchRoomsArrangement()
  loading.value = false
}

onLoad(() => {
  load()
})
</script>

<template>
  <uv-toast ref="toastRef" />

  <PageState
    :loading="loading"
    :error="loadError"
    :empty="!loading && !loadError && !!roomsData && allRooms.length === 0"
    empty-text="还没有可预约的房间"
    @retry="load"
  >
    <view class="yp-page py-3 pb-40">
      <!-- 日期条 -->
      <scroll-view scroll-x class="w-full" :show-scrollbar="false">
        <view class="flex gap-2 px-4">
          <view
            v-for="(day, index) in weekDays"
            :key="index"
            class="h-112rpx w-124rpx flex shrink-0 flex-col items-center justify-center rounded-md"
            :class="selectedDayIndex === index ? 'bg-primary text-white' : 'bg-fill text-fg-1 active:bg-fill-active'"
            @click="selectDay(index)"
          >
            <text class="text-xs" :class="selectedDayIndex === index ? 'text-white' : 'text-fg-3'">
              {{ day.label }}
            </text>
            <text class="mt-0.5 text-base font-medium">{{ day.month }}/{{ day.day }}</text>
          </view>
        </view>
      </scroll-view>

      <!-- 说明 -->
      <view class="mt-3 px-4 text-xs text-fg-3">
        先点开始时间，再点结束时间；再次点开始时间可取消
      </view>

      <!-- 时段表格（每个房间一列，横向滚动） -->
      <scroll-view scroll-x class="mt-2 w-full" :show-scrollbar="false">
        <view class="flex gap-2 px-4">
          <view
            v-for="column in columns"
            :key="column.room.Rid"
            class="w-168rpx flex shrink-0 flex-col"
          >
            <!-- 房间标题（固定在顶部） -->
            <view
              class="sticky top-0 z-10 mb-2 h-104rpx flex flex-col items-center justify-center rounded-md px-1"
              :class="selectedRoomId === column.room.Rid ? 'bg-primary text-white' : 'bg-card text-fg-1'"
            >
              <text class="text-sm font-semibold">{{ column.room.Rid }}</text>
              <text class="w-full truncate text-center text-2xs" :class="selectedRoomId === column.room.Rid ? 'text-white' : 'text-fg-3'">
                {{ column.room.Rtitle }}
              </text>
            </view>

            <!-- 该房间的时间段列表 -->
            <view class="flex flex-col gap-1.5">
              <template v-for="(section, cellIndex) in column.cells" :key="allTimeSectionIds[cellIndex]">
                <view
                  v-if="section"
                  class="relative h-96rpx flex flex-col items-center justify-center border rounded-md text-sm"
                  :class="[
                    isTimeAvailable(section)
                      ? isTimeSelected(column.room.Rid, section)
                        ? 'border-primary bg-primary text-white font-medium'
                        : 'border-line bg-card text-fg-1 active:bg-fill'
                      : 'border-line-light bg-fill text-fg-4',
                  ]"
                  @click="onTimeClick(column.room.Rid, section)"
                >
                  <!-- 起始 / 结束标记 -->
                  <text
                    v-if="isStartTime(column.room.Rid, section)"
                    class="absolute left-1 top-0 text-2xs text-white"
                  >
                    起
                  </text>
                  <text
                    v-if="isEndTime(column.room.Rid, section)"
                    class="absolute right-1 top-0 text-2xs text-white"
                  >
                    止
                  </text>

                  <view class="flex items-center gap-0.5">
                    <view v-if="isTimeSelected(column.room.Rid, section)" class="i-carbon-checkmark text-xs" />
                    <text>{{ section.starttime }}</text>
                  </view>
                  <text v-if="!isTimeAvailable(section)" class="text-2xs leading-none">{{ slotLabel(section) }}</text>
                </view>
                <!-- 该房间没有这个时间段 -->
                <view
                  v-else
                  class="h-96rpx flex items-center justify-center border border-line-light rounded-md bg-fill"
                >
                  <text class="text-xs text-fg-4">–</text>
                </view>
              </template>
            </view>
          </view>
        </view>
      </scroll-view>
      <!-- 底部固定栏的安全区占位 -->
      <view class="pb-safe" />
    </view>
  </PageState>

  <!-- 底部固定栏：已选摘要 + 主按钮 -->
  <view v-if="roomsData && !loadError" class="fixed bottom-0 left-0 right-0 z-50 bg-card px-4 pt-3 shadow-float pb-safe-3">
    <view class="flex items-center gap-3">
      <view class="min-w-0 flex-1">
        <template v-if="summaryText && selectedRoom">
          <view class="truncate text-sm text-fg-1 font-medium">
            {{ selectedRoom.Rid }} {{ selectedRoom.Rtitle }}
          </view>
          <view class="truncate text-xs text-fg-3">
            {{ summaryText }}<text v-if="durationText"> · {{ durationText }}</text>
          </view>
        </template>
        <view v-else class="text-sm text-fg-3">
          请选择房间和时段
        </view>
      </view>
      <button class="btn-primary shrink-0 px-6" :disabled="!canSubmit" @click="goToCheckout">
        下一步
      </button>
    </view>
  </view>
</template>
