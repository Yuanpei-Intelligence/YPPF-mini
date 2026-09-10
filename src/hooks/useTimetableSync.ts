import type { ImportOut } from '@/api/types/timetable'
import { ref } from 'vue'
import { getBinding } from '@/api/pku'
import { importPortal } from '@/api/timetable'
import { RequestError, toRequestError } from '@/http/errors'
import { clearPkuCredential, readPkuCredential } from '@/utils/timetable'

/**
 * 带密码的门户导入会在服务端把课表授权置为 true，所以静默重试前先确认学生仍然授权；
 * 查不到绑定或请求失败时一律视为未授权，交给导入页由用户显式操作。
 */
async function consentStillGranted(): Promise<boolean> {
  try {
    const binding = await getBinding()
    return binding.bound && binding.consents.timetable
  }
  catch {
    return false
  }
}

/** 同步结果；login_required 表示需要用户重新登录门户，retried 表示已用本机记住的密码重试过但失败 */
export type PortalSyncResult
  = | { status: 'ok', result: ImportOut }
    | { status: 'login_required', error: RequestError, retried: boolean }
    | { status: 'error', error: RequestError }

/**
 * 门户课表同步：先用服务端保存的会话抓取；遇到 409 PKU_LOGIN_REQUIRED 且本机记住了密码时，
 * 用记住的密码静默重试一次。不弹任何提示，由页面决定如何呈现。
 */
export function useTimetableSync() {
  const syncing = ref(false)

  async function syncPortal(term?: string): Promise<PortalSyncResult> {
    if (syncing.value) {
      return {
        status: 'error',
        error: new RequestError({ kind: 'unknown', code: 'busy', message: '正在同步中，请稍候' }),
      }
    }
    syncing.value = true
    try {
      try {
        const result = await importPortal({ term })
        return { status: 'ok', result }
      }
      catch (error) {
        const info = toRequestError(error)
        if (info.statusCode !== 409 || info.code !== 'PKU_LOGIN_REQUIRED')
          return { status: 'error', error: info }

        const credential = readPkuCredential()
        if (!credential)
          return { status: 'login_required', error: info, retried: false }
        // 用户在设置里关闭了课表授权：不能用记住的密码绕过它
        if (!(await consentStillGranted()))
          return { status: 'login_required', error: info, retried: false }

        try {
          const result = await importPortal({
            term,
            username: credential.username,
            password: credential.password,
            consent_timetable: true,
          })
          return { status: 'ok', result }
        }
        catch (retryError) {
          const retryInfo = toRequestError(retryError)
          // 密码错误说明记住的密码已失效：清掉，免得之后每次同步都拿错密码重试
          if (retryInfo.statusCode === 400 && retryInfo.code === 'IAAA_ERROR')
            clearPkuCredential()
          // 记住的密码已失效 / 需要验证码 / 账号被锁：都要用户到导入页处理
          if (retryInfo.statusCode === 400 || retryInfo.statusCode === 409 || retryInfo.statusCode === 429)
            return { status: 'login_required', error: retryInfo, retried: true }
          return { status: 'error', error: retryInfo }
        }
      }
    }
    finally {
      syncing.value = false
    }
  }

  return { syncing, syncPortal }
}
