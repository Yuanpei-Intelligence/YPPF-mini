<script setup lang="ts">
import { tokens } from '@/style/tokens'

/**
 * Loading / error / empty states for data pages and sections.
 *
 * Renders exactly one state, or the default slot when there is data.
 * Icon classes passed through `emptyIcon` must be listed in `uno.config.ts#safelist`.
 */
withDefaults(defineProps<{
  loading?: boolean
  /** Normalized error message; falsy means no error. */
  error?: string | null
  empty?: boolean
  emptyText?: string
  emptyIcon?: string
  loadingText?: string
  retryText?: string
  /** Smaller vertical padding for in-card sections. */
  compact?: boolean
}>(), {
  loading: false,
  error: null,
  empty: false,
  emptyText: '暂无内容',
  emptyIcon: 'i-carbon-document-blank',
  loadingText: '加载中…',
  retryText: '重试',
  compact: false,
})

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <view v-if="loading" class="yp-state" :class="{ 'yp-state--compact': compact }">
    <uv-loading-icon mode="circle" :color="tokens.primary" size="32" />
    <text class="yp-state__text">{{ loadingText }}</text>
  </view>
  <view v-else-if="error" class="yp-state" :class="{ 'yp-state--compact': compact }">
    <view class="i-carbon-warning-alt yp-state__icon text-warning" />
    <text class="yp-state__text">{{ error }}</text>
    <button class="btn-outline mt-4 btn-sm" @click="emit('retry')">
      {{ retryText }}
    </button>
  </view>
  <view v-else-if="empty" class="yp-state" :class="{ 'yp-state--compact': compact }">
    <view class="yp-state__icon text-fg-4" :class="emptyIcon" />
    <text class="yp-state__text">{{ emptyText }}</text>
    <slot name="action" />
  </view>
  <slot v-else />
</template>

<style lang="scss" scoped>
.yp-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 48rpx;
  text-align: center;

  &--compact {
    padding: 56rpx 32rpx;
  }

  &__icon {
    font-size: 96rpx;
    margin-bottom: 8rpx;
  }

  &__text {
    margin-top: 16rpx;
    font-size: var(--yp-font-sm);
    line-height: 1.5;
    color: var(--yp-text-3);
  }
}
</style>
