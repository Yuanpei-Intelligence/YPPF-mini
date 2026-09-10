import { ref } from 'vue'
import { getSettings, getSubscribeTemplates, grantSubscribe } from '@/api/timetable'
import { readReminderCache, saveReminderCache } from '@/utils/timetable'

/** 本机缓存多久之内不再向服务端核对模板 id 与提醒开关 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * 微信订阅弹窗的结果：
 * - accept：用户允许，且已向服务端登记一次配额
 * - reject：用户拒绝（或之前勾选了“总是拒绝”）
 * - unavailable：服务端未配置模板、模板被封禁 / 过滤，或不在微信环境
 * - disabled：用户在微信里关闭了本小程序的订阅消息（errCode 20004），需去设置里打开
 * - tap_required：本次不能调起弹窗（模板 id 尚未取到，微信要求在点击手势内同步调起），请用户再点一次授权按钮
 * - failed：微信接口调用失败（如不在点击事件内调起）或登记配额失败
 */
export type SubscribeOutcome = 'accept' | 'reject' | 'unavailable' | 'disabled' | 'tap_required' | 'failed'

/** 微信实际返回 `{ errMsg, [templateId]: 'accept' | 'reject' | 'ban' | 'filter' }`，uni 的类型只声明了 errMsg */
interface SubscribeMessageResult {
  errMsg: string
  [templateId: string]: string
}

/** 调起微信订阅弹窗。微信要求在用户点击事件里调用；用户勾选过“总是保持以上选择”时不会再弹窗 */
function requestSubscribeMessage(templateId: string): Promise<SubscribeOutcome> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (res) => {
        const status = (res as SubscribeMessageResult)[templateId]
        if (status === 'accept')
          resolve('accept')
        else if (status === 'reject')
          resolve('reject')
        else
          resolve('unavailable')
      },
      // 20004：用户在微信「设置 - 订阅消息」里关掉了本小程序的订阅，重试无用，要引导去设置
      fail: err => resolve((err as { errCode?: number } | undefined)?.errCode === 20004 ? 'disabled' : 'failed'),
    })
    // #endif
    // #ifndef MP-WEIXIN
    resolve('unavailable')
    // #endif
  })
}

/**
 * 上课提醒的微信订阅消息流程。
 * 微信每次“允许”只能发送一条订阅消息，所以设置页开启提醒时、课表页每次打开时都要再请求一次；
 * 用户允许后向服务端登记配额，服务端配额用完就退回站内通知 + 企业微信推送。
 * 模板 id 与提醒开关缓存在本机，一天内不重复向服务端核对。
 */
export function useClassReminder() {
  const templateId = ref<string | null>(readReminderCache()?.template_id ?? null)
  let subscribing = false

  /** 取模板 id：缓存一天内有效，否则向服务端查询并更新缓存；查询失败时退回缓存值 */
  async function ensureTemplateId(options: { force?: boolean } = {}): Promise<string | null> {
    const cached = readReminderCache()
    if (!options.force && cached && Date.now() - cached.checked_at < CACHE_TTL_MS) {
      templateId.value = cached.template_id
      return templateId.value
    }
    try {
      const data = await getSubscribeTemplates({ hideErrorToast: true })
      templateId.value = data.class_reminder.template_id
      saveReminderCache({ enabled: cached?.enabled ?? false, template_id: templateId.value, checked_at: Date.now() })
    }
    catch (error) {
      console.error('获取订阅模板失败:', error)
      templateId.value = cached?.template_id ?? null
    }
    return templateId.value
  }

  /** 设置页保存提醒开关后同步到本机缓存 */
  function rememberEnabled(enabled: boolean) {
    const cached = readReminderCache()
    saveReminderCache({
      enabled,
      template_id: cached?.template_id ?? templateId.value,
      checked_at: cached?.checked_at ?? 0,
    })
  }

  /** 请求订阅授权；用户允许后向服务端登记一次配额。必须在用户点击事件里调用才能弹窗 */
  async function subscribe(id: string | null = templateId.value): Promise<SubscribeOutcome> {
    if (!id)
      return 'unavailable'
    if (subscribing)
      return 'failed'
    subscribing = true
    try {
      const outcome = await requestSubscribeMessage(id)
      if (outcome !== 'accept')
        return outcome
      try {
        await grantSubscribe({ template_key: 'class_reminder' }, { hideErrorToast: true })
        return 'accept'
      }
      catch (error) {
        console.error('登记订阅配额失败:', error)
        return 'failed'
      }
    }
    finally {
      subscribing = false
    }
  }

  /**
   * 课表页打开时的静默尝试：缓存过期则先向服务端核对开关与模板，开关打开且有模板时再请求订阅。
   * 任何失败都不打扰用户，也不影响页面渲染。
   */
  async function resubscribeSilently(): Promise<void> {
    try {
      let cached = readReminderCache()
      if (!cached || Date.now() - cached.checked_at >= CACHE_TTL_MS) {
        const [settings, templates] = await Promise.all([
          getSettings({ hideErrorToast: true }),
          getSubscribeTemplates({ hideErrorToast: true }),
        ])
        cached = {
          enabled: settings.reminder_enabled,
          template_id: templates.class_reminder.template_id,
          checked_at: Date.now(),
        }
        saveReminderCache(cached)
      }
      templateId.value = cached.template_id
      if (cached.enabled && cached.template_id)
        await subscribe(cached.template_id)
    }
    catch {
      // 静默尝试：忽略一切失败
    }
  }

  return { templateId, ensureTemplateId, rememberEnabled, subscribe, resubscribeSilently }
}
