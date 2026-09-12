<script lang="ts" setup>
import type { Experiment, RolloutStage } from '@/api/types/rollout'
import type { UvToastInstance } from '@/hooks/useApiException'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useApiException } from '@/hooks/useApiException'
import { useRolloutStore } from '@/store/rollout'

definePage({
  style: {
    navigationBarTitleText: '体验通道',
  },
})

interface UvModalInstance {
  open: () => void
  close: () => void
}

const STAGE_LABELS: Record<RolloutStage, string> = {
  off: '已关闭',
  internal: '内测',
  preview: '体验',
  rollout: '放量',
  ga: '全量',
}
/** 与后端 rollout.feedback.org_name 的默认值一致，仅在尚未取回配置时显示 */
const DEFAULT_FEEDBACK_ORG = '智慧书院项目组'

const rolloutStore = useRolloutStore()
const { experiments, feedback, loadError, preview, status } = storeToRefs(rolloutStore)
const toastRef = ref<UvToastInstance | null>(null)
const leaveModalRef = ref<UvModalInstance | null>(null)
const { handleApiException } = useApiException(toastRef)
const submitting = ref(false)
let shownBefore = false

const feedbackOrgName = computed(() => feedback.value?.org_name || DEFAULT_FEEDBACK_ORG)
const joinedDate = computed(() => formatDate(preview.value?.joined_at ?? null))
const leaveModalContent = computed(() => (
  preview.value?.can_join
    ? '退出后，体验中的功能会对你关闭，之后可以随时重新加入。'
    : '退出后，体验中的功能会对你关闭，而且当前账号暂时不能自己重新加入。'
))

function formatDate(value: string | null): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : ''
}

async function loadState(force: boolean) {
  try {
    await rolloutStore.refresh({ force })
  }
  catch (error) {
    // 已有数据时保留数据并提示一次；没有数据时由页面内的重试视图展示 loadError
    if (rolloutStore.isLoaded)
      handleApiException(error)
  }
}

// 首次进入强制获取最新状态，之后返回本页时按节流刷新
onShow(() => {
  void loadState(!shownBefore)
  shownBefore = true
})

async function handleJoin() {
  if (submitting.value)
    return
  submitting.value = true
  try {
    await rolloutStore.join()
  }
  catch (error) {
    handleApiException(error)
    // 被拒通常说明本地状态已过时（例如通道刚关闭），后台刷新以显示最新原因
    rolloutStore.refreshInBackground({ force: true })
  }
  finally {
    submitting.value = false
  }
}

function handleLeave() {
  if (!submitting.value)
    leaveModalRef.value?.open()
}

async function confirmLeave() {
  if (submitting.value)
    return
  submitting.value = true
  try {
    await rolloutStore.leave()
  }
  catch (error) {
    handleApiException(error)
  }
  finally {
    submitting.value = false
  }
}

function openFeedback(experiment: Experiment) {
  if (!feedback.value)
    return
  uni.navigateTo({ url: `/pages/me/preview-feedback?feature=${encodeURIComponent(experiment.key)}` })
}
</script>

<template>
  <uv-toast ref="toastRef" />
  <uv-modal
    ref="leaveModalRef"
    title="退出体验通道"
    :content="leaveModalContent"
    confirm-text="退出"
    show-cancel-button
    @confirm="confirmLeave"
  />
  <view class="min-h-screen bg-gray-50 px-4 pb-10 pt-4">
    <!-- 说明 -->
    <view class="rounded-2xl bg-white p-4 shadow-sm">
      <view class="flex items-center">
        <view class="i-carbon-rocket mr-2 text-xl text-blue-600" />
        <text class="text-base text-gray-800 font-bold">什么是体验通道</text>
      </view>
      <view class="mt-3 text-sm text-gray-600 leading-6">
        <text class="block">新功能全面上线之前，会先在体验通道里开放，加入后就能抢先试用。</text>
        <text class="mt-2 block">体验中的功能还可能调整，也可能下线。</text>
        <text class="mt-2 block">你可以随时退出。遇到问题或有想法，欢迎反馈给{{ feedbackOrgName }}。</text>
      </view>
    </view>

    <view v-if="status === 'ready' && preview">
      <!-- 加入状态 -->
      <view class="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <view class="flex items-center justify-between">
          <view class="flex-1">
            <text class="block text-base text-gray-800 font-bold">{{ preview.joined ? '已加入体验通道' : '还没有加入' }}</text>
            <text v-if="preview.joined && joinedDate" class="mt-1 block text-xs text-gray-500">{{ joinedDate }}加入</text>
          </view>
          <text v-if="preview.joined" class="ml-3 rounded-full bg-green-50 px-3 py-1 text-xs text-green-600">体验中</text>
        </view>
        <uv-alert
          v-if="!preview.joined && !preview.can_join"
          class="mt-3"
          type="warning"
          :description="preview.join_block_message || '当前账号暂时不能加入体验通道。'"
        />
        <view class="mt-4">
          <uv-button
            v-if="preview.joined"
            type="info"
            shape="circle"
            plain
            text="退出体验通道"
            :loading="submitting"
            :disabled="submitting"
            @click="handleLeave"
          />
          <uv-button
            v-else
            type="primary"
            shape="circle"
            text="加入体验通道"
            :loading="submitting"
            :disabled="submitting || !preview.can_join"
            @click="handleJoin"
          />
        </view>
      </view>

      <!-- 体验中的功能 -->
      <view class="mb-3 mt-6 flex items-center px-1">
        <view class="mr-2 h-4 w-1 rounded-full bg-blue-600" />
        <text class="text-base text-gray-800 font-bold">体验中的功能</text>
      </view>
      <view v-if="experiments.length === 0" class="rounded-2xl bg-white py-10 text-center text-sm text-gray-400 shadow-sm">
        目前没有正在体验的功能
      </view>
      <view v-else>
        <view
          v-for="experiment in experiments"
          :key="experiment.key"
          class="mb-3 rounded-2xl bg-white p-4 shadow-sm"
        >
          <view class="flex items-start justify-between">
            <text class="flex-1 text-base text-gray-800 font-bold">{{ experiment.name }}</text>
            <view class="ml-2 flex flex-shrink-0 items-center">
              <text class="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{{ STAGE_LABELS[experiment.stage] }}</text>
              <text
                class="ml-1 rounded-full px-2 py-0.5 text-xs"
                :class="experiment.enabled ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'"
              >
                {{ experiment.enabled ? '可用' : '未开放' }}
              </text>
            </view>
          </view>
          <text v-if="experiment.description" class="mt-2 block text-sm text-gray-600 leading-6">{{ experiment.description }}</text>
          <view class="mt-3 flex justify-end border-t border-gray-100 pt-3">
            <view
              class="rounded-full px-4 py-1 text-xs"
              :class="feedback ? 'bg-blue-50 text-blue-600 active:bg-blue-100' : 'bg-gray-100 text-gray-400'"
              @click="openFeedback(experiment)"
            >
              反馈
            </view>
          </view>
        </view>
      </view>
      <text v-if="!feedback" class="mt-1 block px-1 text-xs text-gray-400">体验反馈暂未开放，开放后可以在这里提交。</text>
    </view>

    <view v-else-if="status === 'error'" class="mt-4 rounded-2xl bg-white px-6 py-10 text-center shadow-sm">
      <view class="i-carbon-warning-alt mb-3 text-5xl text-gray-300" />
      <text class="block text-sm text-gray-600">{{ loadError }}</text>
      <view class="mx-auto mt-5 w-40">
        <uv-button type="primary" shape="circle" plain text="重试" @click="loadState(true)" />
      </view>
    </view>

    <view v-else-if="status === 'signed_out'" class="mt-4 rounded-2xl bg-white px-6 py-10 text-center text-sm text-gray-500 shadow-sm">
      登录后可以加入体验通道。
    </view>

    <view v-else class="py-16 text-center">
      <uv-loading-icon mode="circle" text="加载中" />
    </view>
  </view>
</template>
