/**
 * Personal data kept on the phone: the home agenda and week-view caches, locally hidden events,
 * reminder state, the catalog row handed to the entry form and the remembered portal password.
 * Every value lives under `<key>:<account>`, so another account on the same phone never reads it,
 * and `clearPersonalStorage()` (run on logout and unbind) removes the copies of every account.
 * Device preferences such as the poster theme or the show-hidden toggle stay global and do not
 * belong here.
 */

export const PERSONAL_STORAGE_KEYS = {
  agenda: 'home_agenda_cache',
  pkuCredential: 'pku_cred',
  weekView: 'timetable_week_view',
  hiddenIds: 'timetable_hidden_ids',
  reminder: 'timetable_reminder',
  catalogPick: 'timetable_catalog_pick',
} as const

export type PersonalStorageKey = (typeof PERSONAL_STORAGE_KEYS)[keyof typeof PERSONAL_STORAGE_KEYS]

function scopedKey(key: PersonalStorageKey, account: string): string {
  return `${key}:${account}`
}

/** The value stored for `account`; null when there is none or no account is signed in */
export function readPersonalStorage<T>(key: PersonalStorageKey, account: string): T | null {
  if (!account)
    return null
  try {
    const value = uni.getStorageSync(scopedKey(key, account))
    return value === '' || value === undefined || value === null ? null : value as T
  }
  catch {
    return null
  }
}

/** Store `value` for `account`; without a signed-in account nothing is written */
export function writePersonalStorage(key: PersonalStorageKey, account: string, value: unknown) {
  if (!account)
    return
  try {
    uni.setStorageSync(scopedKey(key, account), value)
  }
  catch (error) {
    console.error(`Failed to write ${key}:`, error)
  }
}

export function removePersonalStorage(key: PersonalStorageKey, account: string) {
  if (!account)
    return
  try {
    uni.removeStorageSync(scopedKey(key, account))
  }
  catch {
    // Nothing to remove
  }
}

/** Remove the personal data of every account, including unscoped copies written by earlier builds */
export function clearPersonalStorage() {
  let names: string[] = []
  try {
    names = uni.getStorageInfoSync().keys
  }
  catch {
    return
  }
  const keys: string[] = Object.values(PERSONAL_STORAGE_KEYS)
  for (const name of names) {
    if (!keys.some(key => name === key || name.startsWith(`${key}:`)))
      continue
    try {
      uni.removeStorageSync(name)
    }
    catch {
      // Keep clearing the rest
    }
  }
}
