<script lang="ts" setup>
import type { IIndexResponse, IRoom } from '@/api/types/appoint'
import type { UvToastInstance } from '@/hooks/useApiException'
import { getAgreement, getIndexStatus } from '@/api/appoint'
import { useApiException } from '@/hooks/useApiException'
import { usePageRefresh } from '@/hooks/usePageRefresh'

definePage({
  style: {
    // 'custom' 表示开启自定义导航栏，默认 'default'
    navigationStyle: 'custom',
    navigationBarTitleText: '预约',
  },
})

const statusData = ref<IIndexResponse>()
const loading = ref(false)
const activeTab = ref(0)
const agreementTime = ref<string | null>(null)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException } = useApiException(toastRef)

// 公告列表
const announcements = computed(() => {
  if (!statusData.value?.announcements?.length)
    return []
  return statusData.value.announcements
    .filter(item => item.show === 1)
    .map(item => item.announcement)
})

// 计算头部高度（导航栏 + 状态栏 + 公告栏），单位：rpx
const headerHeight = computed(() => {
  const systemInfo = uni.getSystemInfoSync()
  // 导航栏高度 88rpx (44px * 2) + 状态栏高度（px转rpx）
  // 状态栏高度通常是 20-50px，转换为 rpx 约为 40-100rpx
  const statusBarHeightRpx = (systemInfo.statusBarHeight / systemInfo.windowWidth) * 750
  const navbarHeightRpx = 88 + Math.ceil(statusBarHeightRpx)
  // 公告栏高度：每个公告约 40rpx，加上 padding 24rpx (上下各12rpx)
  const announcementHeightRpx = announcements.value.length > 0
    ? announcements.value.length * 40 + 24
    : 0
  return navbarHeightRpx + announcementHeightRpx
})

// 侧边栏列表
const tabList = computed(() => {
  const tabs = []

  if (statusData.value?.function_room_list?.length) {
    tabs.push({
      name: '功能房',
      key: 'function',
      rooms: statusData.value.function_room_list,
    })
  }

  if (statusData.value?.talk_room_list?.length) {
    tabs.push({
      name: '研讨室',
      key: 'talk',
      rooms: statusData.value.talk_room_list,
    })
  }

  if (statusData.value?.russian_room_list?.length) {
    tabs.push({
      name: '俄文楼',
      key: 'russian',
      rooms: statusData.value.russian_room_list,
    })
  }

  return tabs
})

// 当前选中的房间列表
const currentRooms = computed(() => {
  return tabList.value[activeTab.value]?.rooms || []
})

// 获取房间状态颜色
function getRoomStatusColor(status: number) {
  switch (status) {
    case 0: return 'success' // 可用
    case 1: return 'warning' // 部分可用
    case 2: return 'danger' // 不可用
    default: return 'info'
  }
}

// 获取房间状态文字
function getRoomStatusText(room: IRoom) {
  return room.status_display || '未知'
}

// 跳转到预约页面
function goToAppointRoom(room: IRoom) {
  uni.navigateTo({
    url: `/pages/appoint/arrange?Rid=${room.Rid}`,
  })
}

async function fetchData() {
  loading.value = true
  try {
    const res = await getIndexStatus()
    statusData.value = res
  }
  catch (error) {
    console.error('获取预约状态失败:', error)
    handleApiException(error)
  }
  finally {
    loading.value = false
  }
}

async function checkAgreementStatus() {
  try {
    const res = await getAgreement()
    if (!res.agree_time) {
      uni.navigateTo({
        url: `/pages/appoint/agreement`,
      })
      return
    }
    agreementTime.value = res.agree_time
  }
  catch (error) {
    handleApiException(error)
  }
}

// 页面自动刷新：从其他页面返回时自动更新数据
usePageRefresh(
  async () => {
    await fetchData()
    await checkAgreementStatus()
  },
  {
    minInterval: 2000,
  },
)

function goToArrangeByTime() {
  uni.navigateTo({
    url: `/pages/appoint/arrange-by-time`,
  })
}

function goToMyAppointments() {
  uni.navigateTo({
    url: `/pages/me/my-appointments`,
  })
}

function formatTime(time: string) {
  // HH:MM:SS => HH:MM
  const hms = time.split(':')
  return `${hms[0]}:${hms[1]}`
}
</script>

<template>
  <!-- 自定义导航栏 -->
  <uv-navbar
    title="预约房间"
    :safe-area-inset-top="true"
    :placeholder="true"
    :auto-back="false"
  >
    <template #left>
      <view class="uv-nav-slot">
        <view class="i-carbon-arrows-horizontal text-lg text-gray-800" @click="goToArrangeByTime" />
        <uv-line
          direction="column"
          :hairline="false"
          length="16"
          margin="0 8px"
        />
        <view class="i-carbon-time text-lg text-gray-800" @click="goToMyAppointments" />
      </view>
    </template>
  </uv-navbar>
  <uv-toast ref="toastRef" />
  <!-- 公告栏 -->
  <view v-if="announcements.length > 0" class="px-3 pt-3">
    <uv-notice-bar
      v-for="(announcement, index) in announcements"
      :key="index"
      :text="announcement"
      direction="row"
      mode="closable"
      bg-color="#fffbf0"
      color="#ed6a0c"
      icon="volume-fill"
      :duration="3000"
    />
  </view>
  <view class="min-h-screen">
    <uv-vtabs
      :list="tabList"
      :current="activeTab"
      :chain="false"
      :hd-height="`${headerHeight}rpx`"
      key-name="name"
      @change="(e) => activeTab = e"
    >
      <uv-vtabs-item>
        <view class="p-3 space-y-3">
          <!-- 房间卡片 -->
          <view
            v-for="room in currentRooms"
            :key="room.Rid"
            class="mb-3 overflow-hidden border border-gray-200 rounded-lg bg-white shadow-lg"
            @click="goToAppointRoom(room)"
          >
            <!-- 房间头部：蓝色渐变 -->
            <view class="border-b border-white/20 from-[var(--primary-color)] to-[var(--primary-dark)] bg-gradient-to-r px-4 py-3">
              <view class="flex items-center justify-between gap-2">
                <view class="min-w-0 flex-1">
                  <view class="text-base text-white font-bold">
                    {{ room.Rid }}
                  </view>
                  <view class="text-sm text-white/90">
                    {{ room.Rtitle }}
                  </view>
                </view>
                <view class="flex shrink-0 items-center gap-2">
                  <uv-tag
                    :type="getRoomStatusColor(room.Rstatus)"
                    :text="getRoomStatusText(room)"
                    plain
                    size="mini"
                  />
                  <view class="i-carbon-arrow-right text-lg text-white" />
                </view>
              </view>
            </view>

            <!-- 房间详情 -->
            <view class="px-4 py-3 space-y-2">
              <!-- 容纳人数 -->
              <view class="flex items-center text-sm text-gray-700">
                <div class="i-carbon-group mr-2 text-lg text-blue-500" />
                <text>{{ room.Rmin }} - {{ room.Rmax }} 人</text>
              </view>

              <!-- 开放时间 -->
              <view class="flex items-center text-sm text-gray-700">
                <div class="i-carbon-time mr-2 text-lg text-blue-500" />
                <text>{{ formatTime(room.Rstart) }} - {{ formatTime(room.Rfinish) }}</text>
              </view>

              <!-- 当前使用人数（已注释） -->
              <!-- <view v-if="room.Rpresent > 0" class="flex items-center text-sm text-gray-700">
                <div class="i-carbon-user mr-2 text-lg text-blue-500" />
                <text>当前使用：{{ room.Rpresent }} 人</text>
              </view> -->

              <!-- 是否需要协议 -->
              <view v-if="room.RneedAgree" class="flex items-center text-sm text-orange-600">
                <div class="i-carbon-document mr-2 text-lg" />
                <text>需签署使用协议</text>
              </view>

              <!-- 是否通宵 -->
              <view v-if="room.RIsAllNight" class="flex items-center text-sm text-purple-600">
                <div class="i-carbon-moon mr-2 text-lg" />
                <text>支持通宵使用</text>
              </view>
            </view>
          </view>

          <!-- 空状态 -->
          <view v-if="currentRooms.length === 0" class="py-10 text-center text-sm text-gray-400">
            暂无房间
          </view>
        </view>
      </uv-vtabs-item>
    </uv-vtabs>
  </view>
</template>

<style scoped lang="scss">
  @mixin flex($direction: row) {
  /* #ifndef APP-NVUE */
  display: flex;
  /* #endif */
  flex-direction: $direction;
}
.uv-nav-slot {
  @include flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #dadbde;
  border-radius: 150px;
  padding: 3px 7px;
  opacity: 0.8;
}
</style>
