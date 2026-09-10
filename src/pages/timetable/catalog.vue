<script lang="ts" setup>
import type { CatalogEntry, CatalogSlot, Term } from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref, watch } from 'vue'
import { addFromCatalog, getTerms, searchCatalog } from '@/api/timetable'
import { useApiException } from '@/hooks/useApiException'
import { toRequestError } from '@/http/errors'
import { debounce } from '@/utils/debounce'
import { describeCatalogMeta, describeCourseCode, describeSlot, saveCatalogPick } from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '课程库',
  },
})

/*
 * 从课程库添加旁听课程：搜索本学期课程库，一键把课程的全部（或勾选的）时段加为旁听；
 * 解析不出上课时间的课程退回到手动填写（表单页按 catalog_id 取回暂存的整行）。
 */

interface PopupInstance {
  open: () => void
  close: () => void
}

/** 结果卡片的展示数据 */
interface CatalogCard {
  entry: CatalogEntry
  code: string
  meta: string
  slots: CatalogSlot[]
  added: boolean
}

interface SlotChoice {
  index: number
  label: string
  checked: boolean
}

const requestedTerm = ref('')
const term = ref<Term | null>(null)
const loading = ref(true)
const loadError = ref('')
const query = ref('')
const results = ref<CatalogEntry[]>([])
const searching = ref(false)
/** 已经搜过至少一次（用来区分“还没搜”和“没结果”） */
const searched = ref(false)
/** 正在添加的课程库行 id */
const addingId = ref<number | null>(null)
/** 已在本页添加成功的行（后端未升级 added 字段时也能标出来） */
const addedIds = ref<number[]>([])
const slotPopup = ref<PopupInstance | null>(null)
const slotTarget = ref<CatalogEntry | null>(null)
const slotChoices = ref<SlotChoice[]>([])
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
let searchSeq = 0

const cards = computed<CatalogCard[]>(() => results.value.map((entry) => {
  const slots = Array.isArray(entry.slots) ? entry.slots : []
  return {
    entry,
    code: describeCourseCode(entry),
    meta: describeCatalogMeta(entry),
    slots,
    added: !!entry.added || addedIds.value.includes(entry.id),
  }
}))

const selectedSlotCount = computed(() => slotChoices.value.filter(item => item.checked).length)

async function runSearch(q: string) {
  if (!term.value)
    return
  const seq = ++searchSeq
  searching.value = true
  try {
    const data = await searchCatalog({ term: term.value.code, q })
    if (seq !== searchSeq)
      return
    results.value = Array.isArray(data) ? data : []
    searched.value = true
  }
  catch (error) {
    if (seq !== searchSeq)
      return
    results.value = []
    searched.value = true
    handleApiException(error)
  }
  finally {
    if (seq === searchSeq)
      searching.value = false
  }
}

const searchDebounced = debounce((q: string) => {
  void runSearch(q)
}, 300)

watch(query, (value) => {
  const q = value.trim()
  if (!q) {
    searchDebounced.cancel()
    searchSeq++
    results.value = []
    searched.value = false
    searching.value = false
    return
  }
  searchDebounced(q)
})

function clearQuery() {
  query.value = ''
}

function describeSlotChoice(slot: CatalogSlot, index: number) {
  const text = describeSlot(slot)
  return [text || `时间 ${index + 1}`, slot.room].filter(Boolean).join(' · ')
}

/** 把课程库行交给手动表单（整行暂存在本机，表单按 id 取回） */
function goManual(entry: CatalogEntry) {
  if (!term.value)
    return
  saveCatalogPick({ ...entry, slots: Array.isArray(entry.slots) ? entry.slots : [] })
  uni.navigateTo({
    url: `/pages/timetable/entry-form?catalog_id=${entry.id}&term=${encodeURIComponent(term.value.code)}`,
  })
}

async function addSlots(entry: CatalogEntry, slots?: number[]) {
  if (addingId.value !== null || !term.value)
    return
  addingId.value = entry.id
  try {
    const created = await addFromCatalog(entry.id, { role: 'audit', term: term.value.code, slots })
    addedIds.value = [...addedIds.value, entry.id]
    showMessage(`已添加「${entry.name}」${created.length} 个时段（旁听）`, 'success')
  }
  catch (error) {
    const info = toRequestError(error)
    if (info.statusCode === 409) {
      // 已在课表里：把状态标出来即可
      addedIds.value = [...addedIds.value, entry.id]
      showMessage(info.message, 'warning')
      return
    }
    if (info.code === 'timetable.catalog_no_slots') {
      showMessage('这门课没有可解析的上课时间，请手动填写', 'warning')
      goManual(entry)
      return
    }
    handleApiException(error)
  }
  finally {
    addingId.value = null
  }
}

/** 「添加为旁听」：一个时段直接加；多个先勾选；没有可解析时段退回手动填写 */
function handleAdd(card: CatalogCard) {
  if (card.added || addingId.value !== null)
    return
  if (!card.slots.length) {
    goManual(card.entry)
    return
  }
  if (card.slots.length === 1) {
    void addSlots(card.entry)
    return
  }
  slotTarget.value = card.entry
  slotChoices.value = card.slots.map((slot, index) => ({
    index,
    label: describeSlotChoice(slot, index),
    checked: true,
  }))
  slotPopup.value?.open()
}

function toggleSlot(index: number) {
  const choice = slotChoices.value[index]
  if (choice)
    choice.checked = !choice.checked
}

async function confirmSlots() {
  const entry = slotTarget.value
  const picked = slotChoices.value.filter(item => item.checked).map(item => item.index)
  if (!entry || !picked.length)
    return
  slotPopup.value?.close()
  // 全选时不传 slots，交给后端按缺省（全部）处理
  await addSlots(entry, picked.length === slotChoices.value.length ? undefined : picked)
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const terms = await getTerms()
    const picked = (requestedTerm.value && terms.terms.find(item => item.code === requestedTerm.value))
      || terms.current
      || terms.terms[0]
      || null
    if (!picked) {
      loadError.value = '当前没有可用学期，请联系管理员。'
      return
    }
    term.value = picked
  }
  catch (error) {
    loadError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    loading.value = false
  }
}

onLoad((options) => {
  if (options?.term)
    requestedTerm.value = decodeURIComponent(options.term)
  void load()
})
</script>

<template>
  <view class="min-h-screen bg-page pb-10">
    <uv-toast ref="toastRef" />
    <PageState
      v-if="loading || loadError"
      :loading="loading"
      :error="loadError"
      loading-text="正在加载…"
      @retry="load"
    />

    <template v-else>
      <!-- 搜索框 -->
      <view class="sticky top-0 z-10 bg-page px-4 pb-2 pt-3">
        <view class="relative">
          <text class="i-carbon-search absolute left-3 top-0 h-full flex items-center text-base text-fg-3" />
          <input
            v-model="query"
            class="search-input"
            placeholder="课程名 / 英文名 / 课程号 / 教师"
            :maxlength="64"
            confirm-type="search"
          >
          <view v-if="searching" class="absolute right-3 top-0 h-full flex items-center">
            <uv-loading-icon size="16" />
          </view>
          <view
            v-else-if="query"
            class="absolute right-2 top-0 h-full flex items-center px-1"
            @click="clearQuery"
          >
            <text class="i-carbon-close text-base text-fg-3" />
          </view>
        </view>
        <text class="mt-1 block text-2xs text-fg-3">{{ term?.name }} · 加入的课程按旁听标记，不影响选课</text>
      </view>

      <view class="px-4">
        <!-- 空状态 -->
        <view v-if="!query.trim()" class="flex flex-col items-center px-6 py-16 text-center">
          <text class="i-carbon-catalog text-4xl text-fg-4" />
          <text class="mt-2 text-sm text-fg-2">搜索本学期开设的课程</text>
          <text class="mt-1 text-xs text-fg-3 leading-5">找到想旁听的课后点「添加为旁听」，它会以旁听标记出现在课表里；也可以用「手动填写」补充时间</text>
        </view>
        <view v-else-if="searched && !searching && !cards.length" class="flex flex-col items-center px-6 py-16 text-center">
          <text class="i-carbon-search text-4xl text-fg-4" />
          <text class="mt-2 text-sm text-fg-2">没有找到匹配的课程</text>
          <text class="mt-1 text-xs text-fg-3 leading-5">课程库只收录本学期开设的课程；换个关键词试试，或在课表页「添加 → 手动添加」自行填写</text>
        </view>

        <!-- 结果 -->
        <view
          v-for="card in cards"
          :key="card.entry.id"
          class="mb-3 yp-card"
        >
          <view class="flex items-start justify-between gap-2">
            <view class="min-w-0 flex-1">
              <text class="block text-base text-fg-1 font-medium leading-6">{{ card.entry.name }}</text>
              <text class="mt-0.5 block text-xs text-fg-2">
                {{ [card.code, card.entry.teacher].filter(Boolean).join(' · ') }}
              </text>
            </view>
            <StatusTag v-if="card.added" type="success" text="已在课表" class="shrink-0" />
          </view>
          <text v-if="card.meta" class="mt-1 block text-xs text-fg-3">{{ card.meta }}</text>
          <text v-if="card.entry.time_text" class="mt-1 block text-xs text-fg-2 leading-5">{{ card.entry.time_text }}</text>
          <text v-if="card.entry.note" class="mt-1 block text-2xs text-fg-3 leading-4">{{ card.entry.note }}</text>
          <text v-if="!card.slots.length" class="mt-1 block text-2xs text-warning">未能解析上课时间，需手动填写</text>
          <view class="mt-3 flex gap-3">
            <button
              class="btn-sm flex-1"
              :class="card.added ? 'btn-ghost bg-fill text-fg-3' : 'btn-primary'"
              :disabled="card.added || addingId !== null"
              @click="handleAdd(card)"
            >
              {{ addingId === card.entry.id ? '添加中…' : card.added ? '已在课表' : card.slots.length > 1 ? `添加为旁听（${card.slots.length} 个时段）` : '添加为旁听' }}
            </button>
            <button
              class="btn-outline btn-sm flex-1"
              :disabled="addingId !== null"
              @click="goManual(card.entry)"
            >
              手动填写
            </button>
          </view>
        </view>
      </view>
    </template>
  </view>

  <!-- 多个时段：勾选要加入的 -->
  <uv-popup ref="slotPopup" mode="bottom" :round="16" :safe-area-inset-bottom="true">
    <view v-if="slotTarget" class="px-5 pb-6 pt-5">
      <text class="block text-base text-fg-1 font-bold">选择要加入的时段</text>
      <text class="mt-1 block truncate text-xs text-fg-3">{{ slotTarget.name }} · 以旁听加入课表</text>
      <view class="mt-3">
        <view
          v-for="choice in slotChoices"
          :key="choice.index"
          class="flex items-center gap-3 border-b border-line-light py-3 last:border-none"
          @click="toggleSlot(choice.index)"
        >
          <view class="check-box" :class="{ 'check-box--checked': choice.checked }">
            <text v-if="choice.checked" class="i-carbon-checkmark text-xs text-white" />
          </view>
          <text class="min-w-0 flex-1 text-sm text-fg-1">{{ choice.label }}</text>
        </view>
      </view>
      <button
        class="btn-primary mt-4 btn-block"
        :disabled="!selectedSlotCount"
        @click="confirmSlots"
      >
        {{ selectedSlotCount ? `加入 ${selectedSlotCount} 个时段` : '请至少勾选一个时段' }}
      </button>
    </view>
  </uv-popup>
</template>

<style lang="scss" scoped>
.search-input {
  box-sizing: border-box;
  width: 100%;
  height: 80rpx;
  padding: 0 72rpx 0 68rpx;
  font-size: var(--yp-font-sm);
  line-height: 80rpx;
  color: var(--yp-text-1);
  background: var(--yp-bg-card);
  border: 2rpx solid var(--yp-border);
  border-radius: 40rpx;
}

.check-box {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36rpx;
  height: 36rpx;
  border: 2rpx solid var(--yp-border);
  border-radius: var(--yp-radius-sm);

  &--checked {
    background: var(--yp-color-primary);
    border-color: var(--yp-color-primary);
  }
}
</style>
