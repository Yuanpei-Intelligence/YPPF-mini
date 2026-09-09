<script lang="ts" setup>
import type { Occurrence, Term, TermsOut, WeekView } from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import type { DetailAction, DetailActionKey, PaletteColor } from '@/utils/timetable'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getTerms, getWeek, updateEntry } from '@/api/timetable'
import { useApiException } from '@/hooks/useApiException'
import { confirmModal } from '@/utils/dialog'
import {
  addDays,
  calendarLabelClass,
  chineseDate,
  clockOf,
  colorForOccurrence,
  dayInfoOf,
  daysBetween,
  describeOccurrenceTime,
  describeSections,
  detailActionsFor,
  isIsoDate,
  KIND_BADGES,
  KIND_LABELS,
  locateDate,
  readLocalHiddenIds,
  readShowHidden,
  saveLocalHiddenIds,
  STATUS_LABELS,
  suspendsClasses,
  todayIso,
  WEEKDAY_LABELS,
  weekdayOf,
} from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '日程',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
    enablePullDownRefresh: true,
  },
})

/** 横向滑动切换日期的最小位移（px） */
const SWIPE_MIN_DISTANCE = 60

interface PopupInstance {
  open: () => void
  close: () => void
}

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
const showHidden = ref(readShowHidden())
const localHiddenIds = ref<string[]>(readLocalHiddenIds())
const detail = ref<Occurrence | null>(null)
const detailPopup = ref<PopupInstance | null>(null)
const hiding = ref(false)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

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

const headline = computed(() => {
  const parts = [`${chineseDate(date.value)} 周${WEEKDAY_LABELS[weekdayOf(date.value) - 1] ?? ''}`]
  if (inTerm.value && target.value)
    parts.push(`第${target.value.week}周`)
  return parts.join(' · ')
})

/** 标题下方一行：校历标签优先，其次学期名 */
const subline = computed(() => {
  if (calendarLabel.value)
    return { text: calendarLabel.value, cls: calendarClass.value }
  if (noTerm.value)
    return { text: '暂无可用学期', cls: 'text-gray-400' }
  if (termsOut.value && !inTerm.value)
    return { text: '不在学期教学周内', cls: 'text-gray-400' }
  return { text: term.value?.name ?? '', cls: 'text-gray-400' }
})

const localHiddenSet = computed(() => new Set(localHiddenIds.value))

function isHidden(occurrence: Occurrence) {
  return occurrence.hidden || localHiddenSet.value.has(occurrence.id)
}

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
      end: clockOf(occurrence.end),
      sections: describeSections(occurrence.start_section, occurrence.end_section),
      badge: KIND_BADGES[occurrence.kind] ?? '',
      status: STATUS_LABELS[occurrence.status] ?? '',
      hidden: isHidden(occurrence),
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

const detailColor = computed(() => (detail.value ? colorForOccurrence(detail.value) : null))
const detailTime = computed(() => (detail.value ? describeOccurrenceTime(detail.value) : ''))
const detailStatus = computed(() => (detail.value ? STATUS_LABELS[detail.value.status] ?? '' : ''))
const detailHidden = computed(() => !!detail.value && isHidden(detail.value))
const detailActions = computed<DetailAction[]>(() =>
  (detail.value ? detailActionsFor(detail.value, detailHidden.value) : []),
)

function openDetail(occurrence: Occurrence) {
  detail.value = occurrence
  detailPopup.value?.open()
}

function closeDetail() {
  detailPopup.value?.close()
}

async function setHidden(item: Occurrence, hidden: boolean) {
  if (hiding.value)
    return
  if (hidden) {
    const ok = await confirmModal({
      title: '隐藏日程',
      content: '隐藏后它不再显示在课表中；可在「导入与设置」里打开“显示已隐藏的日程”恢复。',
      confirmText: '隐藏',
    })
    if (!ok)
      return
  }
  const entryId = item.ref.entry_id
  hiding.value = true
  try {
    if (typeof entryId === 'number') {
      // 有存储条目的日程由服务端记录隐藏状态
      await updateEntry(entryId, { hidden })
    }
    else {
      const next = hidden
        ? Array.from(new Set([...localHiddenIds.value, item.id]))
        : localHiddenIds.value.filter(id => id !== item.id)
      localHiddenIds.value = next
      saveLocalHiddenIds(next)
    }
  }
  catch (error) {
    handleApiException(error)
    return
  }
  finally {
    hiding.value = false
  }
  closeDetail()
  void refresh()
}

async function handleDetailAction(action: DetailActionKey) {
  const item = detail.value
  if (!item)
    return
  switch (action) {
    case 'activity': {
      const activityId = item.ref.activity_id
      if (typeof activityId === 'number' && activityId > 0) {
        closeDetail()
        uni.navigateTo({ url: `/pages/activity/detail?id=${activityId}` })
      }
      else {
        showMessage('本周活动尚未发布', 'warning')
      }
      return
    }
    case 'appoint':
      closeDetail()
      uni.navigateTo({ url: '/pages/me/my-appointments' })
      return
    case 'edit': {
      const entryId = item.ref.entry_id
      if (typeof entryId !== 'number' || !view.value) {
        showMessage('该日程无法编辑', 'warning')
        return
      }
      closeDetail()
      uni.navigateTo({ url: `/pages/timetable/entry-form?id=${entryId}&term=${encodeURIComponent(view.value.term.code)}` })
      return
    }
    case 'hide':
      await setHidden(item, true)
      return
    case 'unhide':
      await setHidden(item, false)
  }
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
  showHidden.value = readShowHidden()
  localHiddenIds.value = readLocalHiddenIds()
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
  <view class="min-h-screen bg-gray-50 pb-10" @touchstart="onTouchStart" @touchend="onTouchEnd">
    <uv-toast ref="toastRef" />
    <!-- 日期头 -->
    <view class="sticky top-0 z-10 bg-white px-3 py-2 shadow-sm">
      <view class="flex items-center gap-1">
        <view class="shrink-0 rounded-full p-1.5 active:bg-gray-100" @click="goDay(-1)">
          <view class="i-carbon-chevron-left text-lg text-gray-600" />
        </view>
        <view class="min-w-0 flex-1 text-center">
          <text class="block text-base text-gray-900 font-bold">{{ headline }}</text>
          <!-- 副标题行常驻占位，标题不随内容跳动 -->
          <text class="block min-h-28rpx truncate text-2xs" :class="subline.cls">
            {{ subline.text }}<text v-if="loading && ready"> · 更新中…</text>
          </text>
        </view>
        <view class="shrink-0 rounded-full p-1.5 active:bg-gray-100" @click="goDay(1)">
          <view class="i-carbon-chevron-right text-lg text-gray-600" />
        </view>
        <view
          v-if="!isToday"
          class="ml-1 shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-600 active:bg-blue-100"
          @click="goToday"
        >
          回到今天
        </view>
      </view>
    </view>

    <!-- 首次加载 / 换周加载 / 加载失败 -->
    <view v-if="!ready && loading" class="flex flex-col items-center justify-center py-24 text-sm text-gray-400">
      <uv-loading-icon mode="circle" />
      <text class="mt-3">正在加载…</text>
    </view>
    <view v-else-if="!ready && loadError" class="flex flex-col items-center justify-center px-8 py-24 text-center">
      <text class="i-carbon-warning-alt mb-3 text-3xl text-gray-300" />
      <text class="text-sm text-gray-500 leading-6">{{ loadError }}</text>
      <button class="mt-5 rounded-lg bg-blue-500 px-6 py-2 text-sm text-white" @click="ensureView()">
        重试
      </button>
    </view>

    <!-- 当天日程 -->
    <template v-else-if="ready || noTerm">
      <view v-if="rows.length === 0" class="flex flex-col items-center justify-center px-8 py-24 text-center">
        <text class="i-carbon-calendar text-4xl text-gray-200" />
        <text class="mt-2 text-sm leading-6" :class="dayOff ? calendarClass : 'text-gray-400'">
          {{ emptyText }}
        </text>
      </view>
      <view v-else class="px-3 pt-3">
        <view
          v-for="row in rows"
          :key="row.occurrence.id"
          class="mb-3 flex overflow-hidden rounded-xl bg-white shadow-sm active:bg-gray-50"
          :class="{ 'opacity-50': row.hidden }"
          @click="openDetail(row.occurrence)"
        >
          <view class="w-1.5 shrink-0" :style="{ backgroundColor: row.color.fg }" />
          <view class="w-20 shrink-0 py-3 pl-3">
            <text class="block text-sm text-gray-900 font-medium">{{ row.start }}</text>
            <text class="block text-xs text-gray-400">{{ row.end }}</text>
            <text v-if="row.sections" class="mt-1 block text-3xs text-gray-400">{{ row.sections }}</text>
          </view>
          <view class="min-w-0 flex-1 py-3 pr-3">
            <view class="flex items-start gap-2">
              <text
                class="min-w-0 flex-1 text-sm text-gray-900 font-medium leading-5"
                :class="{ 'line-through text-gray-400': row.occurrence.status === 'canceled' }"
              >
                {{ row.occurrence.title }}
              </text>
              <text
                v-if="row.badge"
                class="shrink-0 rounded px-1.5 text-3xs text-white leading-5"
                :style="{ backgroundColor: row.color.fg }"
              >
                {{ row.badge }}
              </text>
            </view>
            <text v-if="row.occurrence.subtitle" class="mt-1 block text-xs text-gray-500">{{ row.occurrence.subtitle }}</text>
            <view v-if="row.occurrence.location" class="mt-1 flex items-center text-xs text-gray-500">
              <text class="i-carbon-location mr-1 shrink-0 text-sm text-gray-400" />
              <text class="min-w-0 flex-1 truncate">{{ row.occurrence.location }}</text>
            </view>
            <view v-if="row.status || row.hidden" class="mt-1.5 flex flex-wrap gap-1.5">
              <text v-if="row.status" class="rounded-full bg-gray-100 px-2 text-3xs text-gray-600 leading-5">{{ row.status }}</text>
              <text v-if="row.hidden" class="rounded-full bg-gray-100 px-2 text-3xs text-gray-500 leading-5">已隐藏</text>
            </view>
          </view>
        </view>
      </view>
    </template>
  </view>

  <!-- 日程详情 -->
  <uv-popup ref="detailPopup" mode="bottom" :round="16" :safe-area-inset-bottom="true">
    <view v-if="detail" class="px-5 pb-6 pt-5">
      <view class="flex items-start gap-3">
        <view
          class="mt-1 h-10 w-1.5 shrink-0 rounded-full"
          :style="{ backgroundColor: detailColor?.fg }"
        />
        <view class="min-w-0 flex-1">
          <text class="block text-lg text-gray-900 font-bold leading-6">{{ detail.title }}</text>
          <text v-if="detail.subtitle" class="mt-1 block text-sm text-gray-500">{{ detail.subtitle }}</text>
        </view>
        <view class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {{ KIND_LABELS[detail.kind] }}
        </view>
      </view>

      <view class="mt-4 text-sm text-gray-600 space-y-2">
        <view class="flex items-start gap-2">
          <text class="i-carbon-time mt-0.5 text-base text-gray-400" />
          <text class="flex-1">{{ detailTime }}</text>
        </view>
        <view v-if="detail.location" class="flex items-start gap-2">
          <text class="i-carbon-location mt-0.5 text-base text-gray-400" />
          <text class="flex-1">{{ detail.location }}</text>
        </view>
        <view v-if="detailStatus" class="flex items-start gap-2">
          <text class="i-carbon-information mt-0.5 text-base text-gray-400" />
          <text class="flex-1">{{ detailStatus }}</text>
        </view>
        <view v-if="detailHidden" class="flex items-start gap-2">
          <text class="i-carbon-view-off mt-0.5 text-base text-gray-400" />
          <text class="flex-1">已隐藏</text>
        </view>
      </view>

      <view class="mt-5 flex gap-3">
        <button
          v-for="action in detailActions"
          :key="action.key"
          class="flex-1 rounded-lg py-2.5 text-sm font-medium"
          :class="action.primary ? 'bg-blue-500 text-white' : 'border border-gray-200 bg-white text-gray-700'"
          :disabled="hiding"
          @click="handleDetailAction(action.key)"
        >
          {{ action.label }}
        </button>
      </view>
    </view>
  </uv-popup>
</template>

<style lang="scss" scoped>
button::after {
  border: none;
}
</style>
