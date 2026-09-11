<script lang="ts" setup>
import type { Occurrence, WeekView } from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import type { DetailSheetInstance } from '@/hooks/useOccurrenceDetail'
import type { WeekDirection } from '@/hooks/useWeekSwipe'
import type { PaletteColor, TimetableDensity, WeekendMode, WeekPickerItem } from '@/utils/timetable'
import type { CornerMarkerTone, GridMetrics, OverlapGroup } from '@/utils/timetable-grid'
import { onLoad, onPullDownRefresh, onResize, onShareAppMessage, onShow, onUnload } from '@dcloudio/uni-app'
import { computed, ref, watch } from 'vue'
import { getWeek, listEntries } from '@/api/timetable'
import OccurrenceDetailSheet from '@/components/OccurrenceDetailSheet.vue'
import { useApiException } from '@/hooks/useApiException'
import { useClassReminder } from '@/hooks/useClassReminder'
import { useOccurrenceDetail } from '@/hooks/useOccurrenceDetail'
import { useTimetableSync } from '@/hooks/useTimetableSync'
import { useWeekSwipe } from '@/hooks/useWeekSwipe'
import { useUserStore } from '@/store/user'
import {
  AUDIT_BADGE,
  cacheWeekView,
  CALENDAR_SHADE_CLASS,
  calendarDotClass,
  calendarLabelClass,
  calendarShortLabel,
  colorForOccurrence,
  dayInfo,
  dayInfoOf,
  isSuspended,
  markSwipeHintSeen,
  occurrenceRowSpan,
  readCachedWeekView,
  readDensity,
  readSwipeHintSeen,
  readWeekendMode,
  sectionRows,
  shortDate,
  suspendsClasses,
  weekCalendarNotes,
  WEEKDAY_LABELS,
  weekGridRows,
  weekHeaderMark,
  weekPickerItems,
  weekSuspendedReason,
} from '@/utils/timetable'
import {
  bandBoundaries,
  bandTop,
  BLOCK_EDGE,
  BLOCK_GAP,
  BLOCK_MARKER_SIZE,
  BLOCK_MORE_HEIGHT,
  BLOCK_PAD_LEFT,
  BLOCK_PAD_RIGHT,
  BLOCK_PAD_Y,
  BREAK_HEIGHT,
  breakBoundaries,
  cornerMarker,
  fitRowHeight,
  GRID_AXIS_WIDTH,
  GRID_BODY_WIDTH,
  gridBodyHeight,
  layoutBlockText,
  NAME_ONLY_BELOW_SECTIONS,
  overlapBlockModel,
  RELAXED_ROW_HEIGHT,
  resolveOverlaps,
  rowLineTop,
  rowOffset,
  TITLE_LINE,
  ZONE_LABEL_HEIGHT,
  ZONE_LABELS,
  zoneBoundaries,
  zoneLabelTop,
} from '@/utils/timetable-grid'

definePage({
  style: {
    navigationBarTitleText: '我的课表',
    enablePullDownRefresh: true,
  },
})

/** How long the first-visit swipe hint stays on screen (ms) */
const SWIPE_HINT_MS = 2500
/** A week view in the page cache younger than this (ms) is shown without asking the server again */
const WEEK_CACHE_FRESH_MS = 30_000

interface PopupInstance {
  open: () => void
  close: () => void
}

interface WindowMetrics {
  heightRpx: number
  safeBottomRpx: number
}

interface BlockMarker {
  text: string
  style: string
}

/** Text, markers and +N chip of a suspended block */
const SUSPENDED_FG = 'var(--yp-text-3)'
/** Side bar or frame of a suspended block */
const SUSPENDED_EDGE = 'var(--yp-text-4)'
/** Corner-marker fills by tone; a kind marker takes the occurrence's colour */
const MARKER_FILLS: Partial<Record<CornerMarkerTone, string>> = {
  suspended: SUSPENDED_FG,
  swap: 'var(--yp-color-primary)',
}

interface GridBlock {
  occurrence: Occurrence
  /** This occurrence first, then what the detail sheet's switcher offers */
  detailGroup: Occurrence[]
  /** The +N chip: occurrences grouped under this block plus suspended lessons it covers entirely; 0 for none */
  more: number
  /** A suspended lesson overlapping a normal block: drawn at its own time under it */
  background: boolean
  style: string
  titleStyle: string
  roomStyle: string
  roomLines: number
  /** 宽松 only: the teacher (the occurrence's subtitle) under the room */
  teacherLines: number
  tagLines: number
  /** 旁 and the kind marker, in the top-left corner */
  markers: BlockMarker[]
  /** 本次被调整过 */
  modified: boolean
  canceled: boolean
  /** 校历停课日的课：置灰、斜纹底，仍可点开 */
  suspended: boolean
  moreStyle: string
}

/** 表头一列（周一到周日）的展示数据 */
interface DayColumn {
  /** 一 … 日 */
  weekday: string
  /** M/D */
  date: string
  today: boolean
  /** Calendar tag of at most two characters (放假 / 公休 …); full labels are in the strip above the grid */
  mark: string
  markClass: string
  /** Dot for a calendar event without a tag */
  dotClass: string
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

type LoadOutcome = 'ok' | 'failed' | 'superseded'

const view = ref<WeekView | null>(null)
const loading = ref(false)
const loadError = ref('')
/** The week the user moved to (swipe, picker); null follows the server's current week */
const selected = ref<{ term: string, week: number } | null>(null)
/** 本学期是否有任何存储条目；null 表示未知 */
const termHasEntries = ref<boolean | null>(null)
/** Saturday and Sunday always show unless the user switched on 「隐藏周末」 in the settings */
const weekendMode = ref<WeekendMode>(readWeekendMode())
const swipeHintVisible = ref(false)
/** Occurrences of the tapped block, primary first; the detail sheet offers the others as a switcher */
const detailGroup = ref<Occurrence[]>([])
const detailSheet = ref<DetailSheetInstance | null>(null)
const weekPickerPopup = ref<PopupInstance | null>(null)
const addSheet = ref<PopupInstance | null>(null)
const { syncing, syncPortal } = useTimetableSync()
const { resubscribeSilently } = useClassReminder()
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
const userStore = useUserStore()
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
  selectDetail,
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
const {
  phase: swipePhase,
  busy: swipeBusy,
  slideStyle,
  edgeHint,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  slide,
} = useWeekSwipe({
  targetWeek,
  go: week => showWeek(week),
  onDragStart: dismissSwipeHint,
})

/** Window height and bottom safe area in rpx, for fitting the section rows to the screen */
function readWindowMetrics(): WindowMetrics {
  try {
    const info = uni.getWindowInfo()
    const toRpx = 750 / (info.windowWidth || 375)
    const safeBottom = info.safeArea ? Math.max(info.screenHeight - info.safeArea.bottom, 0) : 0
    return { heightRpx: info.windowHeight * toRpx, safeBottomRpx: safeBottom * toRpx }
  }
  catch {
    return { heightRpx: 1334, safeBottomRpx: 0 }
  }
}

const windowMetrics = ref<WindowMetrics>(readWindowMetrics())
/** 紧凑 fits sections 1–12 to the window; 宽松 uses a fixed taller row and scrolls (saved per account) */
const density = ref<TimetableDensity>(readDensity(userStore.userInfo.username))
const term = computed(() => view.value?.term ?? null)
/** The term's section table; the fitted row height depends on it alone, so it holds from week to week */
const sectionTable = computed(() => sectionRows(term.value))
const rowHeight = computed(() => {
  if (density.value === 'relaxed')
    return RELAXED_ROW_HEIGHT
  return fitRowHeight({
    windowHeightRpx: windowMetrics.value.heightRpx,
    safeBottomRpx: windowMetrics.value.safeBottomRpx,
    sections: sectionTable.value.length,
    breaks: breakBoundaries(sectionTable.value).length,
  })
})
/** The axis shows a section's end time only when the row is tall enough for three lines */
const showEndTimes = computed(() => rowHeight.value >= 80)
const weekDates = computed(() => view.value?.week_dates ?? [])

const visibleOccurrences = computed(() =>
  (view.value?.occurrences ?? []).filter(item => showHidden.value || !isHidden(item)),
)

const columnCount = computed(() => (weekendMode.value === 'hide' ? 5 : 7))
/** Width of one day column in % of the grid body */
const columnWidth = computed(() => 100 / columnCount.value)
/** Saturday / Sunday occurrences left out because the user hides the weekend; the strip says so */
const hiddenWeekendCount = computed(() =>
  columnCount.value === 7 ? 0 : visibleOccurrences.value.filter(item => item.weekday > columnCount.value).length,
)

/** Occurrences drawn on the grid: the visible ones on the shown columns */
const gridOccurrences = computed(() => visibleOccurrences.value.filter(item => item.weekday <= columnCount.value))
/** The section table, plus clock rows when this week has occurrences before the first or after the last section */
const rows = computed(() => weekGridRows(term.value, gridOccurrences.value))
/** Rows with a thin band above them: lunch and dinner, and where 早间 / 晚间 clock rows meet the section table */
const breaks = computed(() => bandBoundaries(rows.value))
const metrics = computed<GridMetrics>(() => ({ rowHeight: rowHeight.value, breaks: breaks.value }))
const gridHeight = computed(() => gridBodyHeight(rows.value.length, metrics.value))
/** Bands and row lines are drawn in both the section axis and the grid, from the same tops */
const breakBands = computed(() => breaks.value.map(boundary => ({
  key: `break-${boundary}`,
  style: `top: ${bandTop(boundary, metrics.value)}rpx; height: ${BREAK_HEIGHT}rpx`,
})))
const rowLines = computed(() => rows.value.map((row, rowIndex) => ({
  key: `${row.section}-${row.start}`,
  style: `top: ${rowLineTop(rowIndex, metrics.value)}rpx`,
})))
/** Axis labels, one per row, placed at the row's own offset like the grid's blocks */
const axisCells = computed(() => rows.value.map((row, rowIndex) => ({
  row,
  key: `axis-${row.section}-${row.start}`,
  style: `top: ${rowOffset(rowIndex, metrics.value)}rpx; height: ${rowHeight.value}rpx`,
})))
/** 早间 / 晚间 on the zone bands, centred on the band in the section axis */
const zoneLabels = computed(() => zoneBoundaries(rows.value).map(boundary => ({
  key: `zone-${boundary.zone}`,
  label: ZONE_LABELS[boundary.zone],
  style: `top: ${zoneLabelTop(boundary.index, metrics.value)}rpx; height: ${ZONE_LABEL_HEIGHT}rpx`,
})))

function blockStyle(occurrence: Occurrence, color: PaletteColor, top: number, height: number, padY: number, zIndex: number) {
  const column = Math.min(Math.max(occurrence.weekday, 1), 7) - 1
  const width = columnWidth.value
  // 校历停课日的课：中性底色（斜纹见 .grid-block--suspended）、fg-3 字、浅灰色条
  const suspended = isSuspended(occurrence)
  const edge = suspended ? SUSPENDED_EDGE : color.fg
  // 自定义日程虚线框，考试实线红框，其余左侧色条
  let border = `border-left: 4rpx solid ${edge}`
  if (occurrence.kind === 'custom')
    border = `border: 2rpx dashed ${edge}`
  else if (occurrence.kind === 'exam')
    border = `border: 2rpx solid ${edge}`
  const parts = [
    `left: ${(column * width).toFixed(3)}%`,
    `width: calc(${width.toFixed(3)}% - ${BLOCK_GAP}rpx)`,
    `top: ${top.toFixed(1)}rpx`,
    `height: ${height.toFixed(1)}rpx`,
    `padding: ${padY.toFixed(1)}rpx ${BLOCK_PAD_RIGHT}rpx ${padY.toFixed(1)}rpx ${BLOCK_PAD_LEFT}rpx`,
    `background-color: ${suspended ? 'var(--yp-bg-fill)' : color.bg}`,
    `color: ${suspended ? SUSPENDED_FG : color.fg}`,
    border,
    // Background suspended lessons sit under the normal blocks, whose opaque fill leaves only the uncovered part
    `z-index: ${zIndex}`,
  ]
  if (isHidden(occurrence))
    parts.push('opacity: 0.45')
  return parts.join('; ')
}

function toBlock(group: OverlapGroup): GridBlock {
  const { primary: occurrence, span } = group
  const model = overlapBlockModel(group)
  const color = colorForOccurrence(occurrence)
  const suspended = isSuspended(occurrence)
  const markers: BlockMarker[] = []
  if (occurrence.role === 'audit')
    markers.push({ text: AUDIT_BADGE, style: `background-color: ${suspended ? SUSPENDED_FG : 'var(--yp-color-warning)'}` })
  // One status / kind marker: 停 over 调 over 书 / 活 / 约 / 考
  const marker = cornerMarker(occurrence)
  if (marker)
    markers.push({ text: marker.text, style: `background-color: ${MARKER_FILLS[marker.tone] ?? color.fg}` })
  // Markers start at the padding edge; the title's first line starts after them plus a small gap
  const indent = markers.length ? markers.length * BLOCK_MARKER_SIZE - BLOCK_PAD_LEFT + 3 : 0
  // The left colour bar takes 4rpx of width; dashed / solid frames take 2rpx on every side
  const framed = occurrence.kind === 'custom' || occurrence.kind === 'exam'
  const top = rowOffset(span.top, metrics.value) + BLOCK_GAP / 2
  const height = rowOffset(span.top + span.span, metrics.value, 'bottom') - rowOffset(span.top, metrics.value) - BLOCK_GAP
  // Blocks too short for padding plus one name line centre that line instead
  const padY = height >= TITLE_LINE + BLOCK_PAD_Y * 2 ? BLOCK_PAD_Y : Math.max((height - TITLE_LINE) / 2, 0)
  const layout = layoutBlockText({
    title: occurrence.title,
    room: occurrence.location,
    teacher: density.value === 'relaxed' && span.span >= 2 ? occurrence.subtitle : '',
    tag: occurrence.tag ?? '',
    widthRpx: GRID_BODY_WIDTH / columnCount.value - BLOCK_GAP - BLOCK_PAD_LEFT - BLOCK_PAD_RIGHT - BLOCK_EDGE,
    heightRpx: height - padY * 2 - (framed ? 4 : 0),
    indentRpx: indent,
    moreRpx: model.more ? BLOCK_MORE_HEIGHT : 0,
    nameOnly: span.span < NAME_ONLY_BELOW_SECTIONS,
  })
  return {
    occurrence,
    detailGroup: model.detailGroup,
    more: model.more,
    background: model.background,
    style: blockStyle(occurrence, color, top, height, padY, model.zIndex),
    titleStyle: `-webkit-line-clamp: ${layout.titleLines}; text-indent: ${indent}rpx`,
    roomStyle: `-webkit-line-clamp: ${layout.roomLines}`,
    roomLines: layout.roomLines,
    teacherLines: layout.teacherLines,
    tagLines: layout.tagLines,
    markers,
    modified: !!occurrence.modified,
    canceled: occurrence.status === 'canceled',
    suspended,
    moreStyle: `background-color: ${suspended ? SUSPENDED_FG : color.fg}`,
  }
}

/** One block per overlap group at full column width; suspended lessons under a normal block come first */
const blocks = computed<GridBlock[]>(() =>
  resolveOverlaps(gridOccurrences.value, item => occurrenceRowSpan(item, rows.value)).map(toBlock),
)

const detailOverlaps = computed(() => detailGroup.value.filter(item => item.id !== detail.value?.id))

/** 回到本周: only when today lies in this term and another week is on screen */
const showBackToCurrent = computed(() => !!view.value?.today.week && view.value.today.week !== view.value.week)
/** The pill's arrow points to where the current week lies */
const backArrowClass = computed(() =>
  view.value?.today.week && view.value.today.week < view.value.week ? 'i-carbon-arrow-left' : 'i-carbon-arrow-right',
)
const weekRangeLabel = computed(() => {
  const dates = weekDates.value
  if (dates.length < 7)
    return ''
  return `${shortDate(dates[0])} – ${shortDate(dates[6])}`
})
const headerSubtitle = computed(() => [term.value?.name, weekRangeLabel.value].filter(Boolean).join(' · '))
/** 表头的周次标记：整周停课的校历原因，否则考试周 */
const weekMark = computed(() => weekHeaderMark(view.value))
const sourceLegend = computed(() => (view.value?.sources ?? []).map(item => item.label).join(' · '))
/** The week's calendar labels in full, for the strip above the grid */
const weekNotes = computed(() => weekCalendarNotes(view.value))
/** Week the edge chevron points to while dragging */
const edgeWeek = computed(() => (view.value && edgeHint.value ? view.value.week + edgeHint.value.direction : 0))
/** A swipe is waiting for a week that was not in the page cache */
const swipeWaiting = computed(() => swipePhase.value === 'wait' && loading.value)

const dayColumns = computed<DayColumn[]>(() => WEEKDAY_LABELS.slice(0, columnCount.value).map((weekday, index) => {
  const iso = weekDates.value[index]
  const info = dayInfo(view.value, index)
  const mark = calendarShortLabel(info?.kind, info?.label)
  return {
    weekday,
    date: iso ? shortDate(iso) : '',
    today: !!view.value && !!iso && iso === view.value.today.date,
    mark,
    markClass: calendarLabelClass(info?.kind),
    dotClass: mark ? '' : calendarDotClass(info?.kind),
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
  const width = columnWidth.value
  return `left: ${(index * width).toFixed(3)}%; width: ${width.toFixed(3)}%`
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

let requestSeq = 0

/** Week views fetched while the page is open, keyed by `term:week`, so a swipe can show a week at once */
const weekCache = new Map<string, { view: WeekView, at: number }>()
/** Bumped whenever the cache is dropped; responses that started before are not cached */
let cacheGeneration = 0
const prefetching = new Set<string>()

function weekKey(termCode: string, week: number) {
  return `${termCode}:${week}`
}

function clearWeekCache() {
  weekCache.clear()
  cacheGeneration++
}

/** The week a swipe towards `direction` would show; null past the first or the last week */
function targetWeek(direction: WeekDirection): number | null {
  const current = view.value
  if (!current)
    return null
  const next = current.week + direction
  return next >= 1 && next <= current.term.total_weeks ? next : null
}

function showView(data: WeekView) {
  view.value = data
  loadError.value = ''
  if (data.occurrences.length === 0)
    void checkTermEntries(data.term.code)
  else
    termHasEntries.value = true
  maybeShowSwipeHint()
}

/**
 * silent: keep the current error state; quiet: no 「更新中…」 (revalidating a week shown from the page cache)
 */
async function loadWeek(
  target: { term: string, week: number } | null,
  options: { silent?: boolean, quiet?: boolean } = {},
): Promise<LoadOutcome> {
  const seq = ++requestSeq
  const generation = cacheGeneration
  if (!options.quiet)
    loading.value = true
  if (!options.silent)
    loadError.value = ''
  try {
    const data = await getWeek(target ?? undefined)
    if (generation === cacheGeneration)
      weekCache.set(weekKey(data.term.code, data.week), { view: data, at: Date.now() })
    if (seq !== requestSeq)
      return 'superseded'
    showView(data)
    // 只缓存当前周，下次打开先用它秒开
    if (target === null || data.week === data.today.week)
      cacheWeekView(userStore.userInfo.username, data)
    prefetchNeighbours(data)
    return 'ok'
  }
  catch (error) {
    if (seq !== requestSeq)
      return 'superseded'
    // 已有数据（含本机缓存）时只 toast，首屏失败才整页报错
    const requestError = handleApiException(error, { showToast: !!view.value })
    if (!view.value)
      loadError.value = requestError.message
    return 'failed'
  }
  finally {
    if (seq === requestSeq)
      loading.value = false
  }
}

/** Fetch the weeks on either side in the background; when it fails the next swipe simply waits for the network */
function prefetchNeighbours(data: WeekView) {
  const generation = cacheGeneration
  for (const week of [data.week - 1, data.week + 1]) {
    const key = weekKey(data.term.code, week)
    if (week < 1 || week > data.term.total_weeks || weekCache.has(key) || prefetching.has(key))
      continue
    prefetching.add(key)
    getWeek({ term: data.term.code, week })
      .then((neighbour) => {
        if (generation === cacheGeneration)
          weekCache.set(key, { view: neighbour, at: Date.now() })
      })
      .catch(() => undefined)
      .finally(() => prefetching.delete(key))
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

async function refresh() {
  clearWeekCache()
  await loadWeek(selected.value, { silent: true })
}

/** Put `week` of the shown term on screen: from the page cache at once, otherwise from the server */
async function showWeek(week: number) {
  const current = view.value
  if (!current || week < 1 || week > current.term.total_weeks)
    return
  const termCode = current.term.code
  // 回到本周时不记录选择，刷新后继续跟随服务端的当前周
  selected.value = week === current.today.week ? null : { term: termCode, week }
  const cached = weekCache.get(weekKey(termCode, week))
  if (cached) {
    // Drop any response still on its way for the week that was shown before
    requestSeq++
    loading.value = false
    showView(cached.view)
    if (Date.now() - cached.at > WEEK_CACHE_FRESH_MS)
      void loadWeek(selected.value, { silent: true, quiet: true })
    else
      prefetchNeighbours(cached.view)
    return
  }
  const outcome = await loadWeek(selected.value)
  if (outcome === 'failed')
    followShownWeek()
}

/** A failed switch leaves the previous week on screen; point the selection back at it */
function followShownWeek() {
  const current = view.value
  if (current)
    selected.value = current.week === current.today.week ? null : { term: current.term.code, week: current.week }
}

/** A week picked (week picker, 回到本周) while a swipe was still sliding; shown once the grid is idle */
let queuedWeek: number | null = null

watch(swipeBusy, (busy) => {
  if (busy || queuedWeek === null)
    return
  const week = queuedWeek
  queuedWeek = null
  transitionToWeek(week)
})

/** Slide to `week` from the week picker or 回到本周 (swipes go through useWeekSwipe directly) */
function transitionToWeek(week: number) {
  // Racing a running swipe would land on the swipe's week instead; wait for it to finish
  if (swipeBusy.value) {
    queuedWeek = week
    return
  }
  const current = view.value
  if (!current || week === current.week)
    return
  void slide(week > current.week ? 1 : -1, () => showWeek(week))
}

function goCurrentWeek() {
  const today = view.value?.today.week
  if (today)
    transitionToWeek(today)
}

function openWeekPicker() {
  if (!view.value)
    return
  weekPickerPopup.value?.open()
}

function pickWeek(week: number) {
  weekPickerPopup.value?.close()
  transitionToWeek(week)
}

/** 点表头日期进入当天的日视图 */
function goDay(index: number) {
  const iso = weekDates.value[index]
  if (!iso || !view.value || swipeBusy.value)
    return
  uni.navigateTo({ url: `/pages-timetable/day?date=${encodeURIComponent(iso)}&term=${encodeURIComponent(view.value.term.code)}` })
}

function openBlock(block: GridBlock) {
  // A drag that ends over a block must not open it
  if (swipeBusy.value)
    return
  detailGroup.value = block.detailGroup
  openDetail(block.occurrence)
}

let swipeHintChecked = false
let swipeHintTimer: ReturnType<typeof setTimeout> | undefined

/** First visit on this phone: say once that the grid swipes between weeks */
function maybeShowSwipeHint() {
  if (swipeHintChecked)
    return
  swipeHintChecked = true
  if (readSwipeHintSeen())
    return
  markSwipeHintSeen()
  swipeHintVisible.value = true
  swipeHintTimer = setTimeout(dismissSwipeHint, SWIPE_HINT_MS)
}

function dismissSwipeHint() {
  if (swipeHintTimer !== undefined) {
    clearTimeout(swipeHintTimer)
    swipeHintTimer = undefined
  }
  swipeHintVisible.value = false
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
  // 导入页可能改了本机隐藏偏好与周末列设置；从其它页返回时刷新数据
  reloadLocalPrefs()
  weekendMode.value = readWeekendMode()
  density.value = readDensity(userStore.userInfo.username)
  // The window may have changed size while another page was on top
  windowMetrics.value = readWindowMetrics()
  if (shownBefore)
    void refresh()
  shownBefore = true
  // 提醒开关打开时再要一次微信订阅额度（每次允许只能发一条）；失败静默，不影响渲染
  void resubscribeSilently()
})

onUnload(() => {
  dismissSwipeHint()
})

// Rotation, split screen or a resized PC window change the height the rows can share
onResize(() => {
  windowMetrics.value = readWindowMetrics()
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
    <!-- 周次（点按打开周次选择）+ 同步；换周靠左右滑动网格 -->
    <view class="sticky top-0 z-10 bg-card px-3 py-2 shadow-card">
      <view class="flex items-center justify-between gap-2">
        <view class="min-w-0 flex-1 active:opacity-60" @click="openWeekPicker">
          <view class="flex items-center gap-1">
            <text class="shrink-0 text-base text-fg-1 font-bold">{{ view ? `第 ${view.week} 周` : '课表' }}</text>
            <view v-if="view" class="i-carbon-chevron-down shrink-0 text-sm text-fg-3" />
            <text v-if="weekMark" class="ml-1 min-w-0 truncate rounded-sm bg-error-light px-1 text-2xs text-error">{{ weekMark }}</text>
          </view>
          <view class="flex items-center gap-1 text-2xs text-fg-3">
            <text class="min-w-0 truncate">{{ headerSubtitle }}</text>
            <text v-if="loading && view" class="shrink-0">· 更新中…</text>
          </view>
        </view>
        <view
          class="shrink-0 rounded-full p-2 text-primary active:bg-primary-light"
          :class="{ 'opacity-50': syncing }"
          @click="handleSync"
        >
          <view class="i-carbon-renew text-lg" />
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

    <view v-else-if="view" class="relative">
      <!-- Everything that belongs to one week slides together; touches are read on the grid card -->
      <view :style="slideStyle">
        <!-- 本周校历标签全文；表头只放短标记 -->
        <scroll-view
          v-if="weekNotes.length || hiddenWeekendCount"
          scroll-x
          class="week-notes mx-2 mt-2"
          :show-scrollbar="false"
          :enhanced="true"
        >
          <view class="week-notes__line">
            <text class="i-carbon-calendar mr-1 shrink-0 text-xs text-fg-3" />
            <view v-for="(note, index) in weekNotes" :key="note.start" class="week-notes__item">
              <text v-if="index > 0" class="mx-1 text-fg-4">·</text>
              <text class="mr-1 text-fg-2">{{ note.range }}</text>
              <text :class="note.labelClass">{{ note.label }}</text>
            </view>
            <view v-if="hiddenWeekendCount" class="week-notes__item">
              <text v-if="weekNotes.length" class="mx-1 text-fg-4">·</text>
              <text class="text-warning">周末 {{ hiddenWeekendCount }} 项未显示</text>
            </view>
          </view>
        </scroll-view>

        <!-- 周视图网格 -->
        <view
          class="week-grid mx-1 mt-2 overflow-hidden rounded-lg bg-card shadow-card"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchCancel"
        >
          <view class="flex border-b border-line-light">
            <view class="shrink-0" :style="{ width: `${GRID_AXIS_WIDTH}rpx` }" />
            <view class="min-w-0 flex flex-1">
              <view
                v-for="(day, index) in dayColumns"
                :key="index"
                class="day-head active:bg-fill"
                :class="day.today ? 'bg-primary-light' : day.suspended ? CALENDAR_SHADE_CLASS : ''"
                :style="{ width: `${columnWidth}%` }"
                @click="goDay(index)"
              >
                <text class="day-head__line text-xs" :class="day.today ? 'text-primary font-bold' : 'text-fg-2'">周{{ day.weekday }}</text>
                <text class="day-head__line text-2xs" :class="day.today ? 'text-primary' : 'text-fg-3'">{{ day.date }}</text>
                <!-- 校历标记行常驻占位，表头高度不随周次变化 -->
                <view class="day-head__mark">
                  <text v-if="day.mark" :class="day.markClass">{{ day.mark }}</text>
                  <view v-else-if="day.dotClass" class="day-head__dot" :class="day.dotClass" />
                </view>
              </view>
            </view>
          </view>

          <view class="flex">
            <!-- 节次列的分隔带、行线和文字都与右侧格子一样按行位置绝对定位，不逐格堆叠，带才与格子里的对齐 -->
            <view class="relative shrink-0" :style="{ width: `${GRID_AXIS_WIDTH}rpx`, height: `${gridHeight}rpx` }">
              <view v-for="band in breakBands" :key="`axis-${band.key}`" class="grid-break" :style="band.style" />
              <view
                v-for="line in rowLines"
                :key="`axis-row-${line.key}`"
                class="absolute left-0 right-0 border-b border-line-light"
                :style="line.style"
              />
              <view v-for="cell in axisCells" :key="cell.key" class="grid-axis__cell" :style="cell.style">
                <!-- 节次表以外的时刻行：编号位留空，只写开始时间，样式与位置同节次时间；结束时间占位但不显示 -->
                <view class="grid-axis__number">
                  <text v-if="cell.row.section" class="grid-axis__section">{{ cell.row.section }}</text>
                </view>
                <text class="grid-axis__time">{{ cell.row.start }}</text>
                <text v-if="showEndTimes" class="grid-axis__time" :class="{ 'grid-axis__time--hidden': !cell.row.section }">{{ cell.row.end }}</text>
              </view>
              <!-- 时刻行与节次表相接处的分隔带上标「早间 / 晚间」，与课间休息的带区分开 -->
              <text v-for="zone in zoneLabels" :key="zone.key" class="grid-zone-label" :style="zone.style">{{ zone.label }}</text>
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
              <!-- 午饭、晚饭时段只画一条细带，不占一整行 -->
              <view v-for="band in breakBands" :key="band.key" class="grid-break" :style="band.style" />
              <view
                v-for="line in rowLines"
                :key="`row-${line.key}`"
                class="absolute left-0 right-0 border-b border-line-light"
                :style="line.style"
              />

              <!-- 与照常进行的日程重叠的停课课画在下层，只露出没被盖住的部分；点露出的部分打开它的详情 -->
              <view
                v-for="block in blocks"
                :key="block.occurrence.id"
                class="grid-block absolute box-border overflow-hidden rounded-sm"
                :class="{ 'grid-block--suspended': block.suspended }"
                :style="block.style"
                @click="openBlock(block)"
              >
                <!-- 旁听与停 / 调 / 类别标记在左上角，标题首行缩进让开，不占整行 -->
                <view v-if="block.markers.length" class="grid-block__markers">
                  <text
                    v-for="marker in block.markers"
                    :key="marker.text"
                    class="grid-block__marker"
                    :style="marker.style"
                  >
                    {{ marker.text }}
                  </text>
                </view>
                <!-- 被单次 / 分段调整过的日程右上角一个小点 -->
                <view v-if="block.modified" class="grid-block__dot" />
                <text class="grid-block__title" :class="{ 'line-through': block.canceled }" :style="block.titleStyle">{{ block.occurrence.title }}</text>
                <text v-if="block.roomLines" class="grid-block__room" :style="block.roomStyle">{{ block.occurrence.location }}</text>
                <text v-if="block.teacherLines" class="grid-block__teacher">{{ block.occurrence.subtitle }}</text>
                <text v-if="block.tagLines" class="grid-block__tag">#{{ block.occurrence.tag }}</text>
                <!-- 同一时段被盖住的其它日程数（含整个被盖住的停课课）；点开详情可切换 -->
                <text v-if="block.more" class="grid-block__more" :style="block.moreStyle">+{{ block.more }}</text>
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
      </view>

      <!-- 换周时要等网络：网格淡出期间给个加载提示 -->
      <view v-if="swipeWaiting" class="absolute left-0 right-0 top-0 flex justify-center pt-24">
        <uv-loading-icon size="24" />
      </view>
    </view>

    <view v-if="view && sourceLegend" class="mx-4 mt-2 text-2xs text-fg-3">
      来源：{{ sourceLegend }}
    </view>

    <!-- 拖动时被拉开一侧的箭头，透明度跟随拖动距离 -->
    <view
      v-if="edgeHint"
      class="swipe-edge"
      :class="edgeHint.direction > 0 ? 'swipe-edge--right' : 'swipe-edge--left'"
      :style="{ opacity: edgeHint.opacity }"
    >
      <view class="swipe-edge__icon" :class="edgeHint.armed ? 'text-primary' : 'text-fg-3'">
        <view :class="edgeHint.direction > 0 ? 'i-carbon-chevron-right' : 'i-carbon-chevron-left'" />
      </view>
      <text class="swipe-edge__label">第 {{ edgeWeek }} 周</text>
    </view>

    <!-- 首次进入时的一次性提示 -->
    <view v-if="view" class="swipe-hint" :class="{ 'swipe-hint--shown': swipeHintVisible }">
      <view class="swipe-hint__body">
        <view class="i-carbon-arrows-horizontal swipe-hint__arrow" />
        <text>左右滑动切换周</text>
      </view>
    </view>

    <!-- 不在本周时浮在底栏上方 -->
    <view class="back-pill" :class="{ 'back-pill--shown': showBackToCurrent }" @click="goCurrentWeek">
      <view class="back-pill__body">
        <view :class="backArrowClass" />
        <text>回到本周</text>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="timetable-bar fixed bottom-0 left-0 right-0 z-20 bg-card shadow-float pb-safe">
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

  <!-- 日程详情；从网格点开时附带同一时段的其它日程 -->
  <OccurrenceDetailSheet
    ref="detailSheet"
    :occurrence="detail"
    :entry="detailEntry"
    :entry-loading="detailEntryLoading"
    :entry-error="detailEntryError"
    :hidden="detailHidden"
    :busy="detailBusy"
    :overlaps="detailOverlaps"
    :calendar-day="detailCalendarDay"
    @action="handleDetailAction"
    @edit="handleDetailEdit"
    @switch="selectDetail"
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

/* ---- Calendar strip ---- */

.week-notes {
  white-space: nowrap;
}

.week-notes__line {
  display: inline-flex;
  align-items: center;
  padding: 0 8rpx;
  font-size: 22rpx;
  line-height: 40rpx;
}

.week-notes__item {
  display: inline-flex;
  flex: none;
  align-items: center;
}

/* ---- Day headers: fixed column widths, one line each ---- */

/* 6rpx padding + two 28rpx lines + a 24rpx tag row = GRID_CHROME.dayHead (92rpx) */
.day-head {
  box-sizing: border-box;
  flex: none;
  padding: 6rpx 0;
  overflow: hidden;
  text-align: center;
}

.day-head__line {
  display: block;
  overflow: hidden;
  line-height: 28rpx;
  white-space: nowrap;
}

.day-head__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24rpx;
  font-size: 22rpx;
  line-height: 24rpx;
  white-space: nowrap;
}

.day-head__dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
}

/* The section axis stays narrow so the seven day columns keep their width */
/* One row's label at the row's offset; the 1px bottom padding centres it above the row line, as a border did */
.grid-axis__cell {
  position: absolute;
  right: 0;
  left: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-bottom: 1px;
}

/* Same height with or without a number, so a clock row's start time sits where a section's does */
.grid-axis__number {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28rpx;
}

.grid-axis__section {
  font-size: 24rpx;
  font-weight: 500;
  line-height: 28rpx;
  color: var(--yp-text-2);
}

.grid-axis__time {
  font-size: 20rpx;
  line-height: 24rpx;
  color: var(--yp-text-3);
}

/* Clock rows keep the end-time line for alignment but never show it */
.grid-axis__time--hidden {
  visibility: hidden;
}

.grid-zone-label {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 1;
  font-size: 18rpx;
  line-height: 20rpx;
  color: var(--yp-text-3);
  text-align: center;
  background: var(--yp-bg-fill);
}

.grid-break {
  position: absolute;
  right: 0;
  left: 0;
  background: var(--yp-bg-fill);
}

/* ---- Blocks: name wraps to the block height, markers sit in the corners ---- */

/* Sizes match TITLE_* / ROOM_* in utils/timetable-grid.ts; the block's padding is set inline from there */
.grid-block__title,
.grid-block__room {
  display: -webkit-box;
  overflow: hidden;
  word-break: break-all;
  -webkit-box-orient: vertical;
}

.grid-block__title {
  font-size: 22rpx;
  font-weight: 600;
  line-height: 28rpx;
}

/* Rooms break between words so a number stays whole (理教 / 306), falling back to any character */
.grid-block__room {
  font-size: 20rpx;
  line-height: 26rpx;
  word-break: break-word;
  opacity: 0.8;
}

.grid-block__teacher,
.grid-block__tag {
  display: block;
  overflow: hidden;
  font-size: 20rpx;
  line-height: 26rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
}

/* A lesson on a no-class day: bg-fill-active stripes over the bg-fill ground set inline */
.grid-block--suspended {
  background-image: repeating-linear-gradient(
    135deg,
    var(--yp-bg-fill-active) 0,
    var(--yp-bg-fill-active) 3rpx,
    transparent 3rpx,
    transparent 12rpx
  );
}

.grid-block__markers {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
}

.grid-block__marker {
  width: 26rpx;
  height: 26rpx;
  font-size: 20rpx;
  line-height: 26rpx;
  color: var(--yp-text-inverse);
  text-align: center;
}

.grid-block__marker:last-child {
  border-bottom-right-radius: 8rpx;
}

.grid-block__dot {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 10rpx;
  height: 10rpx;
  background: var(--yp-color-warning);
  border-radius: 50%;
  box-shadow: 0 0 0 2rpx var(--yp-bg-card);
}

.grid-block__more {
  position: absolute;
  right: 0;
  bottom: 0;
  min-width: 26rpx;
  padding: 0 5rpx;
  font-size: 20rpx;
  line-height: 26rpx;
  color: var(--yp-text-inverse);
  text-align: center;
  border-top-left-radius: 8rpx;
}

/* ---- Swipe affordances ---- */

.swipe-edge {
  position: fixed;
  top: 50%;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  transform: translateY(-50%);
}

.swipe-edge--left {
  left: 12rpx;
}

.swipe-edge--right {
  right: 12rpx;
}

.swipe-edge__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  font-size: 40rpx;
  background: var(--yp-bg-card);
  border-radius: 50%;
  box-shadow: var(--yp-shadow-float);
}

.swipe-edge__label {
  padding: 0 12rpx;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 36rpx;
  color: var(--yp-text-2);
  background: var(--yp-bg-card);
  border-radius: 999rpx;
  box-shadow: var(--yp-shadow-card);
}

.swipe-hint {
  position: fixed;
  top: 42%;
  right: 0;
  left: 0;
  z-index: 30;
  display: flex;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 240ms ease;
}

.swipe-hint--shown {
  opacity: 1;
}

.swipe-hint__body {
  display: flex;
  gap: 12rpx;
  align-items: center;
  padding: 16rpx 32rpx;
  font-size: 28rpx;
  line-height: 40rpx;
  color: var(--yp-text-inverse);
  background: var(--yp-mask);
  border-radius: 999rpx;
}

.swipe-hint__arrow {
  font-size: 32rpx;
}

.swipe-hint--shown .swipe-hint__arrow {
  animation: swipe-hint-nudge 1.2s ease-in-out infinite;
}

@keyframes swipe-hint-nudge {
  0%,
  100% {
    transform: translateX(-8rpx);
  }

  50% {
    transform: translateX(8rpx);
  }
}

/* The bar is 118rpx above the safe area; the 64rpx pill sits in the 72rpx gap kept above it (GRID_CHROME.pill) */
.back-pill {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom) + 110rpx);
  left: 50%;
  z-index: 25;
  padding: 12rpx;
  pointer-events: none;
  opacity: 0;
  transform: translate3d(-50%, 24rpx, 0);
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.back-pill--shown {
  pointer-events: auto;
  opacity: 1;
  transform: translate3d(-50%, 0, 0);
}

.back-pill__body {
  display: flex;
  gap: 8rpx;
  align-items: center;
  height: 64rpx;
  padding: 0 28rpx;
  font-size: 26rpx;
  color: var(--yp-color-primary);
  white-space: nowrap;
  background: var(--yp-bg-card);
  border-radius: 999rpx;
  box-shadow: var(--yp-shadow-float);
}
</style>
