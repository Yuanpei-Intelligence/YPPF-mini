<script lang="ts" setup>
import type { Occurrence, WeekView } from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import type { DetailSheetInstance } from '@/hooks/useOccurrenceDetail'
import type { PaletteColor, RowSpan, WeekPickerItem } from '@/utils/timetable'
import { onLoad, onPullDownRefresh, onShareAppMessage, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getWeek, listEntries } from '@/api/timetable'
import OccurrenceDetailSheet from '@/components/OccurrenceDetailSheet.vue'
import { useApiException } from '@/hooks/useApiException'
import { useClassReminder } from '@/hooks/useClassReminder'
import { useOccurrenceDetail } from '@/hooks/useOccurrenceDetail'
import { useTimetableSync } from '@/hooks/useTimetableSync'
import { useUserStore } from '@/store/user'
import {
  AUDIT_BADGE,
  cacheWeekView,
  CALENDAR_SHADE_CLASS,
  calendarLabelClass,
  colorForOccurrence,
  dayInfo,
  KIND_BADGES,
  occurrenceRowSpan,
  readCachedWeekView,
  sectionRows,
  shortDate,
  suspendsClasses,
  WEEKDAY_LABELS,
  weekHeaderMark,
  weekPickerItems,
  weekSuspendedReason,
} from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '我的课表',
    enablePullDownRefresh: true,
  },
})

/** 每一节在网格里的高度（rpx） */
const ROW_HEIGHT = 104
const COLUMN_WIDTH = 100 / 7

interface PopupInstance {
  open: () => void
  close: () => void
}

interface GridBlock {
  occurrence: Occurrence
  style: string
  badge: string
  badgeStyle: string
  /** 旁听 */
  audit: boolean
  /** 本次被调整过 */
  modified: boolean
  /** 标签；格子太矮时不显示 */
  tag: string
}

/** 表头一列（周一到周日）的展示数据 */
interface DayColumn {
  /** 一 … 日 */
  weekday: string
  /** M/D */
  date: string
  today: boolean
  /** 校历标签，如“放假”“按周一”；没有则为空串 */
  label: string
  labelClass: string
  /** 放假 / 考试周：整列置灰 */
  suspended: boolean
}

/** 周次选择器里的一格 */
interface WeekCell extends WeekPickerItem {
  cellClass: string
  rangeClass: string
  markClass: string
  dotClass: string
}

type AddActionKey = 'catalog' | 'manual' | 'import'

interface AddAction {
  name: string
  subname: string
  key: AddActionKey
}

const ADD_ACTIONS: AddAction[] = [
  { name: '从课程库添加', subname: '搜索本学期课程，一键加入旁听或已选课程', key: 'catalog' },
  { name: '手动添加', subname: '课程、考试、自习、社团例会等', key: 'manual' },
  { name: '导入课表', subname: '门户登录自动导入，或粘贴选课结果', key: 'import' },
]

const view = ref<WeekView | null>(null)
const loading = ref(false)
const loadError = ref('')
/** 用户通过 ‹ › 明确选择的周；null 表示跟随服务端的当前周 */
const selected = ref<{ term: string, week: number } | null>(null)
/** 本学期是否有任何存储条目；null 表示未知 */
const termHasEntries = ref<boolean | null>(null)
const detailSheet = ref<DetailSheetInstance | null>(null)
const weekPickerPopup = ref<PopupInstance | null>(null)
const addSheet = ref<PopupInstance | null>(null)
const { syncing, syncPortal } = useTimetableSync()
const { resubscribeSilently } = useClassReminder()
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
} = useOccurrenceDetail(detailSheet, {
  termCode: () => view.value?.term.code,
  onChanged: () => refresh(),
  handleApiException,
  showMessage,
})

const term = computed(() => view.value?.term ?? null)
const rows = computed(() => sectionRows(term.value))
const gridHeight = computed(() => rows.value.length * ROW_HEIGHT)
const weekDates = computed(() => view.value?.week_dates ?? [])

const visibleOccurrences = computed(() =>
  (view.value?.occurrences ?? []).filter(item => showHidden.value || !isHidden(item)),
)

/** 冲突分组里每个日程并排显示时的位置 */
const conflictSlots = computed(() => {
  const slots: Record<string, { index: number, count: number }> = {}
  const visibleIds = new Set(visibleOccurrences.value.map(item => item.id))
  for (const group of view.value?.conflicts ?? []) {
    const ids = group.filter(id => visibleIds.has(id))
    ids.forEach((id, index) => {
      slots[id] = { index, count: ids.length }
    })
  }
  return slots
})

function blockStyle(occurrence: Occurrence, color: PaletteColor, rowSpan: RowSpan) {
  const { top, span } = rowSpan
  const slot = conflictSlots.value[occurrence.id] ?? { index: 0, count: 1 }
  const column = Math.min(Math.max(occurrence.weekday, 1), 7) - 1
  const width = COLUMN_WIDTH / slot.count
  const left = column * COLUMN_WIDTH + slot.index * width
  // 自定义日程虚线框，考试实线红框，其余左侧色条
  let border = `border-left: 4rpx solid ${color.fg}`
  if (occurrence.kind === 'custom')
    border = `border: 2rpx dashed ${color.fg}`
  else if (occurrence.kind === 'exam')
    border = `border: 2rpx solid ${color.fg}`
  const parts = [
    `left: ${left.toFixed(3)}%`,
    `width: calc(${width.toFixed(3)}% - 4rpx)`,
    `top: ${(top * ROW_HEIGHT + 2).toFixed(1)}rpx`,
    `height: ${(span * ROW_HEIGHT - 4).toFixed(1)}rpx`,
    `background-color: ${color.bg}`,
    `color: ${color.fg}`,
    border,
  ]
  if (isHidden(occurrence))
    parts.push('opacity: 0.45')
  return parts.join('; ')
}

const blocks = computed<GridBlock[]>(() => visibleOccurrences.value.map((occurrence) => {
  const color = colorForOccurrence(occurrence)
  const rowSpan = occurrenceRowSpan(occurrence, rows.value)
  return {
    occurrence,
    style: blockStyle(occurrence, color, rowSpan),
    badge: KIND_BADGES[occurrence.kind] ?? '',
    badgeStyle: `background-color: ${color.fg}`,
    audit: occurrence.role === 'audit',
    modified: !!occurrence.modified,
    // 只占一节的格子放不下标签
    tag: rowSpan.span >= 2 ? (occurrence.tag ?? '') : '',
  }
}))

const canPrev = computed(() => !!view.value && view.value.week > 1)
const canNext = computed(() => !!view.value && view.value.week < view.value.term.total_weeks)
const isCurrentWeek = computed(() => !!view.value && view.value.today.week === view.value.week)
const weekRangeLabel = computed(() => {
  const dates = weekDates.value
  if (dates.length < 7)
    return ''
  return `${shortDate(dates[0])} – ${shortDate(dates[6])}`
})
/** 表头的周次标记：整周停课的校历原因，否则考试周 */
const weekMark = computed(() => weekHeaderMark(view.value))
const sourceLegend = computed(() => (view.value?.sources ?? []).map(item => item.label).join(' · '))

const dayColumns = computed<DayColumn[]>(() => WEEKDAY_LABELS.map((weekday, index) => {
  const iso = weekDates.value[index]
  const info = dayInfo(view.value, index)
  return {
    weekday,
    date: iso ? shortDate(iso) : '',
    today: !!view.value && !!iso && iso === view.value.today.date,
    label: info?.label ?? '',
    labelClass: calendarLabelClass(info?.kind),
    suspended: suspendsClasses(info?.kind),
  }
}))

/** 一周都停课时用校历原因代替“本周没有日程” */
const emptyText = computed(() => {
  if (termHasEntries.value === false)
    return '还没有导入课表'
  return weekSuspendedReason(view.value) || '本周没有日程'
})

function columnStyle(index: number) {
  return `left: ${(index * COLUMN_WIDTH).toFixed(3)}%; width: ${COLUMN_WIDTH.toFixed(3)}%`
}

/** 周次选择器：本周蓝底，正在显示的周描边，停课周标红，考试周标橙 */
const weekCells = computed<WeekCell[]>(() => {
  const current = view.value?.today.week ?? null
  const shown = view.value?.week ?? null
  return (term.value ? weekPickerItems(term.value) : []).map((item) => {
    const isCurrent = item.week === current
    const isShown = item.week === shown
    let cellClass = 'border-line-light bg-page text-fg-1'
    if (isCurrent)
      cellClass = isShown ? 'border-primary-disabled bg-primary text-white' : 'border-primary bg-primary text-white'
    else if (isShown)
      cellClass = 'border-primary bg-primary-light text-primary-dark'
    const examOnly = !item.suspended && item.exam
    let markClass = examOnly ? 'text-warning' : 'text-error'
    if (isCurrent)
      markClass = examOnly ? 'text-warning-light' : 'text-error-light'
    return {
      ...item,
      cellClass,
      rangeClass: isCurrent ? 'text-primary-light' : 'text-fg-3',
      markClass,
      dotClass: examOnly ? 'bg-warning' : 'bg-error',
    }
  })
})

const userStore = useUserStore()
let requestSeq = 0

async function loadWeek(target: { term: string, week: number } | null, options: { silent?: boolean } = {}) {
  const seq = ++requestSeq
  loading.value = true
  if (!options.silent)
    loadError.value = ''
  try {
    const data = await getWeek(target ?? undefined)
    if (seq !== requestSeq)
      return
    view.value = data
    loadError.value = ''
    // 只缓存当前周，下次打开先用它秒开
    if (target === null || data.week === data.today.week)
      cacheWeekView(userStore.userInfo.username, data)
    if (data.occurrences.length === 0)
      void checkTermEntries(data.term.code)
    else
      termHasEntries.value = true
  }
  catch (error) {
    if (seq !== requestSeq)
      return
    // 已有数据（含本机缓存）时只 toast，首屏失败才整页报错
    const requestError = handleApiException(error, { showToast: !!view.value })
    if (!view.value)
      loadError.value = requestError.message
  }
  finally {
    if (seq === requestSeq)
      loading.value = false
  }
}

async function checkTermEntries(termCode: string) {
  try {
    const entries = await listEntries({ term: termCode })
    termHasEntries.value = entries.length > 0
  }
  catch {
    termHasEntries.value = null
  }
}

function refresh() {
  return loadWeek(selected.value, { silent: true })
}

function goWeek(delta: number) {
  if (!view.value)
    return
  const next = view.value.week + delta
  if (next < 1 || next > view.value.term.total_weeks)
    return
  selected.value = { term: view.value.term.code, week: next }
  void loadWeek(selected.value)
}

function goCurrentWeek() {
  if (selected.value === null && isCurrentWeek.value)
    return
  selected.value = null
  void loadWeek(null)
}

function openWeekPicker() {
  if (!view.value)
    return
  weekPickerPopup.value?.open()
}

function pickWeek(week: number) {
  weekPickerPopup.value?.close()
  if (!view.value || week === view.value.week)
    return
  if (week === view.value.today.week) {
    // 回到本周时不记录选择，刷新后继续跟随服务端的当前周
    goCurrentWeek()
    return
  }
  selected.value = { term: view.value.term.code, week }
  void loadWeek(selected.value)
}

/** 点表头日期进入当天的日视图 */
function goDay(index: number) {
  const iso = weekDates.value[index]
  if (!iso || !view.value)
    return
  uni.navigateTo({ url: `/pages-timetable/day?date=${encodeURIComponent(iso)}&term=${encodeURIComponent(view.value.term.code)}` })
}

async function handleSync() {
  if (syncing.value)
    return
  const outcome = await syncPortal(view.value?.term.code)
  if (outcome.status === 'ok') {
    showMessage(`已同步 ${outcome.result.total} 门课程`, 'success')
    void refresh()
    return
  }
  if (outcome.status === 'login_required') {
    if (outcome.retried) {
      // 记住的密码重试失败：先让用户看到原因，再转到导入页重新登录（页内 toast 会被新页面盖住）
      handleApiException(outcome.error)
      setTimeout(() => uni.navigateTo({ url: '/pages-timetable/import' }), 1500)
    }
    else {
      uni.navigateTo({ url: '/pages-timetable/import' })
    }
    return
  }
  handleApiException(outcome.error)
}

function termQuery() {
  return view.value ? `term=${encodeURIComponent(view.value.term.code)}` : ''
}

function goImport(section?: 'settings') {
  uni.navigateTo({ url: section ? `/pages-timetable/import?section=${section}` : '/pages-timetable/import' })
}

function openAddSheet() {
  addSheet.value?.open()
}

function onAddSelect(item: AddAction) {
  const query = termQuery()
  switch (item.key) {
    case 'catalog':
      uni.navigateTo({ url: `/pages-timetable/catalog${query ? `?${query}` : ''}` })
      return
    case 'manual':
      uni.navigateTo({ url: `/pages-timetable/entry-form${query ? `?${query}` : ''}` })
      return
    case 'import':
      goImport()
  }
}

function goPoster() {
  if (!view.value)
    return
  uni.navigateTo({
    url: `/pages-timetable/poster?term=${encodeURIComponent(view.value.term.code)}&week=${view.value.week}`,
  })
}

function goGrades() {
  uni.navigateTo({ url: '/pages-timetable/grades' })
}

let shownBefore = false

onLoad(() => {
  const cached = readCachedWeekView(userStore.userInfo.username)
  if (cached)
    view.value = cached
  void loadWeek(null)
})

onShow(() => {
  // 导入页可能改了本机隐藏偏好；从其它页返回时刷新数据
  reloadLocalPrefs()
  if (shownBefore)
    void refresh()
  shownBefore = true
  // 提醒开关打开时再要一次微信订阅额度（每次允许只能发一条）；失败静默，不影响渲染
  void resubscribeSilently()
})

onPullDownRefresh(async () => {
  await refresh()
  uni.stopPullDownRefresh()
})

onShareAppMessage(() => ({
  title: '我的课表',
  path: '/pages/timetable/index',
}))
</script>

<template>
  <view class="min-h-screen bg-page pb-24">
    <uv-toast ref="toastRef" />
    <!-- 学期 + 周切换 -->
    <view class="sticky top-0 z-10 bg-card px-3 py-2 shadow-card">
      <view class="flex items-center justify-between gap-2">
        <view class="min-w-0 flex-1">
          <text class="block truncate text-sm text-fg-1 font-medium">{{ term?.name || '课表' }}</text>
          <view class="flex items-center gap-1 text-2xs text-fg-3">
            <text>{{ weekRangeLabel }}</text>
            <text v-if="weekMark" class="rounded-sm bg-error-light px-1 text-2xs text-error">{{ weekMark }}</text>
            <text v-if="loading && view">· 更新中…</text>
          </view>
        </view>
        <view class="flex shrink-0 items-center">
          <view
            class="rounded-full p-1.5 active:bg-fill"
            :class="{ 'opacity-30': !canPrev }"
            @click="goWeek(-1)"
          >
            <view class="i-carbon-chevron-left text-lg text-fg-2" />
          </view>
          <view
            class="min-w-14 flex items-center justify-center text-sm text-fg-1 font-bold active:opacity-60"
            @click="openWeekPicker"
          >
            <text>{{ view ? `第 ${view.week} 周` : '—' }}</text>
            <view v-if="view" class="i-carbon-chevron-down ml-0.5 text-xs text-fg-3" />
          </view>
          <view
            class="rounded-full p-1.5 active:bg-fill"
            :class="{ 'opacity-30': !canNext }"
            @click="goWeek(1)"
          >
            <view class="i-carbon-chevron-right text-lg text-fg-2" />
          </view>
          <view
            v-if="view && !isCurrentWeek"
            class="ml-1 rounded-full bg-primary-light px-2 py-1 text-xs text-primary active:opacity-70"
            @click="goCurrentWeek"
          >
            本周
          </view>
          <view
            class="ml-1 rounded-full p-1.5 text-primary active:bg-primary-light"
            :class="{ 'opacity-50': syncing }"
            @click="handleSync"
          >
            <view class="i-carbon-renew text-lg" />
          </view>
        </view>
      </view>
    </view>

    <!-- 首次加载 / 加载失败 -->
    <PageState
      v-if="!view && (loading || loadError)"
      :loading="loading"
      :error="loadError"
      loading-text="正在加载课表…"
      @retry="loadWeek(selected)"
    />

    <!-- 周视图网格 -->
    <view v-else-if="view" class="mx-2 mt-2 overflow-hidden rounded-lg bg-card shadow-card">
      <view class="flex border-b border-line-light">
        <view class="w-11 shrink-0" />
        <view
          v-for="(day, index) in dayColumns"
          :key="index"
          class="flex-1 py-1 text-center active:bg-fill"
          :class="day.today ? 'bg-primary-light' : day.suspended ? CALENDAR_SHADE_CLASS : ''"
          @click="goDay(index)"
        >
          <text class="block text-xs" :class="day.today ? 'text-primary font-bold' : 'text-fg-2'">
            周{{ day.weekday }}
          </text>
          <text class="block text-2xs" :class="day.today ? 'text-primary' : 'text-fg-3'">
            {{ day.date }}
          </text>
          <!-- 校历标签行常驻占位，表头高度不随周次变化 -->
          <text class="block min-h-26rpx truncate px-0.5 text-2xs" :class="day.labelClass">
            {{ day.label }}
          </text>
        </view>
      </view>

      <view class="flex">
        <view class="w-11 shrink-0">
          <view
            v-for="row in rows"
            :key="row.section"
            class="flex flex-col items-center justify-center border-b border-line-light"
            :style="{ height: `${ROW_HEIGHT}rpx` }"
          >
            <text class="text-xs text-fg-2 font-medium">{{ row.section }}</text>
            <text class="text-2xs text-fg-3">{{ row.start }}</text>
            <text class="text-2xs text-fg-3">{{ row.end }}</text>
          </view>
        </view>

        <view class="relative flex-1" :style="{ height: `${gridHeight}rpx` }">
          <!-- 停课列置灰；今日底色叠在其上，两种标记同时可见 -->
          <view
            v-for="(day, index) in dayColumns"
            :key="`col-${index}`"
            class="absolute bottom-0 top-0"
            :class="day.suspended ? CALENDAR_SHADE_CLASS : ''"
            :style="columnStyle(index)"
          >
            <view v-if="day.today" class="absolute inset-0 bg-primary-light opacity-50" />
          </view>
          <view
            v-for="(row, rowIndex) in rows"
            :key="`row-${row.section}`"
            class="absolute left-0 right-0 border-b border-line-light"
            :style="{ top: `${(rowIndex + 1) * ROW_HEIGHT - 1}rpx` }"
          />

          <view
            v-for="block in blocks"
            :key="block.occurrence.id"
            class="grid-block absolute box-border overflow-hidden rounded-md"
            :style="block.style"
            @click="openDetail(block.occurrence)"
          >
            <!-- 被单次 / 分段调整过的日程右上角一个小点 -->
            <view v-if="block.modified" class="grid-block__dot" />
            <text
              class="grid-block__title block text-2xs font-medium leading-tight"
              :class="{ 'line-through': block.occurrence.status === 'canceled' }"
            >
              <text v-if="block.audit" class="grid-block__audit">{{ AUDIT_BADGE }}</text>{{ block.occurrence.title }}
            </text>
            <text v-if="block.occurrence.location" class="mt-0.5 block truncate text-2xs opacity-80">
              {{ block.occurrence.location }}
            </text>
            <text v-if="block.tag" class="grid-block__tag">{{ block.tag }}</text>
            <text v-if="block.badge" class="grid-block__badge" :style="block.badgeStyle">{{ block.badge }}</text>
          </view>

          <view
            v-if="visibleOccurrences.length === 0"
            class="absolute inset-0 flex flex-col items-center justify-center"
          >
            <text class="i-carbon-calendar text-4xl text-fg-4" />
            <text class="mt-2 text-sm text-fg-3">
              {{ emptyText }}
            </text>
            <button
              v-if="termHasEntries === false"
              class="btn-primary mt-4 btn-sm"
              @click="goImport()"
            >
              导入课表
            </button>
          </view>
        </view>
      </view>
    </view>

    <view v-if="view && sourceLegend" class="mx-4 mt-2 text-2xs text-fg-3">
      来源：{{ sourceLegend }}
    </view>

    <!-- 底部操作栏 -->
    <view class="fixed bottom-0 left-0 right-0 z-20 bg-card shadow-float pb-safe">
      <view class="flex">
        <view class="flex flex-1 flex-col items-center py-2 active:bg-fill" @click="openAddSheet">
          <view class="i-carbon-add text-xl text-fg-2" />
          <text class="mt-0.5 text-xs text-fg-2">添加</text>
        </view>
        <view class="flex flex-1 flex-col items-center py-2 active:bg-fill" @click="goImport()">
          <view class="i-carbon-cloud-download text-xl text-fg-2" />
          <text class="mt-0.5 text-xs text-fg-2">导入</text>
        </view>
        <view class="flex flex-1 flex-col items-center py-2 active:bg-fill" @click="goGrades">
          <view class="i-carbon-report text-xl text-fg-2" />
          <text class="mt-0.5 text-xs text-fg-2">成绩</text>
        </view>
        <view class="flex flex-1 flex-col items-center py-2 active:bg-fill" @click="goPoster">
          <view class="i-carbon-image text-xl text-fg-2" />
          <text class="mt-0.5 text-xs text-fg-2">海报</text>
        </view>
        <view class="flex flex-1 flex-col items-center py-2 active:bg-fill" @click="goImport('settings')">
          <view class="i-carbon-settings text-xl text-fg-2" />
          <text class="mt-0.5 text-xs text-fg-2">设置</text>
        </view>
      </view>
    </view>
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
    @action="handleDetailAction"
    @edit="handleDetailEdit"
  />

  <!-- 添加 -->
  <uv-action-sheet
    ref="addSheet"
    title="添加到课表"
    :actions="ADD_ACTIONS"
    cancel-text="取消"
    :round="16"
    @select="onAddSelect"
  />

  <!-- 周次选择 -->
  <uv-popup ref="weekPickerPopup" mode="bottom" :round="16" :safe-area-inset-bottom="true">
    <view v-if="view" class="px-4 pb-4 pt-5">
      <view class="flex items-center justify-between gap-2">
        <view class="min-w-0 flex-1">
          <text class="block text-base text-fg-1 font-bold">选择周次</text>
          <text class="block truncate text-xs text-fg-3">{{ view.term.name }} · 共 {{ view.term.total_weeks }} 周</text>
        </view>
        <view
          v-if="view.today.week"
          class="shrink-0 rounded-full bg-primary-light px-3 py-1 text-xs text-primary active:opacity-70"
          @click="pickWeek(view.today.week)"
        >
          回到本周
        </view>
      </view>
      <scroll-view scroll-y class="week-picker mt-3">
        <view class="flex flex-wrap -mx-1">
          <view v-for="cell in weekCells" :key="cell.week" class="w-1/4 px-1 pb-2">
            <view
              class="relative border-2 rounded-lg px-1 py-2 text-center"
              :class="cell.cellClass"
              @click="pickWeek(cell.week)"
            >
              <text class="block text-sm font-medium">第 {{ cell.week }} 周</text>
              <text class="block text-2xs" :class="cell.rangeClass">{{ cell.range }}</text>
              <!-- 标记行常驻占位，每格高度一致 -->
              <text class="block min-h-26rpx truncate text-2xs" :class="cell.markClass">{{ cell.label }}</text>
              <view v-if="cell.label" class="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" :class="cell.dotClass" />
            </view>
          </view>
        </view>
      </scroll-view>
      <view class="mt-1 flex items-center gap-4 text-2xs text-fg-3">
        <view class="flex items-center gap-1">
          <view class="h-2.5 w-2.5 rounded-sm bg-primary" />
          <text>本周</text>
        </view>
        <view class="flex items-center gap-1">
          <view class="h-2.5 w-2.5 border-2 border-primary rounded-sm" />
          <text>正在显示</text>
        </view>
        <view class="flex items-center gap-1">
          <view class="h-1.5 w-1.5 rounded-full bg-error" />
          <text>放假 / 停课</text>
        </view>
        <view class="flex items-center gap-1">
          <view class="h-1.5 w-1.5 rounded-full bg-warning" />
          <text>考试周</text>
        </view>
      </view>
    </view>
  </uv-popup>
</template>

<style lang="scss" scoped>
.week-picker {
  max-height: 60vh;
}

.grid-block {
  padding: 4rpx 6rpx;
}

.grid-block__title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  word-break: break-all;
}

.grid-block__audit {
  display: inline-block;
  padding: 0 4rpx;
  margin-right: 4rpx;
  font-size: 20rpx;
  line-height: 24rpx;
  color: var(--yp-text-inverse);
  vertical-align: 2rpx;
  background: var(--yp-color-warning);
  border-radius: 4rpx;
}

.grid-block__dot {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 10rpx;
  height: 10rpx;
  background: var(--yp-color-warning);
  border-radius: 50%;
}

.grid-block__tag {
  display: inline-block;
  max-width: 100%;
  padding: 0 6rpx;
  margin-top: 4rpx;
  overflow: hidden;
  font-size: 20rpx;
  line-height: 26rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 6rpx;
}

.grid-block__badge {
  position: absolute;
  right: 4rpx;
  bottom: 4rpx;
  padding: 0 6rpx;
  font-size: 20rpx;
  line-height: 26rpx;
  color: var(--yp-text-inverse);
  border-radius: var(--yp-radius-sm);
  opacity: 0.85;
}
</style>
