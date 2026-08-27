<script lang="ts" setup>
import type { ICheckoutAppointRequest, ICheckoutInfoResponse, ISearchUserItem } from '@/api/types/appoint'
import type { UvToastInstance } from '@/hooks/useApiException'
import { createAppoint, getCheckoutInfo, searchUsers } from '@/api/appoint'
import ApiFieldError from '@/components/ApiFieldError.vue'
import { useApiException } from '@/hooks/useApiException'

definePage({
  style: {
    navigationStyle: 'custom',
    navigationBarTitleText: '预约',
  },
})

// URL 参数
const Rid = ref<string>('')
const startid = ref<number>(0)
const endid = ref<number>(0)
const weekday = ref<'Fri' | 'Mon' | 'Sat' | 'Sun' | 'Thu' | 'Tue' | 'Wed'>('Mon')
const isLongterm = ref<boolean>(false)
const startWeek = ref<0 | 1>(0)
const timestr = ref<string>('')

// 页面状态
const loading = ref(false)
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

// 间隔选项
const intervalOptions = [
  { label: '每周', value: 1 },
  { label: '1周', value: 2 },
  { label: '2周', value: 3 },
  { label: '3周', value: 4 },
]

// 次数选项
const timesOptions = computed(() => {
  const options = []
  for (let i = 2; i <= 16; i++) {
    options.push({ label: `${i} 次`, value: i })
  }
  return options
})

// 获取页面参数
onLoad((options) => {
  if (options) {
    Rid.value = options.Rid || ''
    startid.value = Number(options.startid) || 0
    endid.value = Number(options.endid) || 0
    weekday.value = (options.weekday as typeof weekday.value) || 'Mon'
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
    console.log(data.value)

    // 初始化已有成员，member_ids 格式: ["user1", "ztr"]
    if (res.member_ids && Array.isArray(res.member_ids)) {
      formData.students = res.member_ids.map((id: string) => String(id))
    }
    console.log(formData.students)
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
  }
  finally {
    loading.value = false
  }
}

// 添加成员（从搜索结果选择）
function addStudentFromSearch(user: ISearchUserItem) {
  const id = String(user.id)
  if (formData.students.includes(id)) {
    showMessage('该成员已添加。', 'warning')
    return
  }
  formData.students.push(id)
  clearFieldError('students')
  memberNames.value[id] = user.name
  searchQuery.value = ''
  searchResults.value = []
}

// 有内容时结果区一直展示，不收起到 onSearchBlur；仅当清空搜索框时收起

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
    showMessage('没有可添加的成员。')
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
    showMessage(`已添加 ${toAdd.length} 人。`, 'success')
  }
  catch (error) {
    handleApiException(error)
  }
}

// 清空所有成员
function clearAllMembers() {
  formData.students = []
  memberNames.value = {}
}

// 提交预约
async function submitAppoint() {
  if (submitting.value)
    return

  // 验证
  if (!formData.Ausage.trim()) {
    setFieldError('Ausage', '请填写预约用途。', 'required')
    showMessage('请检查预约表单。', 'warning')
    return
  }
  if (!isPeopleValid.value) {
    setFieldError('students', `人数需在 ${minPeople.value}-${maxPeople.value} 人之间。`, 'invalid_count')
    showMessage('请检查预约人数。', 'warning')
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

    showMessage(isLongterm.value ? '已提交审核。' : '预约成功。', 'success')
    // 返回上一页或跳转到我的预约
    setTimeout(() => {
      uni.navigateBack({ delta: 2 })
    }, 1500)
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
  }
  finally {
    submitting.value = false
  }
}

function goBack() {
  uni.navigateBack()
}
</script>

<template>
  <!-- 自定义导航栏 -->
  <uv-navbar
    title="填写预约信息"
    :safe-area-inset-top="true"
    :placeholder="true"
    left-icon="arrow-left"
    @left-click="goBack"
  />
  <uv-toast ref="toastRef" />
  <!-- 加载状态 -->
  <view v-if="loading" class="flex items-center justify-center py-20">
    <uv-loading-icon mode="circle" />
  </view>

  <view v-else-if="data" class="min-h-screen bg-gray-50 pb-safe">
    <!-- 房间信息卡片 -->
    <view class="mx-3 mt-3 rounded-lg bg-white p-4 shadow-sm">
      <view class="flex items-start justify-between">
        <view>
          <view class="text-lg text-gray-800 font-bold">
            {{ room?.Rtitle }}
          </view>
          <view class="mt-1 text-sm text-gray-500">
            {{ room?.Rid }} · {{ room?.Rmin }}-{{ room?.Rmax }}人
          </view>
        </view>
        <view v-if="hasLongtermPermission">
          <text class="mr-2 text-gray-500">长期预约</text>
          <wd-switch v-model="isLongterm" size="20px" />
        </view>
      </view>

      <!-- 预约时间信息 -->
      <view class="mt-3 border-t border-gray-100 pt-3">
        <view class="flex items-center text-sm text-gray-600">
          <div class="i-carbon-calendar mr-2 text-blue-500" />
          <text>{{ weekday }}</text>
          <text v-if="appointParams.date" class="ml-2 text-gray-400">{{ appointParams.date }}</text>
        </view>
        <view class="mt-1 flex items-center text-sm text-gray-600">
          <div class="i-carbon-time mr-2 text-blue-500" />
          <text>{{ timestr }}</text>
        </view>
      </view>
    </view>

    <!-- 面试预约开关（如果有权限） -->
    <view v-if="hasInterviewPermission && !isLongterm" class="mx-3 mt-3 rounded-lg bg-white p-4 shadow-sm">
      <view class="flex items-center justify-between">
        <view>
          <view class="text-base text-gray-800 font-medium">
            面试预约模式
          </view>
          <view class="mt-1 text-xs text-gray-500">
            开启后可为面试候选人预约（最多 {{ interviewMaxCount }} 人）
          </view>
        </view>
        <wd-switch v-model="formData.interview" size="20px" />
      </view>
    </view>

    <!-- 长期预约额外字段 -->
    <view v-if="isLongterm" class="mx-3 mt-3 rounded-lg bg-white shadow-sm">
      <view class="border-b border-gray-100 px-4 py-3">
        <view class="text-base text-gray-800 font-medium">
          长期预约设置
        </view>
        <view class="mt-1 text-xs text-gray-500">
          设置预约重复周期和次数
        </view>
      </view>

      <!-- 间隔周期 -->
      <view class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <view class="text-sm text-gray-700">
          间隔周期
        </view>
        <view class="flex items-center gap-2">
          <view
            v-for="opt in intervalOptions"
            :key="opt.value"
            class="rounded-full px-3 py-1 text-xs"
            :class="formData.interval === opt.value
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600'"
            @click="formData.interval = opt.value; clearFieldError('interval')"
          >
            {{ opt.label }}
          </view>
        </view>
      </view>
      <ApiFieldError class="px-4" :messages="getFieldMessages('interval')" />

      <!-- 预约次数 -->
      <view class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <view class="text-sm text-gray-700">
          预约次数
        </view>
        <view class="flex items-center gap-2">
          <view
            class="h-8 w-8 flex items-center justify-center rounded-full bg-gray-100"
            @click="formData.times > 2 && formData.times--; clearFieldError('times')"
          >
            <div class="i-carbon-subtract text-gray-600" />
          </view>
          <view class="min-w-12 text-center text-base text-gray-800 font-medium">
            {{ formData.times }} 次
          </view>
          <view
            class="h-8 w-8 flex items-center justify-center rounded-full bg-gray-100"
            @click="formData.times < 16 && formData.times++; clearFieldError('times')"
          >
            <div class="i-carbon-add text-gray-600" />
          </view>
        </view>
      </view>
      <ApiFieldError class="px-4" :messages="getFieldMessages('times')" />

      <!-- 开始周次 -->
      <view class="flex items-center justify-between px-4 py-3">
        <view>
          <view class="text-sm text-gray-700">
            开始周次
          </view>
          <view class="mt-0.5 text-xs text-gray-400">
            {{ startWeek === 1 ? '从下周开始预约' : '从本周开始预约' }}
          </view>
        </view>
        <view class="flex items-center gap-2">
          <text class="text-sm" :class="startWeek === 0 ? 'text-blue-600 font-medium' : 'text-gray-400'">本周</text>
          <wd-switch :model-value="startWeek === 1" size="20px" @change="startWeek = $event.value ? 1 : 0; clearFieldError('start_week')" />
          <text class="text-sm" :class="startWeek === 1 ? 'text-blue-600 font-medium' : 'text-gray-400'">下周</text>
        </view>
      </view>
      <ApiFieldError class="px-4" :messages="getFieldMessages('start_week')" />
    </view>

    <!-- 预约用途 -->
    <view class="mx-3 mt-3 rounded-lg bg-white shadow-sm">
      <view class="border-b border-gray-100 px-4 py-3">
        <view class="flex items-center justify-between">
          <view class="text-sm text-gray-700">
            预约用途
            <text class="text-red-500">*</text>
          </view>
          <view class="text-xs text-gray-400">
            {{ formData.Ausage.length }}/100
          </view>
        </view>
        <textarea
          v-model="formData.Ausage"
          class="mt-2 w-full rounded-lg bg-gray-50 px-3 py-2 text-sm"
          :maxlength="100"
          placeholder="请简要描述预约用途，如：小组讨论、项目会议等"
          :auto-height="true"
          :style="{ minHeight: '80px' }"
          @input="clearFieldError('Ausage')"
        />
        <ApiFieldError :messages="getFieldMessages('Ausage')" />
      </view>
      <!-- 预约通知（可选） -->
      <view class="px-4 py-3">
        <view class="flex items-center justify-between">
          <view class="text-sm text-gray-700">
            预约通知
          </view>
          <view class="text-xs text-gray-400">
            选填
          </view>
        </view>
        <textarea
          v-model="formData.announcement"
          class="mt-2 w-full rounded-lg bg-gray-50 px-3 py-2 text-sm"
          :maxlength="200"
          placeholder="给其他成员的提醒信息（选填）"
          :auto-height="true"
          :style="{ minHeight: '60px' }"
        />
      </view>
      <ApiFieldError class="px-4" :messages="getFieldMessages('non_yp_num')" />
    </view>

    <!-- 预约人数 -->
    <view class="mx-3 mt-3 rounded-lg bg-white shadow-sm">
      <view class="border-b border-gray-100 px-4 py-3">
        <view class="flex items-center justify-between">
          <view class="text-base text-gray-800 font-medium">
            预约人数
          </view>
          <view
            class="text-xs"
            :class="isPeopleValid ? 'text-green-600' : 'text-red-500'"
          >
            当前 {{ totalPeople }} 人（需 {{ minPeople }}-{{ maxPeople }} 人）
          </view>
        </view>
      </view>

      <!-- 本院人数（只读，显示已添加成员数+自己） -->
      <view class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <view class="text-sm text-gray-700">
          本院人数
        </view>
        <view class="text-sm text-gray-800 font-medium">
          {{ ypNum }} 人（含发起人）
        </view>
      </view>

      <!-- 外院人数 -->
      <view class="flex items-center justify-between px-4 py-3">
        <view class="text-sm text-gray-700">
          外院人数
        </view>
        <view class="flex items-center">
          <input
            type="number"
            :value="String(formData.non_yp_num)"
            class="w-16 rounded-lg bg-gray-50 px-3 py-1.5 text-center text-sm"
            placeholder="0"
            @input="onNonYpNumInput"
          >
          <text class="ml-2 text-sm text-gray-500">人</text>
        </view>
      </view>
    </view>

    <!-- 添加成员 -->
    <view class="mx-3 mt-3 rounded-lg bg-white shadow-sm">
      <view class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <view>
          <view class="text-base text-gray-800 font-medium">
            添加本院成员
          </view>
          <view class="mt-1 text-xs text-gray-500">
            搜索学号或姓名添加预约参与者
          </view>
        </view>
        <!-- 一键添加按钮（长期预约权限用户可见） -->
        <view v-if="hasLongtermPermission && data?.member_ids?.length" class="flex items-center gap-2">
          <view
            v-if="memberList.length > 0"
            class="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-600 active:bg-gray-200"
            @click="clearAllMembers"
          >
            清空
          </view>
          <view
            class="rounded-full bg-blue-500 px-3 py-1.5 text-xs text-white active:bg-blue-600"
            @click="addAllMembers"
          >
            一键添加
          </view>
        </view>
      </view>

      <!-- 搜索框 -->
      <view class="relative border-b border-gray-100 px-4 py-3">
        <view class="flex items-center rounded-lg bg-gray-50 px-3">
          <div class="i-carbon-search mr-2 text-gray-400" />
          <input
            v-model="searchQuery"
            class="flex-1 bg-transparent py-2 text-sm"
            placeholder="输入学号或姓名搜索"
          >
          <div
            v-if="searchQuery"
            class="i-carbon-close-filled text-gray-400"
            @click="searchQuery = ''"
          />
        </view>

        <!-- 搜索加载中（向上弹出，避免被键盘遮挡）；有内容时一直展示 -->
        <view
          v-if="searchQuery.trim() && searchLoading"
          class="absolute bottom-full left-4 right-4 z-20 mb-1 border border-gray-200 rounded-lg bg-white px-4 py-4 text-center shadow-lg"
        >
          <uv-loading-icon mode="circle" size="20" />
          <text class="ml-2 text-sm text-gray-400">搜索中...</text>
        </view>

        <!-- 搜索结果（向上弹出，避免被键盘遮挡） -->
        <view
          v-else-if="searchQuery.trim() && searchResults.length > 0"
          class="absolute bottom-full left-4 right-4 z-20 mb-1 max-h-60 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg"
        >
          <view
            v-for="user in searchResults"
            :key="user.id"
            class="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-b-0 active:bg-gray-50"
            @click="addStudentFromSearch(user)"
          >
            <view class="flex-1">
              <view class="text-sm text-gray-800 font-medium">
                {{ user.name }}
              </view>
              <view class="mt-0.5 text-xs text-gray-500">
                {{ user.id }}
              </view>
            </view>
            <div class="i-carbon-add-alt text-lg text-blue-500" />
          </view>
        </view>

        <!-- 无搜索结果 -->
        <view
          v-else-if="searchQuery.trim() && !searchLoading && searchResults.length === 0"
          class="absolute bottom-full left-4 right-4 z-20 mb-1 border border-gray-200 rounded-lg bg-white px-4 py-6 text-center shadow-lg"
        >
          <div class="i-carbon-search mx-auto mb-2 text-2xl text-gray-300" />
          <text class="text-sm text-gray-400">未找到匹配的成员</text>
        </view>
      </view>

      <!-- 已添加成员列表 -->
      <view v-if="memberList.length > 0" class="px-4 py-3">
        <view class="mb-2 text-xs text-gray-500">
          已添加成员（{{ memberList.length }} 人）
        </view>
        <view class="flex flex-wrap gap-2">
          <view
            v-for="member in memberList"
            :key="member.id"
            class="flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-1"
          >
            <text class="text-sm text-blue-700">{{ member.name }}</text>
            <view
              class="h-5 w-5 flex items-center justify-center rounded-full bg-blue-200"
              @click="removeStudent(member.id)"
            >
              <div class="i-carbon-close text-xs text-blue-600" />
            </view>
          </view>
        </view>
      </view>

      <view v-else class="px-4 py-4 text-center text-sm text-gray-400">
        暂未添加其他成员
      </view>
      <ApiFieldError class="px-4 pb-3" :messages="getFieldMessages('students')" />
    </view>

    <!-- 提交按钮区域 -->
    <view class="fixed bottom-0 left-0 right-0 z-50 bg-white px-4 pt-3 pb-safe shadow-lg">
      <!-- 提示信息 -->
      <view v-if="isLongterm" class="mb-2 text-center text-xs text-orange-600">
        长期预约将提交审核，通过后生效
      </view>
      <view v-if="formData.interview" class="mb-2 text-center text-xs text-purple-600">
        面试预约模式已开启
      </view>

      <uv-button
        type="primary"
        shape="circle"
        :loading="submitting"
        :disabled="!canSubmit || submitting"
        @click="submitAppoint"
      >
        {{ submitting ? '提交中...' : (isLongterm ? '提交审核' : '确认预约') }}
      </uv-button>
    </view>

    <!-- 底部占位 -->
    <view class="h-24" />
  </view>

  <!-- 无数据状态 -->
  <view v-else class="flex flex-col items-center justify-center py-20">
    <text class="text-gray-400">加载失败</text>
    <view class="mt-4 w-32">
      <uv-button type="primary" shape="circle" @click="fetchData">
        重新加载
      </uv-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
// 安全区域底部内边距
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

// textarea 样式
textarea {
  width: 100%;
  font-size: 14px;
  line-height: 1.5;
}
</style>
