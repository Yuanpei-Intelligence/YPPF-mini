<script setup lang="ts">
import { computed } from 'vue'

/**
 * Status pill with semantic colors (Ant Design badge semantics):
 * success / processing / warning / error / default.
 * Dark text on the light variant keeps ≥ 4.5:1 contrast at small sizes.
 * Never rely on the color alone — the text carries the meaning.
 */
export type StatusTagType = 'success' | 'processing' | 'warning' | 'error' | 'default'

const props = withDefaults(defineProps<{
  type?: StatusTagType
  text?: string
  /** Show a leading dot. */
  dot?: boolean
  size?: 'sm' | 'md'
}>(), {
  type: 'default',
  text: '',
  dot: false,
  size: 'sm',
})

const CLASS_BY_TYPE: Record<StatusTagType, string> = {
  success: 'bg-success-light text-success-dark',
  processing: 'bg-primary-light text-primary-dark',
  warning: 'bg-warning-light text-warning-dark',
  error: 'bg-error-light text-error-dark',
  default: 'bg-fill text-fg-2',
}

const DOT_BY_TYPE: Record<StatusTagType, string> = {
  success: 'bg-success',
  processing: 'bg-primary',
  warning: 'bg-warning',
  error: 'bg-error',
  default: 'bg-fg-3',
}

const tagClass = computed(() => [
  CLASS_BY_TYPE[props.type],
  props.size === 'md' ? 'text-sm px-3 h-48rpx' : 'text-xs px-2 h-40rpx',
])
const dotClass = computed(() => DOT_BY_TYPE[props.type])
</script>

<template>
  <view class="inline-flex items-center gap-1 whitespace-nowrap rounded-sm font-medium leading-none" :class="tagClass">
    <view v-if="dot" class="h-10rpx w-10rpx rounded-full" :class="dotClass" />
    <slot>{{ text }}</slot>
  </view>
</template>
