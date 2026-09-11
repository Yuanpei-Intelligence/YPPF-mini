import dayjs from 'dayjs'

/**
 * Shared date/time/number formatting for user-facing text.
 *
 * Conventions (see docs/design/README.md §6):
 * - Same-week dates read as "今天 14:00" / "明天 14:00" / "周五 14:00".
 * - Dates within the current year read as "9月12日 周五"; otherwise "2025年9月12日".
 * - Ranges use an en dash without spaces: "14:00–15:30".
 * - Machine-readable contexts (forms, exports) use ISO "YYYY-MM-DD HH:mm".
 */

export type DateInput = string | number | Date | dayjs.Dayjs | null | undefined

export const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

function toDayjs(value: DateInput): dayjs.Dayjs | null {
  if (value === null || value === undefined || value === '')
    return null
  const d = dayjs(value)
  return d.isValid() ? d : null
}

/** ISO-like formatting; empty string for invalid input. */
export function formatDate(value: DateInput, pattern = 'YYYY-MM-DD'): string {
  const d = toDayjs(value)
  return d ? d.format(pattern) : ''
}

export function formatTime(value: DateInput): string {
  return formatDate(value, 'HH:mm')
}

export function formatDateTime(value: DateInput): string {
  return formatDate(value, 'YYYY-MM-DD HH:mm')
}

/** "周三" for a date, or for a 0–6 weekday index (0 = Sunday) / 1–7 index (7 = Sunday). */
export function weekdayLabel(value: DateInput | number): string {
  if (typeof value === 'number')
    return WEEKDAY_SHORT[value % 7] ?? ''
  const d = toDayjs(value)
  return d ? WEEKDAY_SHORT[d.day()] : ''
}

/** "9月12日 周五" within the current year, "2025年9月12日" otherwise. */
export function formatChineseDate(value: DateInput, withWeekday = true): string {
  const d = toDayjs(value)
  if (!d)
    return ''
  const sameYear = d.year() === dayjs().year()
  const base = sameYear ? `${d.month() + 1}月${d.date()}日` : `${d.year()}年${d.month() + 1}月${d.date()}日`
  return withWeekday && sameYear ? `${base} ${WEEKDAY_SHORT[d.day()]}` : base
}

/**
 * Human date with relative words for the near future/past:
 * "今天 14:00", "明天 09:30", "昨天 18:00", "9月12日 周五 14:00", "2025年1月3日 10:00".
 */
export function formatSmartDateTime(value: DateInput, withTime = true): string {
  const d = toDayjs(value)
  if (!d)
    return ''
  const today = dayjs().startOf('day')
  const diffDays = d.startOf('day').diff(today, 'day')
  let dayPart: string
  if (diffDays === 0)
    dayPart = '今天'
  else if (diffDays === 1)
    dayPart = '明天'
  else if (diffDays === 2)
    dayPart = '后天'
  else if (diffDays === -1)
    dayPart = '昨天'
  else
    dayPart = formatChineseDate(d)
  return withTime ? `${dayPart} ${d.format('HH:mm')}` : dayPart
}

/** "14:00–15:30"; falls back to the single time when either side is missing. */
export function formatTimeRange(start: DateInput, end: DateInput): string {
  const s = formatTime(start)
  const e = formatTime(end)
  if (s && e)
    return `${s}–${e}`
  return s || e
}

/**
 * "今天 14:00–15:30" or "9月12日 周五 14:00–15:30"; when the range crosses midnight
 * the end side carries its own date.
 */
export function formatDateTimeRange(start: DateInput, end: DateInput): string {
  const s = toDayjs(start)
  const e = toDayjs(end)
  if (!s || !e)
    return formatSmartDateTime(s ?? e)
  if (s.isSame(e, 'day'))
    return `${formatSmartDateTime(s, false)} ${formatTimeRange(s, e)}`
  return `${formatSmartDateTime(s)} – ${formatSmartDateTime(e)}`
}

/** "刚刚", "5 分钟前", "3 小时前", "昨天 14:00", "9月12日 周五", "2025年1月3日". */
export function formatRelativeTime(value: DateInput): string {
  const d = toDayjs(value)
  if (!d)
    return ''
  const now = dayjs()
  const minutes = now.diff(d, 'minute')
  if (minutes < 1)
    return '刚刚'
  if (minutes < 60)
    return `${minutes} 分钟前`
  const hours = now.diff(d, 'hour')
  if (hours < 24 && d.isSame(now, 'day'))
    return `${hours} 小时前`
  if (d.isSame(now.subtract(1, 'day'), 'day'))
    return `昨天 ${d.format('HH:mm')}`
  return formatChineseDate(d)
}

/** Duration in minutes → "30 分钟", "1 小时", "1.5 小时", "2 小时 10 分钟". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes) || minutes <= 0)
    return ''
  const total = Math.round(minutes)
  if (total < 60)
    return `${total} 分钟`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (rest === 0)
    return `${hours} 小时`
  if (rest === 30)
    return `${hours}.5 小时`
  return `${hours} 小时 ${rest} 分钟`
}

/** Thousands separator for counts and points: 12345 → "12,345". */
export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '')
    return ''
  const n = Number(value)
  if (Number.isNaN(n))
    return String(value)
  return n.toLocaleString('en-US')
}
