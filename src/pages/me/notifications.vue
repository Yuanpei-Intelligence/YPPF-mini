<!-- 这一页真应该改成分页显示，卡死了这个玩意，有些人不喜欢点掉未读一攒好几百条 -->
<script lang="ts" setup>
import type { Notification, NotificationListQuery } from '@/api/types/notification'
import type { UvToastInstance } from '@/hooks/useApiException'
import { computed, onMounted, ref } from 'vue'
import {
  deleteAllReadNotifications,
  getNotificationStatistics,
  listNotifications,
  markAllNotificationsRead,
  toggleNotificationStatus,
} from '@/api/notification'
import { NotificationStatus, NotificationType } from '@/api/types/notification'
import { useApiException } from '@/hooks/useApiException'

definePage({
  style: {
    navigationBarTitleText: '通知中心',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
  },
})

interface UvModalInstance {
  open: () => void
  close: () => void
}

type BulkAction = 'deleteAllRead' | 'markAllRead'

// 状态管理
const notifications = ref<Notification[]>([])
const statistics = ref({
  total: 0,
  unread: 0,
  read: 0,
  need_read: 0,
  need_do: 0,
})
const loading = ref(false)
const refreshing = ref(false)
const toastRef = ref<UvToastInstance | null>(null)
const confirmationModalRef = ref<UvModalInstance | null>(null)
const detailModalRef = ref<UvModalInstance | null>(null)
const pendingBulkAction = ref<BulkAction | null>(null)
const selectedNotification = ref<Notification | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

const confirmationContent = computed(() => (
  pendingBulkAction.value === 'markAllRead'
    ? '确定要将所有通知标记为已读吗？'
    : '确定要删除所有已读通知吗？'
))
const detailConfirmText = computed(() => (
  selectedNotification.value?.status === NotificationStatus.UNDONE
    ? '标记已读'
    : '知道了'
))

// 筛选状态
const activeTab = ref<'all' | 'unread' | 'read'>('all')

// 加载通知列表
async function loadNotifications() {
  try {
    loading.value = true
    const query: NotificationListQuery = {
      ordering: '-start_time',
    }

    // 根据选中的 tab 设置状态筛选
    if (activeTab.value === 'unread') {
      query.status = NotificationStatus.UNDONE
    }
    else if (activeTab.value === 'read') {
      query.status = NotificationStatus.DONE
    }

    notifications.value = await listNotifications(query)
  }
  catch (error) {
    console.error('加载通知失败:', error)
    handleApiException(error)
  }
  finally {
    loading.value = false
  }
}

// 加载统计数据
async function loadStatistics() {
  try {
    statistics.value = await getNotificationStatistics()
  }
  catch (error) {
    console.error('加载统计失败:', error)
    handleApiException(error)
  }
}

// 切换通知状态
async function handleToggleStatus(notification: Notification) {
  try {
    const updated = await toggleNotificationStatus(notification.id)
    // 更新本地数据
    const index = notifications.value.findIndex(n => n.id === notification.id)
    if (index !== -1) {
      notifications.value[index] = updated
    }
    // 刷新统计
    await loadStatistics()
  }
  catch (error) {
    console.error('切换状态失败:', error)
    handleApiException(error)
  }
}

// 标记所有为已读
function handleMarkAllRead() {
  pendingBulkAction.value = 'markAllRead'
  confirmationModalRef.value?.open()
}

// 删除所有已读通知
function handleDeleteAllRead() {
  pendingBulkAction.value = 'deleteAllRead'
  confirmationModalRef.value?.open()
}

async function confirmBulkAction() {
  const action = pendingBulkAction.value
  if (!action)
    return

  try {
    const result = action === 'markAllRead'
      ? await markAllNotificationsRead()
      : await deleteAllReadNotifications()
    showMessage(result.message, 'success')
    await Promise.all([loadNotifications(), loadStatistics()])
  }
  catch (error) {
    console.error('批量修改通知失败:', error)
    handleApiException(error)
  }
  finally {
    pendingBulkAction.value = null
    confirmationModalRef.value?.close()
  }
}

// 查看通知详情
function handleViewDetail(notification: Notification) {
  selectedNotification.value = notification
  detailModalRef.value?.open()
}

async function confirmNotificationDetail() {
  const notification = selectedNotification.value
  selectedNotification.value = null
  if (notification?.status === NotificationStatus.UNDONE)
    await handleToggleStatus(notification)
}

// 下拉刷新
async function onRefresh() {
  try {
    refreshing.value = true
    await Promise.all([loadNotifications(), loadStatistics()])
  }
  finally {
    refreshing.value = false
  }
}

// 切换标签
function handleTabChange(tab: 'all' | 'unread' | 'read') {
  activeTab.value = tab
  loadNotifications()
}

// 格式化时间
function formatTime(time: string) {
  const date = new Date(time)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) {
    return '刚刚'
  }
  else if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`
  }
  else if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`
  }
  else if (diff < 7 * day) {
    return `${Math.floor(diff / day)}天前`
  }
  else {
    return `${date.getMonth() + 1}-${date.getDate()}`
  }
}

async function handleNotificationAction(notification: Notification) {
  // 需处理类型：跳转处理并顺便标记已读
  if (notification.typename === NotificationType.NEEDDO) {
    if (notification.URL) {
      uni.setClipboardData({
        data: notification.URL,
        success: () => {
          showMessage('链接已复制', 'success')
        },
        fail: () => {
          showMessage('复制链接失败，请稍后重试。', 'error')
        },
      })
    }
    else {
      showMessage('暂无处理链接', 'warning')
    }
    if (notification.status === NotificationStatus.UNDONE) {
      await handleToggleStatus(notification)
    }
    return
  }

  // 其他类型默认切换已读/未读
  await handleToggleStatus(notification)
}

// 页面加载
onMounted(() => {
  loadNotifications()
  loadStatistics()
})
</script>

<template>
  <view class="min-h-screen bg-gray-50 pb-20">
    <uv-toast ref="toastRef" />
    <uv-modal
      ref="confirmationModalRef"
      title="请确认"
      :content="confirmationContent"
      show-cancel-button
      @confirm="confirmBulkAction"
      @cancel="pendingBulkAction = null"
    />
    <uv-modal
      ref="detailModalRef"
      :title="selectedNotification?.title_display || '通知详情'"
      :content="selectedNotification?.content || ''"
      :confirm-text="detailConfirmText"
      @confirm="confirmNotificationDetail"
      @close="selectedNotification = null"
    />
    <!-- 筛选标签 -->
    <view class="sticky top-0 z-10 bg-white px-4 py-3 shadow-sm">
      <view class="mb-3 flex items-center justify-between">
        <view class="flex gap-2">
          <view
            class="cursor-pointer rounded-full px-4 py-1.5 text-sm transition"
            :class="activeTab === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'"
            @click="handleTabChange('all')"
          >
            全部
          </view>
          <view
            class="cursor-pointer rounded-full px-4 py-1.5 text-sm transition"
            :class="activeTab === 'unread' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'"
            @click="handleTabChange('unread')"
          >
            未读 ({{ statistics.unread }})
          </view>
          <view
            class="cursor-pointer rounded-full px-4 py-1.5 text-sm transition"
            :class="activeTab === 'read' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'"
            @click="handleTabChange('read')"
          >
            已读 ({{ statistics.read }})
          </view>
        </view>
        <view
          class="cursor-pointer rounded-full p-2 text-blue-600 active:bg-blue-50"
          :class="{ 'opacity-60': refreshing }"
          @click="onRefresh"
        >
          <view class="i-carbon-renew text-lg" />
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="mx-4 mt-3 flex gap-2">
        <view
          class="flex-1 cursor-pointer rounded-lg bg-blue-50 px-3 py-2 text-center text-sm text-blue-600 active:bg-blue-100"
          @click="handleMarkAllRead"
        >
          全部已读
        </view>
        <view
          class="flex-1 cursor-pointer rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 active:bg-red-100"
          @click="handleDeleteAllRead"
        >
          删除已读
        </view>
      </view>
    </view>

    <!-- 通知列表 -->
    <scroll-view scroll-y class="mt-3 box-border px-4">
      <view v-if="loading" class="py-20 text-center text-gray-400">
        <uv-loading-icon mode="circle" text="加载中" />
      </view>

      <view v-else-if="notifications.length === 0" class="py-20 text-center text-gray-400">
        <view class="i-carbon-email mx-auto mb-3 text-6xl text-gray-300" />
        <view>暂无通知</view>
      </view>

      <view v-else class="box-border w-full pb-4 space-y-2">
        <view
          v-for="notification in notifications"
          :key="notification.id"
          class="relative box-border w-full overflow-hidden rounded-xl p-4 shadow-sm active:bg-gray-50"
          :class="notification.status === NotificationStatus.UNDONE ? 'bg-white' : 'bg-gray-100 text-gray-500'"
          @click="handleViewDetail(notification)"
        >
          <!-- 未读标记 -->
          <view
            v-if="notification.status === NotificationStatus.UNDONE"
            class="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500"
          />

          <!-- 标题 -->
          <view
            class="mb-2 text-base font-bold"
            :class="notification.status === NotificationStatus.UNDONE ? 'text-gray-800' : 'text-gray-500'"
          >
            {{ notification.title_display }}
          </view>

          <!-- 头部 -->
          <view class="mb-2 flex items-center justify-between">
            <view class="flex items-center gap-2">
              <view
                v-if="!notification.anonymous_flag"
                class="text-xs text-gray-500"
              >
                {{ notification.sender_name }}
              </view>
            </view>
            <view class="text-xs text-gray-400">
              {{ formatTime(notification.start_time) }}
            </view>
          </view>

          <!-- 内容 -->
          <view
            class="line-clamp-2 text-sm"
            :class="notification.status === NotificationStatus.UNDONE ? 'text-gray-600' : 'text-gray-500'"
          >
            {{ notification.content }}
          </view>

          <!-- 底部操作 -->
          <view class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <view
              class="text-xs"
              :class="notification.status === NotificationStatus.UNDONE ? 'text-gray-400' : 'text-gray-500'
              "
            >
              {{ notification.status_display }}
            </view>
            <view
              class="cursor-pointer rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600 active:bg-blue-100"
              @click.stop="handleNotificationAction(notification)"
            >
              {{ notification.typename === NotificationType.NEEDDO ? '去处理' : notification.status === NotificationStatus.UNDONE ? '标为已读' : '标为未读' }}
            </view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<style lang="scss" scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
