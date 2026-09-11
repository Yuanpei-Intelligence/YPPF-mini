/**
 * 首页日程契约，对应后端 `GET /api/v2/timetable/agenda/`（timetable/README.md §6.5）。
 * 日期为 ISO 8601（YYYY-MM-DD）；Occurrence 的日期时间格式见 ./timetable。
 */
import type { CalendarEvent, Occurrence, WeekSource } from './timetable'

/** `GET agenda/` 的查询参数：from 缺省为今天，days 缺省 7（最多 14，超出被截断） */
export interface AgendaQuery {
  from?: string
  days?: number
}

/**
 * 连续日程中的一天。不在任何学期内的日期 term / week 为 null，且没有存储条目（门户 / 粘贴 / 手动）的日程，
 * 书院课 / 活动 / 预约等实时来源仍会出现。kind / label 为当天命中的校历事件（同 WeekDay）。
 */
export interface AgendaDay {
  date: string
  /** 1=周一 … 7=周日 */
  weekday: number
  term: string | null
  week: number | null
  kind: CalendarEvent['kind'] | null
  label: string | null
  /** 已按开始时间排序；服务端已隐藏的条目不返回 */
  occurrences: Occurrence[]
}

export interface AgendaOut {
  /** 起始日期；未传 from 时即服务端的“今天” */
  from: string
  days: AgendaDay[]
  /** 图例 `{key, label}[]`：仅包含已启用的来源，与 WeekView.sources 同形 */
  sources: WeekSource[]
}
