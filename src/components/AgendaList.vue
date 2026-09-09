<script lang="ts" setup>
import type { AgendaDay } from '@/api/types/agenda'
import type { Occurrence } from '@/api/types/timetable'
import { computed } from 'vue'
import {
  calendarLabelClass,
  clockOf,
  colorForOccurrence,
  KIND_BADGES,
  shortDate,
  STATUS_LABELS,
  suspendsClasses,
  WEEKDAY_LABELS,
} from '@/utils/timetable'

/*
 * 按日期分组的日程列表（首页「我的日程」等处使用）。
 * 只负责展示：不请求数据、不知道路由；点击日期头和日程行分别通过 openDay / select 交给父页面处理。
 */

const props = withDefaults(defineProps<{
  days: AgendaDay[]
  /** 正在加载：没有数据时显示加载态，已有数据时保留列表 */
  loading?: boolean
  /** “今天”的 ISO 日期，用来标出 今天 / 明天 / 后天；缺省取本机日期 */
  today?: string
}>(), {
  loading: false,
  today: '',
})

const emit = defineEmits<{
  select: [occurrence: Occurrence]
  openDay: [date: string]
}>()

interface AgendaRow {
  occurrence: Occurrence
  /** HH:MM */
  start: string
  end: string
  /** 左侧色条，颜色与课表页同一门课一致 */
  barStyle: string
  /** 书院课 / 活动 / 预约；学校课程与自定义条目不打标 */
  badge: string
  badgeStyle: string
  status: string
  statusClass: string
  canceled: boolean
  /** 地点 · 副标题 */
  meta: string
}

interface AgendaGroup {
  date: string
  /** 今天 / 明天 / 后天；其它日期为空串 */
  relative: string
  today: boolean
  /** M/D */
  short: string
  /** 周三 */
  weekday: string
  week: number | null
  /** 校历标签，如“放假”“按周一”；没有则为空串 */
  label: string
  labelClass: string
  /** 放假 / 考试周 */
  suspended: boolean
  rows: AgendaRow[]
}

const RELATIVE_LABELS = ['今天', '明天', '后天']

const STATUS_CLASSES: Record<string, string> = {
  canceled: 'text-red-400',
  checked_in: 'text-green-600',
  applied: 'text-blue-500',
}

function localIsoDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** `YYYY-MM-DD` -> 自 1970-01-01 起的天数；无法解析时为 NaN */
function dayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(part => Number(part))
  if (!year || !month || !day)
    return Number.NaN
  return Math.round(Date.UTC(year, month - 1, day) / 86400000)
}

const todayNumber = computed(() => dayNumber(props.today || localIsoDate()))

function relativeLabel(iso: string): string {
  const diff = dayNumber(iso) - todayNumber.value
  return Number.isNaN(diff) ? '' : RELATIVE_LABELS[diff] ?? ''
}

function toRow(occurrence: Occurrence): AgendaRow {
  const color = colorForOccurrence(occurrence)
  return {
    occurrence,
    start: clockOf(occurrence.start),
    end: clockOf(occurrence.end),
    barStyle: `background-color: ${color.fg}`,
    badge: KIND_BADGES[occurrence.kind] ?? '',
    badgeStyle: `background-color: ${color.bg}; color: ${color.fg}`,
    status: STATUS_LABELS[occurrence.status] ?? '',
    statusClass: STATUS_CLASSES[occurrence.status] ?? 'text-gray-400',
    canceled: occurrence.status === 'canceled',
    meta: [occurrence.location, occurrence.subtitle].filter(Boolean).join(' · '),
  }
}

const groups = computed<AgendaGroup[]>(() => props.days.map((day) => {
  const relative = relativeLabel(day.date)
  return {
    date: day.date,
    relative,
    today: relative === RELATIVE_LABELS[0],
    short: shortDate(day.date),
    weekday: `周${WEEKDAY_LABELS[day.weekday - 1] ?? ''}`,
    week: day.week,
    label: day.label ?? '',
    labelClass: calendarLabelClass(day.kind),
    suspended: suspendsClasses(day.kind),
    rows: [...day.occurrences]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(toRow),
  }
}))

const isEmpty = computed(() => props.days.every(day => day.occurrences.length === 0))
</script>

<template>
  <view>
    <view v-if="loading && days.length === 0" class="flex items-center justify-center py-8 text-xs text-gray-400">
      加载日程中…
    </view>
    <view v-else-if="isEmpty" class="py-8">
      <slot name="empty">
        <view class="flex flex-col items-center text-gray-400">
          <text class="i-carbon-calendar text-4xl text-gray-200" />
          <text class="mt-2 text-sm">这几天没有日程</text>
        </view>
      </slot>
    </view>
    <view v-else class="mt-1">
      <view v-for="group in groups" :key="group.date" class="mb-3">
        <!-- 日期头：点击进入当天的日视图 -->
        <view class="flex items-center gap-2 py-1.5 active:opacity-70" @click="emit('openDay', group.date)">
          <text
            v-if="group.relative"
            class="rounded-full px-2 py-0.5 text-2xs font-medium"
            :class="group.today ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'"
          >
            {{ group.relative }}
          </text>
          <text class="text-sm font-medium" :class="group.today ? 'text-blue-700' : 'text-gray-800'">
            {{ group.short }} {{ group.weekday }}
          </text>
          <text v-if="group.week" class="text-2xs text-gray-400">第 {{ group.week }} 周</text>
          <text v-if="group.label" class="truncate text-2xs" :class="group.labelClass">{{ group.label }}</text>
          <view class="flex-1" />
          <view class="i-carbon-chevron-right text-sm text-gray-300" />
        </view>

        <view v-if="group.rows.length" class="overflow-hidden rounded-xl bg-white shadow-sm">
          <view
            v-for="(row, index) in group.rows"
            :key="row.occurrence.id"
            class="flex items-stretch gap-3 px-3 py-2.5 active:bg-gray-50"
            :class="{ 'border-b border-gray-50': index < group.rows.length - 1 }"
            @click="emit('select', row.occurrence)"
          >
            <view class="w-11 shrink-0 text-center">
              <text class="block text-sm text-gray-800 font-medium">{{ row.start }}</text>
              <text class="block text-2xs text-gray-400">{{ row.end }}</text>
            </view>
            <view class="w-1 shrink-0 rounded-full" :style="row.barStyle" />
            <view class="min-w-0 flex-1">
              <view class="flex items-center gap-1.5">
                <text
                  class="min-w-0 flex-1 truncate text-sm text-gray-900 font-medium"
                  :class="{ 'line-through text-gray-400': row.canceled }"
                >
                  {{ row.occurrence.title }}
                </text>
                <text v-if="row.badge" class="shrink-0 rounded px-1.5 py-0.5 text-3xs" :style="row.badgeStyle">
                  {{ row.badge }}
                </text>
              </view>
              <text v-if="row.meta" class="mt-0.5 block truncate text-xs text-gray-500">{{ row.meta }}</text>
              <text v-if="row.status" class="mt-0.5 block text-2xs" :class="row.statusClass">{{ row.status }}</text>
            </view>
          </view>
        </view>
        <view
          v-else
          class="rounded-xl bg-white px-3 py-2.5 text-xs shadow-sm"
          :class="group.suspended ? 'text-gray-300' : 'text-gray-400'"
        >
          没有日程
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
</style>
