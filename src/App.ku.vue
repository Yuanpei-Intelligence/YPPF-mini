<script setup lang="ts">
import { ref } from 'vue'
import AppConfirmModal from '@/components/AppConfirmModal.vue'
import FgTabbar from '@/tabbar/index.vue'
import { isPageTabbar } from './tabbar/store'
import { currRoute } from './utils'

const isCurrentPageTabbar = ref(true)
onShow(() => {
  const { path } = currRoute()
  // 线上环境首页路径可能是 '/'（本地是 '/pages/index/index'），此时也要显示 tabbar
  isCurrentPageTabbar.value = path === '/' ? true : isPageTabbar(path)
})
</script>

<template>
  <view>
    <KuRootView />

    <FgTabbar v-if="isCurrentPageTabbar" />
    <!-- Global confirmation dialog driven by `useConfirm()` -->
    <AppConfirmModal />
  </view>
</template>
