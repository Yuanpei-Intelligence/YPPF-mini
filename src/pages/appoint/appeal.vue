<script lang="ts" setup>
import PageState from '@/components/PageState.vue'

definePage({
  style: {
    navigationBarTitleText: '申诉',
  },
})

const aid = ref<number>(0)
const room = ref<string>('')

onLoad((options) => {
  if (options?.aid) {
    aid.value = Number(options.aid) || 0
  }
  if (options?.room) {
    room.value = decodeURIComponent(options.room)
  }
})

// 申诉暂由反馈中心承接（与「信用分记录」页的申诉入口一致）
function goFeedback() {
  const query = aid.value > 0 ? `?aid=${aid.value}` : ''
  uni.navigateTo({
    url: `/pages/appmenu/feedback/feedback${query}`,
  })
}
</script>

<template>
  <view class="yp-page">
    <PageState empty empty-text="申诉功能开发中" empty-icon="i-carbon-chat">
      <template #action>
        <view class="mt-1 text-xs text-fg-3">
          请前往反馈中心提交申诉
        </view>
        <view v-if="aid > 0" class="mt-1 text-xs text-fg-3">
          预约 {{ aid }}<text v-if="room"> · {{ room }}</text>
        </view>
        <button class="btn-secondary mt-4 btn-sm" @click="goFeedback">
          前往反馈中心
        </button>
      </template>
    </PageState>
  </view>
</template>
