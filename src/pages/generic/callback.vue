<script setup lang="ts">
/*
    这个页面是用于在回调时，炸掉页面栈用的，否则用户点返回键会回到webview页面
    在webview中，完成了业务，会navigateTo当前页面
    在此我们relaunch到之前所在的tabbar的顶层页面
    这样就清除了页面栈
*/
import { onLoad } from '@dcloudio/uni-app'
import { tabbarList, tabbarStore } from '@/tabbar/store'

function goToLastTabbarPage() {
  const currentTabIdx = tabbarStore.curIdx
  const currentTabPath = tabbarList[currentTabIdx]?.pagePath || '/pages/index/index'
  setTimeout(() => {
    uni.reLaunch({ url: currentTabPath })
  }, 500)
}

// 使用 onLoad 只执行一次，避免 onShow 重复触发
// reLaunch 彻底清空页面栈（含 webview），避免后续 tabbar 点击出现 timeout
onLoad(() => {
  goToLastTabbarPage()
})
</script>

<template>
  <view class="relative yp-page">
    <uv-loading-page
      :loading="true"
      loading-text="正在跳转…"
      loading-mode="circle"
    />
    <view class="fixed bottom-20 left-0 right-0 z-1000 text-center text-sm text-fg-3">
      <text>如果没有自动跳转，请</text>
      <text class="text-primary underline" @click="goToLastTabbarPage">点击此处</text>
      <text>手动跳转</text>
    </view>
  </view>
</template>
