import type { AgendaOut } from '@/api/types/agenda'
import { PERSONAL_STORAGE_KEYS, readPersonalStorage, writePersonalStorage } from '@/utils/personal-storage'

/**
 * Home agenda cache for stale-while-revalidate: the last successful `GET timetable/agenda/` payload
 * of an account. It lives in personal storage, so it is scoped to the account and cleared on
 * logout / unbind.
 */

export interface AgendaCache {
  /** Local `YYYY-MM-DD` of the fetch; a cache from an earlier day is stale */
  date: string
  /** Fetch time in ms */
  fetched_at: number
  data: AgendaOut
}

/**
 * The cached agenda of `account`, or null when there is none, it is malformed, or every cached day
 * is before `today` (nothing left worth showing).
 */
export function readAgendaCache(account: string, today: string): AgendaCache | null {
  const value = readPersonalStorage<AgendaCache>(PERSONAL_STORAGE_KEYS.agenda, account)
  if (!value || typeof value.date !== 'string' || typeof value.fetched_at !== 'number')
    return null
  const days = value.data?.days
  if (!Array.isArray(days) || !days.some(day => typeof day?.date === 'string' && day.date >= today))
    return null
  return value
}

export function saveAgendaCache(account: string, date: string, data: AgendaOut) {
  const cache: AgendaCache = { date, fetched_at: Date.now(), data }
  writePersonalStorage(PERSONAL_STORAGE_KEYS.agenda, account, cache)
}
