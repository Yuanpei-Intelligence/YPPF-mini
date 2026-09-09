import type { CalendarEvent, CalendarKind, LessonBlock, Occurrence, OccurrenceKind, Term, WeekDay, WeekView } from '@/api/types/timetable'

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
}

/** 需要在格子上标出的类别（学校课程与自定义条目不打标） */
export const KIND_BADGES: Partial<Record<OccurrenceKind, string>> = {
  college: '书院课',
  activity: '活动',
  appoint: '预约',
}

export const STATUS_LABELS: Record<string, string> = {
  canceled: '已取消',
  checked_in: '已签到',
  applied: '已报名',
}

export const PARITY_LABELS = ['每周', '单周', '双周'] as const

export interface PaletteColor {
  bg: string
  fg: string
}

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
  /** 本周内的停课事件名（放假 / 考试周），多个用 · 连接；没有则为空串 */
  suspended: string
}

/** 周次选择器：学期内每一周的日期范围与停课标记 */
export function weekPickerItems(term: Term): WeekPickerItem[] {
  const suspendedEvents = (term.calendar ?? []).filter(event => suspendsClasses(event.kind))
  const items: WeekPickerItem[] = []
  for (let week = 1; week <= term.total_weeks; week++) {
    const dates = weekDatesOf(term, week)
    const names = suspendedEvents
      .filter(event => eventOverlaps(event, dates[0], dates[6]))
      .map(event => event.name)
    items.push({
      week,
      range: `${shortDate(dates[0])}–${shortDate(dates[6])}`,
      suspended: Array.from(new Set(names)).join(' · '),
    })
  }
  return items
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

export type DetailActionKey = 'activity' | 'appoint' | 'edit' | 'hide' | 'unhide'

export interface DetailAction {
  key: DetailActionKey
  label: string
  primary: boolean
}

/** 详情弹层的操作：书院课 / 活动 → 查看活动，预约 → 查看预约，自定义 → 编辑；任何日程都可隐藏 / 取消隐藏 */
export function detailActionsFor(item: Occurrence, hidden: boolean): DetailAction[] {
  const actions: DetailAction[] = []
  if (item.kind === 'college' || item.kind === 'activity')
    actions.push({ key: 'activity', label: '查看活动 / 签到', primary: true })
  else if (item.kind === 'appoint')
    actions.push({ key: 'appoint', label: '查看预约', primary: true })
  else if (item.kind === 'custom')
    actions.push({ key: 'edit', label: '编辑', primary: true })
  actions.push(hidden
    ? { key: 'unhide', label: '取消隐藏', primary: false }
    : { key: 'hide', label: '隐藏', primary: false })
  return actions
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
