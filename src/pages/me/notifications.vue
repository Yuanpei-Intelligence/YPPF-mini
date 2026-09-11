<script lang="ts" setup>
import type { Notification, NotificationBulkOperationResult, NotificationListQuery } from '@/api/types/notification'
import type { UvToastInstance } from '@/hooks/useApiException'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import { computed, onMounted, ref } from 'vue'
import {
  deleteAllReadNotifications,
  getNotification,
  getNotificationStatistics,
  listNotifications,
  markAllNotificationsRead,
  toggleNotificationStatus,
} from '@/api/notification'
import { NotificationStatus, NotificationType } from '@/api/types/notification'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { useConfirm } from '@/hooks/useConfirm'
import { tokens } from '@/style/tokens'
import { formatRelativeTime } from '@/utils/format'

/*
 * 通知中心。后端 `GET /api/v2/notification/` 目前没有分页（AGENTS.md「notification slice」），
 * 因此一次拉全量；列表用普通 view 渲染，交给页面自身滚动。
 */

definePage({
  style: {
    navigationBarTitleText: '通知中心',
    enablePullDownRefresh: true,
  },
})

type FilterKey = 'all' | 'unread' | 'read'

const FILTERS: { key: FilterKey, name: string }[] = [
  { key: 'all', name: '全部' },
  { key: 'unread', name: '未读' },
  { key: 'read', name: '已读' },
]
const filterNames = FILTERS.map(item => item.name)

const notifications = ref<Notification[]>([])
const statistics = ref({
  total: 0,
  unread: 0,
  read: 0,
  need_read: 0,
  need_do: 0,
})
const loading = ref(false)
/** 首屏（或切换筛选后）列表加载失败的页内错误；已有数据时失败只 toast */
const loadError = ref('')
const bulkPending = ref(false)
const togglingId = ref<number | null>(null)
const filterIndex = ref(0)
const activeFilter = computed<FilterKey>(() => FILTERS[filterIndex.value]?.key ?? 'all')
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
const { confirm } = useConfirm()

/** 从首页「最新发布」带 id 进入时，列表加载完直接展开这一条 */
let pendingOpenId: number | null = null

function isUnread(notification: Notification): boolean {
  return notification.status === NotificationStatus.UNDONE
}

function queryFor(filter: FilterKey): NotificationListQuery {
  const query: NotificationListQuery = { ordering: '-start_time' }
  if (filter === 'unread')
    query.status = NotificationStatus.UNDONE
  else if (filter === 'read')
    query.status = NotificationStatus.DONE
  return query
}

let loadSeq = 0

/**
 * 拉取当前筛选下的列表。没有可显示的数据时失败改为页内错误并返回 null；
 * 已有数据时保留数据并把错误交给调用方合并提示。
 */
async function loadNotifications(): Promise<unknown> {
  const seq = ++loadSeq
  loading.value = true
  try {
    const items = await listNotifications(queryFor(activeFilter.value))
    if (seq === loadSeq) {
      notifications.value = items
      loadError.value = ''
    }
    return null
  }
  catch (error) {
    if (seq !== loadSeq)
      return null
    if (notifications.value.length > 0)
      return error
    loadError.value = handleApiException(error, { showToast: false }).message
    return null
  }
  finally {
    if (seq === loadSeq)
      loading.value = false
  }
}

async function loadStatistics(): Promise<unknown> {
  try {
    statistics.value = await getNotificationStatistics()
    return null
  }
  catch (error) {
    return error
  }
}

/** 列表与统计一起刷新；两路同时失败只提示一次，列表已改为页内错误时统计失败静默 */
async function refreshAll() {
  const [listFailure, statsFailure] = await Promise.all([loadNotifications(), loadStatistics()])
  const failure = listFailure ?? (loadError.value ? null : statsFailure)
  if (failure) {
    console.error('加载通知失败:', failure)
    handleApiException(failure)
  }
}

function onFilterChange(index: number) {
  if (index === filterIndex.value)
    return
  filterIndex.value = index
  notifications.value = []
  loadError.value = ''
  void refreshAll()
}

// 切换通知状态（已读 <-> 未读）
async function toggleStatus(notification: Notification) {
  if (togglingId.value === notification.id)
    return
  togglingId.value = notification.id
  try {
    const updated = await toggleNotificationStatus(notification.id)
    const index = notifications.value.findIndex(item => item.id === notification.id)
    if (index !== -1)
      notifications.value[index] = updated
    const statsFailure = await loadStatistics()
    if (statsFailure)
      handleApiException(statsFailure)
  }
  catch (error) {
    console.error('切换通知状态失败:', error)
    handleApiException(error)
  }
  finally {
    togglingId.value = null
  }
}

async function runBulk(action: () => Promise<NotificationBulkOperationResult>, describe: (count: number) => string) {
  if (bulkPending.value)
    return
  bulkPending.value = true
  try {
    const result = await action()
    showMessage(describe(result.count), 'success')
    await refreshAll()
  }
  catch (error) {
    console.error('批量修改通知失败:', error)
    handleApiException(error)
  }
  finally {
    bulkPending.value = false
  }
}

async function handleMarkAllRead() {
  const ok = await confirm({
    title: '全部标为已读',
    content: '将把所有未读通知标为已读，需处理的通知不受影响。',
    confirmText: '全部已读',
    cancelText: '暂不',
  })
  if (!ok)
    return
  await runBulk(markAllNotificationsRead, count => `已标为已读 ${count} 条`)
}

async function handleDeleteAllRead() {
  const ok = await confirm({
    title: '删除已读通知',
    content: '将删除所有已读通知，需处理的通知不受影响。删除后不可恢复。',
    confirmText: '删除',
    cancelText: '保留',
    danger: true,
  })
  if (!ok)
    return
  await runBulk(deleteAllReadNotifications, count => `已删除 ${count} 条`)
}

/** 查看通知详情；未读的看完可直接标为已读 */
async function openDetail(notification: Notification) {
  const unread = isUnread(notification)
  const ok = await confirm({
    title: notification.title_display || '通知详情',
    content: notification.content,
    confirmText: unread ? '标为已读' : '知道了',
    cancelText: '关闭',
    showCancel: unread,
  })
  if (ok && unread)
    await toggleStatus(notification)
}

async function openPendingNotification() {
  const id = pendingOpenId
  pendingOpenId = null
  if (!id)
    return
  let target = notifications.value.find(item => item.id === id)
  if (!target) {
    try {
      target = await getNotification(id)
    }
    catch (error) {
      handleApiException(error)
      return
    }
  }
  await openDetail(target)
}

function actionLabel(notification: Notification): string {
  if (notification.typename === NotificationType.NEEDDO)
    return '去处理'
  return isUnread(notification) ? '标为已读' : '标为未读'
}

function metaOf(notification: Notification): string {
  const sender = notification.anonymous_flag ? '' : notification.sender_name
  return [sender, formatRelativeTime(notification.start_time), notification.status_display].filter(Boolean).join(' · ')
}

async function handleAction(notification: Notification) {
  // 需处理类型：复制处理链接并顺便标记已读
  if (notification.typename === NotificationType.NEEDDO) {
    if (notification.URL) {
      uni.setClipboardData({
        data: notification.URL,
        success: () => {
          showMessage('链接已复制', 'success')
        },
        fail: () => {
          showMessage('复制链接失败', 'error')
        },
      })
    }
    else {
      showMessage('暂无处理链接', 'warning')
    }
    if (isUnread(notification))
      await toggleStatus(notification)
    return
  }

  // 其他类型默认切换已读/未读
  await toggleStatus(notification)
}

onLoad((options) => {
  const id = Number(options?.id)
  if (Number.isInteger(id) && id > 0)
    pendingOpenId = id
})

onMounted(async () => {
  await refreshAll()
  await openPendingNotification()
})

onPullDownRefresh(async () => {
  await refreshAll()
  uni.stopPullDownRefresh()
})
</script>

<template>
  <view class="yp-page">
    <uv-toast ref="toastRef" />

    <!-- 筛选 + 工具栏 -->
    <view class="bg-card px-4 pb-1 pt-3">
      <uv-subsection
        :list="filterNames"
        :current="filterIndex"
        mode="subsection"
        :active-color="tokens.primary"
        :inactive-color="tokens.text2"
        :font-size="14"
        :bold="false"
        @change="onFilterChange"
      />
      <view class="mt-1 flex items-center justify-between gap-2">
        <text class="min-w-0 flex-1 truncate text-xs text-fg-3 tabular-nums">未读 {{ statistics.unread }} 条 · 共 {{ statistics.total }} 条</text>
        <view class="flex shrink-0 items-center">
          <view class="btn-text min-h-88rpx" :class="{ 'opacity-50': bulkPending }" @click="handleMarkAllRead">
            全部已读
          </view>
          <view class="btn-text min-h-88rpx text-error" :class="{ 'opacity-50': bulkPending }" @click="handleDeleteAllRead">
            删除已读
          </view>
        </view>
      </view>
    </view>

    <!-- 通知列表 -->
    <PageState
      :loading="loading && notifications.length === 0"
      :error="loadError"
      :empty="notifications.length === 0"
      empty-icon="i-carbon-notification"
      empty-text="还没有通知"
      @retry="refreshAll"
    >
      <view class="mt-3 bg-card">
        <template v-for="(notification, index) in notifications" :key="notification.id">
          <view v-if="index > 0" class="yp-divider" />
          <view class="flex items-start gap-3 px-4 py-3 active:bg-fill" @click="openDetail(notification)">
            <!-- 未读左侧色点 -->
            <view
              class="mt-3 h-14rpx w-14rpx shrink-0 rounded-full"
              :class="isUnread(notification) ? 'bg-primary' : 'bg-transparent'"
            />
            <view class="min-w-0 flex-1">
              <view class="flex items-start gap-2">
                <text
                  class="line-clamp-2 min-w-0 flex-1 text-base"
                  :class="isUnread(notification) ? 'text-fg-1 font-medium' : 'text-fg-2'"
                >
                  {{ notification.title_display }}
                </text>
                <StatusTag
                  v-if="notification.typename === NotificationType.NEEDDO"
                  :type="isUnread(notification) ? 'warning' : 'default'"
                  text="需处理"
                  class="mt-1 shrink-0"
                />
              </view>
              <text
                class="line-clamp-2 mt-1 block text-sm"
                :class="isUnread(notification) ? 'text-fg-2' : 'text-fg-3'"
              >
                {{ notification.content }}
              </text>
              <view class="mt-1 flex items-center justify-between gap-2">
                <text class="min-w-0 flex-1 truncate text-xs text-fg-3">{{ metaOf(notification) }}</text>
                <view
                  class="btn-text min-h-88rpx shrink-0 -mr-2"
                  :class="{ 'opacity-50': togglingId === notification.id }"
                  @click.stop="handleAction(notification)"
                >
                  {{ actionLabel(notification) }}
                </view>
              </view>
            </view>
          </view>
        </template>
      </view>
    </PageState>
  </view>
</template>
