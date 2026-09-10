<script setup lang="ts">
import ApiFieldError from '@/components/ApiFieldError.vue'

/**
 * Form row: label, control (default slot), hint and field-level error messages.
 *
 * Pair with `useApiException().getFieldMessages('<field>')` so backend
 * validation errors render beside the matching control (one error surface).
 */
withDefaults(defineProps<{
  label?: string
  required?: boolean
  hint?: string
  messages?: string[]
  /** `vertical` (label above control, default) or `horizontal` (label left, control right). */
  layout?: 'vertical' | 'horizontal'
}>(), {
  label: '',
  required: false,
  hint: '',
  messages: () => [],
  layout: 'vertical',
})
</script>

<template>
  <view class="yp-field" :class="[`yp-field--${layout}`, { 'yp-field--error': messages.length > 0 }]">
    <view v-if="label" class="yp-field__label">
      <text>{{ label }}</text>
      <text v-if="required" class="yp-field__required">*</text>
    </view>
    <view class="yp-field__control">
      <slot />
      <text v-if="hint && messages.length === 0" class="yp-field__hint">{{ hint }}</text>
      <ApiFieldError :messages="messages" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.yp-field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 20rpx 0;

  &--horizontal {
    flex-direction: row;
    align-items: flex-start;
    gap: 24rpx;

    .yp-field__label {
      flex: 0 0 160rpx;
      padding-top: 18rpx;
    }

    .yp-field__control {
      flex: 1;
      min-width: 0;
    }
  }

  &__label {
    font-size: var(--yp-font-sm);
    line-height: 1.5;
    color: var(--yp-text-2);
  }

  &__required {
    margin-left: 4rpx;
    color: var(--yp-color-error);
  }

  &__hint {
    display: block;
    margin-top: 8rpx;
    font-size: var(--yp-font-xs);
    line-height: 1.5;
    color: var(--yp-text-3);
  }
}
</style>
