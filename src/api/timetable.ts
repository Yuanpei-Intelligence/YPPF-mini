import type {
  CatalogAddIn,
  CatalogEntry,
  CatalogQuery,
  EditScope,
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
 * 单条条目的详情（含课程库信息、调整记录、考试安排）；别人的条目返回 404
 */
export function getEntry(id: number) {
  return http.get<Entry>(`${BASE}/entries/${id}/`, undefined, undefined, manualErrorPresentation)
}

/**
 * 新建手动条目，成功返回 201
 */
export function createEntry(payload: EntryIn) {
  return http.post<Entry>(`${BASE}/entries/`, payload, undefined, undefined, manualErrorPresentation)
}

/** 编辑范围：缺省 all；single / following 必须给 week */
export interface UpdateEntryOptions {
  scope?: EditScope
  week?: number
}

/**
 * 部分更新条目。scope / week 随请求体提交：
 * all（缺省）改条目本身（门户 / 粘贴条目的名称 / 时间 / 地点等改动存为整段调整），
 * single / following 存为第 week 周 / 第 week 周起的调整，可带 canceled（本次停课）
 */
export function updateEntry(id: number, payload: EntryPatch, options: UpdateEntryOptions = {}) {
  const data: EntryPatch = { ...payload }
  if (options.scope)
    data.scope = options.scope
  if (options.week !== undefined)
    data.week = options.week
  return http<Entry>({
    url: `${BASE}/entries/${id}/`,
    method: 'PATCH',
    data,
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
 * 撤销一条单次 / 分段调整（恢复该次 / 该段），成功返回 204
 */
export function deleteOverride(id: number, overrideId: number) {
  return http.delete<void>(`${BASE}/entries/${id}/overrides/${overrideId}/`, undefined, undefined, manualErrorPresentation)
}

/**
 * 撤销条目的全部调整（恢复默认），成功返回 204
 */
export function deleteOverrides(id: number) {
  return http.delete<void>(`${BASE}/entries/${id}/overrides/`, undefined, undefined, manualErrorPresentation)
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
 * 部分更新课表设置（不含 ics_token；sources / tags 只读）
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

/**
 * 按课程库行的时间块快速添加（缺省全部时段、旁听），成功返回 201 与新建的条目；
 * 已在课表中返回 409 `timetable.catalog_already_added`，没有可解析时间块返回 400 `timetable.catalog_no_slots`
 */
export function addFromCatalog(id: number, payload: CatalogAddIn = {}) {
  return http.post<Entry[]>(`${BASE}/catalog/${id}/add/`, payload, undefined, undefined, manualErrorPresentation)
}
