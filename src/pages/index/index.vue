<script lang="ts" setup>
import type { IActivityHomepage, IActivitySummary } from '@/api/types/activity'
import type { AgendaDay, AgendaOut } from '@/api/types/agenda'
import type { ICarouselItem } from '@/api/types/carousel'
import type { Notification } from '@/api/types/notification'
import type { Occurrence, Settings, SettingsPatch } from '@/api/types/timetable'
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
import AgendaFilterSheet from '@/components/AgendaFilterSheet.vue'
import AgendaList from '@/components/AgendaList.vue'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { usePageRefresh } from '@/hooks/usePageRefresh'
import { tokens } from '@/style/tokens'
import { toBackendURL } from '@/utils'
import { formatRelativeTime } from '@/utils/format'
import { filterSummary, readLocalHiddenIds, suspendsClasses } from '@/utils/timetable'
import { openWebview } from '@/utils/webview'

defineOptions({
  name: 'Home',
})
definePage({
  // 使用 type: "home" 属性设置首页，其他页面不需要设置，默认为page
  type: 'home',
  style: {
    navigationBarTitleText: '首页',
  },
})

type HomeTabKey = 'agenda' | 'feed'

/** 筛选弹层组件暴露的方法 */
interface FilterSheetInstance {
  open: () => void
  close: () => void
}

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

const homeTabs: { name: string, key: HomeTabKey }[] = [
  { name: '我的日程', key: 'agenda' },
  { name: '最新发布', key: 'feed' },
]

const tabActiveStyle = { color: tokens.text1, fontSize: '30rpx', fontWeight: 600 }
const tabInactiveStyle = { color: tokens.text3, fontSize: '30rpx' }

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
const filterSheet = ref<FilterSheetInstance | null>(null)
const filterSaving = ref(false)
const localHiddenIds = ref<string[]>(readLocalHiddenIds())

/** 课表页里本机隐藏的日程（没有 entry_id 的书院课 / 活动 / 预约）在首页同样不显示 */
const agendaDays = computed<AgendaDay[]>(() => {
  const hidden = new Set(localHiddenIds.value)
  return (agenda.value?.days ?? []).map(day => ({
    ...day,
    occurrences: day.occurrences.filter(item => !item.hidden && !hidden.has(item.id)),
  }))
})

/** 「筛选」按钮角标：有来源 / 标签被关闭时显示 已开启/全部 */
const filterBadge = computed(() => {
  const summary = filterSummary(settings.value)
  return summary.allOn ? '' : `${summary.enabled}/${summary.total}`
})

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

/** 尚未升级到 show_courses 的后端不返回该字段，缺失时按开启处理 */
const agendaEmptyHint = computed(() => (
  settings.value && settings.value.show_courses === false
    ? '课表来源已关闭，点上方「筛选」可重新显示'
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

function openFilter() {
  filterSheet.value?.open()
}

/** 保存筛选（来源开关 + 隐藏的标签），成功后关闭弹层并重拉日程 */
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
/** 「最新发布」首屏两路都没有数据时的页内错误；已有数据时失败只 toast */
const feedError = ref('')

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

function notificationMeta(notification: Notification): string {
  const sender = notification.anonymous_flag ? '' : notification.sender_name
  return [sender, notification.content].filter(Boolean).join(' · ')
}

function onActivityCardClick(id: number) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

/** 打开通知中心并直接展开这一条 */
function openNotification(id: number) {
  uni.navigateTo({ url: `/pages/me/notifications?id=${id}` })
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

/**
 * 「最新发布」的两路数据各自独立：一路失败不影响另一路显示。
 * 两路都没有内容可显示时失败改为页内错误并返回 null，否则把错误交给调用方 toast。
 */
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
    const failure = failures.find(Boolean) ?? null
    if (!failure) {
      feedError.value = ''
      return null
    }
    if (feedItems.value.length === 0) {
      feedError.value = handleApiException(failure, { showToast: false }).message
      return null
    }
    return failure
  }
  finally {
    feedLoading.value = false
  }
}

async function reloadFeed() {
  const failure = await loadFeed()
  if (failure)
    handleApiException(failure)
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
      notifyRef.value?.show({
        message: data.message,
        duration: 3000,
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
  <uv-toast ref="toastRef" />
  <uv-notify ref="notifyRef" />
  <view class="yp-page">
    <!-- 轮播：固定 2:1 圆角图片，加载失败或没有内容时整块隐藏 -->
    <view v-if="carouselLoading || carouselList.length" class="px-4 pt-3">
      <uv-swiper
        :list="carouselList"
        key-name="image"
        :loading="carouselLoading"
        indicator
        indicator-mode="dot"
        circular
        height="343rpx"
        radius="24rpx"
        :bg-color="tokens.bgFill"
        @click="onCarouselClick"
      />
    </view>

    <view class="mt-3 bg-card">
      <uv-tabs
        :list="homeTabs"
        :current="homeTab"
        :scrollable="false"
        :line-color="tokens.primary"
        :active-style="tabActiveStyle"
        :inactive-style="tabInactiveStyle"
        @change="onHomeTabChange"
      />
    </view>

    <!-- 我的日程：今天起 7 天 -->
    <view v-if="currentTabKey === 'agenda'" class="px-4 pb-6">
      <view class="mt-2 flex items-center justify-between gap-2">
        <view v-if="settings" class="py-2 active:opacity-70" @click="openFilter">
          <view class="h-56rpx flex items-center gap-1 border border-line rounded-full bg-card px-3 text-xs text-fg-2">
            <view class="i-carbon-filter text-sm text-fg-3" />
            <text>筛选</text>
            <text v-if="filterBadge" class="rounded-full bg-primary px-1.5 text-2xs text-white leading-4">{{ filterBadge }}</text>
          </view>
        </view>
        <view v-else class="flex-1" />
        <view class="flex shrink-0 items-center gap-0.5 py-3 text-sm text-primary active:opacity-70" @click="goTimetable">
          <text>完整课表</text>
          <view class="i-carbon-chevron-right text-base" />
        </view>
      </view>

      <PageState v-if="agendaError && !agenda" :error="agendaError" @retry="reloadAgenda" />
      <AgendaList
        v-else
        :days="agendaDays"
        :loading="agendaLoading"
        :today="agenda?.from"
        :empty-text="agendaEmptyText"
        @select="openOccurrence"
        @open-day="openDay"
      >
        <template #empty-action>
          <text class="mt-1 block text-xs text-fg-3">{{ agendaEmptyHint }}</text>
          <button class="btn-secondary mt-4 btn-sm" @click="goImport">
            导入课表
          </button>
        </template>
      </AgendaList>
    </view>

    <!-- 最新发布：新活动 + 未读通知 -->
    <view v-else class="px-4 pb-6 pt-3">
      <PageState
        :loading="feedLoading && feedItems.length === 0"
        :error="feedError"
        :empty="feedItems.length === 0"
        empty-icon="i-carbon-notification"
        empty-text="还没有新内容"
        @retry="reloadFeed"
      >
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
            class="mb-3 flex items-start gap-3 yp-card-flat active:bg-fill"
            @click="openNotification(item.notification.id)"
          >
            <view class="mt-0.5 h-64rpx w-64rpx flex shrink-0 items-center justify-center rounded-full bg-primary-light">
              <view class="i-carbon-notification text-lg text-primary" />
            </view>
            <view class="min-w-0 flex-1">
              <view class="flex items-center gap-2">
                <text class="min-w-0 flex-1 truncate text-base text-fg-1 font-medium">
                  {{ item.notification.title_display }}
                </text>
                <StatusTag type="processing" dot text="未读" class="shrink-0" />
              </view>
              <text class="mt-1 block truncate text-sm text-fg-2">{{ notificationMeta(item.notification) }}</text>
              <text class="mt-1 block text-xs text-fg-3">{{ formatRelativeTime(item.notification.start_time) }}</text>
            </view>
          </view>
        </template>
      </PageState>
    </view>
  </view>

  <!-- 日程筛选：来源与标签 -->
  <AgendaFilterSheet ref="filterSheet" :settings="settings" :saving="filterSaving" @save="saveFilter" />
</template>
