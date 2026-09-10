import type { Ref } from 'vue'
import type { EditScope, Entry, Occurrence } from '@/api/types/timetable'
import type { RequestError } from '@/http/errors'
import type { DetailActionKey } from '@/utils/timetable'
import { computed, ref } from 'vue'
import { deleteEntry, deleteOverrides, getEntry, updateEntry } from '@/api/timetable'
import { tokens } from '@/style/tokens'
import { confirmModal } from '@/utils/dialog'
import {
  isEditableOccurrence,
  isStoredSource,
  readLocalHiddenIds,
  readShowHidden,
  saveLocalHiddenIds,
} from '@/utils/timetable'

/** 详情弹层组件暴露的方法（OccurrenceDetailSheet） */
export interface DetailSheetInstance {
  open: () => void
  close: () => void
}

export interface UseOccurrenceDetailOptions {
  /** 当前显示的学期码，编辑页据此定位条目 */
  termCode: () => string | undefined
  /** 隐藏 / 停课 / 恢复 / 删除成功后刷新数据 */
  onChanged: () => void | Promise<void>
  /** 页面的统一异常展示 */
  handleApiException: (error: unknown, options?: { showToast?: boolean }) => RequestError
  showMessage: (message: string, type?: 'default' | 'error' | 'success' | 'warning') => void
}

/**
 * 课表页与日视图共用的日程详情逻辑：打开弹层、懒加载条目详情、执行详情里的操作。
 * 本机隐藏偏好（仅本机隐藏的实时日程 id、“显示已隐藏”开关）也放在这里，页面在 onShow 时调 reloadLocalPrefs。
 */
export function useOccurrenceDetail(sheet: Ref<DetailSheetInstance | null>, options: UseOccurrenceDetailOptions) {
  const detail = ref<Occurrence | null>(null)
  const entry = ref<Entry | null>(null)
  const entryLoading = ref(false)
  const entryError = ref('')
  const busy = ref(false)
  const showHidden = ref(readShowHidden())
  const localHiddenIds = ref<string[]>(readLocalHiddenIds())
  const localHiddenSet = computed(() => new Set(localHiddenIds.value))
  let entrySeq = 0

  function isHidden(occurrence: Occurrence) {
    return occurrence.hidden || localHiddenSet.value.has(occurrence.id)
  }

  const detailHidden = computed(() => !!detail.value && isHidden(detail.value))

  /** 导入页可能改了本机隐藏偏好；页面 onShow 时重读 */
  function reloadLocalPrefs() {
    showHidden.value = readShowHidden()
    localHiddenIds.value = readLocalHiddenIds()
  }

  /** 有存储条目的日程（含由课程匹配出的考试）才有详情可取 */
  async function loadEntry(occurrence: Occurrence) {
    const entryId = occurrence.ref.entry_id
    if (typeof entryId !== 'number')
      return
    const seq = ++entrySeq
    entryLoading.value = true
    entryError.value = ''
    try {
      const data = await getEntry(entryId)
      if (seq === entrySeq)
        entry.value = data
    }
    catch (error) {
      if (seq !== entrySeq)
        return
      // 基本信息已经显示，详情失败只在弹层里说明
      entryError.value = options.handleApiException(error, { showToast: false }).message
    }
    finally {
      if (seq === entrySeq)
        entryLoading.value = false
    }
  }

  function openDetail(occurrence: Occurrence) {
    detail.value = occurrence
    entry.value = null
    entryError.value = ''
    entrySeq++
    entryLoading.value = false
    sheet.value?.open()
    void loadEntry(occurrence)
  }

  function closeDetail() {
    sheet.value?.close()
  }

  function goEntryForm(entryId: number, scope: EditScope, week: number) {
    const params = [`id=${entryId}`, `scope=${scope}`]
    const term = options.termCode()
    if (term)
      params.push(`term=${encodeURIComponent(term)}`)
    if (scope !== 'all')
      params.push(`week=${week}`)
    uni.navigateTo({ url: `/pages-timetable/entry-form?${params.join('&')}` })
  }

  async function setHidden(item: Occurrence, hidden: boolean) {
    if (hidden) {
      const ok = await confirmModal({
        title: '隐藏日程',
        content: '隐藏后它不再显示在课表中；可在「导入与设置」里打开“显示已隐藏的日程”恢复。',
        confirmText: '隐藏',
      })
      if (!ok)
        return false
    }
    const entryId = item.ref.entry_id
    if (typeof entryId === 'number' && isStoredSource(item.source)) {
      // 有存储条目的日程由服务端记录隐藏状态；课程匹配出的考试与实时来源只在本机隐藏
      await updateEntry(entryId, { hidden })
    }
    else {
      const next = hidden
        ? Array.from(new Set([...localHiddenIds.value, item.id]))
        : localHiddenIds.value.filter(id => id !== item.id)
      localHiddenIds.value = next
      saveLocalHiddenIds(next)
    }
    return true
  }

  async function cancelOnce(item: Occurrence, entryId: number) {
    const ok = await confirmModal({
      title: '本次停课',
      content: `第 ${item.week} 周的「${item.title}」将从课表中去掉，其它周次不受影响；可用「恢复默认」撤销。`,
      confirmText: '停课',
    })
    if (!ok)
      return false
    await updateEntry(entryId, { canceled: true }, { scope: 'single', week: item.week })
    options.showMessage('本次已停课', 'success')
    return true
  }

  async function resetOverrides(item: Occurrence, entryId: number) {
    const count = entry.value?.overrides?.length ?? 0
    const ok = await confirmModal({
      title: '恢复默认',
      content: `将撤销「${item.title}」的全部 ${count} 项调整（停课、改时间 / 地点等），恢复为原课表。`,
      confirmText: '恢复',
    })
    if (!ok)
      return false
    await deleteOverrides(entryId)
    options.showMessage('已恢复默认', 'success')
    return true
  }

  async function removeEntry(item: Occurrence, entryId: number) {
    const ok = await confirmModal({
      title: '确认删除',
      content: `删除后「${item.title}」将从课表中移除，无法恢复。`,
      confirmText: '删除',
      confirmColor: tokens.error,
    })
    if (!ok)
      return false
    await deleteEntry(entryId)
    options.showMessage('已删除', 'success')
    return true
  }

  /** 执行一个会改数据的操作：成功后关闭弹层并刷新；取消不算失败 */
  async function runMutation(run: () => Promise<boolean>) {
    if (busy.value)
      return
    busy.value = true
    let changed = false
    try {
      changed = await run()
    }
    catch (error) {
      options.handleApiException(error)
      return
    }
    finally {
      busy.value = false
    }
    if (!changed)
      return
    closeDetail()
    await options.onChanged()
  }

  async function handleDetailAction(action: Exclude<DetailActionKey, 'edit'>) {
    const item = detail.value
    if (!item)
      return
    const entryId = item.ref.entry_id
    switch (action) {
      case 'activity': {
        const activityId = item.ref.activity_id
        if (typeof activityId === 'number' && activityId > 0) {
          closeDetail()
          uni.navigateTo({ url: `/pages/activity/detail?id=${activityId}` })
        }
        else {
          options.showMessage('本周活动尚未发布', 'warning')
        }
        return
      }
      case 'appoint':
        closeDetail()
        uni.navigateTo({ url: '/pages/me/my-appointments' })
        return
      case 'hide':
        await runMutation(() => setHidden(item, true))
        return
      case 'unhide':
        await runMutation(() => setHidden(item, false))
        return
      case 'cancel_once':
        if (typeof entryId === 'number')
          await runMutation(() => cancelOnce(item, entryId))
        return
      case 'reset':
        if (typeof entryId === 'number')
          await runMutation(() => resetOverrides(item, entryId))
        return
      case 'delete':
        if (typeof entryId === 'number')
          await runMutation(() => removeEntry(item, entryId))
    }
  }

  function handleDetailEdit(scope: EditScope) {
    const item = detail.value
    if (!item)
      return
    const entryId = item.ref.entry_id
    if (typeof entryId !== 'number' || !isEditableOccurrence(item)) {
      options.showMessage('该日程无法编辑', 'warning')
      return
    }
    closeDetail()
    goEntryForm(entryId, scope, item.week)
  }

  return {
    detail,
    entry,
    entryLoading,
    entryError,
    busy,
    showHidden,
    localHiddenIds,
    detailHidden,
    isHidden,
    reloadLocalPrefs,
    openDetail,
    closeDetail,
    handleDetailAction,
    handleDetailEdit,
  }
}
