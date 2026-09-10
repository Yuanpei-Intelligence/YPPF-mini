<script lang="ts" setup>
import type { IIndexResponse, IRoom } from '@/api/types/appoint'
import type { StatusTagType } from '@/components/StatusTag.vue'
import type { UvToastInstance } from '@/hooks/useApiException'
import { getAgreement, getIndexStatus } from '@/api/appoint'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { usePageRefresh } from '@/hooks/usePageRefresh'
import { tokens } from '@/style/tokens'

definePage({
  style: {
    // Tab page with in-bar controls: one of the two pages allowed to use a custom
    // navbar (docs/design/README.md §3.1).
    navigationStyle: 'custom',
    navigationBarTitleText: '预约',
  },
})

const TABBAR_HEIGHT_PX = 50

const statusData = ref<IIndexResponse>()
const loading = ref(true)
const loadError = ref<string | null>(null)
const activeTab = ref(0)
const agreementTime = ref<string | null>(null)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException } = useApiException(toastRef)
const instance = getCurrentInstance()

// 公告列表
const announcements = computed(() => {
  if (!statusData.value?.announcements?.length)
    return []
  return statusData.value.announcements
    .filter(item => item.show === 1)
    .map(item => item.announcement)
})

// 侧边栏列表
const tabList = computed(() => {
  const tabs: Array<{ name: string, key: string, rooms: IRoom[] }> = []

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

// 先 loading 再判断 empty：只有拿到数据后才可能显示空态
const isEmpty = computed(() => !loading.value && !loadError.value && !!statusData.value && tabList.value.length === 0)

// 房间状态 → 状态胶囊语义（0 允许预约 / 1 无需预约 / 2 禁止使用）
function roomStatusType(status: number): StatusTagType {
  switch (status) {
    case 0: return 'success'
    case 1: return 'warning'
    case 2: return 'error'
    default: return 'default'
  }
}

// HH:MM:SS => HH:MM
function hhmm(time: string) {
  return time.slice(0, 5)
}

/**
 * uv-vtabs always spans the full window height; measure what sits above it
 * (navbar + segmented control + announcements) and below it (custom tabbar) so the
 * last room card is not hidden behind the tabbar.
 */
const vtabsHeight = ref<string>('auto')
function measureLayout() {
  nextTick(() => {
    uni.createSelectorQuery()
      .in(instance?.proxy)
      .select('#appoint-header')
      .boundingClientRect((rect) => {
        const info = uni.getWindowInfo()
        const headerBottom = (rect as UniApp.NodeInfo | null)?.bottom ?? 0
        const tabbarPx = TABBAR_HEIGHT_PX + (info.safeAreaInsets?.bottom ?? 0)
        const height = info.windowHeight - headerBottom - tabbarPx
        vtabsHeight.value = height > 0 ? `${height}px` : 'auto'
      })
      .exec()
  })
}

onReady(measureLayout)
watch(announcements, measureLayout)

function onTabChange(index: number) {
  activeTab.value = index
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
    loadError.value = null
  }
  catch (error) {
    console.error('获取预约状态失败:', error)
    if (statusData.value) {
      // 已有数据的后台刷新失败：保留数据，只 toast 一次
      handleApiException(error)
    }
    else {
      loadError.value = handleApiException(error, { showToast: false }).message
    }
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
</script>

<template>
  <!-- 自定义导航栏：标题与入口同名；右侧带文字的「我的预约」入口 -->
  <uv-navbar
    title="预约"
    :safe-area-inset-top="true"
    :placeholder="true"
    :auto-back="false"
    :bg-color="tokens.bgCard"
    left-icon=""
  >
    <template #right>
      <view class="btn-text min-h-88rpx" @click="goToMyAppointments">
        我的预约
      </view>
    </template>
  </uv-navbar>
  <uv-toast ref="toastRef" />

  <view id="appoint-header" class="bg-card">
    <!-- 分段控件：按房间 / 按时间 -->
    <view class="px-4 pb-3 pt-2">
      <view class="flex rounded-md bg-fill p-1">
        <view class="h-72rpx flex flex-1 items-center justify-center rounded-sm bg-card text-sm text-fg-1 font-medium shadow-card">
          按房间
        </view>
        <view
          class="h-72rpx flex flex-1 items-center justify-center rounded-sm text-sm text-fg-2 active:opacity-70"
          @click="goToArrangeByTime"
        >
          按时间
        </view>
      </view>
    </view>

    <!-- 公告栏 -->
    <view v-if="announcements.length > 0" class="px-4 pb-3">
      <uv-notice-bar
        v-for="(announcement, index) in announcements"
        :key="index"
        :text="announcement"
        direction="row"
        mode="closable"
        :bg-color="tokens.warningLight"
        :color="tokens.warning"
        icon="volume-fill"
        :duration="3000"
        @close="measureLayout"
      />
    </view>
  </view>

  <PageState
    :loading="loading && !statusData"
    :error="loadError"
    :empty="isEmpty"
    empty-text="还没有可预约的房间"
    @retry="fetchData"
  >
    <uv-vtabs
      :list="tabList"
      :current="activeTab"
      :chain="false"
      :height="vtabsHeight"
      bar-width="176rpx"
      :bar-bg-color="tokens.bgPage"
      :content-style="{ background: tokens.bgPage }"
      key-name="name"
      @change="onTabChange"
    >
      <uv-vtabs-item>
        <view class="px-3 py-3">
          <!-- 房间卡片 -->
          <view
            v-for="room in currentRooms"
            :key="room.Rid"
            class="mb-3 yp-card-flat active:bg-fill"
            @click="goToAppointRoom(room)"
          >
            <view class="flex items-center justify-between gap-2">
              <view class="min-w-0 flex-1">
                <view class="flex items-center gap-2">
                  <text class="text-lg text-fg-1 font-semibold">{{ room.Rid }}</text>
                  <StatusTag :type="roomStatusType(room.Rstatus)" :text="room.status_display || '未知'" />
                </view>
                <view class="mt-0.5 truncate text-sm text-fg-2">
                  {{ room.Rtitle }}
                </view>
              </view>
              <view class="i-carbon-chevron-right shrink-0 text-lg text-fg-4" />
            </view>

            <!-- 信息行：人数 / 开放时间 / 附加说明 -->
            <view class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3">
              <view class="flex items-center gap-1">
                <view class="i-carbon-group text-base" />
                <text>{{ room.Rmin }}–{{ room.Rmax }} 人</text>
              </view>
              <view class="flex items-center gap-1">
                <view class="i-carbon-time text-base" />
                <text>{{ hhmm(room.Rstart) }}–{{ hhmm(room.Rfinish) }}</text>
              </view>
              <view v-if="room.RneedAgree" class="flex items-center gap-1">
                <view class="i-carbon-document text-base" />
                <text>需签署使用协议</text>
              </view>
              <view v-if="room.RIsAllNight" class="flex items-center gap-1">
                <view class="i-carbon-moon text-base" />
                <text>可通宵使用</text>
              </view>
            </view>
          </view>

          <!-- 该分类下无房间 -->
          <view v-if="currentRooms.length === 0" class="py-10 text-center text-sm text-fg-3">
            还没有房间
          </view>
        </view>
      </uv-vtabs-item>
    </uv-vtabs>
  </PageState>
</template>
