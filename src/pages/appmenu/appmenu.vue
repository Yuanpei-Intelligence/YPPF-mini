<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/store/user'
import { openWebview } from '@/utils/webview'

definePage({
  style: {
    navigationBarTitleText: '应用中心',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
  },
})

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

const APP_LIST_PERSON = [
  {
    name: '实用工具',
    apps: [
      { name: '反馈中心', icon: 'i-carbon-chat-bot', color: 'text-green-500', url: '/pages/appmenu/feedback/feedback' },
      { name: '元气值商城', icon: 'i-carbon-store', color: 'text-blue-500', url: '/pages/appmenu/YQpools' },
      { name: '住宿调研', icon: 'i-carbon-document-tasks', color: 'text-orange-500', uri: '/dormitory/routine-QA/' },
      { name: '宿舍分配', icon: 'i-carbon-catalog', color: 'text-purple-500', uri: '/dormitory/assign-result/' },
      { name: '旧版预约', icon: 'i-carbon-calendar', color: 'text-pink-600', uri: '/underground' },
    ],
  },
  {
    name: '小组生活',
    apps: [
      { name: '小组一览', icon: 'i-carbon-event', color: 'text-teal-500', uri: '/subscribeOrganization' },
      { name: '加入小组', icon: 'i-carbon-bullhorn', color: 'text-yellow-600', uri: '/showPosition' },
      { name: '新建小组', icon: 'i-carbon-add', color: 'text-pink-600', uri: '/showNewOrganization' },
    ],
  },
  {
    name: '元培书院',
    apps: [
      { name: '元培书房', icon: 'i-carbon-book', color: 'text-red-500', url: '/pages/appmenu/library' },
      { name: '学术地图', icon: 'i-carbon-map', color: 'text-indigo-500', uri: '/modifyAcademic' },
      { name: '学术问答', icon: 'i-carbon-question-answering', color: 'text-teal-500', uri: '/AcademicQA' },
      { name: '书院课程', icon: 'i-carbon-education', color: 'text-yellow-600', uri: '/selectCourse' },
    ],
  },
]

const APP_LIST_ORG = [
  {
    name: '实用工具',
    apps: [
      { name: '反馈中心', icon: 'i-carbon-chat-bot', color: 'text-green-500', url: '/pages/appmenu/feedback/feedback' },
      { name: '旧版预约', icon: 'i-carbon-calendar', color: 'text-pink-600', uri: '/underground' },
    ],
  },
  {
    name: '小组管理',
    apps: [
      { name: '小组一览', icon: 'i-carbon-event', color: 'text-teal-500', uri: '/subscribeOrganization' },
      { name: '活动立项', icon: 'i-carbon-task-add', color: 'text-yellow-600', uri: '/showActivity' },
      { name: '活动结项', icon: 'i-carbon-task-complete', color: 'text-pink-600', uri: '/endActivity' },
      { name: '成员申请', icon: 'i-carbon-user-follow', color: 'text-purple-600', uri: '/showPosition' },
      { name: '信息发送', icon: 'i-carbon-send', color: 'text-blue-600', uri: '/sendMessage' },
    ],
  },
]

const appGroups = computed(() => {
  return userInfo.value.is_org ? APP_LIST_ORG : APP_LIST_PERSON
})

interface AppItem {
  name: string
  icon: string
  color: string
  url?: string
  uri?: string
}

async function handleAppClick(app: AppItem) {
  if (app.uri) {
    await openWebview({ uri: app.uri })
    return
  }

  if (!app.url)
    return

  console.log('handleAppClick', app.url)
  uni.navigateTo({ url: app.url })
}
</script>

<template>
  <view class="min-h-screen bg-[var(--bg-soft)] pb-10">
    <!-- 顶部装饰区（参考 me 页面） -->
    <view class="relative bg-[var(--primary-color)] px-6 pb-18 pt-10">
      <view class="flex items-center">
        <view class="flex-1">
          <view class="text-2xl text-white font-bold">
            应用中心
          </view>
          <view class="mt-1 text-sm text-white/80">
            发现更多实用功能
          </view>
        </view>
        <view class="i-carbon-apps text-4xl text-white/30" />
      </view>
    </view>

    <!-- 内容区域 -->
    <view class="mx-4 mt-[-40px]">
      <view v-for="(group, gIdx) in appGroups" :key="gIdx" class="mb-6">
        <!-- 分组标题 -->
        <view class="mb-3 flex items-center px-1">
          <view class="mr-2 h-4 w-1 rounded-full bg-[var(--primary-color)]" />
          <text class="text-base text-[var(--text-main)] font-bold">{{ group.name }}</text>
        </view>

        <!-- 应用网格卡片 -->
        <view class="grid grid-cols-4 gap-y-6 overflow-hidden rounded-2xl bg-white px-2 py-6 shadow-sm">
          <view
            v-for="(app, aIdx) in group.apps"
            :key="aIdx"
            class="flex flex-col items-center active:opacity-70"
            @click="handleAppClick(app)"
          >
            <view :class="[app.icon, app.color]" class="mb-2 text-3xl" />
            <text class="text-xs text-[var(--text-main)]">{{ app.name }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 保持一致的按钮交互效果 */
.active-state {
  &:active {
    opacity: 0.7;
  }
}
</style>
