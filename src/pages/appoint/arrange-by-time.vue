<script lang="ts" setup>
import type { IArrangeTimeResponse, IIndexResponse, IRoom, ITimeSection } from '@/api/types/appoint'
import type { UvToastInstance } from '@/hooks/useApiException'
import { getArrangeByRoom, getIndexStatus } from '@/api/appoint'
import { useApiException } from '@/hooks/useApiException'

definePage({
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '按时间预约',
  },
})

const loading = ref(false)
const roomsData = ref<IIndexResponse>()
const roomsArrangementData = ref<Map<string, IArrangeTimeResponse>>(new Map())
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

// 生成接下来一周的日期列表
const weekDays = computed(() => {
  const days: Array<{ weekday: string, date: string, year: number, month: number, day: number, timestamp: number }> = []
  const today = new Date()

  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)

    const weekdayMap: Record<number, string> = {
      0: 'Sun',
      1: 'Mon',
      2: 'Tue',
      3: 'Wed',
      4: 'Thu',
      5: 'Fri',
      6: 'Sat',
    }

    days.push({
      weekday: weekdayMap[date.getDay()],
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      timestamp: date.getTime(),
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

// 获取当前选中日期对应的所有时间段ID（合并所有房间的时间段）
const allTimeSectionIds = computed(() => {
  const timeIdSet = new Set<number>()

  // 遍历所有房间，收集时间段ID
  allRooms.value.forEach((room) => {
    const arrangement = roomsArrangementData.value.get(room.Rid)
    if (!arrangement?.dayrange_list)
      return

    // 找到当前选中日期对应的数据
    const dayData = arrangement.dayrange_list.find(
      day => day.year === currentDay.value.year
        && day.month === currentDay.value.month
        && day.day === currentDay.value.day,
    )

    if (dayData?.timesection) {
      dayData.timesection.forEach((section) => {
        timeIdSet.add(section.id)
      })
    }
  })

  // 按 id 排序
  return Array.from(timeIdSet).sort((a, b) => a - b)
})

// 获取某个房间在某个时间段的详细信息
function getRoomTimeSection(roomId: string, timeId: number): ITimeSection | null {
  const arrangement = roomsArrangementData.value.get(roomId)
  if (!arrangement?.dayrange_list)
    return null

  const dayData = arrangement.dayrange_list.find(
    day => day.year === currentDay.value.year
      && day.month === currentDay.value.month
      && day.day === currentDay.value.day,
  )

  if (!dayData?.timesection)
    return null

  return dayData.timesection.find(s => s.id === timeId) || null
}

// 选中的房间ID
const selectedRoomId = ref<string | null>(null)

// 选中的时间段（起始和结束）
const selectedStartId = ref<number | null>(null)
const selectedEndId = ref<number | null>(null)

// 判断时间段是否可选（status === 0 表示可用）
function isTimeAvailable(roomId: string, section: ITimeSection): boolean {
  const arrangement = roomsArrangementData.value.get(roomId)
  if (!arrangement?.dayrange_list)
    return false

  const dayData = arrangement.dayrange_list.find(
    day => day.year === currentDay.value.year
      && day.month === currentDay.value.month
      && day.day === currentDay.value.day,
  )

  if (!dayData?.timesection)
    return false

  const sectionData = dayData.timesection.find(s => s.id === section.id)
  return sectionData?.status === 0
}

// 判断时间段是否被选中
function isTimeSelected(roomId: string, section: ITimeSection): boolean {
  if (selectedRoomId.value !== roomId)
    return false
  if (selectedStartId.value === null)
    return false
  if (selectedEndId.value === null)
    return section.id === selectedStartId.value

  const arrangement = roomsArrangementData.value.get(roomId)
  if (!arrangement?.dayrange_list)
    return false

  const dayData = arrangement.dayrange_list.find(
    day => day.year === currentDay.value.year
      && day.month === currentDay.value.month
      && day.day === currentDay.value.day,
  )

  if (!dayData?.timesection)
    return false

  const daySections = dayData.timesection
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
  if (!isTimeAvailable(roomId, section))
    return

  const arrangement = roomsArrangementData.value.get(roomId)
  if (!arrangement?.dayrange_list)
    return

  const dayData = arrangement.dayrange_list.find(
    day => day.year === currentDay.value.year
      && day.month === currentDay.value.month
      && day.day === currentDay.value.day,
  )

  if (!dayData?.timesection)
    return

  const daySections = dayData.timesection

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
    if (section.id < selectedStartId.value!) {
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
      .some(s => !isTimeAvailable(roomId, s))

    if (hasUnavailable) {
      showMessage('选择范围内有不可用时段。', 'warning')
      return
    }

    // 检查是否超过该天的最大预约时长
    const arrangement = roomsArrangementData.value.get(roomId)
    if (arrangement && !arrangement.has_longterm_permission) {
      const selectedCount = maxIdx - minIdx
      const maxLimit = arrangement.max_appoint_time
      if (maxLimit && selectedCount > maxLimit) {
        showMessage(`该天最多可预约 ${maxLimit / 2} 小时。`, 'warning')
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

// 获取选中的时间范围文字
const selectedTimeRange = computed(() => {
  if (selectedStartId.value === null || selectedRoomId.value === null)
    return ''

  const arrangement = roomsArrangementData.value.get(selectedRoomId.value)
  if (!arrangement?.dayrange_list)
    return ''

  const dayData = arrangement.dayrange_list.find(
    day => day.year === currentDay.value.year
      && day.month === currentDay.value.month
      && day.day === currentDay.value.day,
  )

  if (!dayData?.timesection)
    return ''

  const daySections = dayData.timesection
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
  return selectedStartId.value !== null && selectedEndId.value !== null && selectedRoomId.value !== null
})

// 获取选中房间的信息
const selectedRoom = computed(() => {
  if (!selectedRoomId.value)
    return null
  return allRooms.value.find(r => r.Rid === selectedRoomId.value) || null
})

// 返回上一页
function goBack() {
  uni.navigateBack()
}

// 前往 checkout 页面
function goToCheckout() {
  if (!canSubmit.value || !selectedRoom.value || selectedRoomId.value === null)
    return

  const arrangement = roomsArrangementData.value.get(selectedRoomId.value)
  if (!arrangement?.dayrange_list)
    return

  const dayData = arrangement.dayrange_list.find(
    day => day.year === currentDay.value.year
      && day.month === currentDay.value.month
      && day.day === currentDay.value.day,
  )

  if (!dayData?.timesection)
    return

  const daySections = dayData.timesection

  // 计算实际的开始和结束 id
  const startIdx = daySections.findIndex(s => s.id === selectedStartId.value)
  const endIdx = daySections.findIndex(s => s.id === selectedEndId.value)
  const actualStartIdx = Math.min(startIdx, endIdx)
  const actualEndIdx = Math.max(startIdx, endIdx)

  const startid = daySections[actualStartIdx].id
  const endid = daySections[actualEndIdx].id

  uni.navigateTo({
    url: `/pages/appoint/checkout?Rid=${selectedRoomId.value}&startid=${startid}&endid=${endid}&weekday=${dayData.weekday}&timestr=${selectedTimeRange.value}`,
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

// 获取房间列表
async function fetchRooms() {
  try {
    const res = await getIndexStatus()
    roomsData.value = res
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
  }
}

// 获取所有房间的时间安排
async function fetchRoomsArrangement() {
  if (!roomsData.value || allRooms.value.length === 0)
    return

  loading.value = true
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
  if (firstError)
    handleApiException(firstError)
  loading.value = false
}

onLoad(() => {
  fetchRooms().then(() => {
    fetchRoomsArrangement()
  })
})
</script>

<template>
  <!-- 自定义导航栏 -->
  <uv-navbar
    title="按时间预约"
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

  <view v-else-if="roomsData" class="min-h-screen bg-gray-50 pb-safe">
    <!-- 日期选择器 -->
    <view class="mx-3 mt-3 rounded-lg bg-white p-3 shadow-sm">
      <view class="mb-2 text-sm text-gray-600">
        选择日期
      </view>
      <scroll-view scroll-x class="w-full" :show-scrollbar="true">
        <view class="flex flex-row gap-2">
          <view
            v-for="(day, index) in weekDays"
            :key="index"
            class="flex flex-shrink-0 flex-col items-center justify-center border rounded-lg px-4 py-2 transition-all"
            :class="selectedDayIndex === index
              ? 'border-blue-500 bg-blue-500 text-white'
              : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50'"
            @click="selectDay(index)"
          >
            <text class="text-xs" :class="selectedDayIndex === index ? 'text-blue-100' : 'text-gray-400'">
              {{ day.weekday }}
            </text>
            <text class="mt-1 text-base font-medium">{{ day.day }}</text>
            <text class="text-xs" :class="selectedDayIndex === index ? 'text-blue-100' : 'text-gray-400'">
              {{ day.month }}/{{ day.day }}
            </text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 选择提示 -->
    <view class="mx-3 mt-3 flex items-center justify-between text-sm">
      <view class="text-gray-500">
        <text>轻触选择，点击开始时间可取消选择</text>
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

    <!-- 房间信息卡片（如果已选择房间） -->
    <view v-if="selectedRoom" class="mx-3 mt-3 rounded-lg bg-white p-4 shadow-sm">
      <view class="text-lg text-gray-800 font-bold">
        {{ selectedRoom.Rtitle }}
      </view>
      <view class="mt-1 text-sm text-gray-500">
        {{ selectedRoom.Rid }} · {{ selectedRoom.Rmin }}-{{ selectedRoom.Rmax }}人
      </view>
      <view class="mt-1 text-sm text-gray-500">
        开放时间：{{ selectedRoom.Rstart }} - {{ selectedRoom.Rfinish }}
      </view>
    </view>

    <!-- 时间段表格（每个房间一列，横向滚动） -->
    <scroll-view scroll-x class="mt-3" :show-scrollbar="false">
      <view class="flex gap-2 px-3 pb-32">
        <!-- 每个房间为一列 -->
        <view
          v-for="room in allRooms"
          :key="room.Rid"
          class="flex flex-shrink-0 flex-col"
          :style="{ width: '80px' }"
        >
          <!-- 房间标题（固定在顶部） -->
          <view
            class="sticky top-0 z-10 mb-2 h-15 rounded-lg py-2 text-center"
            :class="selectedRoomId === room.Rid ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 shadow-sm'"
          >
            <text class="text-xs font-medium">{{ room.Rid }}</text>
            <view class="mt-0.5 text-xs" :class="selectedRoomId === room.Rid ? 'text-blue-100' : 'text-gray-400'">
              {{ room.Rtitle }}
            </view>
          </view>

          <!-- 该房间的时间段列表 -->
          <view class="flex flex-col gap-1.5">
            <view
              v-for="timeId in allTimeSectionIds"
              :key="timeId"
            >
              <view
                v-if="getRoomTimeSection(room.Rid, timeId)"
                :key="timeId"
                class="relative flex items-center justify-center border rounded-lg py-2.5 transition-all"
                :class="[
                  isTimeAvailable(room.Rid, getRoomTimeSection(room.Rid, timeId)!)
                    ? isTimeSelected(room.Rid, getRoomTimeSection(room.Rid, timeId)!)
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50'
                    : 'border-gray-100 bg-gray-200 text-gray-400',
                ]"
                @click="onTimeClick(room.Rid, getRoomTimeSection(room.Rid, timeId)!)"
              >
                <!-- 起始标记 -->
                <view
                  v-if="isStartTime(room.Rid, getRoomTimeSection(room.Rid, timeId)!)"
                  class="absolute left-1 top-0.5 text-xs"
                  :class="isTimeSelected(room.Rid, getRoomTimeSection(room.Rid, timeId)!) ? 'text-blue-200' : 'text-blue-500'"
                >
                  起
                </view>
                <!-- 结束标记 -->
                <view
                  v-if="isEndTime(room.Rid, getRoomTimeSection(room.Rid, timeId)!)"
                  class="absolute right-1 top-0.5 text-xs"
                  :class="isTimeSelected(room.Rid, getRoomTimeSection(room.Rid, timeId)!) ? 'text-blue-200' : 'text-blue-500'"
                >
                  止
                </view>

                <!-- 时间显示 -->
                <text class="text-sm font-medium">{{ getRoomTimeSection(room.Rid, timeId)?.starttime }}</text>
              </view>
              <view
                v-else
                class="flex items-center justify-center border border-gray-100 rounded-lg bg-gray-50 py-2.5"
              >
                <text class="text-xs text-gray-300">-</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 底部确认按钮 -->
    <view class="fixed bottom-0 left-0 right-0 z-50 bg-white px-4 pt-3 pb-safe shadow-lg">
      <view class="mb-2 text-center text-sm text-gray-600">
        <text v-if="selectedTimeRange && selectedRoom">
          {{ currentDay.weekday }} {{ selectedTimeRange }} · {{ selectedRoom.Rtitle }}
        </text>
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
    <button class="mt-4 rounded-lg bg-blue-500 px-6 py-2 text-white" @click="fetchRooms">
      重新加载
    </button>
  </view>
</template>

<style lang="scss" scoped>
// 安全区域底部内边距
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
