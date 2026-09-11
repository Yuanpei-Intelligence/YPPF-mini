<script lang="ts" setup>
import type { AgendaDay } from '@/api/types/agenda'
import type { Occurrence } from '@/api/types/timetable'
import { computed } from 'vue'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import {
  AUDIT_BADGE,
  calendarLabelClass,
  clockOf,
  colorForOccurrence,
  displayEndClock,
  isSuspended,
  KIND_BADGES,
  STATUS_CLASSES,
  STATUS_LABELS,
  suspendsClasses,
  swapNote,
  WEEKDAY_LABELS,
} from '@/utils/timetable'

/*
 * 按日期分组的日程时间线（首页「我的日程」等处使用）。
 * 只负责展示：不请求数据、不知道路由；点击日期头和日程行分别通过 openDay / select 交给父页面处理。
 */

const props = withDefaults(defineProps<{
  days: AgendaDay[]
  /** 正在加载：没有数据时显示加载态，已有数据时保留列表 */
  loading?: boolean
  /** “今天”的 ISO 日期，用来标出 今天 / 明天 / 后天；缺省取本机日期 */
  today?: string
  /** 没有任何日程时的空态文案 */
  emptyText?: string
}>(), {
  loading: false,
  today: '',
  emptyText: '这几天没有日程',
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
  /** 来源色点，颜色与课表页同一门课一致 */
  pipStyle: string
  /** 书院课 / 活动 / 预约 / 考试；学校课程与自定义条目不打标 */
  badge: string
  badgeStyle: string
  status: string
  statusClass: string
  canceled: boolean
  /** 校历停课日的课：字置灰，不划线 */
  suspended: boolean
  /** 调休搬来的课：「调休」 */
  swap: string
  /** 地点 · 副标题 */
  meta: string
  /** 旁听 */
  audit: boolean
  tag: string
  exam: boolean
}

interface AgendaGroup {
  date: string
  /** 今天 / 明天 / 后天；其它日期为空串 */
  relative: string
  today: boolean
  /** 大号日数字 */
  dayNumber: string
  /** 9月 · 周四 · 第 1 周 */
  caption: string
  /** 校历标签，如“放假”“按周一”；没有则为空串 */
  label: string
  labelClass: string
  /** 放假 / 考试周 */
  suspended: boolean
  rows: AgendaRow[]
}

const RELATIVE_LABELS = ['今天', '明天', '后天']

/** 「调休」用校历调休的颜色 */
const SWAP_CLASS = calendarLabelClass('swap')

function localIsoDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** `YYYY-MM-DD` -> 自 1970-01-01 起的天数；无法解析时为 NaN */
function dayNumberOf(iso: string): number {
  const [year, month, day] = iso.split('-').map(part => Number(part))
  if (!year || !month || !day)
    return Number.NaN
  return Math.round(Date.UTC(year, month - 1, day) / 86400000)
}

const todayNumber = computed(() => dayNumberOf(props.today || localIsoDate()))

function relativeLabel(iso: string): string {
  const diff = dayNumberOf(iso) - todayNumber.value
  return Number.isNaN(diff) ? '' : RELATIVE_LABELS[diff] ?? ''
}

function toRow(occurrence: Occurrence): AgendaRow {
  const color = colorForOccurrence(occurrence)
  return {
    occurrence,
    start: clockOf(occurrence.start),
    end: displayEndClock(occurrence),
    pipStyle: `background-color: ${color.fg}`,
    badge: KIND_BADGES[occurrence.kind] ?? '',
    badgeStyle: `background-color: ${color.bg}; color: ${color.fg}`,
    status: STATUS_LABELS[occurrence.status] ?? '',
    statusClass: STATUS_CLASSES[occurrence.status] ?? 'text-fg-3',
    canceled: occurrence.status === 'canceled',
    suspended: isSuspended(occurrence),
    swap: swapNote(occurrence),
    meta: [occurrence.location, occurrence.subtitle].filter(Boolean).join(' · '),
    audit: occurrence.role === 'audit',
    tag: occurrence.tag ?? '',
    exam: occurrence.kind === 'exam',
  }
}

/** `YYYY-MM-DD` -> { month: '9月', day: '10' }；无法解析时 day 为原串 */
function splitDate(iso: string): { month: string, day: string } {
  const [, month, day] = iso.split('-')
  if (!month || !day)
    return { month: '', day: iso }
  return { month: `${Number(month)}月`, day: String(Number(day)) }
}

const groups = computed<AgendaGroup[]>(() => props.days.map((day) => {
  const relative = relativeLabel(day.date)
  const { month, day: dayNumber } = splitDate(day.date)
  const caption = [
    month,
    `周${WEEKDAY_LABELS[day.weekday - 1] ?? ''}`,
    day.week ? `第 ${day.week} 周` : '',
  ].filter(Boolean).join(' · ')
  return {
    date: day.date,
    relative,
    today: relative === RELATIVE_LABELS[0],
    dayNumber,
    caption,
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
  <PageState :loading="loading && days.length === 0" :empty="isEmpty" :empty-text="emptyText" empty-icon="i-carbon-calendar" compact>
    <template #action>
      <slot name="empty-action" />
    </template>
    <view>
      <view v-for="group in groups" :key="group.date" class="mt-4">
        <!-- 日期头：大号日数字 + 月份/星期/周次；点击进入当天的日视图 -->
        <view class="flex items-end gap-3 px-1 py-2 active:opacity-70" @click="emit('openDay', group.date)">
          <text
            class="text-3xl font-semibold leading-none tabular-nums"
            :class="group.today ? 'text-primary' : 'text-fg-1'"
          >
            {{ group.dayNumber }}
          </text>
          <view class="min-w-0 flex flex-1 flex-col gap-1 pb-1">
            <view class="flex items-center gap-2">
              <StatusTag v-if="group.relative" :type="group.today ? 'processing' : 'default'" :text="group.relative" />
              <text v-if="group.label" class="truncate text-2xs" :class="group.labelClass">{{ group.label }}</text>
            </view>
            <text class="truncate text-xs text-fg-3">{{ group.caption }}</text>
          </view>
          <view class="i-carbon-chevron-right mb-1 text-base text-fg-4" />
        </view>

        <view v-if="group.rows.length" class="overflow-hidden rounded-lg bg-card">
          <template v-for="(row, index) in group.rows" :key="row.occurrence.id">
            <view v-if="index > 0" class="yp-divider" />
            <view
              class="flex items-start gap-3 px-4 py-3 active:bg-fill"
              @click="emit('select', row.occurrence)"
            >
              <!-- 时间列：等宽数字，起止上下排列 -->
              <view class="w-88rpx shrink-0 pt-0.5">
                <text class="block text-sm font-medium leading-tight tabular-nums" :class="row.suspended ? 'text-fg-3' : 'text-fg-1'">{{ row.start }}</text>
                <text class="mt-1 block text-2xs text-fg-3 leading-tight tabular-nums">{{ row.end }}</text>
              </view>
              <!-- 来源色点，同一门课与课表页同色 -->
              <view class="mt-2.5 h-14rpx w-14rpx shrink-0 rounded-full" :style="row.pipStyle" />
              <view class="min-w-0 flex-1">
                <view class="flex items-center gap-2">
                  <text
                    class="min-w-0 flex-1 truncate text-base font-medium"
                    :class="[row.canceled ? 'line-through text-fg-3' : row.suspended ? 'text-fg-3' : row.exam ? 'text-error-dark' : 'text-fg-1']"
                  >
                    {{ row.occurrence.title }}
                  </text>
                  <text v-if="row.audit" class="shrink-0 rounded-sm bg-warning px-1 text-2xs text-white leading-relaxed">
                    {{ AUDIT_BADGE }}
                  </text>
                  <text v-if="row.tag" class="max-w-24 shrink-0 truncate rounded-sm bg-fill px-1.5 text-2xs text-fg-2 leading-relaxed">
                    {{ row.tag }}
                  </text>
                  <text v-if="row.badge" class="shrink-0 rounded-sm px-1.5 text-2xs leading-relaxed" :style="row.badgeStyle">
                    {{ row.badge }}
                  </text>
                </view>
                <text v-if="row.meta" class="mt-0.5 block truncate text-xs text-fg-3">{{ row.meta }}</text>
                <view v-if="row.status || row.swap" class="mt-0.5 flex items-center gap-2 text-2xs">
                  <text v-if="row.status" :class="row.statusClass">{{ row.status }}</text>
                  <text v-if="row.swap" :class="SWAP_CLASS">{{ row.swap }}</text>
                </view>
              </view>
            </view>
          </template>
        </view>
        <view v-else class="rounded-lg bg-card px-4 py-3 text-xs text-fg-3">
          {{ group.suspended ? (group.label || '停课') : '没有日程' }}
        </view>
      </view>
    </view>
  </PageState>
</template>
