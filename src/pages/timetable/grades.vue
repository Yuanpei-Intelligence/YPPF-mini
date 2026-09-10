<script lang="ts" setup>
import type { GradeRow, GradesOut, GradesTerm } from '@/api/types/grades'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { deleteGrades, getGrades, syncGrades } from '@/api/grades'
import { updateConsents } from '@/api/pku'
import { getApiError } from '@/http/error'
import { confirmModal } from '@/utils/dialog'
import { describeTermCode, formatDateTime } from '@/utils/timetable'

definePage({
  style: {
    navigationBarTitleText: '我的成绩',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
    enablePullDownRefresh: true,
  },
})

/** consent：需要授权；binding：需要到导入页绑定 / 重新登录北大账号 */
type Gate = 'none' | 'consent' | 'binding'

const data = ref<GradesOut | null>(null)
const loading = ref(true)
const loadError = ref('')
const gate = ref<Gate>('none')
const gateMessage = ref('')
const consenting = ref(false)
const syncing = ref(false)
const revoking = ref(false)
/** 学期码 -> 是否折叠 */
const collapsed = ref<Record<string, boolean>>({})
/** 已把用户带去导入页绑定 / 重新登录；回来时重新加载但不再自动跳转，避免来回弹 */
let leftForBinding = false

const busy = computed(() => consenting.value || syncing.value || revoking.value)
/** 最近的学期排在前面 */
const terms = computed<GradesTerm[]>(() =>
  [...(data.value?.terms ?? [])].sort((a, b) => b.term_code.localeCompare(a.term_code)),
)
const totalCourses = computed(() => terms.value.reduce((sum, term) => sum + term.rows.length, 0))
const fetchedLabel = computed(() => {
  const at = data.value?.fetched_at
  return at ? `更新于 ${formatDateTime(at)}` : '尚未同步'
})

/** 学分：整数不带小数，其它保留一位；null 或无法解析时显示 —（兼容 DRF 把 Decimal 序列化成字符串） */
function formatCredits(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '')
    return '—'
  const number = Number(value)
  if (!Number.isFinite(number))
    return String(value)
  return Number.isInteger(number) ? String(number) : number.toFixed(1)
}

function formatGpa(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '')
    return '—'
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(2) : String(value)
}

function scoreClass(row: GradeRow) {
  return row.score_numeric !== null && row.score_numeric < 60 ? 'text-red-500' : 'text-gray-900'
}

function rowKey(row: GradeRow) {
  return `${row.term_code}|${row.course_code}|${row.class_no}|${row.name}`
}

function rowMeta(row: GradeRow) {
  return [row.course_type, row.course_code].filter(Boolean).join(' · ')
}

function termMeta(term: GradesTerm) {
  return `${term.rows.length} 门 · ${formatCredits(term.summary.credits)} 学分 · GPA ${formatGpa(term.summary.gpa)}`
}

/** 新出现的学期默认只展开最近一个，已有的保持用户的折叠状态 */
function initCollapsed() {
  const next = { ...collapsed.value }
  terms.value.forEach((term, index) => {
    if (!(term.term_code in next))
      next[term.term_code] = index !== 0
  })
  collapsed.value = next
}

function toggleTerm(code: string) {
  collapsed.value = { ...collapsed.value, [code]: !collapsed.value[code] }
}

function applyData(result: GradesOut) {
  data.value = result
  gate.value = 'none'
  loadError.value = ''
  initCollapsed()
}

function goImport() {
  leftForBinding = true
  uni.navigateTo({ url: '/pages/timetable/import' })
}

/**
 * 把请求失败映射到页面状态：403 未授权 -> 授权引导；404 未绑定 / 409 会话失效 -> 提示并转到导入页；
 * 其它失败：已有数据时 toast，否则整页错误
 */
function handleFailure(error: unknown, fallback: string, options: { redirect?: boolean } = {}) {
  const info = getApiError(error, fallback)
  if (info.statusCode === 403 && info.code === 'CONSENT_REQUIRED') {
    gate.value = 'consent'
    loadError.value = ''
    return
  }
  const notBound = info.statusCode === 404 && info.code === 'NOT_BOUND'
  const loginRequired = info.statusCode === 409 && info.code === 'PKU_LOGIN_REQUIRED'
  if (notBound || loginRequired) {
    gate.value = 'binding'
    gateMessage.value = notBound ? '请先绑定北大账号' : '门户会话已失效，请重新登录'
    loadError.value = ''
    if (options.redirect !== false) {
      uni.showToast({ title: gateMessage.value, icon: 'none' })
      goImport()
    }
    return
  }
  if (data.value)
    uni.showToast({ title: info.message, icon: 'none' })
  else
    loadError.value = info.message
}

async function load(options: { silent?: boolean, redirect?: boolean } = {}) {
  if (!options.silent) {
    loading.value = true
    loadError.value = ''
  }
  try {
    applyData(await getGrades({ hideErrorToast: true }))
  }
  catch (error) {
    handleFailure(error, '成绩加载失败', { redirect: options.redirect })
  }
  finally {
    loading.value = false
  }
}

/** 授权存储成绩，然后抓取并保存 */
async function handleConsent() {
  if (busy.value)
    return
  consenting.value = true
  try {
    await updateConsents({ grades: true }, { hideErrorToast: true })
    applyData(await syncGrades({ hideErrorToast: true }))
  }
  catch (error) {
    handleFailure(error, '同步失败')
  }
  finally {
    consenting.value = false
  }
}

/** 从门户重新抓取；未授权存储时只返回本次数据（stored=false），不落库 */
async function handleSync() {
  if (busy.value)
    return
  syncing.value = true
  try {
    applyData(await syncGrades({ hideErrorToast: true }))
    uni.showToast({ title: '已同步', icon: 'success' })
  }
  catch (error) {
    handleFailure(error, '同步失败')
  }
  finally {
    syncing.value = false
  }
}

async function handleRevoke() {
  if (busy.value)
    return
  const ok = await confirmModal({
    title: '撤销授权',
    content: '将撤销成绩数据使用授权，并删除服务端保存的全部成绩记录；课表授权不受影响。',
    confirmText: '撤销并删除',
    confirmColor: '#dc2626',
  })
  if (!ok)
    return
  revoking.value = true
  try {
    await updateConsents({ grades: false }, { hideErrorToast: true })
    try {
      await deleteGrades({ hideErrorToast: true })
    }
    catch (error) {
      // 撤销授权时服务端已同步删除成绩，403 / 404 说明已无可删
      const info = getApiError(error, '删除失败')
      if (info.statusCode !== 403 && info.statusCode !== 404)
        throw error
    }
    data.value = null
    collapsed.value = {}
    gate.value = 'consent'
    uni.showToast({ title: '已撤销授权并删除成绩', icon: 'success' })
  }
  catch (error) {
    handleFailure(error, '撤销失败')
  }
  finally {
    revoking.value = false
  }
}

onLoad(() => {
  void load()
})

onShow(() => {
  // 从导入页绑定 / 重新登录回来后重新加载；仍未绑定时留在本页，由用户决定是否再去绑定
  if (leftForBinding) {
    leftForBinding = false
    void load({ redirect: false })
  }
})

onPullDownRefresh(async () => {
  await load({ silent: !!data.value })
  uni.stopPullDownRefresh()
})
</script>

<template>
  <view class="min-h-screen bg-gray-50 pb-10">
    <view v-if="loading" class="flex flex-col items-center justify-center py-24 text-sm text-gray-400">
      <uv-loading-icon mode="circle" />
      <text class="mt-3">正在加载成绩…</text>
    </view>

    <view v-else-if="loadError" class="flex flex-col items-center justify-center px-8 py-24 text-center">
      <text class="i-carbon-warning-alt mb-3 text-3xl text-gray-300" />
      <text class="text-sm text-gray-500 leading-6">{{ loadError }}</text>
      <button class="mt-5 rounded-lg bg-blue-500 px-6 py-2 text-sm text-white" @click="load()">
        重试
      </button>
    </view>

    <!-- 授权引导 -->
    <view v-else-if="gate === 'consent'" class="px-4 pt-4">
      <view class="rounded-2xl bg-white p-5 shadow-sm">
        <view class="flex items-center gap-2">
          <text class="i-carbon-security text-2xl text-blue-600" />
          <text class="text-base text-gray-900 font-bold">查看成绩需要你的授权</text>
        </view>
        <view class="mt-3 text-sm text-gray-600 leading-6 space-y-2">
          <view>· 获取内容：门户「我的成绩」里各学期的课程名、课程号、学分、成绩与绩点。</view>
          <view>· 只有在你授权后，成绩才会保存在智慧书院服务器，用于在这里展示总学分与 GPA；不会用于其它用途，也不会向他人展示。</view>
          <view>· 你可以随时撤销授权，撤销时会同时删除已保存的全部成绩。</view>
          <view>· 不授权也可以“仅查看一次”，本次数据不会保存。</view>
        </view>
        <button
          class="mt-5 w-full rounded-lg bg-blue-500 py-2.5 text-sm text-white font-medium"
          :disabled="busy"
          @click="handleConsent"
        >
          {{ consenting ? '同步中…' : '同意并同步成绩' }}
        </button>
        <button
          class="mt-3 w-full border border-gray-200 rounded-lg bg-white py-2.5 text-sm text-gray-700 font-medium"
          :disabled="busy"
          @click="handleSync"
        >
          {{ syncing ? '获取中…' : '仅查看一次（不保存）' }}
        </button>
      </view>
    </view>

    <!-- 未绑定 / 会话失效 -->
    <view v-else-if="gate === 'binding'" class="flex flex-col items-center justify-center px-8 py-24 text-center">
      <text class="i-carbon-locked mb-3 text-3xl text-gray-300" />
      <text class="text-sm text-gray-500 leading-6">{{ gateMessage }}</text>
      <view class="mt-5 flex gap-3">
        <button class="rounded-lg bg-blue-500 px-6 py-2 text-sm text-white" @click="goImport">
          去绑定
        </button>
        <button class="border border-gray-200 rounded-lg bg-white px-6 py-2 text-sm text-gray-700" @click="load({ redirect: false })">
          重试
        </button>
      </view>
    </view>

    <view v-else-if="data" class="px-4 pt-4 space-y-4">
      <!-- 总览 -->
      <view class="rounded-2xl bg-blue-600 p-5 text-white shadow-sm">
        <view class="flex">
          <view class="flex-1">
            <text class="block text-xs text-blue-100">总学分</text>
            <text class="mt-1 block text-3xl font-bold">{{ formatCredits(data.summary.credits) }}</text>
          </view>
          <view class="flex-1">
            <text class="block text-xs text-blue-100">GPA</text>
            <text class="mt-1 block text-3xl font-bold">{{ formatGpa(data.summary.gpa) }}</text>
          </view>
          <view class="flex-1">
            <text class="block text-xs text-blue-100">课程数</text>
            <text class="mt-1 block text-3xl font-bold">{{ totalCourses }}</text>
          </view>
        </view>
        <text class="mt-3 block text-xs text-blue-100">{{ fetchedLabel }}</text>
      </view>

      <view v-if="!data.stored" class="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 leading-5">
        本次成绩未保存（未授权存储），下次打开需重新获取。
        <text class="text-blue-600" @click="handleConsent">授权并保存</text>
      </view>

      <button
        class="w-full rounded-lg bg-blue-500 py-2.5 text-sm text-white font-medium"
        :disabled="busy"
        @click="handleSync"
      >
        {{ syncing ? '同步中…' : '从门户同步成绩' }}
      </button>

      <view v-if="!terms.length" class="flex flex-col items-center justify-center py-16 text-center">
        <text class="i-carbon-report mb-3 text-3xl text-gray-200" />
        <text class="text-sm text-gray-400">还没有成绩记录，请先同步</text>
      </view>

      <!-- 各学期 -->
      <view
        v-for="term in terms"
        :key="term.term_code"
        class="overflow-hidden rounded-2xl bg-white shadow-sm"
      >
        <view class="flex items-center justify-between px-4 py-3 active:bg-gray-50" @click="toggleTerm(term.term_code)">
          <view class="min-w-0 flex-1">
            <text class="block text-sm text-gray-900 font-medium">{{ describeTermCode(term.term_code) }}</text>
            <text class="block text-xs text-gray-400">{{ termMeta(term) }}</text>
          </view>
          <text class="text-gray-400" :class="collapsed[term.term_code] ? 'i-carbon-chevron-down' : 'i-carbon-chevron-up'" />
        </view>
        <view v-if="!collapsed[term.term_code]" class="border-t border-gray-50">
          <view class="flex items-center bg-gray-50 px-4 py-1.5 text-2xs text-gray-400">
            <text class="flex-1">课程</text>
            <text class="w-12 text-right">学分</text>
            <text class="w-14 text-right">成绩</text>
            <text class="w-12 text-right">绩点</text>
          </view>
          <view
            v-for="row in term.rows"
            :key="rowKey(row)"
            class="flex items-center border-b border-gray-50 px-4 py-2.5 last:border-none"
          >
            <view class="min-w-0 flex-1">
              <text class="block truncate text-sm text-gray-800">{{ row.name }}</text>
              <text v-if="rowMeta(row)" class="block truncate text-xs text-gray-400">{{ rowMeta(row) }}</text>
            </view>
            <text class="w-12 text-right text-xs text-gray-500">{{ formatCredits(row.credits) }}</text>
            <text class="w-14 text-right text-sm font-medium" :class="scoreClass(row)">{{ row.score || '—' }}</text>
            <text class="w-12 text-right text-xs text-gray-500">{{ formatGpa(row.gpa) }}</text>
          </view>
        </view>
      </view>

      <view class="pt-2 text-center">
        <text class="text-xs text-red-500" @click="handleRevoke">{{ revoking ? '处理中…' : '撤销授权并删除成绩' }}</text>
      </view>
      <text class="block text-center text-2xs text-gray-400">成绩仅供参考，以门户为准</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
button::after {
  border: none;
}
</style>
