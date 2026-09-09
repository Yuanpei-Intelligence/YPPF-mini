<script lang="ts" setup>
import type { Occurrence, WeekView } from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import type { PaletteColor } from '@/utils/timetable'
import { onLoad, onPullDownRefresh, onShareAppMessage, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getWeek, listEntries, updateEntry } from '@/api/timetable'
import { useApiException } from '@/hooks/useApiException'
import { useClassReminder } from '@/hooks/useClassReminder'
import { useTimetableSync } from '@/hooks/useTimetableSync'
import { confirmModal } from '@/utils/dialog'
import {
  cacheWeekView,
  CALENDAR_SHADE_CLASS,
  calendarLabelClass,
  chineseDate,
  clockOf,
  colorForOccurrence,
  dayInfo,
  KIND_BADGES,
  KIND_LABELS,
  occurrenceRowSpan,
  readCachedWeekView,
  readLocalHiddenIds,
  readShowHidden,
  saveLocalHiddenIds,
  sectionRows,
  shortDate,
  STATUS_LABELS,
  suspendsClasses,
  WEEKDAY_LABELS,
  weekSuspendedReason,
} from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '我的课表',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
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

type DetailActionKey = 'activity' | 'appoint' | 'edit' | 'hide' | 'unhide'

interface DetailAction {
  key: DetailActionKey
  label: string
  primary: boolean
}

const view = ref<WeekView | null>(null)
const loading = ref(false)
const loadError = ref('')
/** 用户通过 ‹ › 明确选择的周；null 表示跟随服务端的当前周 */
const selected = ref<{ term: string, week: number } | null>(null)
/** 本学期是否有任何存储条目；null 表示未知 */
const termHasEntries = ref<boolean | null>(null)
const showHidden = ref(readShowHidden())
const localHiddenIds = ref<string[]>(readLocalHiddenIds())
const detail = ref<Occurrence | null>(null)
const detailPopup = ref<PopupInstance | null>(null)
const hiding = ref(false)
const { syncing, syncPortal } = useTimetableSync()
const { resubscribeSilently } = useClassReminder()
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

const term = computed(() => view.value?.term ?? null)
const rows = computed(() => sectionRows(term.value))
const gridHeight = computed(() => rows.value.length * ROW_HEIGHT)
const weekDates = computed(() => view.value?.week_dates ?? [])
const localHiddenSet = computed(() => new Set(localHiddenIds.value))

function isHidden(occurrence: Occurrence) {
  return occurrence.hidden || localHiddenSet.value.has(occurrence.id)
}

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

function blockStyle(occurrence: Occurrence, color: PaletteColor) {
  const { top, span } = occurrenceRowSpan(occurrence, rows.value)
  const slot = conflictSlots.value[occurrence.id] ?? { index: 0, count: 1 }
  const column = Math.min(Math.max(occurrence.weekday, 1), 7) - 1
  const width = COLUMN_WIDTH / slot.count
  const left = column * COLUMN_WIDTH + slot.index * width
  const border = occurrence.kind === 'custom'
    ? `border: 2rpx dashed ${color.fg}`
    : `border-left: 4rpx solid ${color.fg}`
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
  return {
    occurrence,
    style: blockStyle(occurrence, color),
    badge: KIND_BADGES[occurrence.kind] ?? '',
    badgeStyle: `background-color: ${color.fg}`,
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
      cacheWeekView(data)
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
      setTimeout(() => uni.navigateTo({ url: '/pages/timetable/import' }), 1500)
    }
    else {
      uni.navigateTo({ url: '/pages/timetable/import' })
    }
    return
  }
  handleApiException(outcome.error)
}

const detailColor = computed(() => (detail.value ? colorForOccurrence(detail.value) : null))
const detailTime = computed(() => {
  const item = detail.value
  if (!item)
    return ''
  const parts = [
    `${chineseDate(item.date)} 周${WEEKDAY_LABELS[item.weekday - 1] ?? ''}`,
    `${clockOf(item.start)}–${clockOf(item.end)}`,
  ]
  if (item.start_section && item.end_section) {
    parts.push(item.start_section === item.end_section
      ? `第${item.start_section}节`
      : `第${item.start_section}–${item.end_section}节`)
  }
  return parts.join(' · ')
})
const detailStatus = computed(() => (detail.value ? STATUS_LABELS[detail.value.status] ?? '' : ''))
const detailHidden = computed(() => !!detail.value && isHidden(detail.value))
const detailActions = computed<DetailAction[]>(() => {
  const item = detail.value
  if (!item)
    return []
  const actions: DetailAction[] = []
  if (item.kind === 'college' || item.kind === 'activity')
    actions.push({ key: 'activity', label: '查看活动 / 签到', primary: true })
  else if (item.kind === 'appoint')
    actions.push({ key: 'appoint', label: '查看预约', primary: true })
  else if (item.kind === 'custom')
    actions.push({ key: 'edit', label: '编辑', primary: true })
  actions.push(detailHidden.value
    ? { key: 'unhide', label: '取消隐藏', primary: false }
    : { key: 'hide', label: '隐藏', primary: false })
  return actions
})

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

function goImport(section?: 'settings') {
  uni.navigateTo({ url: section ? `/pages/timetable/import?section=${section}` : '/pages/timetable/import' })
}

function goPoster() {
  if (!view.value)
    return
  uni.navigateTo({
    url: `/pages/timetable/poster?term=${encodeURIComponent(view.value.term.code)}&week=${view.value.week}`,
  })
}

function goGrades() {
  uni.navigateTo({ url: '/pages/timetable/grades' })
}

let shownBefore = false

onLoad(() => {
  const cached = readCachedWeekView()
  if (cached)
    view.value = cached
  void loadWeek(null)
})

onShow(() => {
  // 导入页可能改了本机隐藏偏好；从其它页返回时刷新数据
  showHidden.value = readShowHidden()
  localHiddenIds.value = readLocalHiddenIds()
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
  <view class="min-h-screen bg-gray-50 pb-24">
    <uv-toast ref="toastRef" />
    <!-- 学期 + 周切换 -->
    <view class="sticky top-0 z-10 bg-white px-3 py-2 shadow-sm">
      <view class="flex items-center justify-between gap-2">
        <view class="min-w-0 flex-1">
          <text class="block truncate text-sm text-gray-800 font-medium">{{ term?.name || '课表' }}</text>
          <text class="block text-2xs text-gray-400">
            {{ weekRangeLabel }}<text v-if="loading && view"> · 更新中…</text>
          </text>
        </view>
        <view class="flex shrink-0 items-center">
          <view
            class="rounded-full p-1.5 active:bg-gray-100"
            :class="{ 'opacity-30': !canPrev }"
            @click="goWeek(-1)"
          >
            <view class="i-carbon-chevron-left text-lg text-gray-600" />
          </view>
          <view class="min-w-14 text-center text-sm text-gray-800 font-bold" @click="goCurrentWeek">
            {{ view ? `第 ${view.week} 周` : '—' }}
          </view>
          <view
            class="rounded-full p-1.5 active:bg-gray-100"
            :class="{ 'opacity-30': !canNext }"
            @click="goWeek(1)"
          >
            <view class="i-carbon-chevron-right text-lg text-gray-600" />
          </view>
          <view
            v-if="view && !isCurrentWeek"
            class="ml-1 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-600 active:bg-blue-100"
            @click="goCurrentWeek"
          >
            本周
          </view>
          <view
            class="ml-1 rounded-full p-1.5 text-blue-600 active:bg-blue-50"
            :class="{ 'opacity-50': syncing }"
            @click="handleSync"
          >
            <view class="i-carbon-renew text-lg" />
          </view>
        </view>
      </view>
    </view>

    <!-- 首次加载 / 加载失败 -->
    <view v-if="!view && loading" class="flex flex-col items-center justify-center py-24 text-sm text-gray-400">
      <uv-loading-icon mode="circle" />
      <text class="mt-3">正在加载课表…</text>
    </view>
    <view v-else-if="!view && loadError" class="flex flex-col items-center justify-center px-8 py-24 text-center">
      <text class="i-carbon-warning-alt mb-3 text-3xl text-gray-300" />
      <text class="text-sm text-gray-500 leading-6">{{ loadError }}</text>
      <button class="mt-5 rounded-lg bg-blue-500 px-6 py-2 text-sm text-white" @click="loadWeek(selected)">
        重试
      </button>
    </view>

    <!-- 周视图网格 -->
    <view v-else-if="view" class="mx-2 mt-2 overflow-hidden rounded-xl bg-white shadow-sm">
      <view class="flex border-b border-gray-100">
        <view class="w-11 shrink-0" />
        <view
          v-for="(day, index) in dayColumns"
          :key="index"
          class="flex-1 py-1 text-center"
          :class="day.today ? 'bg-blue-50' : day.suspended ? CALENDAR_SHADE_CLASS : ''"
        >
          <text class="block text-xs" :class="day.today ? 'text-blue-600 font-bold' : 'text-gray-600'">
            周{{ day.weekday }}
          </text>
          <text class="block text-3xs" :class="day.today ? 'text-blue-500' : 'text-gray-400'">
            {{ day.date }}
          </text>
          <!-- 校历标签行常驻占位，表头高度不随周次变化 -->
          <text class="block min-h-26rpx truncate px-0.5 text-3xs" :class="day.labelClass">
            {{ day.label }}
          </text>
        </view>
      </view>

      <view class="flex">
        <view class="w-11 shrink-0">
          <view
            v-for="row in rows"
            :key="row.section"
            class="flex flex-col items-center justify-center border-b border-gray-50"
            :style="{ height: `${ROW_HEIGHT}rpx` }"
          >
            <text class="text-xs text-gray-700 font-medium">{{ row.section }}</text>
            <text class="text-3xs text-gray-400">{{ row.start }}</text>
            <text class="text-3xs text-gray-400">{{ row.end }}</text>
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
            <view v-if="day.today" class="absolute inset-0 bg-blue-50 opacity-50" />
          </view>
          <view
            v-for="(row, rowIndex) in rows"
            :key="`row-${row.section}`"
            class="absolute left-0 right-0 border-b border-gray-50"
            :style="{ top: `${(rowIndex + 1) * ROW_HEIGHT - 1}rpx` }"
          />

          <view
            v-for="block in blocks"
            :key="block.occurrence.id"
            class="grid-block absolute box-border overflow-hidden rounded-md"
            :style="block.style"
            @click="openDetail(block.occurrence)"
          >
            <text
              class="grid-block__title block text-2xs font-medium leading-tight"
              :class="{ 'line-through': block.occurrence.status === 'canceled' }"
            >
              {{ block.occurrence.title }}
            </text>
            <text v-if="block.occurrence.location" class="mt-0.5 block truncate text-3xs opacity-80">
              {{ block.occurrence.location }}
            </text>
            <text v-if="block.badge" class="grid-block__badge" :style="block.badgeStyle">{{ block.badge }}</text>
          </view>

          <view
            v-if="visibleOccurrences.length === 0"
            class="absolute inset-0 flex flex-col items-center justify-center"
          >
            <text class="i-carbon-calendar text-4xl text-gray-200" />
            <text class="mt-2 text-sm text-gray-400">
              {{ emptyText }}
            </text>
            <button
              v-if="termHasEntries === false"
              class="mt-4 rounded-full bg-blue-600 px-5 py-1.5 text-sm text-white"
              @click="goImport()"
            >
              导入课表
            </button>
          </view>
        </view>
      </view>
    </view>

    <view v-if="view && sourceLegend" class="mx-4 mt-2 text-2xs text-gray-400">
      来源：{{ sourceLegend }}
    </view>

    <!-- 底部操作栏 -->
    <view class="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-100 bg-white pb-safe">
      <view class="flex">
        <view class="flex flex-1 flex-col items-center py-2 active:bg-gray-50" @click="goImport()">
          <view class="i-carbon-cloud-download text-xl text-blue-600" />
          <text class="mt-0.5 text-xs text-gray-600">导入</text>
        </view>
        <view class="flex flex-1 flex-col items-center py-2 active:bg-gray-50" @click="goGrades">
          <view class="i-carbon-report text-xl text-blue-600" />
          <text class="mt-0.5 text-xs text-gray-600">成绩</text>
        </view>
        <view class="flex flex-1 flex-col items-center py-2 active:bg-gray-50" @click="goPoster">
          <view class="i-carbon-image text-xl text-blue-600" />
          <text class="mt-0.5 text-xs text-gray-600">海报</text>
        </view>
        <view class="flex flex-1 flex-col items-center py-2 active:bg-gray-50" @click="goImport('settings')">
          <view class="i-carbon-settings text-xl text-blue-600" />
          <text class="mt-0.5 text-xs text-gray-600">设置</text>
        </view>
      </view>
    </view>
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

.grid-block__badge {
  position: absolute;
  right: 4rpx;
  bottom: 4rpx;
  padding: 0 6rpx;
  font-size: 18rpx;
  line-height: 26rpx;
  color: #fff;
  border-radius: 6rpx;
  opacity: 0.85;
}

button::after {
  border: none;
}
</style>
