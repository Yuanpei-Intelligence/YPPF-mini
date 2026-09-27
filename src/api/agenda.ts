import type { AgendaOut, AgendaQuery } from './types/agenda'
import { http } from '@/http/http'

const manualErrorPresentation = { errorPresentation: 'manual' } as const

const BASE = '/api/v2/timetable'

/**
 * 从 from 起连续 days 天的日程（跨学期，每天带校历标签）；缺省为今天起 7 天，最多 14 天
 */
export function getAgenda(query?: AgendaQuery) {
  return http.get<AgendaOut>(`${BASE}/agenda/`, query, undefined, manualErrorPresentation)
}
