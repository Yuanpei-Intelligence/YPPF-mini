<script lang="ts" setup>
import type { IMyViolationsResponse } from '@/api/types/appoint'
import type { UvToastInstance } from '@/hooks/useApiException'
import { getMyViolations } from '@/api/appoint'
import { useApiException } from '@/hooks/useApiException'

definePage({
  style: {
    navigationBarTitleText: '我的信用分记录',
    navigationStyle: 'default',
  },
})

const violations = ref<IMyViolationsResponse>()
const loading = ref<boolean>(false)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException } = useApiException(toastRef)

const credit = computed(() => violations.value?.user_info?.credit || 0)
const vioList = computed(() => violations.value?.vio_list || [])

async function fetchData() {
  loading.value = true
  try {
    const res = await getMyViolations()
    violations.value = res
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
  }
  finally {
    loading.value = false
  }
}

function handleAppeal(aid: number, room: string | null | undefined) {
  uni.navigateTo({
    url: `/pages/appmenu/feedback/feedback?aid=${aid}`,
  })
}

onShow(() => {
  fetchData()
})
</script>

<template>
  <uv-toast ref="toastRef" />
  <view class="min-h-screen bg-gray-50 pb-10">
    <!-- 信用分卡片 -->
    <view v-if="violations || loading" class="mx-4 mt-4 overflow-hidden border border-blue-100 rounded-lg bg-white shadow-sm">
      <view class="border-b border-blue-100 from-blue-50 to-cyan-50 bg-gradient-to-r px-4 py-4">
        <view class="mb-1 text-sm text-gray-600">
          当前信用分
        </view>
        <view class="flex items-center gap-2">
          <text class="text-3xl text-blue-600 font-bold">{{ credit }}</text>
          <text class="text-sm text-gray-500">分</text>
        </view>
      </view>
    </view>

    <view class="p-4">
      <!-- Loading -->
      <view v-if="loading && !violations" class="py-10 text-center text-gray-400">
        加载中...
      </view>

      <!-- 违约记录列表 -->
      <block v-else>
        <view v-if="vioList.length === 0" class="py-10 text-center text-gray-400">
          暂无违约记录
        </view>

        <view
          v-for="violation in vioList"
          :key="violation.Aid"
          class="mb-4 overflow-hidden border border-red-100 rounded-lg bg-white shadow-sm"
        >
          <!-- Header -->
          <view class="border-b border-red-100 from-red-50 to-pink-50 bg-gradient-to-r px-4 py-3">
            <view class="flex items-start justify-between gap-2">
              <view class="flex-1">
                <view v-if="violation.Rid" class="mb-1 text-sm text-gray-600">
                  {{ violation.Rid }}
                </view>
                <view class="text-base text-gray-800 font-bold">
                  {{ violation.Rtitle || '未知房间' }}
                </view>
              </view>
              <wd-tag type="danger" plain>
                违约
              </wd-tag>
            </view>
          </view>

          <!-- Content -->
          <view class="px-4 py-3 space-y-2.5">
            <!-- 预约日期 -->
            <view class="flex items-center text-sm text-gray-700">
              <div class="i-carbon-calendar mr-2.5 text-lg text-red-500" />
              <text class="font-medium">{{ violation.Astart?.split('T')?.[0] || '--' }}</text>
            </view>

            <!-- 预约时间 -->
            <view class="flex items-center text-sm text-gray-700">
              <div class="i-carbon-time mr-2.5 text-lg text-red-500" />
              <text>{{ violation.Astart_hour_minute }} - {{ violation.Afinish_hour_minute }}</text>
            </view>

            <!-- 房间信息 -->
            <view v-if="violation.Room" class="flex items-start text-sm text-gray-700">
              <div class="i-carbon-location mr-2.5 mt-0.5 flex-shrink-0 text-lg text-red-500" />
              <view class="flex-1">
                <text class="text-gray-600">房间：</text>
                <text class="text-gray-800">{{ violation.Room }}</text>
              </view>
            </view>

            <!-- 用途 -->
            <view v-if="violation.Ausage" class="flex items-start text-sm text-gray-700">
              <div class="i-carbon-document mr-2.5 mt-0.5 flex-shrink-0 text-lg text-red-500" />
              <view class="flex-1">
                <text class="text-gray-600">用途：</text>
                <text class="text-gray-800">{{ violation.Ausage }}</text>
              </view>
            </view>
          </view>

          <!-- Actions -->
          <view class="flex items-center gap-2 border-t border-gray-100 px-4 py-3">
            <button
              class="flex-1 rounded-lg bg-blue-500 py-2 text-sm text-white font-medium"
              @click="handleAppeal(violation.Aid, violation.Room)"
            >
              申诉
            </button>
          </view>
        </view>
      </block>
    </view>
  </view>
</template>

<style lang="scss" scoped>
</style>
