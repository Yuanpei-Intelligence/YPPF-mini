/**
 * 课表契约，对应后端 `/api/v2/timetable/`。
 * 日期为 ISO 8601（YYYY-MM-DD），时间为 HH:MM，
 * 日期时间为不带时区的本地时间（YYYY-MM-DDTHH:MM:SS，Asia/Shanghai）。
 *
 * 标注「尚未升级的后端不返回」的字段来自 2026-09 迭代（timetable/README.md §8），
 * 一律可选，页面按缺省值处理。
 */

/** 日程来源：portal/paste/manual 为本系统存储的条目，其余为其它模块的实时适配器 */
export type OccurrenceSource = 'portal' | 'paste' | 'manual' | 'college' | 'activity' | 'appoint' | 'exam' | string

/** 日程类别：course=学校课程，college=书院课，activity=活动，appoint=地下室预约，custom=自定义，exam=考试 */
export type OccurrenceKind = 'course' | 'college' | 'activity' | 'appoint' | 'custom' | 'exam'

/** 存储条目的来源 */
export type EntrySource = 'portal' | 'paste' | 'manual'

/** 单双周：0=每周，1=单周，2=双周 */
export type Parity = 0 | 1 | 2

/** 条目身份：enrolled=已选，audit=旁听 */
export type EntryRole = 'enrolled' | 'audit'

/** 条目类别：course=课程，exam=考试（单周），other=其它（自定义日程） */
export type EntryCategory = 'course' | 'exam' | 'other'

/** 编辑范围：all=全部，single=仅本次（某一周），following=本次及以后 */
export type EditScope = 'all' | 'single' | 'following'

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
  /** 学期总周数，含考试周 */
  total_weeks: number
  /** 今天所在教学周；不在学期内为 null */
  current_week: number | null
  /** 节次 -> [开始, 结束]，如 {"1": ["08:00", "08:50"]} */
  section_times: Record<string, [string, string]>
  /** 本学期校历；尚未升级的后端不返回 */
  calendar?: CalendarEvent[]
  /** 考试周起始周次（≥ 此周为考试周）；未设置为 null。尚未升级的后端不返回 */
  exam_week_start?: number | null
  /** 教学周数（exam_week_start − 1；未设置考试周时等于 total_weeks）。尚未升级的后端不返回 */
  teaching_weeks?: number
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

/* -------------------- 学期总览（海报） -------------------- */

/** `GET overview/`：term 缺省为当前学期 */
export interface OverviewQuery {
  term?: string
}

/** 总览里的时段类别：活动与地下室预约不列出，考试单独列在 exams */
export type OverviewSlotKind = Extract<OccurrenceKind, 'course' | 'college' | 'custom'>

/**
 * 整个学期（第 1..total_weeks 周）里的一个每周时段：同一条目在同一星期、时间、地点上的课合并为一个，
 * 按周调整过时间 / 星期 / 地点的那几次单独成一个时段。放假等校历停课不在 weeks 里留空。
 * 与周视图一样遵循来源开关、隐藏标签和隐藏条目。
 */
export interface OverviewSlot {
  /** 稳定键，同一响应内唯一 */
  key: string
  kind: OverviewSlotKind
  source: OccurrenceSource
  title: string
  /** 教师等补充信息，可能为空串 */
  subtitle: string
  location: string
  /** 1=周一 … 7=周日 */
  weekday: number
  /** HH:MM */
  start: string
  end: string
  start_section: number | null
  end_section: number | null
  /** 上课周次，升序 */
  weeks: number[]
  /** 周次文字：第3周 / 1-16周 / 1-15周 单周 / 2-16周 双周 / 1-8,10-16周 */
  weeks_text: string
  /** 周次恰好是单周 / 双周规律时为 1 / 2，否则为 0 */
  parity: Parity
  /** 稳定配色键（课程名或 id），与周视图一致 */
  color_key: string
  /** 已选 / 旁听；书院课为空串 */
  role: EntryRole | ''
  tag: string
  /** {'entry_id'}（存储条目）| {'course_id'}（书院课） */
  ref: Record<string, number | null>
}

/** 学期里的一场考试（已去重） */
export interface OverviewExam {
  title: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  start: string
  end: string
  location: string
  /** 所在教学周；不在 1..total_weeks 内为 null */
  week: number | null
}

export interface OverviewOut {
  term: Term
  slots: OverviewSlot[]
  exams: OverviewExam[]
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
  /** '' | 'canceled' | 'checked_in' | 'applied' | 'suspended'（校历停课日上不了的课，照常返回，由前端淡化显示） */
  status: string
  /** {'entry_id'} | {'course_id','activity_id'} | {'activity_id'} | {'appoint_id'} | {'exam_id','entry_id'} */
  ref: Record<string, number | null>
  hidden: boolean
  /** 已选 / 旁听；实时来源为空串。尚未升级的后端不返回 */
  role?: EntryRole | ''
  /** 条目标签。尚未升级的后端不返回 */
  tag?: string
  /** 本次日程被单次 / 分段调整过。尚未升级的后端不返回 */
  modified?: boolean
  /** 调休日按另一天课表上的课：原本的星期（1=周一 … 7=周日）；其余日程为 null 或不返回 */
  swap_from?: number | null
}

/** 条目关联的课程库行（§8.1） */
export interface EntryCatalog {
  id: number
  course_code: string
  name: string
  class_no: string
  teacher: string
  credits: number | null
  department: string
  category: string
  time_text: string
  weeks_text: string
  note: string
}

/** 单次 / 分段调整可覆盖的字段（§8.2）；只含被覆盖的键 */
export interface OverrideFields {
  name?: string
  teacher?: string
  room?: string
  weekday?: number
  start_section?: number
  end_section?: number
  start_time?: string
  end_time?: string
  note?: string
  tag?: string
  color?: string
}

/**
 * 某一周 / 某段周次的调整。展开时按范围从宽到窄、id 从小到大依次应用，
 * 所以更窄或更新的调整在每个键上都优先，canceled 亦然。
 */
export interface EntryOverride {
  id: number
  /** null = 从条目的第一周起 */
  week_start: number | null
  /** null = 到条目的最后一周 */
  week_end: number | null
  /** 范围内的日程被取消（本次停课） */
  canceled: boolean
  fields: OverrideFields
  updated_at: string
}

/** 与课程匹配到的学期考试安排（§8.4），按时间取第一条 */
export interface EntryExam {
  id: number
  start: string
  end: string
  room: string
  method: string
  note: string
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
  /** 最多 2000 字 */
  note: string
  hidden: boolean
  color: string
  /** 已选 / 旁听；缺省 enrolled。尚未升级的后端不返回 */
  role?: EntryRole
  /** 课程 / 考试 / 其它；决定日程的 kind。尚未升级的后端不返回 */
  category?: EntryCategory
  /** 标签（≤ 24 字）。尚未升级的后端不返回 */
  tag?: string
  /** 关联的课程库行；没有为 null。尚未升级的后端不返回 */
  catalog?: EntryCatalog | null
  /** 单次 / 分段调整。尚未升级的后端不返回 */
  overrides?: EntryOverride[]
  /** 匹配到的考试安排；没有为 null。尚未升级的后端不返回 */
  exam?: EntryExam | null
}

/**
 * 新建手动条目的请求体；给出节次时 start/end_time 可由后端推算。
 * catalog_id 关联同学期的课程库行（null 取消关联）。
 */
export type EntryIn = Omit<Entry, 'id' | 'source' | 'term' | 'catalog' | 'overrides' | 'exam'> & {
  term?: string
  catalog_id?: number | null
}

/**
 * `PATCH entries/{id}/`。scope 缺省为 all：手动条目改行本身；任何来源的 hidden / color / tag / role / category / catalog_id
 * 改行本身，门户 / 粘贴条目的其它字段存为整段调整（重新导入后保留）。
 * single / following 需给 week，改动存为该周 / 该周起的调整，可带 canceled（本次停课）；
 * hidden / role / category / catalog_id 只能在 scope=all 下改。
 */
export interface EntryPatch extends Partial<EntryIn> {
  scope?: EditScope
  week?: number
  canceled?: boolean
}

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

/** 已注册的日程来源；setting 为控制它的布尔设置项名（show_courses / show_college / show_activities / show_appointments / show_exams） */
export interface SettingsSource {
  key: string
  label: string
  setting: string
}

export interface Settings {
  reminder_enabled: boolean
  reminder_minutes: number
  /** 来源开关，周视图 / 日程 / ICS 订阅 / 提醒一并生效：学校课表（门户 / 粘贴 / 手动条目） */
  show_courses: boolean
  show_college: boolean
  show_activities: boolean
  show_appointments: boolean
  share_show_name: boolean
  /** 考试来源开关。尚未升级的后端不返回 */
  show_exams?: boolean
  /** 隐藏的标签：带这些标签的条目不出现在周视图 / 日程 / ICS / 提醒里。尚未升级的后端不返回 */
  hidden_tags?: string[]
  /** 只读：已注册的来源（配置顺序）。尚未升级的后端不返回 */
  sources?: SettingsSource[]
  /** 只读：我的条目用过的标签（全部学期，去重排序）。尚未升级的后端不返回 */
  tags?: string[]
}

/** `PATCH settings/`：sources / tags 只读，不可提交 */
export type SettingsPatch = Partial<Omit<Settings, 'sources' | 'tags'>>

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

/** `GET catalog/`：q 按课程名 / 英文名 / 课程号 / 教师模糊匹配；term 缺省为当前学期 */
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
  /** 开课院系。尚未升级的后端不返回 */
  department?: string
  /** 课程类别（专业必修 / 通选课等）。尚未升级的后端不返回 */
  category?: string
  /** 修读对象。尚未升级的后端不返回 */
  audience?: string
  hours_per_week?: string
  /** 原始起止周文本 */
  weeks_text?: string
  note?: string
  /** 我在该学期已有条目关联到这一行。尚未升级的后端不返回 */
  added?: boolean
}

/**
 * `POST catalog/{id}/add/`：按课程库行的时间块各建一条手动条目并关联该行。
 * slots 为 CatalogEntry.slots 的下标，缺省全部；role 缺省 audit（旁听）。
 * 409 `timetable.catalog_already_added`：该学期已有条目关联这一行；400 `timetable.catalog_no_slots`：该行没有可解析的时间块。
 */
export interface CatalogAddIn {
  role?: EntryRole
  slots?: number[]
  term?: string
}
