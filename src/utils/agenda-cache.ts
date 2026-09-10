import type { AgendaOut } from '@/api/types/agenda'

/**
 * Home agenda cache for stale-while-revalidate: the last successful `GET timetable/agenda/` payload.
 * One slot, tagged with the account it belongs to, so another account on the same device never
 * renders it; the token store clears it on logout / unbind.
 */

const AGENDA_CACHE_KEY = 'home_agenda_cache'

export interface AgendaCache {
  /** Username of the account the payload belongs to */
  account: string
  /** Local `YYYY-MM-DD` of the fetch; a cache from an earlier day is stale */
  date: string
  /** Fetch time in ms */
  fetched_at: number
  data: AgendaOut
}

/**
 * The cached agenda of `account`, or null when there is none, it is malformed, it belongs to another
 * account, or every cached day is before `today` (nothing left worth showing).
 */
export function readAgendaCache(account: string, today: string): AgendaCache | null {
  if (!account)
    return null
  try {
    const value = uni.getStorageSync(AGENDA_CACHE_KEY) as AgendaCache | '' | null | undefined
    if (!value || value.account !== account || typeof value.date !== 'string' || typeof value.fetched_at !== 'number')
      return null
    const days = value.data?.days
    if (!Array.isArray(days) || !days.some(day => typeof day?.date === 'string' && day.date >= today))
      return null
    return value
  }
  catch {
    return null
  }
}

export function saveAgendaCache(account: string, date: string, data: AgendaOut) {
  if (!account)
    return
  const cache: AgendaCache = { account, date, fetched_at: Date.now(), data }
  try {
    uni.setStorageSync(AGENDA_CACHE_KEY, cache)
  }
  catch (error) {
    console.error('Failed to cache the home agenda:', error)
  }
}

export function clearAgendaCache() {
  try {
    uni.removeStorageSync(AGENDA_CACHE_KEY)
  }
  catch {
    // Nothing to clean up
  }
}
