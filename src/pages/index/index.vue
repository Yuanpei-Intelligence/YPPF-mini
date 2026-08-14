<script lang="ts" setup>
import type { IActivityHomepage, IActivitySummary } from '@/api/types/activity'
import type { ICarouselItem } from '@/api/types/carousel'
import { onMounted, ref } from 'vue'
import { getActivityOverview } from '@/api/activity'
import { getCarouselList } from '@/api/carousel'
import { everydaySignIn, getUserMe } from '@/api/login'
import ActivityCard from '@/components/ActivityCard.vue'
import { usePageRefresh } from '@/hooks/usePageRefresh'
import { toBackendURL } from '@/utils'
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

const notifyRef = ref()
const carouselList = ref<ICarouselItem[]>([])
const carouselLoading = ref(true)

// 活动数据
const activityOverview = ref<IActivityHomepage | null>(null)
const activityLoading = ref(false)
const activityTab = ref(0)
const activityTabs = [
  { name: '近期活动', key: 'recent' },
  { name: '今日活动', key: 'today' },
  { name: '最新发布', key: 'new' },
]

const currentActivities = ref<IActivitySummary[]>([])

// 根据 key 更新当前活动列表
function updateCurrentActivities(key: string) {
  const overview = activityOverview.value
  if (!overview) {
    currentActivities.value = []
    return
  }

  if (key === 'today') {
    currentActivities.value = overview.today_activities?.map(item => item.activity) || []
  }
  else if (key === 'new') {
    currentActivities.value = overview.newly_released_activities || []
  }
  else {
    // 默认：近期活动
    currentActivities.value = overview.recent_activities || []
  }
}

function onActivityTabChange(params: any) {
  activityTab.value = params.index
  const key = activityTabs[params.index]?.key ?? 'recent'
  updateCurrentActivities(key)
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

// 轮播 + 活动数据刷新（页面显示时自动刷新，如从其他页返回）
const { refresh } = usePageRefresh(
  async () => {
    try {
      carouselLoading.value = true
      const res = await getCarouselList()
      carouselList.value = res?.items ?? []
      for (const item of carouselList.value) {
        item.image = toBackendURL(item.image)
      }
    }
    catch (error) {
      console.error('轮播列表获取失败:', error)
    }
    finally {
      carouselLoading.value = false
    }

    try {
      activityLoading.value = true
      activityOverview.value = await getActivityOverview()
      updateCurrentActivities('recent')
    }
    catch (error) {
      console.error('活动数据获取失败:', error)
    }
    finally {
      activityLoading.value = false
    }
  },
  { immediate: false },
)

onMounted(async () => {
  // 未登录时先请求一次个人信息，统一在进入页面前完成 401 → 绑定页跳转，避免签到、活动等多个接口连续触发多次跳转
  try {
    await getUserMe()
  }
  catch {
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
  }

  await refresh()
})

function onActivityCardClick(id: number) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}
</script>

<template>
  <uv-navbar title="首页" :placeholder="true" left-icon="" />
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

  <!-- 活动列表：使用 uv-tabs 切换不同分组 -->
  <view class="px-4 pb-safe">
    <view class="mt-4">
      <uv-tabs
        :list="activityTabs"
        :scrollable="false"
        @change="onActivityTabChange"
      />
    </view>

    <view v-if="activityLoading" class="flex items-center justify-center py-6 text-xs text-gray-400">
      加载活动中…
    </view>
    <view v-else>
      <view v-if="currentActivities.length === 0" class="flex items-center justify-center py-6 text-xs text-gray-400">
        暂无活动
      </view>
      <view v-else class="mt-3">
        <ActivityCard
          v-for="item in currentActivities"
          :key="item.id"
          :activity="item"
          :show-quota="true"
          :show-time="activityTabs[activityTab].key === 'today'"
          @click="onActivityCardClick(item.id)"
        />
      </view>
    </view>

    <!-- 即将截止报名的活动单独展示
    <view v-if="activityOverview?.signup_activities?.length" class="mt-6">
      <view class="mb-2 text-sm font-medium text-gray-800">
        即将截止报名
      </view>
      <ActivityCard
        v-for="item in activityOverview.signup_activities"
        :key="item.activity.id"
        :activity="item.activity"
        :show-quota="true"
        :show-time="true"
      />
    </view> -->
  </view>
</template>

<style lang="scss" scoped>
</style>
