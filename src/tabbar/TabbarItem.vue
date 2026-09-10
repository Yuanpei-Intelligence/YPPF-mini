<script setup lang="ts">
import type { CustomTabBarItem } from './types'
import { tabbarStore } from './store'

defineProps<{
  item: CustomTabBarItem
  index: number
  isBulge?: boolean
}>()

function getImageByIndex(index: number, item: CustomTabBarItem) {
  if (!item.iconActive) {
    console.warn('image 模式下，需要配置 iconActive (高亮时的图片），否则无法切换高亮图片')
    return item.icon
  }
  return tabbarStore.curIdx === index ? item.iconActive : item.icon
}
</script>

<template>
  <view class="flex flex-col items-center justify-center">
    <template v-if="item.iconType === 'uiLib'">
      <!-- 如需使用 UI 库图标，在此替换：<uv-icon :name="item.icon" size="22" /> -->
    </template>
    <template v-if="item.iconType === 'unocss' || item.iconType === 'iconfont'">
      <view :class="[item.icon, isBulge ? 'text-80px' : 'text-22px']" />
    </template>
    <template v-if="item.iconType === 'image'">
      <image :src="getImageByIndex(index, item)" mode="scaleToFill" :class="isBulge ? 'h-80px w-80px' : 'h-22px w-22px'" />
    </template>
    <view v-if="!isBulge" class="mt-2px text-2xs leading-none">
      {{ item.text }}
    </view>
    <!-- 角标显示 -->
    <view v-if="item.badge">
      <template v-if="item.badge === 'dot'">
        <view class="absolute right-0 top-0 h-2 w-2 rounded-full bg-error" />
      </template>
      <template v-else>
        <view class="absolute top-0 box-border h-5 min-w-5 center rounded-full bg-error px-1 text-center text-2xs text-white -right-3">
          {{ item.badge > 99 ? '99+' : item.badge }}
        </view>
      </template>
    </view>
  </view>
</template>
