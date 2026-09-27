<script lang="ts" setup>
import type { Occurrence, Term, TermsOut, WeekView } from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import type { DetailSheetInstance } from '@/hooks/useOccurrenceDetail'
import type { PaletteColor } from '@/utils/timetable'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getTerms, getWeek } from '@/api/timetable'
import OccurrenceDetailSheet from '@/components/OccurrenceDetailSheet.vue'
import { useApiException } from '@/hooks/useApiException'
import { useOccurrenceDetail } from '@/hooks/useOccurrenceDetail'
import {
  addDays,
  AUDIT_BADGE,
  calendarLabelClass,
  chineseDate,
  clockOf,
  colorForOccurrence,
  dayInfoOf,
  daysBetween,
  describeSections,
  displayEndClock,
  EXAM_WEEK_LABEL,
  isExamWeek,
  isIsoDate,
  isSuspended,
  KIND_BADGES,
  locateDate,
  STATUS_LABELS,
  suspendsClasses,
  swapNote,
  todayIso,
  WEEKDAY_LABELS,
  weekdayOf,
} from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '日程',
    enablePullDownRefresh: true,
  },
})

/** 横向滑动切换日期的最小位移（px） */
const SWIPE_MIN_DISTANCE = 60

/** 列表里一行的展示数据 */
interface DayRow {
  occurrence: Occurrence
  color: PaletteColor
  start: string
  end: string
  sections: string
  badge: string
  status: string
  hidden: boolean
  /** 旁听 */
  audit: boolean
  tag: string
  /** 本次被调整过 */
  modified: boolean
  exam: boolean
  /** 校历停课日的课：字置灰，不划线 */
  suspended: boolean
  /** 调休搬来的课：「调休」 */
  swap: string
}

/** 这天要请求的周；inTerm=false 表示这天不在任何学期的教学周内，只是借当前学期兜底 */
interface WeekTarget {
  term: string
  week: number
  inTerm: boolean
}

interface TouchPoint {
  clientX: number
  clientY: number
}

/** 同时兼容 uni 的 TouchDetail[] 与 DOM 的 TouchList，只取按下 / 抬起的第一个触点 */
interface SwipeEvent {
  touches?: ArrayLike<TouchPoint>
  changedTouches?: ArrayLike<TouchPoint>
}

const date = ref(todayIso())
/** URL 带来的学期码，定位时优先考虑 */
const preferredTerm = ref('')
const termsOut = ref<TermsOut | null>(null)
const view = ref<WeekView | null>(null)
/** view 对应的 `term:week`，换天后据此判断要不要重新请求 */
const loadedKey = ref('')
const loading = ref(false)
const loadError = ref('')
const detailSheet = ref<DetailSheetInstance | null>(null)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
const {
  detail,
  entry: detailEntry,
  entryLoading: detailEntryLoading,
  entryError: detailEntryError,
  busy: detailBusy,
  showHidden,
  detailHidden,
  isHidden,
  reloadLocalPrefs,
  openDetail,
  handleDetailAction,
  handleDetailEdit,
  detailCalendarDay,
} = useOccurrenceDetail(detailSheet, {
  termCode: () => view.value?.term.code,
  calendarDay: occurrence => dayInfoOf(view.value, occurrence.date),
  onChanged: () => refresh(),
  handleApiException,
  showMessage,
})

/** 这天落在哪个学期的第几周；不在任何学期内时借当前学期（周次夹到 1..total_weeks） */
const target = computed<WeekTarget | null>(() => {
  const data = termsOut.value
  if (!data)
    return null
  const located = locateDate(data.terms, date.value, preferredTerm.value || undefined)
  if (located)
    return { term: located.term.code, week: located.week, inTerm: true }
  const fallback = data.current
  if (!fallback)
    return null
  const diff = daysBetween(fallback.week1_monday, date.value) ?? 0
  const week = Math.min(Math.max(Math.floor(diff / 7) + 1, 1), Math.max(fallback.total_weeks, 1))
  return { term: fallback.code, week, inTerm: false }
})
const targetKey = computed(() => (target.value ? `${target.value.term}:${target.value.week}` : ''))
/** 已经拿到这天所在周的数据 */
const ready = computed(() => !!view.value && !!targetKey.value && loadedKey.value === targetKey.value)
/** 学期列表已加载但没有任何可用学期 */
const noTerm = computed(() => !!termsOut.value && !target.value)
const inTerm = computed(() => !!target.value?.inTerm)
const term = computed<Term | null>(() => (ready.value && view.value ? view.value.term : null))
const today = computed(() => view.value?.today.date ?? todayIso())
const isToday = computed(() => date.value === today.value)
const info = computed(() => (ready.value ? dayInfoOf(view.value, date.value) : null))
const calendarLabel = computed(() => info.value?.label ?? '')
const calendarClass = computed(() => calendarLabelClass(info.value?.kind))
/** 放假 / 考试周：这天没有课 */
const dayOff = computed(() => suspendsClasses(info.value?.kind))
/** 考试周（week ≥ exam_week_start），校历没有标签时在副标题里提示 */
const examWeek = computed(() => inTerm.value && isExamWeek(term.value, target.value?.week))

const headline = computed(() => {
  const parts = [`${chineseDate(date.value)} 周${WEEKDAY_LABELS[weekdayOf(date.value) - 1] ?? ''}`]
  if (inTerm.value && target.value)
    parts.push(`第 ${target.value.week} 周`)
  return parts.join(' · ')
})

/** 标题下方一行：校历标签优先，其次考试周，再次学期名 */
const subline = computed(() => {
  if (calendarLabel.value)
    return { text: calendarLabel.value, cls: calendarClass.value }
  if (noTerm.value)
    return { text: '暂无可用学期', cls: 'text-fg-3' }
  if (termsOut.value && !inTerm.value)
    return { text: '不在学期教学周内', cls: 'text-fg-3' }
  if (examWeek.value)
    return { text: `${EXAM_WEEK_LABEL} · ${term.value?.name ?? ''}`, cls: 'text-warning' }
  return { text: term.value?.name ?? '', cls: 'text-fg-3' }
})

const rows = computed<DayRow[]>(() => {
  if (!ready.value || !view.value)
    return []
  return view.value.occurrences
    .filter(item => item.date === date.value && (showHidden.value || !isHidden(item)))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
    .map(occurrence => ({
      occurrence,
      color: colorForOccurrence(occurrence),
      start: clockOf(occurrence.start),
      end: displayEndClock(occurrence),
      sections: describeSections(occurrence.start_section, occurrence.end_section),
      badge: KIND_BADGES[occurrence.kind] ?? '',
      status: STATUS_LABELS[occurrence.status] ?? '',
      hidden: isHidden(occurrence),
      audit: occurrence.role === 'audit',
      tag: occurrence.tag ?? '',
      modified: !!occurrence.modified,
      exam: occurrence.kind === 'exam',
      suspended: isSuspended(occurrence),
      swap: swapNote(occurrence),
    }))
})

/** 空状态：停课日显示校历原因，不在学期内说明没有课表数据 */
const emptyText = computed(() => {
  if (noTerm.value)
    return '当前没有可用的学期'
  if (!inTerm.value)
    return '这天不在学期教学周内，没有课表数据'
  if (dayOff.value)
    return calendarLabel.value || (info.value?.kind === 'exam' ? '考试周' : '放假')
  return '这天没有日程'
})

let requestSeq = 0

/**
 * 确保 view 是这天所在的周：学期列表只取一次，同一周内换天不再请求。
 * silent：出错时不清掉已有数据；force：即使同一周也重新请求
 */
async function ensureView(options: { silent?: boolean, force?: boolean } = {}) {
  const seq = ++requestSeq
  loading.value = true
  if (!options.silent)
    loadError.value = ''
  try {
    if (!termsOut.value)
      termsOut.value = await getTerms()
    if (seq !== requestSeq)
      return
    const next = target.value
    if (!next)
      return
    const key = `${next.term}:${next.week}`
    if (!options.force && key === loadedKey.value)
      return
    const data = await getWeek({ term: next.term, week: next.week })
    if (seq !== requestSeq)
      return
    view.value = data
    loadedKey.value = key
    loadError.value = ''
  }
  catch (error) {
    if (seq !== requestSeq)
      return
    // 已有这天的数据时只 toast，否则整页报错
    const requestError = handleApiException(error, { showToast: ready.value })
    if (!ready.value)
      loadError.value = requestError.message
  }
  finally {
    if (seq === requestSeq)
      loading.value = false
  }
}

function refresh() {
  return ensureView({ silent: true, force: true })
}

function goDay(delta: number) {
  date.value = addDays(date.value, delta)
  void ensureView()
}

function goToday() {
  if (isToday.value)
    return
  date.value = today.value
  void ensureView()
}

let touchStart: TouchPoint | null = null

function onTouchStart(event: SwipeEvent) {
  const point = event.touches?.[0]
  touchStart = point ? { clientX: point.clientX, clientY: point.clientY } : null
}

function onTouchEnd(event: SwipeEvent) {
  const start = touchStart
  touchStart = null
  const point = event.changedTouches?.[0]
  if (!start || !point)
    return
  const dx = point.clientX - start.clientX
  const dy = point.clientY - start.clientY
  // 明显的横向滑动才切换日期，避免和纵向滚动打架
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5)
    return
  goDay(dx < 0 ? 1 : -1)
}

let shownBefore = false

onLoad((options) => {
  const raw = options?.date ?? ''
  // 日期参数缺失或无效时显示今天
  date.value = isIsoDate(raw) ? raw : todayIso()
  preferredTerm.value = options?.term ? decodeURIComponent(options.term) : ''
  void ensureView()
})

onShow(() => {
  // 导入页可能改了本机隐藏偏好；从其它页（编辑、活动详情）返回时刷新数据
  reloadLocalPrefs()
  if (shownBefore)
    void refresh()
  shownBefore = true
})

onPullDownRefresh(async () => {
  await refresh()
  uni.stopPullDownRefresh()
})
</script>

<template>
  <view class="min-h-screen bg-page pb-10" @touchstart="onTouchStart" @touchend="onTouchEnd">
    <uv-toast ref="toastRef" />
    <!-- 日期头 -->
    <view class="sticky top-0 z-10 bg-card px-3 py-2 shadow-card">
      <view class="flex items-center gap-1">
        <view class="shrink-0 rounded-full p-1.5 active:bg-fill" @click="goDay(-1)">
          <view class="i-carbon-chevron-left text-lg text-fg-2" />
        </view>
        <view class="min-w-0 flex-1 text-center">
          <text class="block text-base text-fg-1 font-bold">{{ headline }}</text>
          <!-- 副标题行常驻占位，标题不随内容跳动 -->
          <text class="block min-h-28rpx truncate text-2xs" :class="subline.cls">
            {{ subline.text }}<text v-if="loading && ready"> · 更新中…</text>
          </text>
        </view>
        <view class="shrink-0 rounded-full p-1.5 active:bg-fill" @click="goDay(1)">
          <view class="i-carbon-chevron-right text-lg text-fg-2" />
        </view>
        <view
          v-if="!isToday"
          class="ml-1 shrink-0 rounded-full bg-primary-light px-2 py-1 text-xs text-primary active:opacity-70"
          @click="goToday"
        >
          回到今天
        </view>
      </view>
    </view>

    <!-- 首次加载 / 换周加载 / 加载失败 -->
    <PageState
      v-if="!ready && (loading || loadError)"
      :loading="loading"
      :error="loadError"
      loading-text="正在加载…"
      @retry="ensureView()"
    />

    <!-- 当天日程 -->
    <template v-else-if="ready || noTerm">
      <view v-if="rows.length === 0" class="flex flex-col items-center justify-center px-8 py-24 text-center">
        <text class="i-carbon-calendar text-4xl text-fg-4" />
        <text class="mt-2 text-sm leading-6" :class="dayOff ? calendarClass : 'text-fg-3'">
          {{ emptyText }}
        </text>
      </view>
      <view v-else class="px-3 pt-3">
        <view
          v-for="row in rows"
          :key="row.occurrence.id"
          class="mb-3 flex overflow-hidden rounded-lg shadow-card active:bg-fill"
          :class="[row.hidden ? 'opacity-50' : '', row.exam ? 'bg-error-light' : 'bg-card']"
          @click="openDetail(row.occurrence)"
        >
          <view class="w-1.5 shrink-0" :style="{ backgroundColor: row.color.fg }" />
          <view class="w-20 shrink-0 py-3 pl-3">
            <text class="block text-sm font-medium" :class="row.suspended ? 'text-fg-3' : 'text-fg-1'">{{ row.start }}</text>
            <text class="block text-xs text-fg-3">{{ row.end }}</text>
            <text v-if="row.sections" class="mt-1 block text-2xs text-fg-3">{{ row.sections }}</text>
          </view>
          <view class="min-w-0 flex-1 py-3 pr-3">
            <view class="flex items-start gap-2">
              <text
                class="min-w-0 flex-1 text-sm font-medium leading-5"
                :class="[row.occurrence.status === 'canceled' ? 'line-through text-fg-3' : row.suspended ? 'text-fg-3' : row.exam ? 'text-error-dark' : 'text-fg-1']"
              >
                {{ row.occurrence.title }}
              </text>
              <text
                v-if="row.audit"
                class="shrink-0 rounded-sm bg-warning px-1.5 text-2xs text-white leading-5"
              >
                {{ AUDIT_BADGE }}
              </text>
              <text
                v-if="row.badge"
                class="shrink-0 rounded-sm px-1.5 text-2xs text-white leading-5"
                :style="{ backgroundColor: row.color.fg }"
              >
                {{ row.badge }}
              </text>
            </view>
            <text v-if="row.occurrence.subtitle" class="mt-1 block text-xs text-fg-2">{{ row.occurrence.subtitle }}</text>
            <view v-if="row.occurrence.location" class="mt-1 flex items-center text-xs text-fg-2">
              <text class="i-carbon-location mr-1 shrink-0 text-sm text-fg-3" />
              <text class="min-w-0 flex-1 truncate">{{ row.occurrence.location }}</text>
            </view>
            <view v-if="row.status || row.swap || row.hidden || row.tag || row.modified" class="mt-1.5 flex flex-wrap gap-1.5">
              <text v-if="row.tag" class="rounded-full bg-primary-light px-2 text-2xs text-primary leading-5">{{ row.tag }}</text>
              <text v-if="row.modified" class="rounded-full bg-warning-light px-2 text-2xs text-warning leading-5">本次已调整</text>
              <text v-if="row.status" class="rounded-full bg-fill px-2 text-2xs text-fg-2 leading-5">{{ row.status }}</text>
              <text v-if="row.swap" class="rounded-full bg-fill px-2 text-2xs text-primary leading-5">{{ row.swap }}</text>
              <text v-if="row.hidden" class="rounded-full bg-fill px-2 text-2xs text-fg-3 leading-5">已隐藏</text>
            </view>
          </view>
        </view>
      </view>
    </template>
  </view>

  <!-- 日程详情 -->
  <OccurrenceDetailSheet
    ref="detailSheet"
    :occurrence="detail"
    :entry="detailEntry"
    :entry-loading="detailEntryLoading"
    :entry-error="detailEntryError"
    :hidden="detailHidden"
    :busy="detailBusy"
    :calendar-day="detailCalendarDay"
    @action="handleDetailAction"
    @edit="handleDetailEdit"
  />
</template>
