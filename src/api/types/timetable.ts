/**
 * 课表契约，对应后端 `/api/v2/timetable/`。
 * 日期为 ISO 8601（YYYY-MM-DD），时间为 HH:MM，
 * 日期时间为不带时区的本地时间（YYYY-MM-DDTHH:MM:SS，Asia/Shanghai）。
 */

/** 日程来源：portal/paste/manual 为本系统存储的条目，其余为其它模块的实时适配器 */
export type OccurrenceSource = 'portal' | 'paste' | 'manual' | 'college' | 'activity' | 'appoint' | string

/** 日程类别：course=学校课程，college=书院课，activity=活动，appoint=地下室预约，custom=自定义 */
export type OccurrenceKind = 'course' | 'college' | 'activity' | 'appoint' | 'custom'

/** 存储条目的来源 */
export type EntrySource = 'portal' | 'paste' | 'manual'

/** 单双周：0=每周，1=单周，2=双周 */
export type Parity = 0 | 1 | 2

/* -------------------- 校历 -------------------- */

/**
 * 校历事件。holiday=放假停课，exam=停课复习考试，swap=调休（按 follows_weekday 的课表上课），
 * info=仅标注（公休课程照常 / 运动会等）。停课日的存储条目由后端直接不产生日程，前端只负责显示标签。
 */
export interface CalendarEvent {
  kind: 'holiday' | 'exam' | 'swap' | 'info'
  /** 起止日期（含） */
  start: string
  end: string
  name: string
  /** 仅 swap：按周几的课表上课，1=周一 … 7=周日 */
  follows_weekday: number | null
}

export type CalendarKind = CalendarEvent['kind']

/** 一周中某一天命中的校历事件（holiday/exam 优先于 swap，再优先于 info）；没有事件时 kind 与 label 为 null */
export interface WeekDay {
  date: string
  /** 1=周一 … 7=周日 */
  weekday: number
  kind: CalendarEvent['kind'] | null
  label: string | null
  follows_weekday: number | null
}

export interface Term {
  /** 门户学期码，如 '26-27-1'（1 秋、2 春、3 夏） */
  code: string
  name: string
  /** 教学第 1 周的周一 */
  week1_monday: string
  total_weeks: number
  /** 今天所在教学周；不在学期内为 null */
  current_week: number | null
  /** 节次 -> [开始, 结束]，如 {"1": ["08:00", "08:50"]} */
  section_times: Record<string, [string, string]>
  /** 本学期校历；尚未升级的后端不返回 */
  calendar?: CalendarEvent[]
}

export interface TermsOut {
  current: Term | null
  terms: Term[]
}

export interface WeekQuery {
  term?: string
  week?: number
}

export interface WeekToday {
  date: string
  weekday: number
  week: number | null
}

export interface WeekSource {
  key: string
  label: string
}

export interface WeekView {
  term: Term
  week: number
  /** 周一到周日的 7 个 ISO 日期 */
  week_dates: string[]
  today: WeekToday
  occurrences: Occurrence[]
  /** 同一天内时间重叠的日程 id 分组 */
  conflicts: string[][]
  /** 图例：仅包含已启用的来源 */
  sources: WeekSource[]
  /** 与 week_dates 一一对应的校历信息；尚未升级的后端不返回 */
  days?: WeekDay[]
}

export interface Occurrence {
  /** 稳定 id：`${source}:${key}:${date}` */
  id: string
  source: OccurrenceSource
  kind: OccurrenceKind
  title: string
  subtitle: string
  location: string
  start: string
  end: string
  date: string
  week: number
  /** 1=周一 … 7=周日 */
  weekday: number
  start_section: number | null
  end_section: number | null
  /** 稳定配色键（课程名或 id） */
  color_key: string
  /** '' | 'canceled' | 'checked_in' | 'applied' */
  status: string
  /** {'entry_id'} | {'course_id','activity_id'} | {'activity_id'} | {'appoint_id'} */
  ref: Record<string, number | null>
  hidden: boolean
}

export interface Entry {
  id: number
  term: string
  source: EntrySource
  name: string
  course_code: string
  class_no: string
  teacher: string
  room: string
  weekday: number
  start_section: number
  end_section: number
  start_time: string
  end_time: string
  week_start: number
  week_end: number
  parity: Parity
  note: string
  hidden: boolean
  color: string
}

/** 新建手动条目的请求体；给出节次时 start/end_time 可由后端推算 */
export type EntryIn = Omit<Entry, 'id' | 'source' | 'term'> & { term?: string }

/** `PATCH entries/{id}/`：hidden 对任何来源可改，其它字段仅限手动条目 */
export type EntryPatch = Partial<EntryIn>

export interface EntriesQuery {
  term?: string
}

export interface ImportOut {
  term: string
  created: number
  updated: number
  removed: number
  total: number
}

export interface Settings {
  reminder_enabled: boolean
  reminder_minutes: number
  show_college: boolean
  show_activities: boolean
  show_appointments: boolean
  share_show_name: boolean
}

export type SettingsPatch = Partial<Settings>

/** `POST import/portal/`：带 username+password 时先登录绑定再抓取，否则使用已保存的门户会话 */
export interface ImportPortalIn {
  term?: string
  username?: string
  password?: string
  consent_timetable?: boolean
}

export interface ImportTextIn {
  term?: string
  text: string
  dry_run?: boolean
}

/** 解析出的一段课程时间块 */
export interface LessonBlock {
  name: string
  teacher: string
  room: string
  course_code: string
  class_no: string
  weekday: number
  start_section: number
  end_section: number
  week_start: number
  week_end: number
  parity: Parity
  raw: string
}

export type TextFormat = 'portal_html' | 'elective' | 'unknown'

/** `POST import/text/` 且 dry_run=true 的响应 */
export interface TextDryRunOut {
  format: TextFormat
  blocks: LessonBlock[]
}

export interface IcsOut {
  url: string
  token: string
}

/* -------------------- 上课提醒（微信订阅消息） -------------------- */

export type SubscribeTemplateKey = 'class_reminder'

/** `GET subscribe-templates/`：template_id 为 null 表示服务端未配置该模板，客户端不应调用 requestSubscribeMessage */
export interface SubscribeTemplatesOut {
  class_reminder: { template_id: string | null }
}

/** `POST subscribe-grant/`：用户在微信订阅弹窗里点了“允许”后登记一次配额；count 缺省为 1，服务端有上限 */
export interface SubscribeGrantIn {
  template_key: SubscribeTemplateKey
  count?: number
}

export interface SubscribeGrantOut {
  template_key: SubscribeTemplateKey
  count: number
}

/* -------------------- 课程库 -------------------- */

/** `GET catalog/`：q 按课程名 / 课程号 / 教师模糊匹配；term 缺省为当前学期 */
export interface CatalogQuery {
  term?: string
  q: string
}

/** 由“起止周 + 上课时间”尽力解析出的一个时间块，解析不到的字段可能缺失 */
export type CatalogSlot = Partial<Pick<LessonBlock, 'weekday' | 'start_section' | 'end_section' | 'week_start' | 'week_end' | 'parity' | 'room'>>

export interface CatalogEntry {
  id: number
  course_code: string
  name: string
  class_no: string
  teacher: string
  credits: number | null
  /** 原始上课时间文本，如 '1~16周 每周 周一 3~4节' */
  time_text: string
  slots: CatalogSlot[]
}
