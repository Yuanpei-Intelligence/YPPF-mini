<script lang="ts" setup>
import type { EditScope, Entry, Occurrence } from '@/api/types/timetable'
import type { DetailAction, DetailActionKey } from '@/utils/timetable'
import { computed, ref } from 'vue'
import {
  colorForOccurrence,
  describeCatalogMeta,
  describeCourseCode,
  describeExamTime,
  describeOccurrenceTime,
  describeWeeks,
  detailActionsFor,
  entrySpansWeeks,
  KIND_LABELS,
  ROLE_LABELS,
  SCOPE_LABELS,
  STATUS_LABELS,
} from '@/utils/timetable'

/*
 * 日程详情底部弹层（课表页与日视图共用）。
 * 只负责展示与收集操作意图：条目详情由父页面加载后传入，点操作按钮通过 action / edit 事件交给父页面执行。
 * 「编辑」在条目跨多周时先弹范围选择（仅本次 / 本次及以后 / 全部），再以 edit 事件带出范围。
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
}>(), {
  entry: null,
  entryLoading: false,
  entryError: '',
  hidden: false,
  busy: false,
})

const emit = defineEmits<{
  action: [key: Exclude<DetailActionKey, 'edit'>]
  edit: [scope: EditScope]
}>()

interface PopupInstance {
  open: () => void
  close: () => void
}

interface ScopeAction {
  name: string
  scope: EditScope
}

const popup = ref<PopupInstance | null>(null)
const scopeSheet = ref<PopupInstance | null>(null)

const SCOPE_ACTIONS: ScopeAction[] = (['single', 'following', 'all'] as EditScope[])
  .map(scope => ({ name: SCOPE_LABELS[scope], scope }))

const color = computed(() => (props.occurrence ? colorForOccurrence(props.occurrence) : null))
const time = computed(() => (props.occurrence ? describeOccurrenceTime(props.occurrence) : ''))
const status = computed(() => (props.occurrence ? STATUS_LABELS[props.occurrence.status] ?? '' : ''))
const kindLabel = computed(() => (props.occurrence ? KIND_LABELS[props.occurrence.kind] ?? '' : ''))
/** 已选 / 旁听：优先用条目详情，其次日程自带的 role */
const roleLabel = computed(() => {
  const role = props.entry?.role ?? props.occurrence?.role
  return role ? ROLE_LABELS[role] ?? '' : ''
})
const tag = computed(() => props.entry?.tag ?? props.occurrence?.tag ?? '')
const modified = computed(() => !!props.occurrence?.modified)

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

const actions = computed<DetailAction[]>(() => (
  props.occurrence
    ? detailActionsFor(props.occurrence, { hidden: props.hidden, entry: props.entry })
    : []
))

function open() {
  popup.value?.open()
}

function close() {
  popup.value?.close()
}

function onAction(key: DetailActionKey) {
  if (props.busy)
    return
  if (key !== 'edit') {
    emit('action', key)
    return
  }
  // 跨多周的条目先选范围；单周条目（含考试）只能改全部；详情没拿到时也按全部处理
  if (props.entry && entrySpansWeeks(props.entry)) {
    close()
    scopeSheet.value?.open()
    return
  }
  emit('edit', 'all')
}

function onScopeSelect(item: ScopeAction) {
  emit('edit', item.scope)
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
          <text class="block text-lg text-gray-900 font-bold leading-6">{{ occurrence.title }}</text>
          <text v-if="occurrence.subtitle" class="mt-1 block text-sm text-gray-500">{{ occurrence.subtitle }}</text>
        </view>
        <view class="flex shrink-0 flex-col items-end gap-1">
          <view class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {{ kindLabel }}
          </view>
          <view v-if="roleLabel" class="rounded-full px-2 py-0.5 text-xs" :class="roleLabel === '旁听' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-600'">
            {{ roleLabel }}
          </view>
        </view>
      </view>

      <view class="mt-4 text-sm text-gray-600 space-y-2">
        <view class="flex items-start gap-2">
          <text class="i-carbon-time mt-0.5 shrink-0 text-base text-gray-400" />
          <text class="flex-1">{{ time }}</text>
        </view>
        <view v-if="occurrence.location" class="flex items-start gap-2">
          <text class="i-carbon-location mt-0.5 shrink-0 text-base text-gray-400" />
          <text class="flex-1">{{ occurrence.location }}</text>
        </view>
        <view v-if="tag" class="flex items-start gap-2">
          <text class="i-carbon-tag mt-0.5 shrink-0 text-base text-gray-400" />
          <text class="flex-1">{{ tag }}</text>
        </view>
        <view
          v-for="(row, index) in detailRows"
          :key="index"
          class="flex items-start gap-2"
        >
          <text class="mt-0.5 shrink-0 text-base text-gray-400" :class="row.icon" />
          <text class="flex-1" :class="{ 'whitespace-pre-wrap break-all': row.multiline }">{{ row.text }}</text>
        </view>
        <view v-if="status" class="flex items-start gap-2">
          <text class="i-carbon-information mt-0.5 shrink-0 text-base text-gray-400" />
          <text class="flex-1">{{ status }}</text>
        </view>
        <view v-if="modified" class="flex items-start gap-2 text-amber-600">
          <text class="i-carbon-edit mt-0.5 shrink-0 text-base" />
          <text class="flex-1">本次已调整</text>
        </view>
        <view v-if="hidden" class="flex items-start gap-2">
          <text class="i-carbon-view-off mt-0.5 shrink-0 text-base text-gray-400" />
          <text class="flex-1">已隐藏</text>
        </view>
        <view v-if="entryLoading" class="flex items-center gap-2 text-xs text-gray-400">
          <uv-loading-icon size="14" />
          <text>正在加载详情…</text>
        </view>
        <text v-else-if="entryError" class="block text-xs text-gray-400">{{ entryError }}</text>
      </view>

      <view class="detail-actions mt-5">
        <button
          v-for="action in actions"
          :key="action.key"
          class="detail-action rounded-lg py-2.5 text-sm font-medium"
          :class="action.primary
            ? 'bg-blue-500 text-white'
            : action.danger
              ? 'border border-red-200 bg-white text-red-500'
              : 'border border-gray-200 bg-white text-gray-700'"
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
    title="修改哪些周次？"
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

button::after {
  border: none;
}
</style>
