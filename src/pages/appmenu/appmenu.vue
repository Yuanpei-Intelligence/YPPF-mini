<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/store/user'
import { openWebview } from '@/utils/webview'

definePage({
  style: {
    navigationBarTitleText: '应用',
  },
})

interface AppItem {
  /** Entrance label; must equal the target page title and stay within 4 characters. */
  name: string
  icon: string
  /** Mini-program route (uni.navigateTo). */
  url?: string
  /** Legacy web path opened through the authenticated webview. */
  uri?: string
}

interface AppGroup {
  name: string
  /** Tinted circle behind the icon. Keep as one static literal so UnoCSS can extract it. */
  tint: string
  apps: AppItem[]
}

const APP_LIST_PERSON: AppGroup[] = [
  {
    name: '书院服务',
    tint: 'bg-primary-light text-primary',
    apps: [
      { name: '反馈中心', icon: 'i-carbon-chat-bot', url: '/pages/appmenu/feedback/feedback' },
      { name: '元气商城', icon: 'i-carbon-store', url: '/pages/appmenu/YQpools' },
      { name: '住宿调研', icon: 'i-carbon-document-tasks', uri: '/dormitory/routine-QA/' },
      { name: '宿舍分配', icon: 'i-carbon-catalog', uri: '/dormitory/assign-result/' },
      { name: '旧版预约', icon: 'i-carbon-calendar', uri: '/underground' },
    ],
  },
  {
    name: '小组生活',
    tint: 'bg-success-light text-success',
    apps: [
      { name: '小组一览', icon: 'i-carbon-event', uri: '/subscribeOrganization' },
      { name: '加入小组', icon: 'i-carbon-bullhorn', uri: '/showPosition' },
      { name: '新建小组', icon: 'i-carbon-add', uri: '/showNewOrganization' },
    ],
  },
  {
    name: '元培书院',
    tint: 'bg-warning-light text-warning',
    apps: [
      { name: '元培书房', icon: 'i-carbon-book', url: '/pages/appmenu/library' },
      { name: '学术地图', icon: 'i-carbon-map', uri: '/modifyAcademic' },
      { name: '学术问答', icon: 'i-carbon-question-answering', uri: '/AcademicQA' },
      { name: '书院课程', icon: 'i-carbon-education', uri: '/selectCourse' },
    ],
  },
]

const APP_LIST_ORG: AppGroup[] = [
  {
    name: '书院服务',
    tint: 'bg-primary-light text-primary',
    apps: [
      { name: '反馈中心', icon: 'i-carbon-chat-bot', url: '/pages/appmenu/feedback/feedback' },
      { name: '旧版预约', icon: 'i-carbon-calendar', uri: '/underground' },
    ],
  },
  {
    name: '组织功能',
    tint: 'bg-info-light text-info',
    apps: [
      { name: '小组一览', icon: 'i-carbon-event', uri: '/subscribeOrganization' },
      { name: '活动立项', icon: 'i-carbon-task-add', uri: '/showActivity' },
      { name: '活动结项', icon: 'i-carbon-task-complete', uri: '/endActivity' },
      { name: '成员申请', icon: 'i-carbon-user-follow', uri: '/showPosition' },
      { name: '信息发送', icon: 'i-carbon-send', uri: '/sendMessage' },
    ],
  },
]

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

const appGroups = computed(() => (userInfo.value.is_org ? APP_LIST_ORG : APP_LIST_PERSON))

async function handleAppClick(app: AppItem) {
  if (app.uri) {
    await openWebview({ uri: app.uri })
    return
  }
  if (!app.url)
    return
  uni.navigateTo({ url: app.url })
}
</script>

<template>
  <view class="yp-page px-4 py-3">
    <view
      v-for="(group, gIdx) in appGroups"
      :key="group.name"
      class="yp-card-flat"
      :class="{ 'mt-3': gIdx > 0 }"
    >
      <text class="block yp-section-title">{{ group.name }}</text>
      <view class="grid grid-cols-4 mt-4 gap-y-5">
        <view
          v-for="app in group.apps"
          :key="app.name"
          class="flex flex-col items-center gap-2 active:opacity-70"
          @click="handleAppClick(app)"
        >
          <view class="h-88rpx w-88rpx flex items-center justify-center rounded-full" :class="group.tint">
            <view class="text-40rpx" :class="app.icon" />
          </view>
          <text class="text-xs text-fg-1">{{ app.name }}</text>
        </view>
      </view>
    </view>
  </view>
</template>
