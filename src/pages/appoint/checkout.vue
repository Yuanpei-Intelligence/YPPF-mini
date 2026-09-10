<script lang="ts" setup>
import type { ICheckoutAppointRequest, ICheckoutInfoResponse, ISearchUserItem } from '@/api/types/appoint'
import type { UvToastInstance } from '@/hooks/useApiException'
import { createAppoint, getCheckoutInfo, searchUsers } from '@/api/appoint'
import FormField from '@/components/FormField.vue'
import PageState from '@/components/PageState.vue'
import { useApiException } from '@/hooks/useApiException'
import { useConfirm } from '@/hooks/useConfirm'
import { tokens } from '@/style/tokens'
import { formatChineseDate, weekdayLabel } from '@/utils/format'

definePage({
  style: {
    navigationBarTitleText: '填写预约信息',
  },
})

type Weekday = 'Fri' | 'Mon' | 'Sat' | 'Sun' | 'Thu' | 'Tue' | 'Wed'

const WEEKDAY_INDEX: Record<Weekday, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

// URL 参数
const Rid = ref<string>('')
const startid = ref<number>(0)
const endid = ref<number>(0)
const weekday = ref<Weekday>('Mon')
const isLongterm = ref<boolean>(false)
const startWeek = ref<0 | 1>(0)
const timestr = ref<string>('')

// 页面状态
const loading = ref(false)
const loadError = ref<string | null>(null)
const submitting = ref(false)
const data = ref<ICheckoutInfoResponse>()
const toastRef = ref<UvToastInstance | null>(null)
const {
  clearFieldError,
  getFieldMessages,
  handleApiException,
  setFieldError,
  showMessage,
} = useApiException(toastRef)
const { confirm } = useConfirm()

// 表单数据
const formData = reactive({
  // 基础字段
  Ausage: '',
  announcement: '',
  non_yp_num: 0,
  students: [] as string[],
  // 长期预约字段
  times: 10,
  interval: 1,
  // 面试预约
  interview: false,
})

// 存储已添加成员的名称映射
const memberNames = ref<Record<string, string>>({})

// 搜索相关
const searchQuery = ref('')
const searchResults = ref<ISearchUserItem[]>([])
const searchLoading = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

// 防抖搜索
function debounceSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    performSearch()
  }, 300)
}

// 执行搜索
async function performSearch() {
  const query = searchQuery.value.trim()
  if (!query) {
    searchResults.value = []
    return
  }

  searchLoading.value = true
  try {
    const results = await searchUsers({ query, limit: 10 })
    // 过滤掉已添加的用户
    searchResults.value = results.filter(
      u => !formData.students.includes(String(u.id)),
    )
  }
  catch (error) {
    console.error('搜索用户失败:', error)
    searchResults.value = []
    handleApiException(error)
  }
  finally {
    searchLoading.value = false
  }
}

// 监听搜索输入
watch(searchQuery, () => {
  if (searchQuery.value.trim()) {
    debounceSearch()
  }
  else {
    searchResults.value = []
  }
})

// 计算属性
const hasLongtermPermission = computed(() => data.value?.has_longterm_permission || false)
const hasInterviewPermission = computed(() => data.value?.has_interview_permission || false)
const interviewMaxCount = computed(() => data.value?.interview_max_count || 5)
const room = computed(() => data.value?.room)

// 预约参数（从 API 返回的，如日期等）
const appointParams = computed(() => data.value?.appoint_params || {})

// 已添加的成员列表（包含用户信息）
const memberList = computed(() => {
  return formData.students.map((sid) => {
    return {
      id: sid,
      name: memberNames.value[sid] || sid,
    }
  })
})

// 总人数（本院）
const ypNum = computed(() => formData.students.length + 1) // +1 是预约发起人

// 最小/最大人数验证
const minPeople = computed(() => room.value?.Rmin || 1)
const maxPeople = computed(() => room.value?.Rmax || 10)
const totalPeople = computed(() => ypNum.value + formData.non_yp_num)
const isPeopleValid = computed(() => totalPeople.value >= minPeople.value && totalPeople.value <= maxPeople.value)

// 表单验证
const canSubmit = computed(() => {
  if (!formData.Ausage.trim())
    return false
  if (!isPeopleValid.value)
    return false
  return true
})

// ---- 摘要区块 ----------------------------------------------------------------

// 「9月12日 周五」：优先用后端返回的年月日，否则只显示星期
const dateLabel = computed(() => {
  const { year, month, day } = appointParams.value
  if (typeof year === 'number' && typeof month === 'number' && typeof day === 'number')
    return formatChineseDate(new Date(year, month - 1, day))
  return weekdayLabel(WEEKDAY_INDEX[weekday.value])
})

// 起止时间：优先后端 starttime/endtime，否则解析 query 里的 timestr
const timeBounds = computed<{ start: string, end: string } | null>(() => {
  const { starttime, endtime } = appointParams.value
  if (typeof starttime === 'string' && typeof endtime === 'string')
    return { start: starttime, end: endtime }
  const matched = timestr.value.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/)
  return matched ? { start: matched[1], end: matched[2] } : null
})

const timeRangeLabel = computed(() => {
  const bounds = timeBounds.value
  return bounds ? `${bounds.start}–${bounds.end}` : timestr.value
})

function toMinutes(time: string): number {
  const [hh, mm] = time.split(':').map(Number)
  return (hh || 0) * 60 + (mm || 0)
}

const durationText = computed(() => {
  const bounds = timeBounds.value
  if (!bounds)
    return ''
  const minutes = Math.abs(toMinutes(bounds.end) - toMinutes(bounds.start))
  if (minutes === 0)
    return ''
  if (minutes < 60)
    return `${minutes} 分钟`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`
})

// 间隔选项（value 为后端约定的周期编号：1 每周、2 每 2 周…）
const intervalOptions = [
  { label: '每周', value: 1, summary: '每周一次' },
  { label: '每 2 周', value: 2, summary: '每 2 周一次' },
  { label: '每 3 周', value: 3, summary: '每 3 周一次' },
  { label: '每 4 周', value: 4, summary: '每 4 周一次' },
]

const intervalLabel = computed(() => {
  const option = intervalOptions.find(opt => opt.value === formData.interval)
  return option ? option.summary : ''
})

// 长期预约按星期重复：「周五」
const weekdayText = computed(() => weekdayLabel(WEEKDAY_INDEX[weekday.value]))

// 获取页面参数
onLoad((options) => {
  if (options) {
    Rid.value = options.Rid || ''
    startid.value = Number(options.startid) || 0
    endid.value = Number(options.endid) || 0
    weekday.value = (options.weekday as Weekday) || 'Mon'
    startWeek.value = Number(options.start_week) === 1 ? 1 : 0
    timestr.value = options.timestr || ''
  }
  fetchData()
})

async function fetchData() {
  loading.value = true
  try {
    const res = await getCheckoutInfo({
      Rid: Rid.value,
      startid: startid.value,
      endid: endid.value,
      weekday: weekday.value,
      start_week: startWeek.value,
    })
    data.value = res
    loadError.value = null

    // 初始化已有成员，member_ids 格式: ["user1", "ztr"]
    if (res.member_ids && Array.isArray(res.member_ids)) {
      formData.students = res.member_ids.map((id: string) => String(id))
    }
  }
  catch (error) {
    // 首屏失败只显示页内错误 + 重试
    loadError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    loading.value = false
  }
}

// 添加成员（从搜索结果选择）
function addStudentFromSearch(user: ISearchUserItem) {
  const id = String(user.id)
  if (formData.students.includes(id)) {
    showMessage('该成员已添加', 'warning')
    return
  }
  formData.students.push(id)
  clearFieldError('students')
  memberNames.value[id] = user.name
  searchQuery.value = ''
  searchResults.value = []
}

// 处理外院人数输入
function onNonYpNumInput(e: { detail: { value: string } }) {
  const val = Number.parseInt(e.detail.value) || 0
  formData.non_yp_num = Math.max(0, Math.min(val, maxPeople.value))
  clearFieldError('non_yp_num')
}

// 移除成员
function removeStudent(id: string) {
  const index = formData.students.indexOf(id)
  if (index > -1) {
    formData.students.splice(index, 1)
    delete memberNames.value[id]
  }
}

// 一键添加所有可用成员，member_ids 格式: ["user1", "ztr"]，并通过搜索解析姓名
async function addAllMembers() {
  const memberIds = data.value?.member_ids || []
  const toAdd = memberIds
    .map(id => String(id))
    .filter(sid => !formData.students.includes(sid))
  if (toAdd.length === 0) {
    showMessage('没有可添加的成员')
    return
  }
  toAdd.forEach(sid => formData.students.push(sid))
  // 通过 searchUsers 按 id 解析姓名，避免列表显示 id
  try {
    const results = await Promise.all(
      toAdd.map(sid =>
        searchUsers({ query: sid, limit: 10 }).then((list) => {
          const user = list.find(u => String(u.id) === sid)
          return { sid, name: user ? user.name : sid }
        }),
      ),
    )
    results.forEach(({ sid, name }) => {
      memberNames.value[sid] = name
    })
    clearFieldError('students')
    showMessage(`已添加 ${toAdd.length} 人`, 'success')
  }
  catch (error) {
    handleApiException(error)
  }
}

// 清空所有成员（先确认）
async function clearAllMembers() {
  const count = formData.students.length
  const ok = await confirm({
    title: '清空成员',
    content: `将移除已添加的 ${count} 位成员。`,
    confirmText: '清空成员',
    cancelText: '保留成员',
    danger: true,
  })
  if (!ok)
    return
  formData.students = []
  memberNames.value = {}
}

function selectInterval(value: number) {
  formData.interval = value
  clearFieldError('interval')
}

function stepTimes(delta: number) {
  formData.times = Math.max(2, Math.min(16, formData.times + delta))
  clearFieldError('times')
}

function onStartWeekChange(value: boolean) {
  startWeek.value = value ? 1 : 0
  clearFieldError('start_week')
}

function openAgreement() {
  uni.navigateTo({ url: '/pages/appoint/agreement' })
}

// 提交预约
async function submitAppoint() {
  if (submitting.value)
    return

  // 本地校验：只用字段内联错误，不叠加 toast
  if (!formData.Ausage.trim()) {
    setFieldError('Ausage', '请填写预约用途', 'required')
    return
  }
  if (!isPeopleValid.value) {
    setFieldError('students', `人数需在 ${minPeople.value}–${maxPeople.value} 人之间`, 'invalid_count')
    return
  }

  submitting.value = true
  try {
    const requestData: ICheckoutAppointRequest = {
      Rid: Rid.value,
      weekday: weekday.value,
      startid: startid.value,
      endid: endid.value,
      Ausage: formData.Ausage.trim(),
      announcement: formData.announcement.trim() || undefined,
      non_yp_num: formData.non_yp_num,
      students: formData.students,
    }

    // 长期预约参数
    if (isLongterm.value) {
      requestData.longterm = true
      requestData.start_week = startWeek.value
      requestData.times = formData.times
      requestData.interval = formData.interval
    }

    // 面试预约参数
    if (formData.interview && hasInterviewPermission.value) {
      requestData.interview = true
    }

    await createAppoint(requestData)

    showMessage(isLongterm.value ? '已提交审核' : '预约成功', 'success')
    // 返回房间列表
    setTimeout(() => {
      uni.navigateBack({ delta: 2 })
    }, 800)
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <uv-toast ref="toastRef" />

  <PageState :loading="loading && !data" :error="loadError" @retry="fetchData">
    <view v-if="data" class="yp-page px-4 py-3 pb-48">
      <!-- 预约摘要 -->
      <view class="yp-card-flat">
        <view class="yp-section-title">
          预约摘要
        </view>
        <view class="mt-3 flex flex-col gap-2 text-sm">
          <view class="flex gap-3">
            <text class="w-140rpx shrink-0 text-fg-3">场地</text>
            <text class="flex-1 text-fg-1">{{ room?.Rid }} {{ room?.Rtitle }}</text>
          </view>
          <view class="flex gap-3">
            <text class="w-140rpx shrink-0 text-fg-3">日期与时段</text>
            <view class="flex-1 text-fg-1">
              <text v-if="isLongterm">{{ weekdayText }} {{ timeRangeLabel }}</text>
              <text v-else>{{ dateLabel }} {{ timeRangeLabel }}</text>
              <view v-if="isLongterm" class="text-xs text-fg-2">
                {{ intervalLabel }} · 共 {{ formData.times }} 次 · {{ startWeek === 1 ? '下周开始' : '本周开始' }}
              </view>
            </view>
          </view>
          <view v-if="durationText" class="flex gap-3">
            <text class="w-140rpx shrink-0 text-fg-3">时长</text>
            <text class="flex-1 text-fg-1">{{ durationText }}</text>
          </view>
          <view class="flex gap-3">
            <text class="w-140rpx shrink-0 text-fg-3">人数</text>
            <view class="flex-1">
              <text class="text-fg-1">{{ totalPeople }} 人（本院 {{ ypNum }} · 外院 {{ formData.non_yp_num }}）</text>
              <view class="text-xs" :class="isPeopleValid ? 'text-fg-3' : 'text-warning'">
                需 {{ minPeople }}–{{ maxPeople }} 人
              </view>
            </view>
          </view>
          <view class="flex gap-3">
            <text class="w-140rpx shrink-0 text-fg-3">用途</text>
            <text class="flex-1" :class="formData.Ausage.trim() ? 'text-fg-1' : 'text-fg-3'">
              {{ formData.Ausage.trim() || '未填写' }}
            </text>
          </view>
        </view>
      </view>

      <!-- 预约模式：长期 / 面试 -->
      <view v-if="hasLongtermPermission || (hasInterviewPermission && !isLongterm)" class="mt-3 yp-card-flat">
        <view v-if="hasLongtermPermission" class="flex items-center justify-between gap-3">
          <view class="min-w-0 flex-1">
            <view class="text-base text-fg-1">
              长期预约
            </view>
            <view class="text-xs text-fg-3">
              按固定周期重复预约，提交后需审核
            </view>
          </view>
          <uv-switch v-model="isLongterm" size="22" :active-color="tokens.primary" />
        </view>

        <template v-if="hasLongtermPermission && isLongterm">
          <view class="my-3 yp-divider" />
          <FormField label="间隔周期" layout="horizontal" :messages="getFieldMessages('interval')">
            <view class="flex flex-wrap justify-end gap-2">
              <view
                v-for="opt in intervalOptions"
                :key="opt.value"
                class="btn-sm"
                :class="formData.interval === opt.value ? 'btn-secondary' : 'btn-outline'"
                @click="selectInterval(opt.value)"
              >
                {{ opt.label }}
              </view>
            </view>
          </FormField>
          <FormField label="预约次数" layout="horizontal" :messages="getFieldMessages('times')">
            <view class="flex items-center justify-end gap-3">
              <view
                class="h-72rpx w-72rpx flex items-center justify-center rounded-md bg-fill active:bg-fill-active"
                :class="{ 'opacity-50': formData.times <= 2 }"
                @click="stepTimes(-1)"
              >
                <view class="i-carbon-subtract text-fg-2" />
              </view>
              <text class="min-w-96rpx text-center text-base text-fg-1 font-medium">{{ formData.times }} 次</text>
              <view
                class="h-72rpx w-72rpx flex items-center justify-center rounded-md bg-fill active:bg-fill-active"
                :class="{ 'opacity-50': formData.times >= 16 }"
                @click="stepTimes(1)"
              >
                <view class="i-carbon-add text-fg-2" />
              </view>
            </view>
          </FormField>
          <FormField label="开始周次" layout="horizontal" :hint="startWeek === 1 ? '从下周开始预约' : '从本周开始预约'" :messages="getFieldMessages('start_week')">
            <view class="flex items-center justify-end gap-2">
              <text class="text-sm" :class="startWeek === 0 ? 'text-fg-1 font-medium' : 'text-fg-3'">本周</text>
              <uv-switch :model-value="startWeek === 1" size="22" :active-color="tokens.primary" @change="onStartWeekChange" />
              <text class="text-sm" :class="startWeek === 1 ? 'text-fg-1 font-medium' : 'text-fg-3'">下周</text>
            </view>
          </FormField>
        </template>

        <view v-if="hasLongtermPermission && hasInterviewPermission && !isLongterm" class="my-3 yp-divider" />

        <view v-if="hasInterviewPermission && !isLongterm" class="flex items-center justify-between gap-3">
          <view class="min-w-0 flex-1">
            <view class="text-base text-fg-1">
              面试预约模式
            </view>
            <view class="text-xs text-fg-3">
              开启后可为面试候选人预约（最多 {{ interviewMaxCount }} 人）
            </view>
          </view>
          <uv-switch v-model="formData.interview" size="22" :active-color="tokens.primary" />
        </view>
      </view>

      <!-- 用途与通知 -->
      <view class="mt-3 yp-card-flat">
        <FormField label="预约用途" required :hint="`${formData.Ausage.length}/100`" :messages="getFieldMessages('Ausage')">
          <textarea
            v-model="formData.Ausage"
            class="yp-input min-h-160rpx py-2"
            :maxlength="100"
            placeholder="如：小组讨论、项目会议"
            :placeholder-style="`color: ${tokens.text3}`"
            :auto-height="true"
            @input="clearFieldError('Ausage')"
          />
        </FormField>
        <FormField label="预约通知" hint="选填，给其他成员的提醒" :messages="getFieldMessages('announcement')">
          <textarea
            v-model="formData.announcement"
            class="yp-input min-h-120rpx py-2"
            :maxlength="200"
            placeholder="给其他成员的提醒信息"
            :placeholder-style="`color: ${tokens.text3}`"
            :auto-height="true"
          />
        </FormField>
      </view>

      <!-- 人数 -->
      <view class="mt-3 yp-card-flat">
        <FormField label="本院人数" layout="horizontal">
          <view class="min-h-88rpx flex items-center justify-end text-base text-fg-1">
            {{ ypNum }} 人（含发起人）
          </view>
        </FormField>
        <FormField label="外院人数" layout="horizontal" :messages="getFieldMessages('non_yp_num')">
          <view class="flex items-center justify-end gap-2">
            <input
              type="number"
              :value="String(formData.non_yp_num)"
              class="yp-input w-160rpx text-center"
              placeholder="0"
              :placeholder-style="`color: ${tokens.text3}`"
              @input="onNonYpNumInput"
            >
            <text class="text-sm text-fg-2">人</text>
          </view>
        </FormField>
      </view>

      <!-- 本院成员 -->
      <view class="mt-3 yp-card-flat">
        <FormField label="本院成员" hint="搜索学号或姓名添加预约参与者" :messages="getFieldMessages('students')">
          <!-- 一键添加 / 清空（长期预约权限用户可见） -->
          <view v-if="hasLongtermPermission && data.member_ids?.length" class="mb-2 flex justify-end gap-2">
            <view v-if="memberList.length > 0" class="btn-outline btn-sm" @click="clearAllMembers">
              清空
            </view>
            <view class="btn-secondary btn-sm" @click="addAllMembers">
              一键添加
            </view>
          </view>

          <!-- 搜索框 -->
          <view class="yp-input flex items-center gap-2">
            <view class="i-carbon-search shrink-0 text-fg-3" />
            <input
              v-model="searchQuery"
              class="min-w-0 flex-1 bg-transparent text-base text-fg-1"
              placeholder="输入学号或姓名搜索"
              :placeholder-style="`color: ${tokens.text3}`"
            >
            <view
              v-if="searchQuery"
              class="h-64rpx w-64rpx flex shrink-0 items-center justify-center"
              @click="searchQuery = ''"
            >
              <view class="i-carbon-close-filled text-fg-3" />
            </view>
          </view>

          <!-- 搜索结果 -->
          <view v-if="searchQuery.trim()" class="mt-2 overflow-hidden border border-line rounded-md">
            <view v-if="searchLoading" class="flex items-center justify-center gap-2 py-4">
              <uv-loading-icon mode="circle" size="18" :color="tokens.primary" />
              <text class="text-sm text-fg-3">搜索中…</text>
            </view>
            <template v-else-if="searchResults.length > 0">
              <view
                v-for="user in searchResults"
                :key="user.id"
                class="yp-list-item justify-between px-3"
                @click="addStudentFromSearch(user)"
              >
                <view class="min-w-0 flex-1">
                  <view class="text-sm text-fg-1">
                    {{ user.name }}
                  </view>
                  <view class="text-xs text-fg-3">
                    {{ user.id }}
                  </view>
                </view>
                <view class="i-carbon-add-alt text-lg text-primary" />
              </view>
            </template>
            <view v-else class="py-4 text-center text-sm text-fg-3">
              没有找到匹配的成员
            </view>
          </view>

          <!-- 已添加成员列表 -->
          <view v-if="memberList.length > 0" class="mt-3">
            <view class="mb-2 text-xs text-fg-3">
              已添加 {{ memberList.length }} 人
            </view>
            <view class="flex flex-wrap gap-2">
              <view
                v-for="member in memberList"
                :key="member.id"
                class="flex items-center gap-1 rounded-full bg-primary-light py-1 pl-3 pr-1"
              >
                <text class="text-sm text-primary">{{ member.name }}</text>
                <view
                  class="h-56rpx w-56rpx flex items-center justify-center rounded-full active:opacity-70"
                  @click="removeStudent(member.id)"
                >
                  <view class="i-carbon-close text-xs text-primary" />
                </view>
              </view>
            </view>
          </view>
          <view v-else class="mt-3 text-center text-sm text-fg-3">
            还没有添加其他成员
          </view>
        </FormField>
      </view>

      <!-- 须知 -->
      <view class="mt-3 flex items-center justify-between gap-3 yp-card-flat active:bg-fill" @click="openAgreement">
        <view class="min-w-0 flex-1">
          <view class="text-sm text-fg-1">
            预约须知
          </view>
          <view class="text-xs text-fg-3">
            开始时间前后 15 分钟内无人刷卡使用，或到场人数不足，将扣除信用分
          </view>
        </view>
        <view class="i-carbon-chevron-right shrink-0 text-fg-4" />
      </view>
      <!-- 底部固定栏的安全区占位 -->
      <view class="pb-safe" />
    </view>
  </PageState>

  <!-- 提交按钮区域 -->
  <view v-if="data" class="fixed bottom-0 left-0 right-0 z-50 bg-card px-4 pt-3 shadow-float pb-safe-3">
    <view v-if="isLongterm" class="mb-2 text-center text-xs text-fg-3">
      长期预约将提交审核，通过后生效
    </view>
    <view v-else-if="formData.interview" class="mb-2 text-center text-xs text-fg-3">
      面试预约模式已开启
    </view>
    <button
      class="btn-primary btn-block"
      :loading="submitting"
      :disabled="!canSubmit || submitting"
      @click="submitAppoint"
    >
      {{ isLongterm ? '提交审核' : '确认预约' }}
    </button>
  </view>
</template>
