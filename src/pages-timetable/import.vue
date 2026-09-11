<script lang="ts" setup>
import type { Binding } from '@/api/types/pku'
import type { IcsOut, ImportOut, Settings, SettingsPatch, Term, TextDryRunOut, TextFormat } from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import type { SubscribeOutcome } from '@/hooks/useClassReminder'
import { onLoad } from '@dcloudio/uni-app'
import { computed, nextTick, ref, watch } from 'vue'
import { getBinding, pkuUnbind, updateConsents } from '@/api/pku'
import {
  getIcsUrl,
  getSettings,
  getTerms,
  importPortal,
  importText,
  rotateIcsUrl,
  updateSettings,
} from '@/api/timetable'
import AgendaFilterSheet from '@/components/AgendaFilterSheet.vue'
import ApiFieldError from '@/components/ApiFieldError.vue'
import { useApiException } from '@/hooks/useApiException'
import { useClassReminder } from '@/hooks/useClassReminder'
import { useConfirm } from '@/hooks/useConfirm'
import { useTimetableSync } from '@/hooks/useTimetableSync'
import { useUserStore } from '@/store/user'
import { tokens } from '@/style/tokens'
import { confirmModal } from '@/utils/dialog'
import {
  clearPkuCredential,
  describeSlot,
  filterSummary,
  formatDateTime,
  readPkuCredential,
  readShowHidden,
  readWeekendMode,
  savePkuCredential,
  saveShowHidden,
  saveWeekendMode,
} from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '导入与设置',
  },
})

type ToggleKey = 'share_show_name'

interface PickerEvent {
  detail: { value: number | string }
}

/** 筛选弹层组件暴露的方法 */
interface FilterSheetInstance {
  open: () => void
  close: () => void
}

const binding = ref<Binding | null>(null)
const terms = ref<Term[]>([])
const selectedTerm = ref('')
const settings = ref<Settings | null>(null)
const loading = ref(true)
const loadError = ref('')
const toastRef = ref<UvToastInstance | null>(null)
const {
  clearFieldError,
  clearFieldErrors,
  getFieldMessages,
  handleApiException,
  showMessage,
} = useApiException(toastRef)
const { confirm } = useConfirm()
let scrollToSettings = false

const userStore = useUserStore()

// 北大账号
const showLoginForm = ref(false)
const username = ref('')
const password = ref('')
const consent = ref(false)
const remember = ref(!!readPkuCredential(userStore.userInfo.username))
const formError = ref('')
const importing = ref(false)
const importResult = ref<ImportOut | null>(null)
const unbinding = ref(false)
const consentSaving = ref(false)
const { syncing, syncPortal } = useTimetableSync()

// 粘贴导入
const pasteText = ref('')
const parsing = ref(false)
const dryRun = ref<TextDryRunOut | null>(null)
const pasteImporting = ref(false)
const pasteResult = ref<ImportOut | null>(null)
const pasteError = ref('')

// 字段一改就清掉它的后端错误提示
watch(username, () => clearFieldError('username'))
watch(password, () => clearFieldError('password'))
watch(pasteText, () => clearFieldError('text'))

/** 登录表单里会显示在控件旁的后端字段错误；一个都没有时退回整体 message，避免错误被吞掉 */
function hasLoginFieldErrors() {
  return ['username', 'password', 'non_field_errors'].some(field => getFieldMessages(field).length > 0)
}

// 设置
const savingKeys = ref<Record<string, boolean>>({})
const showHidden = ref(readShowHidden())
/** Opt-in: the week grid shows Saturday and Sunday unless this is switched on (device preference) */
const hideWeekend = ref(readWeekendMode() === 'hide')
const ics = ref<IcsOut | null>(null)
const icsLoading = ref(false)
const filterSheet = ref<FilterSheetInstance | null>(null)
const filterSaving = ref(false)

// 上课提醒
const REMINDER_MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60]
const { templateId: reminderTemplateId, ensureTemplateId, rememberEnabled, subscribe: subscribeReminder } = useClassReminder()
const reminderSaving = ref(false)
const reminderHint = ref('')

/** 来源 / 标签的显示开关都在筛选弹层里；这里只剩海报开关 */
const toggles: { key: ToggleKey, label: string, desc: string }[] = [
  { key: 'share_show_name', label: '海报显示姓名', desc: '分享海报上显示我的名字' },
]

const FORMAT_LABELS: Record<TextFormat, string> = {
  portal_html: '门户课表页面',
  elective: '选课结果',
  unknown: '未识别',
}

const termIndex = computed(() => Math.max(terms.value.findIndex(item => item.code === selectedTerm.value), 0))
const selectedTermName = computed(() => terms.value.find(item => item.code === selectedTerm.value)?.name ?? '')
const sessionLabel = computed(() => {
  const session = binding.value?.session
  if (!session)
    return ''
  if (session.alive === true)
    return '有效'
  if (session.alive === false)
    return '已失效，需重新登录'
  return '未检测'
})
const lockedLabel = computed(() => {
  const until = binding.value?.locked_until
  if (!until)
    return ''
  const time = new Date(until.replace(' ', 'T')).getTime()
  if (Number.isFinite(time) && time <= Date.now())
    return ''
  return `登录失败次数过多，已锁定至 ${formatDateTime(until)}`
})
/** 未绑定或会话已失效时直接展示登录表单 */
const needsLogin = computed(() => !binding.value?.bound || binding.value.session.alive === false)
const formVisible = computed(() => showLoginForm.value || needsLogin.value)
const busy = computed(() => importing.value || syncing.value)

/** 筛选行的摘要：全部显示 / 已开启 N/M */
const filterText = computed(() => {
  const summary = filterSummary(settings.value)
  return summary.allOn ? '全部显示' : `已开启 ${summary.enabled}/${summary.total}`
})

const reminderMinuteOptions = computed(() => {
  const current = settings.value?.reminder_minutes
  if (current && !REMINDER_MINUTE_OPTIONS.includes(current))
    return [...REMINDER_MINUTE_OPTIONS, current].sort((a, b) => a - b)
  return REMINDER_MINUTE_OPTIONS
})
const reminderMinuteLabels = computed(() => reminderMinuteOptions.value.map(minutes => `提前 ${minutes} 分钟`))
const reminderMinuteIndex = computed(() => Math.max(reminderMinuteOptions.value.indexOf(settings.value?.reminder_minutes ?? -1), 0))

function onTermChange(event: PickerEvent) {
  const picked = terms.value[Number(event.detail.value)]
  if (picked)
    selectedTerm.value = picked.code
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [bindingData, termsData, settingsData] = await Promise.all([
      getBinding(),
      getTerms(),
      getSettings(),
    ])
    binding.value = bindingData
    terms.value = termsData.terms
    settings.value = settingsData
    rememberEnabled(settingsData.reminder_enabled)
    // 预取订阅模板 id，让“上课提醒”开关能在点击事件里同步调起微信弹窗
    void ensureTemplateId()
    if (!selectedTerm.value || !termsData.terms.some(item => item.code === selectedTerm.value))
      selectedTerm.value = termsData.current?.code ?? termsData.terms[0]?.code ?? ''
    if (!username.value)
      username.value = bindingData.pku_username || readPkuCredential(userStore.userInfo.username)?.username || ''
  }
  catch (error) {
    loadError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    loading.value = false
  }
  if (scrollToSettings && !loadError.value) {
    scrollToSettings = false
    await nextTick()
    uni.pageScrollTo({ selector: '#settings', duration: 300 })
  }
}

async function reloadBinding() {
  try {
    binding.value = await getBinding()
  }
  catch (error) {
    // 操作本身已成功并提示过；绑定状态刷新失败只记日志，下次进入页面会重新加载
    console.error('刷新绑定状态失败:', error)
  }
}

async function handleLoginImport() {
  if (busy.value)
    return
  const user = username.value.trim()
  const pass = password.value
  clearFieldErrors()
  if (!user || !pass) {
    formError.value = '请输入学号和密码'
    return
  }
  if (!consent.value) {
    formError.value = '请先勾选同意数据使用说明'
    return
  }
  formError.value = ''
  importing.value = true
  try {
    const result = await importPortal({
      term: selectedTerm.value || undefined,
      username: user,
      password: pass,
      consent_timetable: true,
    })
    if (remember.value)
      savePkuCredential(userStore.userInfo.username, { username: user, password: pass })
    else
      clearPkuCredential(userStore.userInfo.username)
    password.value = ''
    importResult.value = result
    showLoginForm.value = false
    showMessage(`已导入 ${result.total} 门课程`, 'success')
    await reloadBinding()
  }
  catch (error) {
    // 字段错误显示在对应输入框下；IAAA 登录失败、需要验证码、账号锁定等显示在表单底部
    const requestError = handleApiException(error, { showToast: false })
    formError.value = hasLoginFieldErrors() ? '' : requestError.message
  }
  finally {
    importing.value = false
  }
}

async function handleRefresh() {
  if (busy.value)
    return
  const outcome = await syncPortal(selectedTerm.value || undefined)
  if (outcome.status === 'ok') {
    importResult.value = outcome.result
    showMessage(`已同步 ${outcome.result.total} 门课程`, 'success')
    await reloadBinding()
    return
  }
  if (outcome.status === 'login_required') {
    showLoginForm.value = true
    formError.value = outcome.retried ? outcome.error.message : '门户会话已失效，请重新登录'
    if (binding.value?.pku_username)
      username.value = binding.value.pku_username
    return
  }
  handleApiException(outcome.error)
}

async function handleUnbind() {
  if (unbinding.value)
    return
  const ok = await confirmModal({
    title: '解除绑定',
    content: '将删除服务端保存的门户会话与授权，以及本机记住的密码；已导入的课表不受影响。',
    confirmText: '解除绑定',
    confirmColor: tokens.error,
  })
  if (!ok)
    return
  unbinding.value = true
  try {
    await pkuUnbind()
    clearPkuCredential(userStore.userInfo.username)
    remember.value = false
    password.value = ''
    importResult.value = null
    showLoginForm.value = false
    showMessage('已解除绑定', 'success')
    await reloadBinding()
  }
  catch (error) {
    handleApiException(error)
  }
  finally {
    unbinding.value = false
  }
}

async function handleConsentChange(value: boolean) {
  const current = binding.value
  if (!current || consentSaving.value)
    return
  const previous = current.consents.timetable
  current.consents.timetable = value
  consentSaving.value = true
  try {
    binding.value = await updateConsents({ timetable: value })
  }
  catch (error) {
    handleApiException(error)
    current.consents.timetable = previous
  }
  finally {
    consentSaving.value = false
  }
}

async function handleParse() {
  const text = pasteText.value.trim()
  if (!text || parsing.value)
    return
  parsing.value = true
  pasteError.value = ''
  pasteResult.value = null
  clearFieldErrors()
  try {
    dryRun.value = await importText({ term: selectedTerm.value || undefined, text, dry_run: true })
  }
  catch (error) {
    dryRun.value = null
    // text 字段的错误显示在文本框下，其余失败显示在按钮下方
    const requestError = handleApiException(error, { showToast: false })
    pasteError.value = getFieldMessages('text').length ? '' : requestError.message
  }
  finally {
    parsing.value = false
  }
}

async function handlePasteImport() {
  const text = pasteText.value.trim()
  if (!text || pasteImporting.value || !dryRun.value?.blocks.length)
    return
  pasteImporting.value = true
  pasteError.value = ''
  clearFieldErrors()
  try {
    const result = await importText({ term: selectedTerm.value || undefined, text })
    pasteResult.value = result
    dryRun.value = null
    pasteText.value = ''
    showMessage(`已导入 ${result.total} 门课程`, 'success')
  }
  catch (error) {
    const requestError = handleApiException(error, { showToast: false })
    pasteError.value = getFieldMessages('text').length ? '' : requestError.message
  }
  finally {
    pasteImporting.value = false
  }
}

function describeResult(result: ImportOut) {
  return `新增 ${result.created}，更新 ${result.updated}，移除 ${result.removed}，当前共 ${result.total} 门`
}

async function handleToggle(key: ToggleKey, value: boolean) {
  const current = settings.value
  if (!current || savingKeys.value[key])
    return
  const previous = current[key]
  current[key] = value
  savingKeys.value = { ...savingKeys.value, [key]: true }
  try {
    settings.value = await updateSettings({ [key]: value })
  }
  catch (error) {
    handleApiException(error)
    current[key] = previous
  }
  finally {
    savingKeys.value = { ...savingKeys.value, [key]: false }
  }
}

function handleShowHiddenChange(value: boolean) {
  showHidden.value = value
  saveShowHidden(value)
}

function handleHideWeekendChange(value: boolean) {
  hideWeekend.value = value
  saveWeekendMode(value ? 'hide' : 'show')
}

function openFilter() {
  filterSheet.value?.open()
}

/** 保存筛选（来源开关 + 隐藏的标签） */
async function saveFilter(patch: SettingsPatch) {
  if (filterSaving.value)
    return
  filterSaving.value = true
  try {
    settings.value = await updateSettings(patch)
  }
  catch (error) {
    handleApiException(error)
    return
  }
  finally {
    filterSaving.value = false
  }
  filterSheet.value?.close()
  showMessage('已保存', 'success')
}

function describeSubscribeOutcome(outcome: SubscribeOutcome) {
  switch (outcome) {
    case 'accept':
      return '已允许微信提醒 1 次。微信每次允许只能发送一条订阅消息，用完后需再次授权；其余情况改为站内通知（含企业微信推送）。'
    case 'reject':
      return '未允许微信提醒，将通过站内通知（含企业微信推送）提醒。'
    case 'unavailable':
      return '微信订阅消息暂不可用，将通过站内通知（含企业微信推送）提醒。'
    case 'disabled':
      return '你在微信里关闭了本小程序的订阅消息，将通过站内通知（含企业微信推送）提醒；如需微信提醒请在设置中打开。'
    case 'tap_required':
      return '提醒已开启。微信要求在点击时授权，请点击“授权微信提醒”完成微信授权；未授权时通过站内通知（含企业微信推送）提醒。'
    default:
      return '微信授权未完成，将通过站内通知（含企业微信推送）提醒；可点击“授权微信提醒”重试。'
  }
}

/** 用户关闭了订阅消息时引导去微信设置页打开 */
async function offerOpenSetting(outcome: SubscribeOutcome) {
  if (outcome !== 'disabled')
    return
  const ok = await confirm({
    title: '订阅消息已关闭',
    content: '需要在微信的小程序设置中允许「上课提醒」订阅消息，是否前往设置？',
    confirmText: '去设置',
  })
  if (ok)
    uni.openSetting({})
}

async function handleReminderToggle(value: boolean) {
  const current = settings.value
  if (!current || reminderSaving.value)
    return
  const previous = current.reminder_enabled
  current.reminder_enabled = value
  reminderHint.value = ''
  // 微信只允许在点击事件里调起订阅弹窗：模板 id 已预取时先同步调起，再保存设置
  const pending = value && reminderTemplateId.value ? subscribeReminder(reminderTemplateId.value) : null
  reminderSaving.value = true
  try {
    settings.value = await updateSettings({ reminder_enabled: value })
    rememberEnabled(value)
  }
  catch (error) {
    handleApiException(error)
    current.reminder_enabled = previous
    return
  }
  finally {
    reminderSaving.value = false
  }
  if (!value)
    return
  if (pending) {
    const outcome = await pending
    reminderHint.value = describeSubscribeOutcome(outcome)
    await offerOpenSetting(outcome)
    return
  }
  // 模板 id 还没取到：微信只接受点击手势内同步调起的订阅弹窗，这里补调会被拒绝，
  // 所以只保存开关并提示用户点「授权微信提醒」，同时把模板 id 取回来供下次点击使用
  void ensureTemplateId()
  reminderHint.value = describeSubscribeOutcome('tap_required')
}

async function handleReminderMinutesChange(event: PickerEvent) {
  const current = settings.value
  const minutes = reminderMinuteOptions.value[Number(event.detail.value)]
  if (!current || !minutes || reminderSaving.value || minutes === current.reminder_minutes)
    return
  const previous = current.reminder_minutes
  current.reminder_minutes = minutes
  reminderSaving.value = true
  try {
    settings.value = await updateSettings({ reminder_minutes: minutes })
  }
  catch (error) {
    handleApiException(error)
    current.reminder_minutes = previous
  }
  finally {
    reminderSaving.value = false
  }
}

/** 再要一次微信订阅额度（每次允许只能发一条） */
async function handleReminderAuthorize() {
  if (reminderSaving.value)
    return
  reminderHint.value = ''
  const outcome = await subscribeReminder()
  reminderHint.value = describeSubscribeOutcome(outcome)
  await offerOpenSetting(outcome)
}

async function handleCopyIcs() {
  if (icsLoading.value)
    return
  icsLoading.value = true
  try {
    const data = ics.value ?? await getIcsUrl()
    ics.value = data
    // 微信会自动提示“内容已复制”
    uni.setClipboardData({ data: data.url })
  }
  catch (error) {
    handleApiException(error)
  }
  finally {
    icsLoading.value = false
  }
}

async function handleRotateIcs() {
  if (icsLoading.value)
    return
  const ok = await confirmModal({
    title: '重置订阅链接',
    content: '旧链接将立即失效，已添加到日历的订阅需要重新添加。',
    confirmText: '重置',
    confirmColor: tokens.error,
  })
  if (!ok)
    return
  icsLoading.value = true
  try {
    ics.value = await rotateIcsUrl()
    uni.setClipboardData({ data: ics.value.url })
  }
  catch (error) {
    handleApiException(error)
  }
  finally {
    icsLoading.value = false
  }
}

function goEntryForm() {
  uni.navigateTo({ url: `/pages-timetable/entry-form?term=${encodeURIComponent(selectedTerm.value)}` })
}

function goCatalog() {
  uni.navigateTo({ url: `/pages-timetable/catalog?term=${encodeURIComponent(selectedTerm.value)}` })
}

onLoad((options) => {
  scrollToSettings = options?.section === 'settings'
  void load()
})
</script>

<template>
  <view class="min-h-screen bg-page pb-10">
    <uv-toast ref="toastRef" />
    <PageState
      v-if="loading || loadError"
      :loading="loading"
      :error="loadError"
      loading-text="正在加载…"
      @retry="load"
    />

    <view v-else class="px-4 pt-4 space-y-4">
      <!-- 学期 -->
      <view class="flex items-center justify-between rounded-lg bg-card px-4 py-3 shadow-card">
        <text class="text-sm text-fg-2">导入到学期</text>
        <picker :value="termIndex" :range="terms" range-key="name" @change="onTermChange">
          <view class="flex items-center text-sm text-primary">
            <text>{{ selectedTermName || '请选择学期' }}</text>
            <text class="i-carbon-chevron-down ml-1" />
          </view>
        </picker>
      </view>

      <!-- 北大账号 -->
      <view class="yp-card">
        <view class="flex items-center justify-between">
          <text class="text-base text-fg-1 font-bold">北大账号</text>
          <view
            class="rounded-full px-2 py-0.5 text-xs"
            :class="binding?.bound ? 'bg-success-light text-success' : 'bg-fill text-fg-2'"
          >
            {{ binding?.bound ? '已绑定' : '未绑定' }}
          </view>
        </view>
        <text class="mt-1 block text-xs text-fg-3 leading-5">
          用门户账号自动获取本学期课表。密码只用于本次登录，服务端不保存密码。
        </text>

        <template v-if="binding && binding.bound">
          <view class="mt-3 text-sm text-fg-2 space-y-1">
            <view>学号：{{ binding.pku_username }}</view>
            <view>门户会话：{{ sessionLabel }}</view>
            <view>上次同步：{{ formatDateTime(binding.last_sync_at) || '尚未同步' }}</view>
            <view v-if="lockedLabel" class="text-error">
              {{ lockedLabel }}
            </view>
          </view>
          <view class="mt-3 flex items-center justify-between border-t border-line-light pt-3">
            <view>
              <text class="block text-sm text-fg-2">允许使用门户课表数据</text>
              <text class="block text-xs text-fg-3">关闭后无法自动同步</text>
            </view>
            <uv-switch
              :model-value="binding.consents.timetable"
              :disabled="consentSaving"
              size="22"
              :active-color="tokens.primary"
              @change="handleConsentChange"
            />
          </view>
        </template>

        <template v-if="binding && binding.bound && !formVisible">
          <view class="mt-4 flex gap-3">
            <button
              class="btn-primary flex-1"
              :disabled="busy"
              @click="handleRefresh"
            >
              {{ syncing ? '同步中…' : '立即刷新' }}
            </button>
            <button
              class="btn-outline flex-1"
              :disabled="busy"
              @click="showLoginForm = true"
            >
              重新登录
            </button>
          </view>
        </template>

        <view v-if="formVisible" class="mt-4 space-y-3">
          <view>
            <text class="mb-2 block text-sm text-fg-2 font-medium">学号</text>
            <input
              v-model="username"
              class="form-input"
              type="text"
              placeholder="北大门户学号"
              :maxlength="32"
            >
            <ApiFieldError :messages="getFieldMessages('username')" />
          </view>
          <view>
            <text class="mb-2 block text-sm text-fg-2 font-medium">密码</text>
            <input
              v-model="password"
              class="form-input"
              type="text"
              password
              placeholder="门户密码，仅用于本次登录"
            >
            <ApiFieldError :messages="getFieldMessages('password')" />
          </view>
          <view class="flex items-start gap-2" @click="consent = !consent">
            <view class="consent-box" :class="{ 'consent-box--checked': consent }">
              <text v-if="consent" class="i-carbon-checkmark text-xs text-white" />
            </view>
            <text class="flex-1 text-xs text-fg-2 leading-5">
              我同意智慧书院使用我的门户课表数据，密码仅用于本次登录，不会被保存
            </text>
          </view>
          <view class="flex items-center justify-between">
            <view>
              <text class="block text-sm text-fg-2">本机记住密码（仅存本手机）</text>
              <text class="block text-xs text-fg-3">门户会话失效时自动重新登录</text>
            </view>
            <uv-switch v-model="remember" size="22" :active-color="tokens.primary" />
          </view>
          <ApiFieldError :messages="getFieldMessages('non_field_errors')" />
          <text v-if="formError" class="block text-sm text-error">{{ formError }}</text>
          <button
            class="btn-primary btn-block"
            :disabled="busy"
            @click="handleLoginImport"
          >
            {{ importing ? '登录并导入中…' : '登录并导入' }}
          </button>
          <button
            v-if="binding && binding.bound && showLoginForm"
            class="btn-outline btn-block"
            :disabled="busy"
            @click="showLoginForm = false"
          >
            取消
          </button>
        </view>

        <view v-if="importResult" class="mt-3 rounded-md bg-success-light p-3 text-xs text-success-dark leading-5">
          已导入 {{ importResult.term }}：{{ describeResult(importResult) }}
        </view>

        <button
          v-if="binding && binding.bound"
          class="btn-danger mt-3 btn-block"
          :disabled="unbinding"
          @click="handleUnbind"
        >
          {{ unbinding ? '解除中…' : '解除绑定' }}
        </button>
      </view>

      <!-- 粘贴导入 -->
      <view class="yp-card">
        <text class="text-base text-fg-1 font-bold">粘贴导入</text>
        <text class="mt-1 block text-xs text-fg-3 leading-5">
          不想输入密码时可用：在电脑浏览器打开 elective.pku.edu.cn 的「选课结果」页面，全选课表表格并复制；
          或在门户「我的课表」页面全选复制，把文本粘贴到下方后点「解析预览」。
        </text>
        <textarea
          v-model="pasteText"
          class="form-textarea mt-3"
          placeholder="粘贴选课结果或门户课表文本"
          :maxlength="-1"
        />
        <ApiFieldError :messages="getFieldMessages('text')" />
        <view class="mt-3 flex gap-3">
          <button
            class="btn-secondary flex-1"
            :disabled="parsing || !pasteText.trim()"
            @click="handleParse"
          >
            {{ parsing ? '解析中…' : '解析预览' }}
          </button>
          <button
            v-if="dryRun && dryRun.blocks.length"
            class="btn-primary flex-1"
            :disabled="pasteImporting"
            @click="handlePasteImport"
          >
            {{ pasteImporting ? '导入中…' : `确认导入（${dryRun.blocks.length}）` }}
          </button>
        </view>
        <text v-if="pasteError" class="mt-2 block text-sm text-error">{{ pasteError }}</text>
        <view v-if="pasteResult" class="mt-3 rounded-md bg-success-light p-3 text-xs text-success-dark leading-5">
          已导入 {{ pasteResult.term }}：{{ describeResult(pasteResult) }}
        </view>
        <view v-if="dryRun" class="mt-3">
          <text class="block text-xs text-fg-2">
            识别格式：{{ FORMAT_LABELS[dryRun.format] }}，共 {{ dryRun.blocks.length }} 条
          </text>
          <text v-if="!dryRun.blocks.length" class="mt-1 block text-xs text-error">
            未识别到课程，请检查复制的内容是否完整
          </text>
          <view
            v-for="(block, index) in dryRun.blocks"
            :key="index"
            class="mt-2 rounded-md bg-fill p-3"
          >
            <text class="block text-sm text-fg-1 font-medium">{{ block.name }}</text>
            <text class="mt-0.5 block text-xs text-fg-2">{{ describeSlot(block) }}</text>
            <text v-if="block.room || block.teacher" class="mt-0.5 block text-xs text-fg-3">
              {{ [block.room, block.teacher].filter(Boolean).join(' · ') }}
            </text>
          </view>
        </view>
      </view>

      <!-- 考试安排 -->
      <view class="flex items-start gap-3 yp-card">
        <text class="i-carbon-task mt-0.5 shrink-0 text-xl text-error" />
        <view class="min-w-0 flex-1">
          <text class="block text-base text-fg-1 font-bold">考试安排</text>
          <text class="mt-1 block text-xs text-fg-3 leading-5">
            学期考试安排导入后，课表里的课程会按课程号自动匹配出考试（红色显示），无需手动录入；
            第 17 周起的考试周会在周次上标出。临时或未匹配到的考试可在「添加 → 手动添加」里选类别“考试”。
          </text>
        </view>
      </view>

      <!-- 手动添加 / 课程库 -->
      <view class="overflow-hidden rounded-lg bg-card shadow-card">
        <view class="flex items-center justify-between border-b border-line-light p-4 active:bg-fill" @click="goCatalog">
          <view>
            <text class="block text-base text-fg-1 font-bold">从课程库添加旁听课程</text>
            <text class="mt-1 block text-xs text-fg-3">搜索本学期课程，一键把上课时间加进课表</text>
          </view>
          <view class="flex items-center text-primary">
            <text class="i-carbon-catalog text-xl" />
          </view>
        </view>
        <view class="flex items-center justify-between p-4 active:bg-fill" @click="goEntryForm">
          <view>
            <text class="block text-base text-fg-1 font-bold">手动添加</text>
            <text class="mt-1 block text-xs text-fg-3">课程、考试、自习、社团例会等自定义日程</text>
          </view>
          <view class="flex items-center text-primary">
            <text class="i-carbon-add text-xl" />
          </view>
        </view>
      </view>

      <!-- 设置 -->
      <view id="settings" class="yp-card">
        <text class="text-base text-fg-1 font-bold">课表设置</text>
        <view
          v-if="settings"
          class="flex items-center justify-between border-b border-line-light py-3 active:opacity-70"
          @click="openFilter"
        >
          <view>
            <text class="block text-sm text-fg-2">筛选来源与标签</text>
            <text class="block text-xs text-fg-3">学校课表 / 书院课 / 活动 / 预约 / 考试，以及按标签显示或隐藏</text>
          </view>
          <view class="flex shrink-0 items-center text-sm text-primary">
            <text>{{ filterText }}</text>
            <text class="i-carbon-chevron-right ml-0.5" />
          </view>
        </view>
        <template v-if="settings">
          <view
            v-for="item in toggles"
            :key="item.key"
            class="flex items-center justify-between border-b border-line-light py-3"
          >
            <view>
              <text class="block text-sm text-fg-2">{{ item.label }}</text>
              <text class="block text-xs text-fg-3">{{ item.desc }}</text>
            </view>
            <uv-switch
              :model-value="settings[item.key]"
              :disabled="!!savingKeys[item.key]"
              size="22"
              :active-color="tokens.primary"
              @change="(value: boolean) => handleToggle(item.key, value)"
            />
          </view>
        </template>
        <view class="flex items-center justify-between py-3">
          <view>
            <text class="block text-sm text-fg-2">显示已隐藏的日程</text>
            <text class="block text-xs text-fg-3">打开后可在课表里取消隐藏</text>
          </view>
          <uv-switch :model-value="showHidden" size="22" :active-color="tokens.primary" @change="handleShowHiddenChange" />
        </view>
        <view class="flex items-center justify-between border-t border-line-light py-3">
          <view class="min-w-0 flex-1 pr-3">
            <text class="block text-sm text-fg-2">隐藏周末</text>
            <text class="block text-xs text-fg-3">周视图不显示周六、周日两列；周末有日程时课表上方会提示</text>
          </view>
          <uv-switch :model-value="hideWeekend" size="22" :active-color="tokens.primary" @change="handleHideWeekendChange" />
        </view>

        <view v-if="settings" class="mt-2 border-t border-line-light pt-3">
          <view class="flex items-center justify-between">
            <view class="min-w-0 flex-1 pr-3">
              <text class="block text-sm text-fg-2">上课提醒</text>
              <text class="block text-xs text-fg-3 leading-5">
                上课前通过微信订阅消息提醒。微信每次允许只能发送一条，用完后需再次授权；未授权或用完时改为站内通知（含企业微信推送）。
              </text>
            </view>
            <uv-switch
              :model-value="settings.reminder_enabled"
              :disabled="reminderSaving"
              size="22"
              :active-color="tokens.primary"
              @change="handleReminderToggle"
            />
          </view>
          <template v-if="settings.reminder_enabled">
            <view class="mt-3 flex items-center justify-between">
              <text class="text-sm text-fg-2">提醒时间</text>
              <picker
                :value="reminderMinuteIndex"
                :range="reminderMinuteLabels"
                :disabled="reminderSaving"
                @change="handleReminderMinutesChange"
              >
                <view class="flex items-center text-sm text-primary">
                  <text>提前 {{ settings.reminder_minutes }} 分钟</text>
                  <text class="i-carbon-chevron-down ml-1" />
                </view>
              </picker>
            </view>
            <text v-if="reminderHint" class="mt-2 block text-xs text-fg-2 leading-5">{{ reminderHint }}</text>
            <button
              v-if="reminderTemplateId"
              class="btn-secondary mt-3 btn-block"
              :disabled="reminderSaving"
              @click="handleReminderAuthorize"
            >
              授权微信提醒
            </button>
            <text v-else class="mt-2 block text-xs text-fg-3">微信订阅消息未配置，提醒将通过站内通知发送</text>
          </template>
        </view>

        <view class="mt-2 border-t border-line-light pt-3">
          <text class="block text-sm text-fg-2">日历订阅</text>
          <text class="mt-1 block text-xs text-fg-3 leading-5">
            把订阅链接添加到系统日历（iOS 日历、Outlook、Google 日历等），课表变动会自动更新。订阅内容跟随「筛选来源与标签」里的设置。链接含私人 token，请勿转发。
          </text>
          <view class="mt-3 flex gap-3">
            <button
              class="btn-secondary flex-1"
              :disabled="icsLoading"
              @click="handleCopyIcs"
            >
              复制订阅链接
            </button>
            <button
              class="btn-outline flex-1"
              :disabled="icsLoading"
              @click="handleRotateIcs"
            >
              重置链接
            </button>
          </view>
        </view>
      </view>
    </view>
  </view>

  <!-- 日程筛选：来源与标签 -->
  <AgendaFilterSheet ref="filterSheet" :settings="settings" :saving="filterSaving" @save="saveFilter" />
</template>

<style lang="scss" scoped>
.form-input,
.form-textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0 24rpx;
  font-size: var(--yp-font-sm);
  color: var(--yp-text-1);
  background: var(--yp-bg-fill);
  border: 2rpx solid var(--yp-border);
  border-radius: var(--yp-radius-md);
}

.form-input {
  height: 80rpx;
  line-height: 80rpx;
}

.form-textarea {
  min-height: 200rpx;
  padding: 16rpx 24rpx;
  line-height: 1.5;
}

.consent-box {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36rpx;
  height: 36rpx;
  margin-top: 4rpx;
  border: 2rpx solid var(--yp-border);
  border-radius: var(--yp-radius-sm);

  &--checked {
    background: var(--yp-color-primary);
    border-color: var(--yp-color-primary);
  }
}
</style>
