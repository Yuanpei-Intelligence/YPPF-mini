import type {
  CalendarEvent,
  CalendarKind,
  CatalogEntry,
  EditScope,
  Entry,
  EntryCategory,
  EntryExam,
  EntryOverride,
  EntryRole,
  LessonBlock,
  Occurrence,
  OccurrenceKind,
  OccurrenceSource,
  OverrideFields,
  Settings,
  SettingsPatch,
  SettingsSource,
  Term,
  WeekDay,
  WeekView,
} from '@/api/types/timetable'

// @unocss-include
// 上面这行让 UnoCSS 扫描本文件：这里的校历配色表以字符串形式返回 class（.ts 默认不在扫描范围内）。

/*
 * 课表展示用的纯函数与本机存储读写；不含请求与 UI。
 */

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const

export const KIND_LABELS: Record<OccurrenceKind, string> = {
  course: '课程',
  college: '书院课',
  activity: '活动',
  appoint: '预约',
  custom: '自定义',
  exam: '考试',
}

/** 需要在格子上标出的类别（学校课程与自定义条目不打标） */
export const KIND_BADGES: Partial<Record<OccurrenceKind, string>> = {
  college: '书院课',
  activity: '活动',
  appoint: '预约',
  exam: '考试',
}

export const STATUS_LABELS: Record<string, string> = {
  canceled: '已取消',
  checked_in: '已签到',
  applied: '已报名',
}

export const PARITY_LABELS = ['每周', '单周', '双周'] as const

export const ROLE_LABELS: Record<EntryRole, string> = {
  enrolled: '已选',
  audit: '旁听',
}

/** 格子 / 列表里旁听课程的小标 */
export const AUDIT_BADGE = '旁'

export const CATEGORY_LABELS: Record<EntryCategory, string> = {
  course: '课程',
  exam: '考试',
  other: '其它',
}

export const SCOPE_LABELS: Record<EditScope, string> = {
  single: '仅本次',
  following: '本次及以后',
  all: '全部',
}

/** 本系统存储的条目来源（可编辑、可在服务端隐藏） */
export function isStoredSource(source: OccurrenceSource): boolean {
  return source === 'portal' || source === 'paste' || source === 'manual'
}

export interface PaletteColor {
  bg: string
  fg: string
}

/** 考试日程固定用红色系，不参与哈希取色 */
export const EXAM_COLOR: PaletteColor = { bg: '#fee2e2', fg: '#b91c1c' }

/** 浅底深字的 12 色盘，按 color_key 哈希取色，保证同一门课在各处颜色一致 */
export const PALETTE: PaletteColor[] = [
  { bg: '#dbeafe', fg: '#1e40af' },
  { bg: '#dcfce7', fg: '#166534' },
  { bg: '#fef3c7', fg: '#92400e' },
  { bg: '#ede9fe', fg: '#5b21b6' },
  { bg: '#fce7f3', fg: '#9d174d' },
  { bg: '#ccfbf1', fg: '#115e59' },
  { bg: '#ffedd5', fg: '#9a3412' },
  { bg: '#e0e7ff', fg: '#3730a3' },
  { bg: '#ecfccb', fg: '#3f6212' },
  { bg: '#cffafe', fg: '#155e75' },
  { bg: '#ffe4e6', fg: '#9f1239' },
  { bg: '#e2e8f0', fg: '#334155' },
]

function hashString(text: string): number {
  let hash = 5381
  for (let i = 0; i < text.length; i++)
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  return hash
}

export function colorFor(key: string): PaletteColor {
  return PALETTE[hashString(key || '') % PALETTE.length]
}

export function colorForOccurrence(occurrence: Occurrence): PaletteColor {
  if (occurrence.kind === 'exam')
    return EXAM_COLOR
  return colorFor(occurrence.color_key || occurrence.title)
}

export interface SectionRow {
  section: number
  start: string
  end: string
}

/** 北大校本部 50 分钟节次表，后端未提供 section_times 时兜底 */
const DEFAULT_SECTION_TIMES: Record<string, [string, string]> = {
  1: ['08:00', '08:50'],
  2: ['09:00', '09:50'],
  3: ['10:10', '11:00'],
  4: ['11:10', '12:00'],
  5: ['13:00', '13:50'],
  6: ['14:00', '14:50'],
  7: ['15:10', '16:00'],
  8: ['16:10', '17:00'],
  9: ['17:10', '18:00'],
  10: ['18:40', '19:30'],
  11: ['19:40', '20:30'],
  12: ['20:40', '21:30'],
}

/** 按节次号升序整理出行 */
export function sectionRows(term: Term | null | undefined): SectionRow[] {
  const table = term?.section_times && Object.keys(term.section_times).length
    ? term.section_times
    : DEFAULT_SECTION_TIMES
  return Object.keys(table)
    .map(key => Number(key))
    .filter(section => Number.isInteger(section) && section > 0)
    .sort((a, b) => a - b)
    .map(section => ({ section, start: table[String(section)][0], end: table[String(section)][1] }))
}

export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(part => Number(part))
  if (!Number.isFinite(hour) || !Number.isFinite(minute))
    return 0
  return hour * 60 + minute
}

/**
 * 把时刻换算成以“行”为单位的纵向位置：落在某节内按比例插值，落在课间则贴到下一节起点
 */
export function timeToRowPosition(time: string, rows: SectionRow[]): number {
  const minutes = timeToMinutes(time)
  if (!rows.length)
    return 0
  if (minutes <= timeToMinutes(rows[0].start))
    return 0
  for (let i = 0; i < rows.length; i++) {
    const start = timeToMinutes(rows[i].start)
    const end = timeToMinutes(rows[i].end)
    if (minutes <= start)
      return i
    if (minutes <= end)
      return end > start ? i + (minutes - start) / (end - start) : i
  }
  return rows.length
}

export interface RowSpan {
  /** 起始行（0 基，可为小数） */
  top: number
  /** 占据的行数（可为小数） */
  span: number
}

/** 取 `YYYY-MM-DDTHH:MM:SS` 里的 HH:MM */
export function clockOf(datetime: string): string {
  return datetime.length >= 16 ? datetime.slice(11, 16) : datetime
}

/**
 * 日程在网格里的纵向位置：有节次的按节次，没有节次（自定义时间）的按时刻
 */
export function occurrenceRowSpan(occurrence: Occurrence, rows: SectionRow[]): RowSpan {
  const { start_section, end_section } = occurrence
  if (start_section && end_section && start_section > 0 && end_section >= start_section) {
    const startIndex = rows.findIndex(row => row.section === start_section)
    const endIndex = rows.findIndex(row => row.section === end_section)
    const top = startIndex >= 0 ? startIndex : Math.min(start_section - 1, Math.max(rows.length - 1, 0))
    const bottom = endIndex >= 0 ? endIndex + 1 : Math.min(end_section, rows.length)
    return { top, span: Math.max(bottom - top, 1) }
  }
  const top = timeToRowPosition(clockOf(occurrence.start), rows)
  const bottom = timeToRowPosition(clockOf(occurrence.end), rows)
  return { top, span: Math.max(bottom - top, 0.5) }
}

/** `YYYY-MM-DD` -> `M/D` */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split('-')
  if (!month || !day)
    return iso
  return `${Number(month)}/${Number(day)}`
}

/** `YYYY-MM-DD` -> `M月D日` */
export function chineseDate(iso: string): string {
  const [, month, day] = iso.split('-')
  if (!month || !day)
    return iso
  return `${Number(month)}月${Number(day)}日`
}

/** ISO 日期时间 -> `YYYY-MM-DD HH:MM`；空值返回空串 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value)
    return ''
  return value.length >= 16 ? `${value.slice(0, 10)} ${value.slice(11, 16)}` : value
}

const SEASON_LABELS: Record<string, string> = { 1: '秋季', 2: '春季', 3: '夏季' }

/** 学期码 `YY-YY-N` -> `2025–2026 学年 秋季学期`；无法识别时原样返回 */
export function describeTermCode(code: string): string {
  const match = /^(\d{2})-(\d{2})-(\d)$/.exec(code)
  if (!match)
    return code
  const season = SEASON_LABELS[match[3]] ?? `第${match[3]}`
  return `20${match[1]}–20${match[2]} 学年 ${season}学期`
}

type SlotLike = Partial<Pick<LessonBlock, 'weekday' | 'start_section' | 'end_section' | 'week_start' | 'week_end' | 'parity'>>

/** 描述一个时间块：`周一 第3–4节 · 第1–16周单周`；缺失的字段跳过，全缺时返回空串 */
export function describeSlot(slot: SlotLike): string {
  const head: string[] = []
  if (slot.weekday)
    head.push(`周${WEEKDAY_LABELS[slot.weekday - 1] ?? '?'}`)
  const sections = describeSections(slot.start_section, slot.end_section)
  if (sections)
    head.push(sections)
  const weeks = slot.week_start && slot.week_end
    ? `第${slot.week_start}–${slot.week_end}周${slot.parity ? PARITY_LABELS[slot.parity] : ''}`
    : ''
  return [head.join(' '), weeks].filter(Boolean).join(' · ')
}

/* -------------------- 校历 -------------------- */

/** 全校停课的校历类别（放假 / 考试周） */
export type SuspendedKind = Extract<CalendarKind, 'holiday' | 'exam'>

/** 放假与考试周当天没有课，整列置灰 */
export function suspendsClasses(kind: CalendarKind | null | undefined): kind is SuspendedKind {
  return kind === 'holiday' || kind === 'exam'
}

/** 取第 index 列（0=周一）的校历信息；后端未提供 days 时为 null */
export function dayInfo(view: WeekView | null | undefined, index: number): WeekDay | null {
  const days = view?.days
  if (!Array.isArray(days) || !days.length)
    return null
  const date = view?.week_dates?.[index]
  const candidate = days[index]
  if (candidate && (!date || candidate.date === date))
    return candidate
  return days.find(day => day.date === date) ?? null
}

interface CalendarLabelStyle {
  /** 页面用的 UnoCSS 文字色 class */
  class: string
  /** canvas 用的同一颜色 */
  color: string
}

/** 校历标签配色：放假 / 考试红，调休蓝，仅标注灰 */
const CALENDAR_LABEL_STYLES: Record<CalendarKind, CalendarLabelStyle> = {
  holiday: { class: 'text-red-500', color: '#ef4444' },
  exam: { class: 'text-red-500', color: '#ef4444' },
  swap: { class: 'text-blue-500', color: '#3b82f6' },
  info: { class: 'text-gray-400', color: '#9ca3af' },
}

export function calendarLabelClass(kind: CalendarKind | null | undefined): string {
  return kind ? CALENDAR_LABEL_STYLES[kind]?.class ?? '' : ''
}

export function calendarLabelColor(kind: CalendarKind | null | undefined): string {
  return kind ? CALENDAR_LABEL_STYLES[kind]?.color ?? '' : ''
}

/** 停课列的底色（gray-100）：页面 class 与 canvas 色值 */
export const CALENDAR_SHADE_CLASS = 'bg-gray-100'
export const CALENDAR_SHADE_COLOR = '#f3f4f6'

/** 停课日没有 label 时的兜底文案 */
const SUSPENDED_LABELS: Record<SuspendedKind, string> = { holiday: '放假', exam: '考试周' }

/** 整周停课（每天都是放假 / 考试）时的原因，供空状态显示，否则为空串；多个原因按出现顺序用 · 连接 */
export function weekSuspendedReason(view: WeekView | null | undefined): string {
  const days = view?.days
  if (!Array.isArray(days) || days.length < 7)
    return ''
  const reasons: string[] = []
  for (const day of days) {
    const kind = day.kind
    if (!suspendsClasses(kind))
      return ''
    const reason = day.label || SUSPENDED_LABELS[kind]
    if (!reasons.includes(reason))
      reasons.push(reason)
  }
  return reasons.join(' · ')
}

/* -------------------- 日期与学期定位 -------------------- */

const DAY_MS = 86_400_000
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` -> UTC 零点的时间戳（全部按 UTC 计算，避开时区与夏令时）；格式或日期无效时返回 null */
function isoDateToMs(iso: string): number | null {
  if (!ISO_DATE_RE.test(iso))
    return null
  const [year, month, day] = iso.split('-').map(Number)
  const ms = Date.UTC(year, month - 1, day)
  const check = new Date(ms)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day)
    return null
  return ms
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function msToIsoDate(ms: number): string {
  const date = new Date(ms)
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

/** 是否为合法的 `YYYY-MM-DD` */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && isoDateToMs(value) !== null
}

/** 本机今天的 `YYYY-MM-DD` */
export function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** `YYYY-MM-DD` 加减天数；输入无效时原样返回 */
export function addDays(iso: string, delta: number): string {
  const ms = isoDateToMs(iso)
  return ms === null ? iso : msToIsoDate(ms + delta * DAY_MS)
}

/** 相差天数（to − from）；任一无效时返回 null */
export function daysBetween(from: string, to: string): number | null {
  const start = isoDateToMs(from)
  const end = isoDateToMs(to)
  if (start === null || end === null)
    return null
  return Math.round((end - start) / DAY_MS)
}

/** 周几：1=周一 … 7=周日；输入无效时返回 0 */
export function weekdayOf(iso: string): number {
  const ms = isoDateToMs(iso)
  if (ms === null)
    return 0
  const day = new Date(ms).getUTCDay()
  return day === 0 ? 7 : day
}

/* -------------------- 考试周 -------------------- */

/** 第 week 周是否为考试周（week ≥ exam_week_start）；后端未设置或未升级时一律 false */
export function isExamWeek(term: Term | null | undefined, week: number | null | undefined): boolean {
  const start = term?.exam_week_start
  return typeof start === 'number' && start > 0 && typeof week === 'number' && week >= start
}

/** 教学周数：后端给的 teaching_weeks，否则由 exam_week_start 推算，再否则为 total_weeks */
export function teachingWeeksOf(term: Term | null | undefined): number {
  if (!term)
    return 16
  if (typeof term.teaching_weeks === 'number' && term.teaching_weeks > 0)
    return Math.min(term.teaching_weeks, term.total_weeks)
  if (typeof term.exam_week_start === 'number' && term.exam_week_start > 1)
    return Math.min(term.exam_week_start - 1, term.total_weeks)
  return term.total_weeks
}

/** 某天在学期里的教学周次；不在 [week1_monday, week1_monday + total_weeks×7) 内为 null */
export function weekOfDate(term: Term, iso: string): number | null {
  const diff = daysBetween(term.week1_monday, iso)
  if (diff === null || diff < 0)
    return null
  const week = Math.floor(diff / 7) + 1
  return week <= term.total_weeks ? week : null
}

/** 某天落在学期列表里的哪个学期、第几周；都不命中为 null。preferred 为优先判断的学期码 */
export function locateDate(terms: Term[], iso: string, preferred?: string): { term: Term, week: number } | null {
  const ordered = preferred
    ? [...terms.filter(term => term.code === preferred), ...terms.filter(term => term.code !== preferred)]
    : terms
  for (const term of ordered) {
    const week = weekOfDate(term, iso)
    if (week !== null)
      return { term, week }
  }
  return null
}

/** 第 week 周周一到周日的 ISO 日期 */
export function weekDatesOf(term: Term, week: number): string[] {
  const monday = addDays(term.week1_monday, (week - 1) * 7)
  return WEEKDAY_LABELS.map((_, index) => addDays(monday, index))
}

/** 校历事件与闭区间 [start, end] 是否重叠（ISO 日期可直接按字符串比较） */
function eventOverlaps(event: CalendarEvent, start: string, end: string): boolean {
  return event.start <= end && event.end >= start
}

/** 校历事件优先级：放假 / 考试 > 调休 > 仅标注（与后端 day_info 一致） */
const CALENDAR_PRIORITY: Record<CalendarKind, number> = { holiday: 3, exam: 3, swap: 2, info: 1 }

/**
 * 某天的校历信息：优先用 week/ 返回的 days，否则从学期校历推算；
 * 没有事件时 kind 与 label 为 null；日期无效时返回 null
 */
export function dayInfoOf(view: WeekView | null | undefined, iso: string): WeekDay | null {
  const fromDays = view?.days?.find(day => day.date === iso)
  if (fromDays)
    return fromDays
  const weekday = weekdayOf(iso)
  if (!weekday)
    return null
  let best: CalendarEvent | null = null
  for (const event of view?.term.calendar ?? []) {
    if (!eventOverlaps(event, iso, iso))
      continue
    if (!best || CALENDAR_PRIORITY[event.kind] > CALENDAR_PRIORITY[best.kind])
      best = event
  }
  return {
    date: iso,
    weekday,
    kind: best?.kind ?? null,
    label: best?.name ?? null,
    follows_weekday: best?.follows_weekday ?? null,
  }
}

export interface WeekPickerItem {
  week: number
  /** `M/D–M/D` */
  range: string
  /** 本周内的停课事件名（放假 / 停课复习考试），多个用 · 连接；没有则为空串 */
  suspended: string
  /** 考试周（week ≥ exam_week_start） */
  exam: boolean
  /** 格子上的标记：校历停课事件优先，其次“考试周”；没有则为空串 */
  label: string
}

/** 考试周的标签 */
export const EXAM_WEEK_LABEL = '考试周'

/** 周次选择器：学期内每一周的日期范围、停课标记与考试周 */
export function weekPickerItems(term: Term): WeekPickerItem[] {
  const suspendedEvents = (term.calendar ?? []).filter(event => suspendsClasses(event.kind))
  const items: WeekPickerItem[] = []
  for (let week = 1; week <= term.total_weeks; week++) {
    const dates = weekDatesOf(term, week)
    const names = suspendedEvents
      .filter(event => eventOverlaps(event, dates[0], dates[6]))
      .map(event => event.name)
    const suspended = Array.from(new Set(names)).join(' · ')
    const exam = isExamWeek(term, week)
    items.push({
      week,
      range: `${shortDate(dates[0])}–${shortDate(dates[6])}`,
      suspended,
      exam,
      label: suspended || (exam ? EXAM_WEEK_LABEL : ''),
    })
  }
  return items
}

/**
 * 周视图表头的周次标记：整周停课时用校历原因（放假 / 停课复习考试），
 * 否则考试周显示“考试周”；都不是则为空串
 */
export function weekHeaderMark(view: WeekView | null | undefined): string {
  if (!view)
    return ''
  return weekSuspendedReason(view) || (isExamWeek(view.term, view.week) ? EXAM_WEEK_LABEL : '')
}

/* -------------------- 日程详情 -------------------- */

/** `第3节` / `第3–4节`；缺节次时为空串 */
export function describeSections(start: number | null | undefined, end: number | null | undefined): string {
  if (!start || !end)
    return ''
  return start === end ? `第${start}节` : `第${start}–${end}节`
}

/** 详情里的时间行：`9月25日 周五 · 10:10–12:00 · 第3–4节` */
export function describeOccurrenceTime(item: Occurrence): string {
  const parts = [
    `${chineseDate(item.date)} 周${WEEKDAY_LABELS[item.weekday - 1] ?? ''}`,
    `${clockOf(item.start)}–${clockOf(item.end)}`,
  ]
  const sections = describeSections(item.start_section, item.end_section)
  if (sections)
    parts.push(sections)
  return parts.join(' · ')
}

export type DetailActionKey = 'activity' | 'appoint' | 'edit' | 'cancel_once' | 'reset' | 'hide' | 'unhide' | 'delete'

export interface DetailAction {
  key: DetailActionKey
  label: string
  primary: boolean
  /** 红色文字的破坏性操作 */
  danger?: boolean
}

export interface DetailActionContext {
  hidden: boolean
  /** 已加载的条目详情；未加载 / 加载失败时为 null，此时按最保守的集合给操作 */
  entry?: Entry | null
}

/** 存储条目（含手动考试）的日程：有 entry_id 且来源是本系统存储的 */
export function isEditableOccurrence(item: Occurrence): boolean {
  return typeof item.ref.entry_id === 'number' && isStoredSource(item.source)
}

/**
 * 详情弹层的操作：书院课 / 活动 → 查看活动，预约 → 查看预约；
 * 存储条目 → 编辑、本次停课（考试除外）、恢复默认（有调整时）、删除（手动条目）；任何日程都可隐藏 / 取消隐藏
 */
export function detailActionsFor(item: Occurrence, context: DetailActionContext): DetailAction[] {
  const actions: DetailAction[] = []
  const entry = context.entry ?? null
  if (item.kind === 'college' || item.kind === 'activity') {
    actions.push({ key: 'activity', label: '查看活动 / 签到', primary: true })
  }
  else if (item.kind === 'appoint') {
    actions.push({ key: 'appoint', label: '查看预约', primary: true })
  }
  else if (isEditableOccurrence(item)) {
    actions.push({ key: 'edit', label: '编辑', primary: true })
    if (item.kind !== 'exam')
      actions.push({ key: 'cancel_once', label: '本次停课', primary: false })
    if (entry?.overrides?.length)
      actions.push({ key: 'reset', label: '恢复默认', primary: false })
  }
  actions.push(context.hidden
    ? { key: 'unhide', label: '取消隐藏', primary: false }
    : { key: 'hide', label: '隐藏', primary: false })
  if (entry?.source === 'manual' && isEditableOccurrence(item))
    actions.push({ key: 'delete', label: '删除', primary: false, danger: true })
  return actions
}

/* -------------------- 条目详情与调整 -------------------- */

/** 条目是否跨多个周（编辑时才需要选择范围） */
export function entrySpansWeeks(entry: Entry): boolean {
  return entry.week_end > entry.week_start
}

/** 调整在第 week 周是否生效（null 边界为开区间） */
function overrideCovers(override: EntryOverride, week: number): boolean {
  return (override.week_start === null || override.week_start <= week)
    && (override.week_end === null || override.week_end >= week)
}

/** 调整范围的宽度（null 边界取条目的首尾周） */
function overrideWidth(override: EntryOverride, entry: Entry): number {
  const start = override.week_start ?? entry.week_start
  const end = override.week_end ?? entry.week_end
  return end - start
}

export interface EffectiveOverride {
  fields: OverrideFields
  canceled: boolean
  /** 有任何调整命中这一周 */
  modified: boolean
}

/**
 * 第 week 周实际生效的调整：按范围从宽到窄、id 从小到大依次叠加（与后端展开规则一致），
 * 更窄或更新的调整在每个键上优先，canceled 取最后一个命中的值
 */
export function effectiveOverrideAt(entry: Entry, week: number): EffectiveOverride {
  const applicable = (entry.overrides ?? [])
    .filter(override => overrideCovers(override, week))
    .sort((a, b) => overrideWidth(b, entry) - overrideWidth(a, entry) || a.id - b.id)
  const fields: OverrideFields = {}
  let canceled = false
  for (const override of applicable) {
    Object.assign(fields, override.fields)
    canceled = override.canceled
  }
  return { fields, canceled, modified: applicable.length > 0 }
}

/** 调整覆盖的周次：`第3周` / `第3周起` / `第3–5周` / `全部周次` */
export function describeOverrideRange(override: EntryOverride): string {
  const { week_start: start, week_end: end } = override
  if (start === null && end === null)
    return '全部周次'
  if (start !== null && end === null)
    return `第${start}周起`
  if (start === null && end !== null)
    return `第${end}周及以前`
  return start === end ? `第${start}周` : `第${start}–${end}周`
}

/** 考试安排的时间行：`1月11日 周一 · 08:30–10:30`；日期无效时退回原始字符串 */
export function describeExamTime(exam: EntryExam): string {
  const date = exam.start.slice(0, 10)
  const weekday = weekdayOf(date)
  const day = weekday ? `${chineseDate(date)} 周${WEEKDAY_LABELS[weekday - 1]}` : date
  return `${day} · ${clockOf(exam.start)}–${clockOf(exam.end)}`
}

/** 课程号-班号，如 `04831410-01`；都没有时为空串 */
export function describeCourseCode(item: { course_code: string, class_no: string }): string {
  return [item.course_code, item.class_no].filter(Boolean).join('-')
}

/** 学分与院系 / 类别：`2 学分 · 信息科学技术学院 · 专业必修` */
export function describeCatalogMeta(catalog: { credits: number | null, department?: string, category?: string }): string {
  const parts: string[] = []
  if (catalog.credits !== null && catalog.credits !== undefined)
    parts.push(`${catalog.credits} 学分`)
  if (catalog.department)
    parts.push(catalog.department)
  if (catalog.category)
    parts.push(catalog.category)
  return parts.join(' · ')
}

/** 周次与单双周：`第1–16周 单周` */
export function describeWeeks(entry: { week_start: number, week_end: number, parity: number }): string {
  const weeks = entry.week_start === entry.week_end ? `第${entry.week_start}周` : `第${entry.week_start}–${entry.week_end}周`
  const parity = entry.parity === 1 || entry.parity === 2 ? ` ${PARITY_LABELS[entry.parity]}` : ''
  return `${weeks}${parity}`
}

/* -------------------- 筛选（来源与标签） -------------------- */

export interface FilterSourceItem extends SettingsSource {
  enabled: boolean
}

export interface FilterTagItem {
  tag: string
  enabled: boolean
}

/** 尚未升级到 sources 列表的后端：按已知的来源开关兜底 */
const FALLBACK_SOURCES: SettingsSource[] = [
  { key: 'stored', label: '学校课表', setting: 'show_courses' },
  { key: 'college', label: '书院课', setting: 'show_college' },
  { key: 'activity', label: '活动', setting: 'show_activities' },
  { key: 'appoint', label: '地下室预约', setting: 'show_appointments' },
  { key: 'exam', label: '考试', setting: 'show_exams' },
]

/** 筛选弹层里的来源列表：后端给的 sources，否则用已知开关兜底（后端没返回的开关跳过）；缺失的值按开启处理 */
export function filterSources(settings: Settings): FilterSourceItem[] {
  const record = settings as unknown as Record<string, unknown>
  const sources = Array.isArray(settings.sources) && settings.sources.length
    ? settings.sources
    : FALLBACK_SOURCES.filter(source => source.setting === 'show_courses' || record[source.setting] !== undefined)
  return sources.map(source => ({ ...source, enabled: record[source.setting] !== false }))
}

/** 筛选弹层里的标签列表：我的条目用过的标签，在 hidden_tags 里的为关闭 */
export function filterTags(settings: Settings): FilterTagItem[] {
  const hidden = new Set(settings.hidden_tags ?? [])
  return (settings.tags ?? []).map(tag => ({ tag, enabled: !hidden.has(tag) }))
}

export interface FilterSummary {
  enabled: number
  total: number
  /** 没有任何来源 / 标签被关闭 */
  allOn: boolean
}

/** 「筛选」按钮角标用：已开启 / 全部 的计数 */
export function filterSummary(settings: Settings | null | undefined): FilterSummary {
  if (!settings)
    return { enabled: 0, total: 0, allOn: true }
  const items = [...filterSources(settings), ...filterTags(settings)]
  const enabled = items.filter(item => item.enabled).length
  return { enabled, total: items.length, allOn: enabled === items.length }
}

/** 把筛选弹层里的选择整理成 `PATCH settings/` 的请求体；后端没返回过 tags 时不提交 hidden_tags */
export function buildFilterPatch(settings: Settings, sources: FilterSourceItem[], tags: FilterTagItem[]): SettingsPatch {
  const patch: Record<string, boolean | string[]> = {}
  for (const source of sources)
    patch[source.setting] = source.enabled
  if (Array.isArray(settings.tags))
    patch.hidden_tags = tags.filter(item => !item.enabled).map(item => item.tag)
  return patch as SettingsPatch
}

/* -------------------- 本机存储 -------------------- */

/** 用户勾选“本机记住密码”后保存在本机的门户凭据 */
export interface PkuCredential {
  username: string
  password: string
}

/** 上课提醒的本机缓存：提醒开关与订阅模板 id，供课表页静默重新请求订阅时使用 */
export interface ReminderCache {
  enabled: boolean
  template_id: string | null
  /** 上次向服务端核对的时间戳（ms）；0 表示尚未核对 */
  checked_at: number
}

const PKU_CRED_KEY = 'pku_cred'
const WEEK_VIEW_CACHE_KEY = 'timetable_week_view'
const LOCAL_HIDDEN_KEY = 'timetable_hidden_ids'
const SHOW_HIDDEN_KEY = 'timetable_show_hidden'
const REMINDER_CACHE_KEY = 'timetable_reminder'
const CATALOG_PICK_KEY = 'timetable_catalog_pick'

function readStorage<T>(key: string): T | null {
  try {
    const value = uni.getStorageSync(key)
    return value === '' || value === undefined || value === null ? null : value as T
  }
  catch {
    return null
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    uni.setStorageSync(key, value)
  }
  catch (error) {
    console.error(`写入本机存储 ${key} 失败:`, error)
  }
}

function removeStorage(key: string) {
  try {
    uni.removeStorageSync(key)
  }
  catch {
    // 忽略
  }
}

export function readPkuCredential(): PkuCredential | null {
  const value = readStorage<PkuCredential>(PKU_CRED_KEY)
  if (!value || typeof value.username !== 'string' || typeof value.password !== 'string' || !value.username || !value.password)
    return null
  return value
}

export function savePkuCredential(credential: PkuCredential) {
  writeStorage(PKU_CRED_KEY, credential)
}

export function clearPkuCredential() {
  removeStorage(PKU_CRED_KEY)
}

export function readCachedWeekView(): WeekView | null {
  const value = readStorage<WeekView>(WEEK_VIEW_CACHE_KEY)
  if (!value || !value.term || !Array.isArray(value.occurrences) || !Array.isArray(value.week_dates))
    return null
  return value
}

export function cacheWeekView(view: WeekView) {
  writeStorage(WEEK_VIEW_CACHE_KEY, view)
}

/** 仅存在本机的隐藏列表（用于没有 entry_id 的书院课 / 活动 / 预约日程） */
export function readLocalHiddenIds(): string[] {
  const value = readStorage<unknown>(LOCAL_HIDDEN_KEY)
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

export function saveLocalHiddenIds(ids: string[]) {
  writeStorage(LOCAL_HIDDEN_KEY, ids)
}

export function readShowHidden(): boolean {
  return readStorage<boolean>(SHOW_HIDDEN_KEY) === true
}

export function saveShowHidden(value: boolean) {
  writeStorage(SHOW_HIDDEN_KEY, value)
}

export function readReminderCache(): ReminderCache | null {
  const value = readStorage<ReminderCache>(REMINDER_CACHE_KEY)
  if (!value || typeof value.enabled !== 'boolean' || typeof value.checked_at !== 'number')
    return null
  if (value.template_id !== null && typeof value.template_id !== 'string')
    return null
  return value
}

export function saveReminderCache(cache: ReminderCache) {
  writeStorage(REMINDER_CACHE_KEY, cache)
}

/**
 * 课程库页“手动填写”交给表单页的课程库行：表单页只收到 catalog_id，
 * 具体字段从这里取（没有按 id 取单行的接口，也不想把整行塞进 URL）
 */
export function saveCatalogPick(entry: CatalogEntry) {
  writeStorage(CATALOG_PICK_KEY, entry)
}

/** 取出并校验暂存的课程库行；id 不符或没有时为 null */
export function readCatalogPick(id: number): CatalogEntry | null {
  const value = readStorage<CatalogEntry>(CATALOG_PICK_KEY)
  if (!value || value.id !== id || typeof value.name !== 'string')
    return null
  return { ...value, slots: Array.isArray(value.slots) ? value.slots : [] }
}

export function clearCatalogPick() {
  removeStorage(CATALOG_PICK_KEY)
}
