<script lang="ts" setup>
import type {
  CatalogEntry,
  CatalogSlot,
  EditScope,
  Entry,
  EntryCategory,
  EntryIn,
  EntryPatch,
  EntryRole,
  OverrideFields,
  Parity,
  Term,
} from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import { onLoad } from '@dcloudio/uni-app'
import { computed, reactive, ref, watch } from 'vue'
import {
  addFromCatalog,
  createEntry,
  deleteEntry,
  getEntry,
  getSettings,
  getTerms,
  listEntries,
  searchCatalog,
  updateEntry,
} from '@/api/timetable'
import ApiFieldError from '@/components/ApiFieldError.vue'
import { useApiException } from '@/hooks/useApiException'
import { toRequestError } from '@/http/errors'
import { tokens } from '@/style/tokens'
import { debounce } from '@/utils/debounce'
import { confirmModal } from '@/utils/dialog'
import {
  CATEGORY_LABELS,
  chineseDate,
  clearCatalogPick,
  describeCourseCode,
  describeSlot,
  describeWeeks,
  effectiveOverrideAt,
  PARITY_LABELS,
  readCatalogPick,
  ROLE_LABELS,
  sectionRows,
  teachingWeeksOf,
  weekDatesOf,
  WEEKDAY_LABELS,
} from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '日程',
  },
})

/*
 * 新建 / 编辑一条存储条目。
 * - 新建：手动条目，可从课程库填入（关联课程库行），课程库行有时间块时可一键把全部时段加为旁听。
 * - 编辑（scope=all）：手动条目改行本身；门户 / 粘贴条目的改动由后端存为整段调整，重新导入后保留。
 * - 仅本次 / 本次及以后（scope=single|following，带 week）：只改该周 / 该周起，存为调整；仅本次可选“本次不上课”。
 */

interface PickerEvent { detail: { value: number | string } }

const CATEGORY_OPTIONS = (['course', 'exam', 'other'] as EntryCategory[]).map(value => ({ value, label: CATEGORY_LABELS[value] }))
const ROLE_OPTIONS = (['enrolled', 'audit'] as EntryRole[]).map(value => ({ value, label: ROLE_LABELS[value] }))
/** 单次 / 分段调整可改的表单字段（其余字段只能在 scope=all 下改） */
const OVERRIDE_FIELDS = ['name', 'teacher', 'room', 'weekday', 'start_section', 'end_section', 'note', 'tag'] as const
type OverrideField = typeof OVERRIDE_FIELDS[number]

const entryId = ref<number | null>(null)
const requestedTerm = ref('')
/** 课程库页“手动填写”带来的课程库行 id */
const catalogIdParam = ref<number | null>(null)
const scope = ref<EditScope>('all')
/** single / following 时要改的周次 */
const scopeWeek = ref<number | null>(null)
const term = ref<Term | null>(null)
const existing = ref<Entry | null>(null)
const loading = ref(true)
const loadError = ref('')
const submitting = ref(false)
const deleting = ref(false)
const quickAdding = ref(false)
const formError = ref('')
/** 我用过的标签，作为标签输入的联想 */
const tagSuggestions = ref<string[]>([])
const toastRef = ref<UvToastInstance | null>(null)
const {
  clearFieldError,
  clearFieldErrors,
  getFieldMessages,
  handleApiException,
  setFieldError,
  showMessage,
} = useApiException(toastRef)

const isEdit = computed(() => entryId.value !== null)
const isScoped = computed(() => scope.value !== 'all')
const isSingle = computed(() => scope.value === 'single')
/** 手动条目（含新建）才能改起止周 / 单双周 / 课程号 */
const isManual = computed(() => !existing.value || existing.value.source === 'manual')

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
  category: 'other' as EntryCategory,
  role: 'enrolled' as EntryRole,
  tag: '',
  /** 仅本次：本次不上课 */
  canceled: false,
})

/** 单次 / 分段模式下打开表单时的生效值，提交时只发有改动的字段 */
let scopedSnapshot: { fields: Record<OverrideField, string | number>, canceled: boolean } | null = null

const rows = computed(() => sectionRows(term.value))
const weekdayOptions = WEEKDAY_LABELS.map(label => `周${label}`)
const sectionOptions = computed(() => rows.value.map(row => `第${row.section}节 ${row.start}–${row.end}`))
const totalWeeks = computed(() => term.value?.total_weeks ?? 16)
const weekOptions = computed(() => Array.from({ length: totalWeeks.value }, (_, index) => `第${index + 1}周`))
const parityOptions = [...PARITY_LABELS]
const categoryOptions = CATEGORY_OPTIONS.map(item => item.label)
const categoryIndex = computed(() => Math.max(CATEGORY_OPTIONS.findIndex(item => item.value === form.category), 0))

const startSectionIndex = computed(() => Math.max(rows.value.findIndex(row => row.section === form.start_section), 0))
const endSectionIndex = computed(() => Math.max(rows.value.findIndex(row => row.section === form.end_section), 0))

const isExam = computed(() => form.category === 'exam')
/** 类别 / 已选旁听 / 标签联想只在整体编辑时显示 */
const showCategory = computed(() => !isScoped.value)
const showRole = computed(() => !isScoped.value && form.category === 'course')
/** 起止周与单双周：整体编辑手动条目且不是考试 */
const showWeekRange = computed(() => !isScoped.value && isManual.value && !isExam.value)
/** 考试只有一周：单个周次选择器 */
const showExamWeek = computed(() => !isScoped.value && isManual.value && isExam.value)

/** 考试类别的日期提示：`考试日期：1月11日 周一（第19周）` */
const examDateText = computed(() => {
  if (!term.value || !isExam.value)
    return ''
  const iso = weekDatesOf(term.value, form.week_start)[form.weekday - 1]
  return iso ? `考试日期：${chineseDate(iso)} 周${WEEKDAY_LABELS[form.weekday - 1]}（第${form.week_start}周）` : ''
})

const scopeBanner = computed(() => {
  const week = scopeWeek.value
  if (!isScoped.value || week === null)
    return ''
  return isSingle.value
    ? `仅修改第 ${week} 周的这一次，其它周次不变`
    : `从第 ${week} 周起修改，之前的周次不变`
})

/** 导入的课程：说明改动的保存方式 */
const sourceHint = computed(() => {
  const entry = existing.value
  if (!entry || entry.source === 'manual' || isScoped.value)
    return ''
  return '这是导入的课程：名称、时间、地点等改动会作为你的个人调整保存，重新导入后仍然保留；起止周与单双周以导入为准。'
})

const linkedCatalogText = computed(() => {
  const catalog = existing.value?.catalog
  if (!catalog)
    return ''
  const code = describeCourseCode(catalog)
  return `已关联课程库：${catalog.name}${code ? `（${code}）` : ''}`
})

const submitLabel = computed(() => {
  if (submitting.value)
    return '保存中…'
  if (isSingle.value && form.canceled)
    return '保存为本次不上课'
  return '保存'
})

/** 会在控件旁显示后端字段错误的表单字段 */
const FORM_FIELDS = [
  'name',
  'weekday',
  'start_section',
  'end_section',
  'week_start',
  'week_end',
  'parity',
  'room',
  'teacher',
  'note',
  'category',
  'role',
  'tag',
] as const

// 字段一改就清掉它的错误提示
for (const field of FORM_FIELDS)
  watch(() => form[field], () => clearFieldError(field))

/** 后端字段错误里有没有会显示在表单里的；一个都没有时退回整体 message，避免错误被吞掉 */
function hasRenderedFieldErrors() {
  return [...FORM_FIELDS, 'non_field_errors'].some(field => getFieldMessages(field).length > 0)
}

function pickerIndex(event: PickerEvent) {
  return Number(event.detail.value)
}

function onWeekdayChange(event: PickerEvent) {
  form.weekday = pickerIndex(event) + 1
}

function onStartSectionChange(event: PickerEvent) {
  const row = rows.value[pickerIndex(event)]
  if (!row)
    return
  form.start_section = row.section
  if (form.end_section < row.section)
    form.end_section = row.section
}

function onEndSectionChange(event: PickerEvent) {
  const row = rows.value[pickerIndex(event)]
  if (!row)
    return
  form.end_section = row.section
  if (form.start_section > row.section)
    form.start_section = row.section
}

function onWeekStartChange(event: PickerEvent) {
  form.week_start = pickerIndex(event) + 1
  if (form.week_end < form.week_start)
    form.week_end = form.week_start
}

function onWeekEndChange(event: PickerEvent) {
  form.week_end = pickerIndex(event) + 1
  if (form.week_start > form.week_end)
    form.week_start = form.week_end
}

/** 考试只有一周：起止周同时设为所选周 */
function onExamWeekChange(event: PickerEvent) {
  form.week_start = pickerIndex(event) + 1
  form.week_end = form.week_start
}

function onParityChange(event: PickerEvent) {
  const value = pickerIndex(event)
  form.parity = (value === 1 || value === 2 ? value : 0) as Parity
}

function onCategoryChange(event: PickerEvent) {
  const option = CATEGORY_OPTIONS[pickerIndex(event)]
  if (!option)
    return
  form.category = option.value
  // 考试只占一周：切到考试时把结束周收拢到开始周；新建的考试默认落在考试周
  if (option.value === 'exam') {
    if (!existing.value && term.value?.exam_week_start && form.week_start === 1)
      form.week_start = Math.min(term.value.exam_week_start, totalWeeks.value)
    form.week_end = form.week_start
  }
}

function pickTag(tag: string) {
  form.tag = tag
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
    const results = await searchCatalog({ term: term.value.code, q })
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
  return [describeCourseCode(entry), entry.teacher, entry.time_text].filter(Boolean).join(' · ')
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
  form.category = 'course'
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
  clearFieldErrors()
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

function clearPickedCatalog() {
  catalogPicked.value = null
  catalogSlotIndex.value = -1
}

/** 回到课表页：它已在页面栈里就直接返回，否则打开一个 */
function openTimetable() {
  const pages = getCurrentPages()
  const index = pages.findIndex(page => page.route === 'pages/timetable/index')
  if (index >= 0 && index < pages.length - 1)
    uni.navigateBack({ delta: pages.length - 1 - index })
  else
    uni.navigateTo({ url: '/pages/timetable/index' })
}

/** 把选中课程库行的全部时段一次加为旁听，成功后返回上一页 */
async function handleQuickAdd() {
  const picked = catalogPicked.value
  if (!picked || quickAdding.value || !term.value)
    return
  quickAdding.value = true
  try {
    const created = await addFromCatalog(picked.id, { role: 'audit', term: term.value.code })
    showMessage(`已添加 ${created.length} 个时段（旁听）`, 'success')
    setTimeout(() => uni.navigateBack(), 1000)
  }
  catch (error) {
    quickAdding.value = false
    const info = toRequestError(error)
    if (info.statusCode === 409) {
      // 已在课表里：不是失败，问一下要不要去看
      const ok = await confirmModal({ title: '已在课表中', content: info.message, confirmText: '打开课表' })
      if (ok)
        openTimetable()
      return
    }
    if (info.code === 'timetable.catalog_no_slots') {
      showMessage('这门课没有可解析的上课时间，请在下方手动选择', 'warning')
      return
    }
    handleApiException(error)
  }
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
  // 尚未升级的后端不返回类别：手动条目按“其它”、导入条目按“课程”处理，与后端迁移一致
  form.category = entry.category ?? (entry.source === 'manual' ? 'other' : 'course')
  form.role = entry.role ?? 'enrolled'
  form.tag = entry.tag ?? ''
}

/** 单次 / 分段模式：表单显示该周实际生效的值（已叠加调整），并记下快照供提交时比对 */
function fillScoped(entry: Entry, week: number) {
  fillFrom(entry)
  const effective = effectiveOverrideAt(entry, week)
  const fields = effective.fields
  if (fields.name !== undefined)
    form.name = fields.name
  if (fields.teacher !== undefined)
    form.teacher = fields.teacher
  if (fields.room !== undefined)
    form.room = fields.room
  if (fields.weekday !== undefined)
    form.weekday = fields.weekday
  if (fields.start_section !== undefined)
    form.start_section = fields.start_section
  if (fields.end_section !== undefined)
    form.end_section = fields.end_section
  if (fields.note !== undefined)
    form.note = fields.note
  if (fields.tag !== undefined)
    form.tag = fields.tag
  form.canceled = effective.canceled
  scopedSnapshot = { fields: snapshotOverrideFields(), canceled: effective.canceled }
}

function snapshotOverrideFields(): Record<OverrideField, string | number> {
  return {
    name: form.name.trim(),
    teacher: form.teacher.trim(),
    room: form.room.trim(),
    weekday: form.weekday,
    start_section: form.start_section,
    end_section: form.end_section,
    note: form.note.trim(),
    tag: form.tag.trim(),
  }
}

/** 取单条条目；尚未提供详情接口的后端（405）退回到条目列表里找 */
async function loadEntry(id: number, termCode: string): Promise<Entry | null> {
  try {
    return await getEntry(id)
  }
  catch (error) {
    if (toRequestError(error).statusCode !== 405)
      throw error
    const entries = await listEntries({ term: termCode })
    return entries.find(item => item.id === id) ?? null
  }
}

function setTitle() {
  let title = isEdit.value ? '编辑日程' : '添加日程'
  if (isScoped.value)
    title = isSingle.value ? '调整本次' : '调整此后周次'
  uni.setNavigationBarTitle({ title })
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [terms, settings] = await Promise.all([
      getTerms(),
      // 标签联想只是锦上添花，取不到就不显示
      isScoped.value ? Promise.resolve(null) : getSettings().catch(() => null),
    ])
    tagSuggestions.value = settings?.tags ?? []
    const picked = (requestedTerm.value && terms.terms.find(item => item.code === requestedTerm.value))
      || terms.current
      || terms.terms[0]
      || null
    if (!picked) {
      loadError.value = '当前没有可用学期，请联系管理员。'
      return
    }
    term.value = picked
    // 新建条目默认到教学周结束（考试周不上课）
    form.week_end = Math.min(teachingWeeksOf(picked), picked.total_weeks)

    if (entryId.value !== null) {
      const found = await loadEntry(entryId.value, picked.code)
      if (!found) {
        loadError.value = '未找到该日程，可能已被删除。'
        return
      }
      // 条目所在学期与请求的学期可能不同（如从首页日程进入），以条目为准
      term.value = terms.terms.find(item => item.code === found.term) ?? picked
      existing.value = found
      if (isScoped.value) {
        const week = scopeWeek.value
        if (week === null || week < found.week_start || week > found.week_end) {
          loadError.value = '周次参数无效：这门课不在该周上课。'
          return
        }
        fillScoped(found, week)
      }
      else {
        fillFrom(found)
      }
    }
    else if (catalogIdParam.value !== null) {
      // 课程库页“手动填写”：整行暂存在本机，这里按 id 取回填入，默认加为旁听
      const pick = readCatalogPick(catalogIdParam.value)
      clearCatalogPick()
      if (pick) {
        pickCatalogEntry(pick)
        form.role = 'audit'
      }
    }
  }
  catch (error) {
    loadError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    loading.value = false
  }
}

function validate(): boolean {
  clearFieldErrors()
  formError.value = ''
  if (!form.name.trim()) {
    setFieldError('name', '请填写名称', 'required')
    return false
  }
  if (form.end_section < form.start_section) {
    setFieldError('end_section', '结束节次不能早于开始节次')
    return false
  }
  if (showWeekRange.value && form.week_end < form.week_start) {
    setFieldError('week_end', '结束周不能早于开始周')
    return false
  }
  return true
}

function sectionTimes() {
  const startRow = rows.value.find(row => row.section === form.start_section)
  const endRow = rows.value.find(row => row.section === form.end_section)
  return { start_time: startRow?.start ?? '', end_time: endRow?.end ?? '' }
}

function buildPayload(): EntryIn {
  const payload: EntryIn = {
    name: form.name.trim(),
    course_code: form.course_code,
    class_no: form.class_no,
    teacher: form.teacher.trim(),
    room: form.room.trim(),
    weekday: form.weekday,
    start_section: form.start_section,
    end_section: form.end_section,
    ...sectionTimes(),
    week_start: form.week_start,
    // 考试只有一周
    week_end: isExam.value ? form.week_start : form.week_end,
    parity: isExam.value ? 0 : form.parity,
    note: form.note.trim(),
    hidden: existing.value?.hidden ?? false,
    color: existing.value?.color ?? '',
    term: term.value?.code,
    category: form.category,
    role: form.category === 'course' ? form.role : 'enrolled',
    tag: form.tag.trim(),
  }
  if (!existing.value && catalogPicked.value)
    payload.catalog_id = catalogPicked.value.id
  return payload
}

/** scope=all 的 PATCH：学期 / hidden / color 不在这里改；导入条目的起止周、单双周、课程号由导入维护 */
function buildFullPatch(entry: Entry): EntryPatch {
  const payload = buildPayload()
  const patch: EntryPatch = {
    name: payload.name,
    teacher: payload.teacher,
    room: payload.room,
    weekday: payload.weekday,
    start_section: payload.start_section,
    end_section: payload.end_section,
    start_time: payload.start_time,
    end_time: payload.end_time,
    note: payload.note,
    category: payload.category,
    role: payload.role,
    tag: payload.tag,
  }
  if (entry.source === 'manual') {
    patch.course_code = payload.course_code
    patch.class_no = payload.class_no
    patch.week_start = payload.week_start
    patch.week_end = payload.week_end
    patch.parity = payload.parity
  }
  return patch
}

/** 单次 / 分段的 PATCH：只发相对打开时有改动的字段；仅本次可带 canceled。没有改动时返回 null */
function buildScopedPatch(): EntryPatch | null {
  const snapshot = scopedSnapshot
  if (!snapshot)
    return null
  const patch: EntryPatch = {}
  if (isSingle.value && form.canceled) {
    patch.canceled = true
    return patch
  }
  const current = snapshotOverrideFields()
  const changed: OverrideFields = {}
  for (const field of OVERRIDE_FIELDS) {
    if (current[field] !== snapshot.fields[field])
      (changed as Record<string, string | number>)[field] = current[field]
  }
  Object.assign(patch, changed)
  if (changed.start_section !== undefined || changed.end_section !== undefined)
    Object.assign(patch, sectionTimes())
  if (isSingle.value && snapshot.canceled)
    patch.canceled = false
  return Object.keys(patch).length ? patch : null
}

async function handleSubmit() {
  if (submitting.value || !term.value || !validate())
    return
  submitting.value = true
  try {
    if (existing.value && isScoped.value && scopeWeek.value !== null) {
      const patch = buildScopedPatch()
      if (patch)
        await updateEntry(existing.value.id, patch, { scope: scope.value, week: scopeWeek.value })
    }
    else if (existing.value) {
      await updateEntry(existing.value.id, buildFullPatch(existing.value))
    }
    else {
      await createEntry(buildPayload())
    }
    // 页内 toast 会随页面一起关闭：先让用户看到提示再返回；保持 submitting，避免等待期间重复提交
    showMessage('已保存', 'success')
    setTimeout(() => uni.navigateBack(), 1000)
  }
  catch (error) {
    // 字段错误显示在对应控件旁，其余失败显示在表单底部
    const requestError = handleApiException(error, { showToast: false })
    formError.value = hasRenderedFieldErrors() ? '' : requestError.message
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
    confirmColor: tokens.error,
  })
  if (!ok)
    return
  deleting.value = true
  try {
    await deleteEntry(existing.value.id)
    showMessage('已删除', 'success')
    setTimeout(() => uni.navigateBack(), 1000)
  }
  catch (error) {
    handleApiException(error)
    deleting.value = false
  }
}

function goBack() {
  uni.navigateBack()
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (raw === undefined || raw === '')
    return null
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}

onLoad((options) => {
  const rawId = options?.id
  if (rawId !== undefined && rawId !== '') {
    const id = parsePositiveInt(rawId)
    if (id !== null)
      entryId.value = id
    else
      loadError.value = '日程参数无效。'
  }
  if (options?.term)
    requestedTerm.value = decodeURIComponent(options.term)
  const rawScope = options?.scope
  if (entryId.value !== null && (rawScope === 'single' || rawScope === 'following')) {
    scope.value = rawScope
    scopeWeek.value = parsePositiveInt(options?.week)
    if (scopeWeek.value === null)
      loadError.value = '周次参数无效。'
  }
  if (entryId.value === null)
    catalogIdParam.value = parsePositiveInt(options?.catalog_id)
  setTitle()
  if (!loadError.value)
    void load()
  else
    loading.value = false
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
      retry-text="返回"
      @retry="goBack"
    />

    <view v-else class="px-4 pt-4">
      <view class="mb-3 text-xs text-fg-3">
        学期：{{ term?.name }}
      </view>

      <!-- 仅本次 / 本次及以后 -->
      <view v-if="scopeBanner" class="mb-3 flex items-start gap-2 rounded-lg bg-warning-light p-3">
        <text class="i-carbon-information mt-0.5 shrink-0 text-base text-warning" />
        <text class="flex-1 text-xs text-warning-dark leading-5">{{ scopeBanner }}</text>
      </view>
      <view v-else-if="sourceHint" class="mb-3 rounded-lg bg-primary-light p-3">
        <text class="block text-xs text-primary-dark leading-5">{{ sourceHint }}</text>
        <text v-if="linkedCatalogText" class="mt-1 block text-xs text-primary leading-5">{{ linkedCatalogText }}</text>
      </view>

      <!-- 课程库联想 -->
      <view v-if="!isEdit" class="mb-3 yp-card">
        <text class="mb-2 block text-sm text-fg-2 font-medium">从课程库填入</text>
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
        <view v-if="catalogResults.length" class="mt-2 border border-line-light rounded-md">
          <view
            v-for="item in catalogResults"
            :key="item.id"
            class="border-b border-line-light px-3 py-2 last:border-none active:bg-fill"
            @click="pickCatalogEntry(item)"
          >
            <view class="flex items-center justify-between gap-2">
              <text class="min-w-0 flex-1 truncate text-sm text-fg-1">{{ item.name }}</text>
              <StatusTag v-if="item.added" type="success" text="已在课表" class="shrink-0" />
              <text v-if="item.credits !== null" class="shrink-0 text-xs text-fg-3">{{ item.credits }} 学分</text>
            </view>
            <text class="mt-0.5 block truncate text-xs text-fg-3">{{ describeCatalogEntry(item) }}</text>
          </view>
        </view>
        <view v-else-if="catalogPicked" class="mt-2 rounded-md bg-primary-light p-3">
          <view class="flex items-center justify-between gap-2">
            <text class="min-w-0 flex-1 truncate text-sm text-primary-dark font-medium">{{ catalogPicked.name }}</text>
            <text class="shrink-0 text-xs text-primary" @click="clearPickedCatalog">清除</text>
          </view>
          <text v-if="catalogPicked.time_text" class="mt-1 block text-xs text-primary leading-5">{{ catalogPicked.time_text }}</text>
          <template v-if="catalogPicked.slots.length > 1">
            <view class="mt-2 flex flex-wrap gap-2">
              <view
                v-for="(slot, index) in catalogPicked.slots"
                :key="index"
                class="rounded-full px-3 py-1 text-xs"
                :class="index === catalogSlotIndex ? 'bg-primary text-white' : 'bg-card text-primary'"
                @click="pickCatalogSlot(index)"
              >
                {{ slotLabel(slot, index) }}
              </view>
            </view>
            <text class="mt-2 block text-xs text-fg-2 leading-5">这门课有多个上课时间：点选一个填入本条，其余时间保存后再添加一条；或用下面的按钮一次全部加入</text>
          </template>
          <text v-else-if="!catalogPicked.slots.length" class="mt-1 block text-xs text-fg-2">未能解析上课时间，请在下方手动选择</text>
          <button
            v-if="catalogPicked.slots.length"
            class="btn-secondary mt-3 btn-block btn-sm"
            :disabled="quickAdding || submitting"
            @click="handleQuickAdd"
          >
            {{ quickAdding ? '添加中…' : `一键添加全部时段（旁听，${catalogPicked.slots.length} 个）` }}
          </button>
        </view>
        <text v-else class="mt-2 block text-xs text-fg-3 leading-5">搜索本学期课程库可一键填入名称、教师与时间；也可以直接在下方手动填写</text>
      </view>

      <view class="yp-card space-y-4">
        <view v-if="showCategory">
          <text class="mb-2 block text-sm text-fg-2 font-medium">类别</text>
          <picker :value="categoryIndex" :range="categoryOptions" @change="onCategoryChange">
            <view class="form-picker">
              <text>{{ CATEGORY_LABELS[form.category] }}</text>
              <text class="i-carbon-chevron-down text-fg-3" />
            </view>
          </picker>
          <text v-if="isExam" class="mt-1 block text-xs text-fg-3 leading-5">考试只占一周；学期考试安排导入后，课程的考试会自动出现，无需手动添加</text>
          <ApiFieldError :messages="getFieldMessages('category')" />
        </view>

        <view v-if="showRole">
          <text class="mb-2 block text-sm text-fg-2 font-medium">已选 / 旁听</text>
          <view class="flex overflow-hidden border border-line rounded-md">
            <view
              v-for="option in ROLE_OPTIONS"
              :key="option.value"
              class="flex-1 py-2 text-center text-sm"
              :class="form.role === option.value ? 'bg-primary text-white' : 'bg-card text-fg-2'"
              @click="form.role = option.value"
            >
              {{ option.label }}
            </view>
          </view>
          <ApiFieldError :messages="getFieldMessages('role')" />
        </view>

        <view>
          <text class="mb-2 block text-sm text-fg-2 font-medium">名称</text>
          <input
            v-model="form.name"
            class="form-input"
            :class="{ 'form-input--error': getFieldMessages('name').length }"
            :placeholder="isExam ? '如：高等数学 期末考试' : '如：自习、社团例会'"
            :maxlength="100"
          >
          <ApiFieldError :messages="getFieldMessages('name')" />
        </view>

        <view v-if="isSingle" class="flex items-center justify-between">
          <view>
            <text class="block text-sm text-fg-2 font-medium">本次不上课</text>
            <text class="block text-xs text-fg-3">这一周的这次课从课表中去掉</text>
          </view>
          <uv-switch v-model="form.canceled" size="22" :active-color="tokens.primary" />
        </view>

        <template v-if="!form.canceled || !isSingle">
          <view>
            <text class="mb-2 block text-sm text-fg-2 font-medium">星期</text>
            <picker :value="form.weekday - 1" :range="weekdayOptions" @change="onWeekdayChange">
              <view class="form-picker">
                <text>{{ weekdayOptions[form.weekday - 1] }}</text>
                <text class="i-carbon-chevron-down text-fg-3" />
              </view>
            </picker>
            <ApiFieldError :messages="getFieldMessages('weekday')" />
          </view>

          <view class="flex gap-3">
            <view class="flex-1">
              <text class="mb-2 block text-sm text-fg-2 font-medium">开始节次</text>
              <picker :value="startSectionIndex" :range="sectionOptions" @change="onStartSectionChange">
                <view class="form-picker">
                  <text class="truncate">第{{ form.start_section }}节</text>
                  <text class="i-carbon-chevron-down text-fg-3" />
                </view>
              </picker>
              <ApiFieldError :messages="getFieldMessages('start_section')" />
            </view>
            <view class="flex-1">
              <text class="mb-2 block text-sm text-fg-2 font-medium">结束节次</text>
              <picker :value="endSectionIndex" :range="sectionOptions" @change="onEndSectionChange">
                <view class="form-picker">
                  <text class="truncate">第{{ form.end_section }}节</text>
                  <text class="i-carbon-chevron-down text-fg-3" />
                </view>
              </picker>
              <ApiFieldError :messages="getFieldMessages('end_section')" />
            </view>
          </view>
          <text class="block text-xs text-fg-3">
            {{ rows[startSectionIndex]?.start }} – {{ rows[endSectionIndex]?.end }}
          </text>

          <view v-if="showWeekRange" class="flex gap-3">
            <view class="flex-1">
              <text class="mb-2 block text-sm text-fg-2 font-medium">开始周</text>
              <picker :value="form.week_start - 1" :range="weekOptions" @change="onWeekStartChange">
                <view class="form-picker">
                  <text>第{{ form.week_start }}周</text>
                  <text class="i-carbon-chevron-down text-fg-3" />
                </view>
              </picker>
              <ApiFieldError :messages="getFieldMessages('week_start')" />
            </view>
            <view class="flex-1">
              <text class="mb-2 block text-sm text-fg-2 font-medium">结束周</text>
              <picker :value="form.week_end - 1" :range="weekOptions" @change="onWeekEndChange">
                <view class="form-picker">
                  <text>第{{ form.week_end }}周</text>
                  <text class="i-carbon-chevron-down text-fg-3" />
                </view>
              </picker>
              <ApiFieldError :messages="getFieldMessages('week_end')" />
            </view>
          </view>

          <view v-if="showExamWeek">
            <text class="mb-2 block text-sm text-fg-2 font-medium">周次</text>
            <picker :value="form.week_start - 1" :range="weekOptions" @change="onExamWeekChange">
              <view class="form-picker">
                <text>第{{ form.week_start }}周</text>
                <text class="i-carbon-chevron-down text-fg-3" />
              </view>
            </picker>
            <text v-if="examDateText" class="mt-1 block text-xs text-error leading-5">{{ examDateText }}</text>
            <ApiFieldError :messages="getFieldMessages('week_start')" />
            <ApiFieldError :messages="getFieldMessages('week_end')" />
          </view>

          <view v-if="showWeekRange">
            <text class="mb-2 block text-sm text-fg-2 font-medium">单双周</text>
            <picker :value="form.parity" :range="parityOptions" @change="onParityChange">
              <view class="form-picker">
                <text>{{ parityOptions[form.parity] }}</text>
                <text class="i-carbon-chevron-down text-fg-3" />
              </view>
            </picker>
            <ApiFieldError :messages="getFieldMessages('parity')" />
          </view>
          <view v-else-if="existing && !isManual && !isScoped">
            <text class="mb-1 block text-sm text-fg-2 font-medium">周次</text>
            <text class="block text-sm text-fg-2">{{ describeWeeks(existing) }}（以导入为准）</text>
          </view>

          <view>
            <text class="mb-2 block text-sm text-fg-2 font-medium">地点</text>
            <input v-model="form.room" class="form-input" placeholder="选填" :maxlength="100">
            <ApiFieldError :messages="getFieldMessages('room')" />
          </view>

          <view>
            <text class="mb-2 block text-sm text-fg-2 font-medium">教师 / 负责人</text>
            <input v-model="form.teacher" class="form-input" placeholder="选填" :maxlength="80">
            <ApiFieldError :messages="getFieldMessages('teacher')" />
          </view>

          <view>
            <text class="mb-2 block text-sm text-fg-2 font-medium">标签</text>
            <input
              v-model="form.tag"
              class="form-input"
              placeholder="选填，如：选修、旁听、社团"
              :maxlength="24"
            >
            <view v-if="tagSuggestions.length" class="mt-2 flex flex-wrap gap-2">
              <view
                v-for="tag in tagSuggestions"
                :key="tag"
                class="rounded-full px-3 py-1 text-xs"
                :class="tag === form.tag ? 'bg-primary text-white' : 'bg-fill text-fg-2'"
                @click="pickTag(tag)"
              >
                {{ tag }}
              </view>
            </view>
            <text v-if="!isScoped" class="mt-1 block text-xs text-fg-3 leading-5">带标签的日程可以在首页「筛选」里按标签显示或隐藏</text>
            <ApiFieldError :messages="getFieldMessages('tag')" />
          </view>

          <view>
            <text class="mb-2 block text-sm text-fg-2 font-medium">备注</text>
            <textarea
              v-model="form.note"
              class="form-textarea"
              placeholder="选填，最多 2000 字"
              :maxlength="2000"
              auto-height
            />
            <ApiFieldError :messages="getFieldMessages('note')" />
          </view>
        </template>

        <ApiFieldError :messages="getFieldMessages('non_field_errors')" />
        <text v-if="formError" class="block text-sm text-error">{{ formError }}</text>
      </view>

      <button
        class="btn-primary mt-6 btn-block"
        :disabled="submitting || quickAdding"
        @click="handleSubmit"
      >
        {{ submitLabel }}
      </button>
      <button
        v-if="isEdit && isManual && !isScoped"
        class="btn-danger mt-3 btn-block"
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
  font-size: var(--yp-font-sm);
  color: var(--yp-text-1);
  background: var(--yp-bg-fill);
  border: 2rpx solid var(--yp-border);
  border-radius: var(--yp-radius-md);
}

.form-input,
.form-picker {
  height: 80rpx;
  line-height: 80rpx;
}

.form-input--error {
  border-color: var(--yp-color-error);
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
</style>
