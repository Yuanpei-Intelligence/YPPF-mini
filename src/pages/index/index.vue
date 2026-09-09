<script lang="ts" setup>
import type { IActivityHomepage, IActivitySummary } from '@/api/types/activity'
import type { AgendaDay, AgendaOut } from '@/api/types/agenda'
import type { ICarouselItem } from '@/api/types/carousel'
import type { Notification } from '@/api/types/notification'
import type { Occurrence, Settings } from '@/api/types/timetable'
import type { UvToastInstance } from '@/hooks/useApiException'
import { computed, onMounted, ref } from 'vue'
import { getActivityOverview } from '@/api/activity'
import { getAgenda } from '@/api/agenda'
import { getCarouselList } from '@/api/carousel'
import { everydaySignIn, getUserMe } from '@/api/login'
import { listNotifications } from '@/api/notification'
import { getSettings, updateSettings } from '@/api/timetable'
import { NotificationStatus } from '@/api/types/notification'
import ActivityCard from '@/components/ActivityCard.vue'
import AgendaList from '@/components/AgendaList.vue'
import { useApiException } from '@/hooks/useApiException'
import { usePageRefresh } from '@/hooks/usePageRefresh'
import { toBackendURL } from '@/utils'
import { readLocalHiddenIds, suspendsClasses } from '@/utils/timetable'
import { openWebview } from '@/utils/webview'

defineOptions({
  name: 'Home',
})
definePage({
  // 使用 type: "home" 属性设置首页，其他页面不需要设置，默认为page
  type: 'home',
  style: {
    // 'custom' 表示开启自定义导航栏，默认 'default'
    navigationStyle: 'custom',
    navigationBarTitleText: '首页',
  },
})

type HomeTabKey = 'agenda' | 'feed'

/** 日程来源开关，键为课表设置里的字段（timetable/README.md §6.5） */
type SourceKey = 'show_courses' | 'show_college' | 'show_activities' | 'show_appointments'

interface FeedActivityItem {
  key: string
  type: 'activity'
  time: number
  activity: IActivitySummary
}

interface FeedNotificationItem {
  key: string
  type: 'notification'
  time: number
  notification: Notification
}

type FeedItem = FeedActivityItem | FeedNotificationItem

/** 首页日程覆盖今天起的天数 */
const AGENDA_DAYS = 7
/** 「最新发布」里最多合并的未读通知条数 */
const FEED_NOTIFICATION_LIMIT = 10

const SOURCE_CHIPS: { key: SourceKey, label: string }[] = [
  { key: 'show_courses', label: '课表' },
  { key: 'show_college', label: '书院课' },
  { key: 'show_activities', label: '活动' },
  { key: 'show_appointments', label: '预约' },
]

const homeTabs: { name: string, key: HomeTabKey }[] = [
  { name: '我的日程', key: 'agenda' },
  { name: '最新发布', key: 'feed' },
]

const notifyRef = ref()
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
const carouselList = ref<ICarouselItem[]>([])
const carouselLoading = ref(true)

const homeTab = ref(0)
const currentTabKey = computed<HomeTabKey>(() => homeTabs[homeTab.value]?.key ?? 'agenda')

function onHomeTabChange(params: { index: number }) {
  homeTab.value = params.index
}

/* -------------------- 我的日程 -------------------- */

const agenda = ref<AgendaOut | null>(null)
const agendaLoading = ref(true)
/** 首屏日程加载失败的页内错误；已有数据时失败只 toast */
const agendaError = ref('')
const settings = ref<Settings | null>(null)
const savingSource = ref<Partial<Record<SourceKey, boolean>>>({})
const localHiddenIds = ref<string[]>(readLocalHiddenIds())

/** 课表页里本机隐藏的日程（没有 entry_id 的书院课 / 活动 / 预约）在首页同样不显示 */
const agendaDays = computed<AgendaDay[]>(() => {
  const hidden = new Set(localHiddenIds.value)
  return (agenda.value?.days ?? []).map(day => ({
    ...day,
    occurrences: day.occurrences.filter(item => !item.hidden && !hidden.has(item.id)),
  }))
})

/** 尚未升级到 show_courses 的后端不返回该字段，缺失时按开启处理 */
function sourceEnabled(key: SourceKey): boolean {
  return settings.value?.[key] ?? true
}

/** 整个窗口都停课（放假 / 考试周）时用校历原因代替默认文案 */
const agendaEmptyText = computed(() => {
  const days = agendaDays.value
  if (!days.length)
    return '这几天没有日程'
  const reasons: string[] = []
  for (const day of days) {
    if (!suspendsClasses(day.kind))
      return '这几天没有日程'
    const reason = day.label || (day.kind === 'exam' ? '考试周' : '放假')
    if (!reasons.includes(reason))
      reasons.push(reason)
  }
  return reasons.join(' · ')
})

const agendaEmptyHint = computed(() => (
  settings.value && !sourceEnabled('show_courses')
    ? '课表来源已关闭，点上方「课表」可重新显示'
    : '导入课表后，课程会显示在这里'
))

let agendaSeq = 0

/**
 * 拉取今天起 7 天的日程。首屏失败显示页内错误并返回 null；
 * 已有数据时保留数据并把错误交给调用方合并提示。
 */
async function loadAgenda(): Promise<unknown> {
  const seq = ++agendaSeq
  agendaLoading.value = true
  try {
    const data = await getAgenda({ days: AGENDA_DAYS })
    if (seq === agendaSeq) {
      agenda.value = data
      agendaError.value = ''
    }
    return null
  }
  catch (error) {
    if (seq !== agendaSeq)
      return null
    if (agenda.value)
      return error
    agendaError.value = handleApiException(error, { showToast: false }).message
    return null
  }
  finally {
    if (seq === agendaSeq)
      agendaLoading.value = false
  }
}

async function reloadAgenda() {
  const failure = await loadAgenda()
  if (failure)
    handleApiException(failure)
}

/** 切换来源开关：先改本地再请求，失败回滚；成功后重拉日程 */
async function toggleSource(key: SourceKey) {
  const current = settings.value
  if (!current || savingSource.value[key])
    return
  const previous = current[key] ?? true
  const next = !previous
  current[key] = next
  savingSource.value = { ...savingSource.value, [key]: true }
  try {
    settings.value = await updateSettings({ [key]: next })
  }
  catch (error) {
    current[key] = previous
    handleApiException(error)
    return
  }
  finally {
    savingSource.value = { ...savingSource.value, [key]: false }
  }
  await reloadAgenda()
}

function openOccurrence(item: Occurrence) {
  switch (item.kind) {
    case 'college':
    case 'activity': {
      const activityId = item.ref.activity_id
      if (typeof activityId === 'number' && activityId > 0)
        uni.navigateTo({ url: `/pages/activity/detail?id=${activityId}` })
      else
        showMessage('本周活动尚未发布', 'warning')
      return
    }
    case 'appoint':
      uni.navigateTo({ url: '/pages/me/my-appointments' })
      return
    default:
      uni.navigateTo({ url: '/pages/timetable/index' })
  }
}

function openDay(date: string) {
  uni.navigateTo({ url: `/pages/timetable/day?date=${encodeURIComponent(date)}` })
}

function goTimetable() {
  uni.navigateTo({ url: '/pages/timetable/index' })
}

function goImport() {
  uni.navigateTo({ url: '/pages/timetable/import' })
}

/* -------------------- 最新发布 -------------------- */

const activityOverview = ref<IActivityHomepage | null>(null)
const unreadNotifications = ref<Notification[]>([])
const feedLoading = ref(true)

/** 后端的本地时间字符串（`YYYY-MM-DDTHH:MM:SS`，或以空格分隔）-> 毫秒时间戳；无法解析时为 0 */
function timestampOf(value: string | null | undefined): number {
  if (!value)
    return 0
  const parsed = Date.parse(value.replace(' ', 'T'))
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * 新发布的活动与未读通知按时间倒序合并。
 * 活动摘要没有发布时间字段，用活动开始时间参与排序（新活动通常都在未来，因此排在通知前面）。
 */
const feedItems = computed<FeedItem[]>(() => {
  const activities: FeedItem[] = (activityOverview.value?.newly_released_activities ?? []).map(activity => ({
    key: `activity-${activity.id}`,
    type: 'activity',
    time: timestampOf(activity.start),
    activity,
  }))
  const notifications: FeedItem[] = unreadNotifications.value.map(notification => ({
    key: `notification-${notification.id}`,
    type: 'notification',
    time: timestampOf(notification.start_time),
    notification,
  }))
  return [...activities, ...notifications].sort((a, b) => b.time - a.time)
})

/** 通知时间的相对表示：刚刚 / N分钟前 / N小时前 / N天前 / M-D */
function relativeTime(value: string): string {
  const time = timestampOf(value)
  if (!time)
    return ''
  const diff = Date.now() - time
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute)
    return '刚刚'
  if (diff < hour)
    return `${Math.floor(diff / minute)}分钟前`
  if (diff < day)
    return `${Math.floor(diff / hour)}小时前`
  if (diff < 7 * day)
    return `${Math.floor(diff / day)}天前`
  const date = new Date(time)
  return `${date.getMonth() + 1}-${date.getDate()}`
}

function notificationMeta(notification: Notification): string {
  const sender = notification.anonymous_flag ? '' : notification.sender_name
  return [sender, notification.content].filter(Boolean).join(' · ')
}

function onActivityCardClick(id: number) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

function goNotifications() {
  uni.navigateTo({ url: '/pages/me/notifications' })
}

/* -------------------- 加载与刷新 -------------------- */

/** 等待请求，成功时写入数据；返回失败原因（成功为 null），供多个并行请求合并成一次提示 */
async function settle<T>(request: Promise<T>, apply: (value: T) => void): Promise<unknown> {
  try {
    apply(await request)
    return null
  }
  catch (error) {
    return error
  }
}

async function loadCarousel(): Promise<unknown> {
  carouselLoading.value = true
  try {
    return await settle(getCarouselList(), (res) => {
      carouselList.value = (res?.items ?? []).map(item => ({ ...item, image: toBackendURL(item.image) }))
    })
  }
  finally {
    carouselLoading.value = false
  }
}

function loadSettings(): Promise<unknown> {
  return settle(getSettings(), (data) => {
    settings.value = data
  })
}

/** 「最新发布」的两路数据各自独立：一路失败不影响另一路显示 */
async function loadFeed(): Promise<unknown> {
  feedLoading.value = true
  try {
    const failures = await Promise.all([
      settle(getActivityOverview(), (data) => {
        activityOverview.value = data
      }),
      settle(
        listNotifications({ status: NotificationStatus.UNDONE, ordering: '-start_time' }),
        (items) => {
          unreadNotifications.value = items.slice(0, FEED_NOTIFICATION_LIMIT)
        },
      ),
    ])
    return failures.find(Boolean) ?? null
  }
  finally {
    feedLoading.value = false
  }
}

/** 两个 tab 的数据一起刷新；多个请求同时失败只提示一次 */
async function refreshHome() {
  localHiddenIds.value = readLocalHiddenIds()
  const failures = await Promise.all([loadCarousel(), loadAgenda(), loadSettings(), loadFeed()])
  const failure = failures.find(Boolean)
  if (failure) {
    console.error('首页数据获取失败:', failure)
    handleApiException(failure)
  }
}

// 计算 navbar 高度（44px + 状态栏高度）
function getNavbarHeight() {
  const systemInfo = uni.getSystemInfoSync()
  const statusBarHeight = systemInfo.statusBarHeight || 0
  const navbarHeight = 44 // navbar 默认高度
  return navbarHeight + statusBarHeight
}

async function onCarouselClick(index: number) {
  const item = carouselList.value[index]
  if (!item?.redirect_url)
    return
  if (item.redirect_url.startsWith('http')) {
    // #ifdef H5
    window.open(item.redirect_url)
    // #endif
    // #ifndef H5
    await openWebview({ uri: item.redirect_url })
    // #endif
  }
  else {
    uni.navigateTo({ url: item.redirect_url })
  }
}

// 轮播 + 日程 + 最新发布（页面显示时自动刷新，如从其他页返回）
const { refresh } = usePageRefresh(refreshHome, { immediate: false })

onMounted(async () => {
  // 未登录时先请求一次个人信息，统一在进入页面前完成 401 → 绑定页跳转，避免签到、活动等多个接口连续触发多次跳转
  try {
    await getUserMe()
  }
  catch (error) {
    handleApiException(error, { showToast: false })
    agendaLoading.value = false
    feedLoading.value = false
    return
  }

  try {
    const data = await everydaySignIn()
    if (data?.message) {
      const navbarHeight = getNavbarHeight()
      notifyRef.value?.show({
        message: data.message,
        duration: 3000,
        top: navbarHeight,
      })
    }
  }
  catch (error) {
    console.error('每日签到失败:', error)
    handleApiException(error)
  }

  await refresh()
})
</script>

<template>
  <uv-navbar title="首页" :placeholder="true" left-icon="" />
  <uv-toast ref="toastRef" />
  <uv-notify ref="notifyRef" />
  <view class="bg-white px-4 pt-safe">
    <uv-swiper
      :list="carouselList"
      key-name="image"
      :loading="carouselLoading"
      indicator
      indicator-mode="dot"
      circular
      height="200"
      radius="8"
      @click="onCarouselClick"
    />
  </view>

  <view class="px-4 pb-safe">
    <view class="mt-4">
      <uv-tabs
        :list="homeTabs"
        :current="homeTab"
        :scrollable="false"
        @change="onHomeTabChange"
      />
    </view>

    <!-- 我的日程：今天起 7 天 -->
    <view v-if="currentTabKey === 'agenda'">
      <view class="mt-3 flex items-center gap-2">
        <view v-if="settings" class="flex flex-1 flex-wrap items-center gap-1.5">
          <view
            v-for="chip in SOURCE_CHIPS"
            :key="chip.key"
            class="rounded-full px-2.5 py-1 text-xs transition"
            :class="[
              sourceEnabled(chip.key) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500',
              { 'opacity-60': savingSource[chip.key] },
            ]"
            @click="toggleSource(chip.key)"
          >
            {{ chip.label }}
          </view>
        </view>
        <view v-else class="flex-1" />
        <view class="flex shrink-0 items-center text-xs text-blue-600 active:opacity-70" @click="goTimetable">
          <text>本周课表</text>
          <view class="i-carbon-chevron-right text-sm" />
        </view>
      </view>

      <view v-if="agendaError && !agenda" class="flex flex-col items-center px-6 py-8 text-center">
        <text class="i-carbon-warning-alt mb-2 text-3xl text-gray-300" />
        <text class="text-sm text-gray-500 leading-6">{{ agendaError }}</text>
        <button class="mt-4 rounded-full bg-blue-600 px-5 py-1.5 text-sm text-white" @click="reloadAgenda">
          重试
        </button>
      </view>
      <AgendaList
        v-else
        :days="agendaDays"
        :loading="agendaLoading"
        :today="agenda?.from"
        @select="openOccurrence"
        @open-day="openDay"
      >
        <template #empty>
          <view class="flex flex-col items-center text-center">
            <text class="i-carbon-calendar text-4xl text-gray-200" />
            <text class="mt-2 text-sm text-gray-500">{{ agendaEmptyText }}</text>
            <text class="mt-1 text-xs text-gray-400">{{ agendaEmptyHint }}</text>
            <button class="mt-4 rounded-full bg-blue-600 px-5 py-1.5 text-sm text-white" @click="goImport">
              导入课表
            </button>
          </view>
        </template>
      </AgendaList>
    </view>

    <!-- 最新发布：新活动 + 未读通知 -->
    <view v-else>
      <view v-if="feedLoading && feedItems.length === 0" class="flex items-center justify-center py-6 text-xs text-gray-400">
        加载中…
      </view>
      <view v-else-if="feedItems.length === 0" class="flex flex-col items-center py-8 text-gray-400">
        <text class="i-carbon-notification text-4xl text-gray-200" />
        <text class="mt-2 text-sm">暂无新内容</text>
      </view>
      <view v-else class="mt-3">
        <template v-for="item in feedItems" :key="item.key">
          <ActivityCard
            v-if="item.type === 'activity'"
            :activity="item.activity"
            :show-quota="true"
            :show-time="true"
            @click="onActivityCardClick(item.activity.id)"
          />
          <view
            v-else
            class="mb-4 flex items-start gap-3 border border-gray-100 rounded-2xl bg-white px-4 py-3 shadow-sm active:opacity-80"
            @click="goNotifications"
          >
            <view class="mt-0.5 h-8 w-8 flex shrink-0 items-center justify-center rounded-full bg-blue-50">
              <view class="i-carbon-notification text-base text-blue-600" />
            </view>
            <view class="min-w-0 flex-1">
              <view class="flex items-center gap-2">
                <text class="min-w-0 flex-1 truncate text-sm text-gray-900 font-medium">
                  {{ item.notification.title_display }}
                </text>
                <text class="shrink-0 text-2xs text-gray-400">{{ relativeTime(item.notification.start_time) }}</text>
              </view>
              <text class="mt-0.5 block truncate text-xs text-gray-500">{{ notificationMeta(item.notification) }}</text>
            </view>
            <view class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
          </view>
        </template>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
button::after {
  border: none;
}
</style>
