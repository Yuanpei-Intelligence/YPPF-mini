<script lang="ts" setup>
import type { EditScope, Entry, Occurrence, WeekDay } from '@/api/types/timetable'
import type { DetailAction, DetailActionKey } from '@/utils/timetable'
import { computed, ref } from 'vue'
import {
  clockOf,
  colorForOccurrence,
  describeCatalogMeta,
  describeCourseCode,
  describeExamTime,
  describeOccurrenceTime,
  describeWeeks,
  detailActionsFor,
  displayEndClock,
  entrySpansWeeks,
  heldDespiteCalendar,
  heldNotice,
  isSuspended,
  KIND_LABELS,
  ROLE_LABELS,
  SCOPE_LABELS,
  STATUS_LABELS,
  suspendedNotice,
  swapDescription,
  swapNote,
} from '@/utils/timetable'

/*
 * 日程详情底部弹层（课表页与日视图共用）。
 * 只负责展示与收集操作意图：条目详情由父页面加载后传入，点操作按钮通过 action / edit 事件交给父页面执行。
 * 「编辑」在条目跨多周时先弹范围选择（仅本次 / 本次及以后 / 全部），再以 edit 事件带出范围；
 * 「照常上课」「恢复按校历停课」同样先选范围，以 action 事件带出（单周条目直接用仅本次）。
 * The week grid draws one occurrence per overlapping slot and passes the others as `overlaps`;
 * they are listed as a switcher and picking one emits `switch`.
 */

const props = withDefaults(defineProps<{
  occurrence: Occurrence | null
  /** 懒加载的条目详情（有 entry_id 的日程）；未加载或无法加载时为 null */
  entry?: Entry | null
  entryLoading?: boolean
  /** 详情加载失败的说明；为空表示没有失败 */
  entryError?: string
  hidden?: boolean
  /** 有操作在进行中，按钮全部禁用 */
  busy?: boolean
  /** Other occurrences in the same slot of the week grid */
  overlaps?: Occurrence[]
  /** 这天的校历信息（停课原因、调休），取自 week/ 的 days；没有为 null */
  calendarDay?: WeekDay | null
}>(), {
  entry: null,
  entryLoading: false,
  entryError: '',
  hidden: false,
  busy: false,
  overlaps: () => [],
  calendarDay: null,
})

const emit = defineEmits<{
  action: [key: Exclude<DetailActionKey, 'edit'>, scope?: EditScope]
  edit: [scope: EditScope]
  switch: [occurrence: Occurrence]
}>()

interface PopupInstance {
  open: () => void
  close: () => void
}

interface ScopeAction {
  name: string
  scope: EditScope
}

/** Actions that ask for a week range first */
type ScopedActionKey = Extract<DetailActionKey, 'edit' | 'hold' | 'unhold'>

const SCOPE_TITLES: Record<ScopedActionKey, string> = {
  edit: '修改哪些周次？',
  hold: '哪些周次照常上课？',
  unhold: '哪些周次恢复按校历停课？',
}

const popup = ref<PopupInstance | null>(null)
const scopeSheet = ref<PopupInstance | null>(null)
/** Which action the scope sheet is choosing weeks for */
const scopeFor = ref<ScopedActionKey>('edit')

const SCOPE_ACTIONS: ScopeAction[] = (['single', 'following', 'all'] as EditScope[])
  .map(scope => ({ name: SCOPE_LABELS[scope], scope }))

const color = computed(() => (props.occurrence ? colorForOccurrence(props.occurrence) : null))
const time = computed(() => (props.occurrence ? describeOccurrenceTime(props.occurrence) : ''))
// 停课的课由校历说明代替状态行
const status = computed(() => (props.occurrence && !isSuspended(props.occurrence) ? STATUS_LABELS[props.occurrence.status] ?? '' : ''))
const kindLabel = computed(() => (props.occurrence ? KIND_LABELS[props.occurrence.kind] ?? '' : ''))
/** 已选 / 旁听：优先用条目详情，其次日程自带的 role */
const roleLabel = computed(() => {
  const role = props.entry?.role ?? props.occurrence?.role
  return role ? ROLE_LABELS[role] ?? '' : ''
})
const tag = computed(() => props.entry?.tag ?? props.occurrence?.tag ?? '')
const modified = computed(() => !!props.occurrence?.modified)
/** 已设为照常上课：校历停课日按普通日程显示的存储课程 */
const held = computed(() => !!props.occurrence && heldDespiteCalendar(props.occurrence, props.calendarDay, props.entry))
/** 校历说明：本次停课 / 已设为照常上课 / 调休 */
const calendarNotice = computed(() => {
  const occurrence = props.occurrence
  if (!occurrence)
    return ''
  if (isSuspended(occurrence))
    return suspendedNotice(occurrence, props.calendarDay)
  if (held.value)
    return heldNotice(occurrence, props.calendarDay)
  return swapDescription(occurrence)
})

/** 条目详情行：只列有值的 */
const detailRows = computed<{ icon: string, text: string, multiline?: boolean }[]>(() => {
  const entry = props.entry
  if (!entry)
    return []
  const catalog = entry.catalog ?? null
  const rows: { icon: string, text: string, multiline?: boolean }[] = []
  const code = describeCourseCode(entry) || (catalog ? describeCourseCode(catalog) : '')
  if (code)
    rows.push({ icon: 'i-carbon-hashtag', text: `课程号 ${code}` })
  const teacher = entry.teacher || catalog?.teacher || ''
  if (teacher)
    rows.push({ icon: 'i-carbon-user', text: teacher })
  const meta = catalog ? describeCatalogMeta(catalog) : ''
  if (meta)
    rows.push({ icon: 'i-carbon-education', text: meta })
  rows.push({ icon: 'i-carbon-calendar', text: describeWeeks(entry) })
  if (entry.exam) {
    const examParts = [describeExamTime(entry.exam), entry.exam.room, entry.exam.method].filter(Boolean)
    rows.push({ icon: 'i-carbon-task', text: `考试 ${examParts.join(' · ')}` })
  }
  if (entry.note)
    rows.push({ icon: 'i-carbon-notebook', text: entry.note, multiline: true })
  return rows
})

/** Switcher entries for the overlapping occurrences, earliest first */
const overlapItems = computed(() => [...props.overlaps]
  .sort((a, b) => a.start.localeCompare(b.start))
  .map(item => ({
    occurrence: item,
    color: colorForOccurrence(item).fg,
    meta: [
      `${KIND_LABELS[item.kind] ?? ''} ${clockOf(item.start)}–${displayEndClock(item)}`,
      isSuspended(item) ? STATUS_LABELS.suspended : swapNote(item),
    ].filter(Boolean).join(' · '),
  })))

const actions = computed<DetailAction[]>(() => (
  props.occurrence
    ? detailActionsFor(props.occurrence, { hidden: props.hidden, entry: props.entry, held: held.value })
    : []
))

function open() {
  popup.value?.open()
}

function close() {
  popup.value?.close()
}

function openScopeSheet(key: ScopedActionKey) {
  scopeFor.value = key
  close()
  scopeSheet.value?.open()
}

function onAction(key: DetailActionKey) {
  if (props.busy)
    return
  if (key === 'hold' || key === 'unhold') {
    // 照常上课 / 恢复按校历停课：单周条目只改这一周，跨多周或详情没拿到时先选范围
    if (props.entry && !entrySpansWeeks(props.entry))
      emit('action', key, 'single')
    else
      openScopeSheet(key)
    return
  }
  if (key !== 'edit') {
    emit('action', key)
    return
  }
  // 跨多周的条目先选范围；单周条目（含考试）只能改全部；详情没拿到时也按全部处理
  if (props.entry && entrySpansWeeks(props.entry)) {
    openScopeSheet('edit')
    return
  }
  emit('edit', 'all')
}

function onSwitch(occurrence: Occurrence) {
  if (!props.busy)
    emit('switch', occurrence)
}

function onScopeSelect(item: ScopeAction) {
  if (scopeFor.value === 'edit')
    emit('edit', item.scope)
  else
    emit('action', scopeFor.value, item.scope)
}

defineExpose({ open, close })
</script>

<template>
  <uv-popup ref="popup" mode="bottom" :round="16" :safe-area-inset-bottom="true">
    <view v-if="occurrence" class="px-5 pb-6 pt-5">
      <view class="flex items-start gap-3">
        <view
          class="mt-1 h-10 w-1.5 shrink-0 rounded-full"
          :style="{ backgroundColor: color?.fg }"
        />
        <view class="min-w-0 flex-1">
          <text class="block text-lg text-fg-1 font-bold leading-6">{{ occurrence.title }}</text>
          <text v-if="occurrence.subtitle" class="mt-1 block text-sm text-fg-2">{{ occurrence.subtitle }}</text>
        </view>
        <view class="flex shrink-0 flex-col items-end gap-1">
          <view class="rounded-full bg-fill px-2 py-0.5 text-xs text-fg-2">
            {{ kindLabel }}
          </view>
          <view v-if="roleLabel" class="rounded-full px-2 py-0.5 text-xs" :class="roleLabel === '旁听' ? 'bg-warning-light text-warning-dark' : 'bg-primary-light text-primary'">
            {{ roleLabel }}
          </view>
        </view>
      </view>

      <!-- 周视图同一时段只画一个日程，其余在这里切换 -->
      <view v-if="overlapItems.length" class="mt-3">
        <text class="block text-xs text-fg-3">同一时段还有 {{ overlapItems.length }} 项</text>
        <scroll-view scroll-x class="overlap-switcher" :show-scrollbar="false" :enhanced="true">
          <view
            v-for="item in overlapItems"
            :key="item.occurrence.id"
            class="overlap-switcher__item"
            @click="onSwitch(item.occurrence)"
          >
            <view class="overlap-switcher__chip active:bg-fill-active">
              <view class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: item.color }" />
              <text class="overlap-switcher__title text-sm text-fg-1">{{ item.occurrence.title }}</text>
              <text class="shrink-0 text-xs text-fg-3">{{ item.meta }}</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- 校历：本次停课 / 已设为照常上课 / 调休 -->
      <view v-if="calendarNotice" class="mt-4 flex items-start gap-2 rounded-md bg-fill px-3 py-2 text-sm text-fg-2">
        <text class="i-carbon-calendar mt-0.5 shrink-0 text-base text-fg-3" />
        <text class="flex-1">{{ calendarNotice }}</text>
      </view>

      <view class="mt-4 text-sm text-fg-2 space-y-2">
        <view class="flex items-start gap-2">
          <text class="i-carbon-time mt-0.5 shrink-0 text-base text-fg-3" />
          <text class="flex-1">{{ time }}</text>
        </view>
        <view v-if="occurrence.location" class="flex items-start gap-2">
          <text class="i-carbon-location mt-0.5 shrink-0 text-base text-fg-3" />
          <text class="flex-1">{{ occurrence.location }}</text>
        </view>
        <view v-if="tag" class="flex items-start gap-2">
          <text class="i-carbon-tag mt-0.5 shrink-0 text-base text-fg-3" />
          <text class="flex-1">{{ tag }}</text>
        </view>
        <view
          v-for="(row, index) in detailRows"
          :key="index"
          class="flex items-start gap-2"
        >
          <text class="mt-0.5 shrink-0 text-base text-fg-3" :class="row.icon" />
          <text class="flex-1" :class="{ 'whitespace-pre-wrap break-all': row.multiline }">{{ row.text }}</text>
        </view>
        <view v-if="status" class="flex items-start gap-2">
          <text class="i-carbon-information mt-0.5 shrink-0 text-base text-fg-3" />
          <text class="flex-1">{{ status }}</text>
        </view>
        <view v-if="modified" class="flex items-start gap-2 text-warning">
          <text class="i-carbon-edit mt-0.5 shrink-0 text-base" />
          <text class="flex-1">本次已调整</text>
        </view>
        <view v-if="hidden" class="flex items-start gap-2">
          <text class="i-carbon-view-off mt-0.5 shrink-0 text-base text-fg-3" />
          <text class="flex-1">已隐藏</text>
        </view>
        <view v-if="entryLoading" class="flex items-center gap-2 text-xs text-fg-3">
          <uv-loading-icon size="14" />
          <text>正在加载详情…</text>
        </view>
        <text v-else-if="entryError" class="block text-xs text-fg-3">{{ entryError }}</text>
      </view>

      <view class="detail-actions mt-5">
        <button
          v-for="action in actions"
          :key="action.key"
          class="detail-action"
          :class="[action.primary ? 'btn-primary' : action.danger ? 'btn-danger' : 'btn-outline', { 'detail-action--wide': action.wide }]"
          :disabled="busy"
          @click="onAction(action.key)"
        >
          {{ action.label }}
        </button>
      </view>
    </view>
  </uv-popup>

  <!-- 编辑范围 -->
  <uv-action-sheet
    ref="scopeSheet"
    :title="SCOPE_TITLES[scopeFor]"
    :actions="SCOPE_ACTIONS"
    cancel-text="取消"
    :round="16"
    @select="onScopeSelect"
  />
</template>

<style lang="scss" scoped>
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.detail-action {
  flex: 1 1 40%;
  margin: 0;
}

.detail-action--wide {
  flex-basis: 100%;
}

.overlap-switcher {
  white-space: nowrap;
}

/* 72rpx chip + 8rpx above and below = 88rpx tap target */
.overlap-switcher__item {
  display: inline-block;
  padding: 8rpx 16rpx 8rpx 0;
  vertical-align: top;
}

.overlap-switcher__chip {
  display: flex;
  gap: 12rpx;
  align-items: center;
  min-height: 72rpx;
  padding: 0 24rpx;
  background: var(--yp-bg-fill);
  border-radius: 999rpx;
}

.overlap-switcher__title {
  max-width: 320rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
