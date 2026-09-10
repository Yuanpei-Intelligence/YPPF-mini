<script lang="ts" setup>
import type { CatalogEntry, CatalogSlot, Entry, EntryIn, Parity, Term } from '@/api/types/timetable'
import { onLoad } from '@dcloudio/uni-app'
import { computed, reactive, ref, watch } from 'vue'
import { createEntry, deleteEntry, getTerms, listEntries, searchCatalog, updateEntry } from '@/api/timetable'
import { getApiError } from '@/http/error'
import { debounce } from '@/utils/debounce'
import { confirmModal } from '@/utils/dialog'
import { describeSlot, PARITY_LABELS, sectionRows, WEEKDAY_LABELS } from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '自定义日程',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
  },
})

const entryId = ref<number | null>(null)
const requestedTerm = ref('')
const term = ref<Term | null>(null)
const existing = ref<Entry | null>(null)
const loading = ref(true)
const loadError = ref('')
const submitting = ref(false)
const deleting = ref(false)
const formError = ref('')
const fieldErrors = ref<Record<string, string[]>>({})

const isEdit = computed(() => entryId.value !== null)

const form = reactive({
  name: '',
  // 课程号 / 班号只在从课程库填入或编辑已有条目时有值，表单上不直接编辑
  course_code: '',
  class_no: '',
  weekday: 1,
  start_section: 1,
  end_section: 2,
  week_start: 1,
  week_end: 16,
  parity: 0 as Parity,
  room: '',
  teacher: '',
  note: '',
})

const rows = computed(() => sectionRows(term.value))
const weekdayOptions = WEEKDAY_LABELS.map(label => `周${label}`)
const sectionOptions = computed(() => rows.value.map(row => `第${row.section}节 ${row.start}–${row.end}`))
const totalWeeks = computed(() => term.value?.total_weeks ?? 16)
const weekOptions = computed(() => Array.from({ length: totalWeeks.value }, (_, index) => `第${index + 1}周`))
const parityOptions = [...PARITY_LABELS]

const startSectionIndex = computed(() => Math.max(rows.value.findIndex(row => row.section === form.start_section), 0))
const endSectionIndex = computed(() => Math.max(rows.value.findIndex(row => row.section === form.end_section), 0))

function fieldError(field: string) {
  return fieldErrors.value[field]?.join('；') ?? ''
}

function pickerIndex(event: { detail: { value: number | string } }) {
  return Number(event.detail.value)
}

function onWeekdayChange(event: { detail: { value: number | string } }) {
  form.weekday = pickerIndex(event) + 1
}

function onStartSectionChange(event: { detail: { value: number | string } }) {
  const row = rows.value[pickerIndex(event)]
  if (!row)
    return
  form.start_section = row.section
  if (form.end_section < row.section)
    form.end_section = row.section
}

function onEndSectionChange(event: { detail: { value: number | string } }) {
  const row = rows.value[pickerIndex(event)]
  if (!row)
    return
  form.end_section = row.section
  if (form.start_section > row.section)
    form.start_section = row.section
}

function onWeekStartChange(event: { detail: { value: number | string } }) {
  form.week_start = pickerIndex(event) + 1
  if (form.week_end < form.week_start)
    form.week_end = form.week_start
}

function onWeekEndChange(event: { detail: { value: number | string } }) {
  form.week_end = pickerIndex(event) + 1
  if (form.week_start > form.week_end)
    form.week_start = form.week_end
}

function onParityChange(event: { detail: { value: number | string } }) {
  const value = pickerIndex(event)
  form.parity = (value === 1 || value === 2 ? value : 0) as Parity
}

// 课程库联想（仅新建时展示）
const catalogQuery = ref('')
const catalogResults = ref<CatalogEntry[]>([])
const catalogSearching = ref(false)
const catalogPicked = ref<CatalogEntry | null>(null)
/** 选中课程里当前填入表单的时间块下标；-1 表示尚未选 */
const catalogSlotIndex = ref(-1)
let catalogSeq = 0

async function runCatalogSearch(q: string) {
  if (!term.value)
    return
  const seq = ++catalogSeq
  catalogSearching.value = true
  try {
    const results = await searchCatalog({ term: term.value.code, q }, { hideErrorToast: true })
    if (seq === catalogSeq)
      catalogResults.value = Array.isArray(results) ? results : []
  }
  catch {
    // 课程库未部署（404）或搜索失败：不展示结果即可
    if (seq === catalogSeq)
      catalogResults.value = []
  }
  finally {
    if (seq === catalogSeq)
      catalogSearching.value = false
  }
}

const searchCatalogDebounced = debounce((q: string) => {
  void runCatalogSearch(q)
}, 300)

function resetCatalogSearch() {
  searchCatalogDebounced.cancel()
  // 让在途的搜索结果失效
  catalogSeq++
  catalogResults.value = []
  catalogSearching.value = false
}

watch(catalogQuery, (value) => {
  const q = value.trim()
  if (q.length < 2) {
    resetCatalogSearch()
    return
  }
  searchCatalogDebounced(q)
})

function describeCatalogEntry(entry: CatalogEntry) {
  const code = [entry.course_code, entry.class_no].filter(Boolean).join('-')
  return [code, entry.teacher, entry.time_text].filter(Boolean).join(' · ')
}

function slotLabel(slot: CatalogSlot, index: number) {
  return describeSlot(slot) || `时间 ${index + 1}`
}

/** 把课程库条目填进表单；slot 为 null 时只填课程信息，时间由用户自己选 */
function applyCatalogEntry(entry: CatalogEntry, slot: CatalogSlot | null) {
  form.name = entry.name
  form.teacher = entry.teacher
  form.course_code = entry.course_code
  form.class_no = entry.class_no
  if (slot) {
    if (slot.weekday && slot.weekday >= 1 && slot.weekday <= 7)
      form.weekday = slot.weekday
    if (slot.start_section && slot.end_section && slot.end_section >= slot.start_section) {
      form.start_section = slot.start_section
      form.end_section = slot.end_section
    }
    if (slot.week_start && slot.week_end && slot.week_end >= slot.week_start) {
      form.week_start = Math.min(slot.week_start, totalWeeks.value)
      form.week_end = Math.min(slot.week_end, totalWeeks.value)
    }
    if (slot.parity === 0 || slot.parity === 1 || slot.parity === 2)
      form.parity = slot.parity
    if (slot.room)
      form.room = slot.room
  }
  fieldErrors.value = {}
  formError.value = ''
}

function pickCatalogEntry(entry: CatalogEntry) {
  // slots 是后端尽力解析的结果，兜底成空数组，模板里不再判空
  const slots = Array.isArray(entry.slots) ? entry.slots : []
  catalogPicked.value = { ...entry, slots }
  catalogQuery.value = ''
  resetCatalogSearch()
  // 只有一个时间块时直接填入；多个时先填课程信息，由用户点选时间块
  catalogSlotIndex.value = slots.length === 1 ? 0 : -1
  applyCatalogEntry(entry, slots.length === 1 ? slots[0] : null)
}

function pickCatalogSlot(index: number) {
  const entry = catalogPicked.value
  const slot = entry?.slots[index]
  if (!entry || !slot)
    return
  catalogSlotIndex.value = index
  applyCatalogEntry(entry, slot)
}

function clearCatalogPick() {
  catalogPicked.value = null
  catalogSlotIndex.value = -1
}

function fillFrom(entry: Entry) {
  form.name = entry.name
  form.course_code = entry.course_code
  form.class_no = entry.class_no
  form.weekday = entry.weekday
  form.start_section = entry.start_section > 0 ? entry.start_section : 1
  form.end_section = entry.end_section > 0 ? entry.end_section : form.start_section
  form.week_start = entry.week_start
  form.week_end = entry.week_end
  form.parity = entry.parity
  form.room = entry.room
  form.teacher = entry.teacher
  form.note = entry.note
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const terms = await getTerms({ hideErrorToast: true })
    const picked = (requestedTerm.value && terms.terms.find(item => item.code === requestedTerm.value))
      || terms.current
      || terms.terms[0]
      || null
    if (!picked) {
      loadError.value = '当前没有可用学期，请联系管理员。'
      return
    }
    term.value = picked
    form.week_end = Math.min(form.week_end, picked.total_weeks)

    if (entryId.value !== null) {
      const entries = await listEntries({ term: picked.code }, { hideErrorToast: true })
      const found = entries.find(item => item.id === entryId.value)
      if (!found) {
        loadError.value = '未找到该日程，可能已被删除。'
        return
      }
      if (found.source !== 'manual') {
        loadError.value = '只有手动添加的日程可以编辑。'
        return
      }
      existing.value = found
      fillFrom(found)
    }
  }
  catch (error) {
    loadError.value = getApiError(error, '加载失败').message
  }
  finally {
    loading.value = false
  }
}

function validate(): boolean {
  fieldErrors.value = {}
  formError.value = ''
  if (!form.name.trim()) {
    fieldErrors.value = { name: ['请填写名称'] }
    return false
  }
  if (form.end_section < form.start_section) {
    fieldErrors.value = { end_section: ['结束节次不能早于开始节次'] }
    return false
  }
  if (form.week_end < form.week_start) {
    fieldErrors.value = { week_end: ['结束周不能早于开始周'] }
    return false
  }
  return true
}

function buildPayload(): EntryIn {
  const startRow = rows.value.find(row => row.section === form.start_section)
  const endRow = rows.value.find(row => row.section === form.end_section)
  return {
    name: form.name.trim(),
    course_code: form.course_code,
    class_no: form.class_no,
    teacher: form.teacher.trim(),
    room: form.room.trim(),
    weekday: form.weekday,
    start_section: form.start_section,
    end_section: form.end_section,
    start_time: startRow?.start ?? '',
    end_time: endRow?.end ?? '',
    week_start: form.week_start,
    week_end: form.week_end,
    parity: form.parity,
    note: form.note.trim(),
    hidden: existing.value?.hidden ?? false,
    color: existing.value?.color ?? '',
    term: term.value?.code,
  }
}

async function handleSubmit() {
  if (submitting.value || !term.value || !validate())
    return
  submitting.value = true
  try {
    const payload = buildPayload()
    if (existing.value) {
      // 学期不可改；hidden / color 由课表页与服务端维护，这里只提交表单字段
      const { term: _term, hidden: _hidden, color: _color, ...patch } = payload
      await updateEntry(existing.value.id, patch, { hideErrorToast: true })
    }
    else {
      await createEntry(payload, { hideErrorToast: true })
    }
    uni.showToast({ title: '已保存', icon: 'success' })
    uni.navigateBack()
  }
  catch (error) {
    const info = getApiError(error, '保存失败')
    fieldErrors.value = info.fieldErrors
    formError.value = Object.keys(info.fieldErrors).length ? '' : info.message
  }
  finally {
    submitting.value = false
  }
}

async function handleDelete() {
  if (!existing.value || deleting.value)
    return
  const ok = await confirmModal({
    title: '确认删除',
    content: `删除后「${existing.value.name}」将从课表中移除，无法恢复。`,
    confirmText: '删除',
    confirmColor: '#dc2626',
  })
  if (!ok)
    return
  deleting.value = true
  try {
    await deleteEntry(existing.value.id)
    uni.showToast({ title: '已删除', icon: 'success' })
    uni.navigateBack()
  }
  catch (error) {
    // 失败提示由请求层统一显示
    console.error('删除日程失败:', error)
  }
  finally {
    deleting.value = false
  }
}

function goBack() {
  uni.navigateBack()
}

onLoad((options) => {
  const rawId = options?.id
  if (rawId !== undefined && rawId !== '') {
    const id = Number(rawId)
    if (Number.isInteger(id) && id > 0)
      entryId.value = id
    else
      loadError.value = '日程参数无效。'
  }
  if (options?.term)
    requestedTerm.value = decodeURIComponent(options.term)
  if (!loadError.value)
    void load()
  else
    loading.value = false
})
</script>

<template>
  <view class="min-h-screen bg-gray-50 pb-10">
    <view v-if="loading" class="flex flex-col items-center justify-center py-24 text-sm text-gray-400">
      <uv-loading-icon mode="circle" />
      <text class="mt-3">正在加载…</text>
    </view>

    <view v-else-if="loadError" class="flex flex-col items-center justify-center px-8 py-24 text-center">
      <text class="i-carbon-warning-alt mb-3 text-3xl text-gray-300" />
      <text class="text-sm text-gray-500 leading-6">{{ loadError }}</text>
      <button class="mt-5 rounded-lg bg-blue-500 px-6 py-2 text-sm text-white" @click="goBack">
        返回
      </button>
    </view>

    <view v-else class="px-4 pt-4">
      <view class="mb-3 text-xs text-gray-400">
        学期：{{ term?.name }}
      </view>

      <!-- 课程库联想 -->
      <view v-if="!isEdit" class="mb-3 rounded-2xl bg-white p-4 shadow-sm">
        <text class="mb-2 block text-sm text-gray-700 font-medium">从课程库填入</text>
        <view class="relative">
          <input
            v-model="catalogQuery"
            class="form-input"
            placeholder="课程名 / 课程号 / 教师，至少 2 个字"
            :maxlength="60"
          >
          <view v-if="catalogSearching" class="absolute right-3 top-0 h-full flex items-center">
            <uv-loading-icon size="16" />
          </view>
        </view>
        <view v-if="catalogResults.length" class="mt-2 border border-gray-100 rounded-lg">
          <view
            v-for="item in catalogResults"
            :key="item.id"
            class="border-b border-gray-50 px-3 py-2 last:border-none active:bg-gray-50"
            @click="pickCatalogEntry(item)"
          >
            <view class="flex items-center justify-between gap-2">
              <text class="min-w-0 flex-1 truncate text-sm text-gray-800">{{ item.name }}</text>
              <text v-if="item.credits !== null" class="shrink-0 text-xs text-gray-400">{{ item.credits }} 学分</text>
            </view>
            <text class="mt-0.5 block truncate text-xs text-gray-400">{{ describeCatalogEntry(item) }}</text>
          </view>
        </view>
        <view v-else-if="catalogPicked" class="mt-2 rounded-lg bg-blue-50 p-3">
          <view class="flex items-center justify-between gap-2">
            <text class="min-w-0 flex-1 truncate text-sm text-blue-700 font-medium">{{ catalogPicked.name }}</text>
            <text class="shrink-0 text-xs text-blue-500" @click="clearCatalogPick">清除</text>
          </view>
          <text v-if="catalogPicked.time_text" class="mt-1 block text-xs text-blue-500 leading-5">{{ catalogPicked.time_text }}</text>
          <template v-if="catalogPicked.slots.length > 1">
            <view class="mt-2 flex flex-wrap gap-2">
              <view
                v-for="(slot, index) in catalogPicked.slots"
                :key="index"
                class="rounded-full px-3 py-1 text-xs"
                :class="index === catalogSlotIndex ? 'bg-blue-600 text-white' : 'bg-white text-blue-600'"
                @click="pickCatalogSlot(index)"
              >
                {{ slotLabel(slot, index) }}
              </view>
            </view>
            <text class="mt-2 block text-xs text-blue-400 leading-5">这门课有多个上课时间：点选一个填入本条，其余时间保存后再添加一条</text>
          </template>
          <text v-else-if="!catalogPicked.slots.length" class="mt-1 block text-xs text-blue-400">未能解析上课时间，请在下方手动选择</text>
        </view>
        <text v-else class="mt-2 block text-xs text-gray-400 leading-5">搜索本学期课程库可一键填入名称、教师与时间；也可以直接在下方手动填写</text>
      </view>

      <view class="rounded-2xl bg-white p-4 shadow-sm space-y-4">
        <view>
          <text class="mb-2 block text-sm text-gray-700 font-medium">名称</text>
          <input
            v-model="form.name"
            class="form-input"
            :class="{ 'form-input--error': fieldError('name') }"
            placeholder="如：自习、社团例会"
            :maxlength="60"
          >
          <text v-if="fieldError('name')" class="form-error">{{ fieldError('name') }}</text>
        </view>

        <view>
          <text class="mb-2 block text-sm text-gray-700 font-medium">星期</text>
          <picker :value="form.weekday - 1" :range="weekdayOptions" @change="onWeekdayChange">
            <view class="form-picker">
              <text>{{ weekdayOptions[form.weekday - 1] }}</text>
              <text class="i-carbon-chevron-down text-gray-400" />
            </view>
          </picker>
          <text v-if="fieldError('weekday')" class="form-error">{{ fieldError('weekday') }}</text>
        </view>

        <view class="flex gap-3">
          <view class="flex-1">
            <text class="mb-2 block text-sm text-gray-700 font-medium">开始节次</text>
            <picker :value="startSectionIndex" :range="sectionOptions" @change="onStartSectionChange">
              <view class="form-picker">
                <text class="truncate">第{{ form.start_section }}节</text>
                <text class="i-carbon-chevron-down text-gray-400" />
              </view>
            </picker>
            <text v-if="fieldError('start_section')" class="form-error">{{ fieldError('start_section') }}</text>
          </view>
          <view class="flex-1">
            <text class="mb-2 block text-sm text-gray-700 font-medium">结束节次</text>
            <picker :value="endSectionIndex" :range="sectionOptions" @change="onEndSectionChange">
              <view class="form-picker">
                <text class="truncate">第{{ form.end_section }}节</text>
                <text class="i-carbon-chevron-down text-gray-400" />
              </view>
            </picker>
            <text v-if="fieldError('end_section')" class="form-error">{{ fieldError('end_section') }}</text>
          </view>
        </view>
        <text class="block text-xs text-gray-400">
          {{ rows[startSectionIndex]?.start }} – {{ rows[endSectionIndex]?.end }}
        </text>

        <view class="flex gap-3">
          <view class="flex-1">
            <text class="mb-2 block text-sm text-gray-700 font-medium">开始周</text>
            <picker :value="form.week_start - 1" :range="weekOptions" @change="onWeekStartChange">
              <view class="form-picker">
                <text>第{{ form.week_start }}周</text>
                <text class="i-carbon-chevron-down text-gray-400" />
              </view>
            </picker>
            <text v-if="fieldError('week_start')" class="form-error">{{ fieldError('week_start') }}</text>
          </view>
          <view class="flex-1">
            <text class="mb-2 block text-sm text-gray-700 font-medium">结束周</text>
            <picker :value="form.week_end - 1" :range="weekOptions" @change="onWeekEndChange">
              <view class="form-picker">
                <text>第{{ form.week_end }}周</text>
                <text class="i-carbon-chevron-down text-gray-400" />
              </view>
            </picker>
            <text v-if="fieldError('week_end')" class="form-error">{{ fieldError('week_end') }}</text>
          </view>
        </view>

        <view>
          <text class="mb-2 block text-sm text-gray-700 font-medium">单双周</text>
          <picker :value="form.parity" :range="parityOptions" @change="onParityChange">
            <view class="form-picker">
              <text>{{ parityOptions[form.parity] }}</text>
              <text class="i-carbon-chevron-down text-gray-400" />
            </view>
          </picker>
          <text v-if="fieldError('parity')" class="form-error">{{ fieldError('parity') }}</text>
        </view>

        <view>
          <text class="mb-2 block text-sm text-gray-700 font-medium">地点</text>
          <input v-model="form.room" class="form-input" placeholder="选填" :maxlength="60">
          <text v-if="fieldError('room')" class="form-error">{{ fieldError('room') }}</text>
        </view>

        <view>
          <text class="mb-2 block text-sm text-gray-700 font-medium">教师 / 负责人</text>
          <input v-model="form.teacher" class="form-input" placeholder="选填" :maxlength="60">
          <text v-if="fieldError('teacher')" class="form-error">{{ fieldError('teacher') }}</text>
        </view>

        <view>
          <text class="mb-2 block text-sm text-gray-700 font-medium">备注</text>
          <textarea
            v-model="form.note"
            class="form-textarea"
            placeholder="选填，最多 200 字"
            :maxlength="200"
            auto-height
          />
          <text v-if="fieldError('note')" class="form-error">{{ fieldError('note') }}</text>
        </view>

        <text v-if="formError" class="block text-sm text-red-500">{{ formError }}</text>
      </view>

      <button
        class="mt-6 w-full rounded-xl bg-blue-500 py-3 text-base text-white font-medium"
        :disabled="submitting"
        @click="handleSubmit"
      >
        {{ submitting ? '保存中…' : '保存' }}
      </button>
      <button
        v-if="isEdit"
        class="mt-3 w-full border border-red-200 rounded-xl bg-white py-3 text-base text-red-500 font-medium"
        :disabled="deleting"
        @click="handleDelete"
      >
        {{ deleting ? '删除中…' : '删除' }}
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.form-input,
.form-picker,
.form-textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #1f2937;
  background: #f9fafb;
  border: 2rpx solid #e5e7eb;
  border-radius: 12rpx;
}

.form-input,
.form-picker {
  height: 80rpx;
  line-height: 80rpx;
}

.form-input--error {
  border-color: #f87171;
}

.form-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-textarea {
  min-height: 120rpx;
  padding: 16rpx 24rpx;
  line-height: 1.5;
}

.form-error {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #ef4444;
}

button::after {
  border: none;
}
</style>
