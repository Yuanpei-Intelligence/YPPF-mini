<script lang="ts" setup>
import type { FeatureGateStatus } from '@/hooks/useFeatureGate'

withDefaults(defineProps<{
  /** 由 useFeatureGate 提供；只有 enabled 时渲染默认插槽 */
  status: FeatureGateStatus
  /** status 为 error 时展示的原因 */
  errorMessage?: string
}>(), {
  errorMessage: '',
})

const emit = defineEmits<{
  /** 用户点了「去体验通道」 */
  openPreview: []
  /** 用户点了「重试」或「刷新」 */
  retry: []
}>()
</script>

<template>
  <template v-if="status === 'enabled'">
    <slot />
  </template>
  <view v-else class="px-8 py-20 text-center">
    <uv-loading-icon v-if="status === 'loading'" mode="circle" text="加载中" />
    <template v-else-if="status === 'error'">
      <view class="i-carbon-warning-alt mb-3 text-5xl text-gray-300" />
      <text class="block text-base text-gray-800 font-medium">暂时无法确认这个功能能否使用</text>
      <text class="mt-2 block text-sm text-gray-500 leading-6">{{ errorMessage || '请稍后重试。' }}</text>
      <view class="mx-auto mt-6 w-40">
        <uv-button type="primary" shape="circle" plain text="重试" @click="emit('retry')" />
      </view>
    </template>
    <template v-else-if="status === 'signed_out'">
      <view class="i-carbon-user-avatar mb-3 text-5xl text-gray-300" />
      <text class="block text-base text-gray-800 font-medium">登录后才能使用这个功能</text>
    </template>
    <template v-else>
      <view class="i-carbon-rocket mb-3 text-5xl text-blue-500" />
      <text class="block text-lg text-gray-800 font-bold">这个功能还在体验中</text>
      <text class="mt-2 block text-sm text-gray-500 leading-6">它正在小范围试用，暂时没有向你开放。加入体验通道，可以抢先试用正在体验的新功能。</text>
      <view class="mx-auto mt-6 w-40">
        <uv-button type="primary" shape="circle" text="去体验通道" @click="emit('openPreview')" />
      </view>
      <text class="mt-4 block text-xs text-blue-600" @click="emit('retry')">已经加入了？点这里刷新</text>
    </template>
  </view>
</template>
