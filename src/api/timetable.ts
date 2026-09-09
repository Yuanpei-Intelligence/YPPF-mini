import type {
  CatalogEntry,
  CatalogQuery,
  EntriesQuery,
  Entry,
  EntryIn,
  EntryPatch,
  IcsOut,
  ImportOut,
  ImportPortalIn,
  ImportTextIn,
  Settings,
  SettingsPatch,
  SubscribeGrantIn,
  SubscribeGrantOut,
  SubscribeTemplatesOut,
  TermsOut,
  TextDryRunOut,
  WeekQuery,
  WeekView,
} from './types/timetable'
import { http } from '@/http/http'

const manualErrorPresentation = { errorPresentation: 'manual' } as const

const BASE = '/api/v2/timetable'

/**
 * 学期列表与当前学期
 */
export function getTerms() {
  return http.get<TermsOut>(`${BASE}/terms/`, undefined, undefined, manualErrorPresentation)
}

/**
 * 某学期某周的课表视图；不传参数时为当前学期、当前周
 */
export function getWeek(query?: WeekQuery) {
  return http.get<WeekView>(`${BASE}/week/`, query, undefined, manualErrorPresentation)
}

/**
 * 某学期的存储条目（门户导入 / 粘贴导入 / 手动添加）
 */
export function listEntries(query?: EntriesQuery) {
  return http.get<Entry[]>(`${BASE}/entries/`, query, undefined, manualErrorPresentation)
}

/**
 * 新建手动条目，成功返回 201
 */
export function createEntry(payload: EntryIn) {
  return http.post<Entry>(`${BASE}/entries/`, payload, undefined, undefined, manualErrorPresentation)
}

/**
 * 部分更新条目；`hidden` 对任何来源可改，其它字段仅限手动条目
 */
export function updateEntry(id: number, payload: EntryPatch) {
  return http<Entry>({
    url: `${BASE}/entries/${id}/`,
    method: 'PATCH',
    data: payload,
    ...manualErrorPresentation,
  })
}

/**
 * 删除手动条目，成功返回 204
 */
export function deleteEntry(id: number) {
  return http.delete<void>(`${BASE}/entries/${id}/`, undefined, undefined, manualErrorPresentation)
}

/**
 * 从北大门户抓取并导入课表。
 * 会话失效或未绑定时返回 409 `{code: 'PKU_LOGIN_REQUIRED'}`；未授权时返回 403 `{code: 'CONSENT_REQUIRED'}`
 */
export function importPortal(payload: ImportPortalIn = {}) {
  return http.post<ImportOut>(`${BASE}/import/portal/`, payload, undefined, undefined, manualErrorPresentation)
}

/**
 * 粘贴文本导入；dry_run 时只解析不落库
 */
export function importText(payload: ImportTextIn & { dry_run: true }): Promise<TextDryRunOut>
export function importText(payload: ImportTextIn & { dry_run?: false }): Promise<ImportOut>
export function importText(payload: ImportTextIn) {
  return http.post<ImportOut | TextDryRunOut>(`${BASE}/import/text/`, payload, undefined, undefined, manualErrorPresentation)
}

/**
 * 课表设置
 */
export function getSettings() {
  return http.get<Settings>(`${BASE}/settings/`, undefined, undefined, manualErrorPresentation)
}

/**
 * 部分更新课表设置（不含 ics_token）
 */
export function updateSettings(payload: SettingsPatch) {
  return http<Settings>({
    url: `${BASE}/settings/`,
    method: 'PATCH',
    data: payload,
    ...manualErrorPresentation,
  })
}

/**
 * 日历订阅（ICS）链接
 */
export function getIcsUrl() {
  return http.get<IcsOut>(`${BASE}/ics/`, undefined, undefined, manualErrorPresentation)
}

/**
 * 重新生成订阅 token，旧链接随即失效
 */
export function rotateIcsUrl() {
  return http.post<IcsOut>(`${BASE}/ics/rotate/`, undefined, undefined, undefined, manualErrorPresentation)
}

/**
 * 微信订阅消息模板；template_id 为 null 时不要调用 requestSubscribeMessage
 */
export function getSubscribeTemplates() {
  return http.get<SubscribeTemplatesOut>(`${BASE}/subscribe-templates/`, undefined, undefined, manualErrorPresentation)
}

/**
 * 用户在订阅弹窗里点了“允许”后登记配额（微信每次允许只能发送一条）
 */
export function grantSubscribe(payload: SubscribeGrantIn) {
  return http.post<SubscribeGrantOut>(`${BASE}/subscribe-grant/`, payload, undefined, undefined, manualErrorPresentation)
}

/**
 * 课程库搜索，最多返回 20 条
 */
export function searchCatalog(query: CatalogQuery) {
  return http.get<CatalogEntry[]>(`${BASE}/catalog/`, query, undefined, manualErrorPresentation)
}
