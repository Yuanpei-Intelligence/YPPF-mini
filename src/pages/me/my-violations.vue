<script lang="ts" setup>
import type { IMyViolationsResponse, IViolationAppoint } from '@/api/types/appoint'
import type { UvToastInstance } from '@/hooks/useApiException'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getMyViolations } from '@/api/appoint'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { formatChineseDate, formatNumber } from '@/utils/format'

definePage({
  style: {
    navigationBarTitleText: '信用分记录',
    enablePullDownRefresh: true,
  },
})

const violations = ref<IMyViolationsResponse>()
const loading = ref<boolean>(false)
/** 首屏加载失败的页内错误；已有数据时失败只 toast */
const loadError = ref('')
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException } = useApiException(toastRef)

const credit = computed(() => formatNumber(violations.value?.user_info?.credit ?? 0))
const vioList = computed(() => violations.value?.vio_list || [])

async function fetchData() {
  loading.value = true
  try {
    violations.value = await getMyViolations()
    loadError.value = ''
  }
  catch (error) {
    console.error(error)
    if (violations.value)
      handleApiException(error)
    else
      loadError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    loading.value = false
  }
}

/** B104 研讨/活动室 */
function roomOf(violation: IViolationAppoint): string {
  return [violation.Rid, violation.Rtitle].filter(Boolean).join(' ') || violation.Room || '未知房间'
}

/** 9月12日 周五 14:00–15:30 */
function timeOf(violation: IViolationAppoint): string {
  const range = [violation.Astart_hour_minute, violation.Afinish_hour_minute].filter(Boolean).join('–')
  return [formatChineseDate(violation.Astart), range].filter(Boolean).join(' ')
}

function handleAppeal(aid: number) {
  uni.navigateTo({
    url: `/pages/appmenu/feedback/feedback?aid=${aid}`,
  })
}

onShow(() => {
  fetchData()
})

onPullDownRefresh(async () => {
  await fetchData()
  uni.stopPullDownRefresh()
})
</script>

<template>
  <view class="yp-page">
    <uv-toast ref="toastRef" />
    <PageState :loading="loading && !violations" :error="loadError" @retry="fetchData">
      <!-- 信用分 -->
      <view class="bg-card px-4 py-6">
        <text class="block text-xs text-fg-3">当前信用分</text>
        <view class="mt-1 flex items-baseline gap-1">
          <text class="text-3xl text-fg-1 font-semibold leading-none tabular-nums">{{ credit }}</text>
          <text class="text-sm text-fg-3">分</text>
        </view>
      </view>

      <!-- 违约记录 -->
      <view class="mt-3 pb-6">
        <text class="block px-4 pb-2 text-xs text-fg-3">违约记录</text>
        <PageState
          :empty="vioList.length === 0"
          empty-icon="i-carbon-checkmark-filled"
          empty-text="还没有违约记录"
          compact
        >
          <view class="bg-card">
            <template v-for="(violation, index) in vioList" :key="violation.Aid">
              <view v-if="index > 0" class="yp-divider" />
              <view class="px-4 py-3">
                <view class="flex items-start gap-2">
                  <text class="min-w-0 flex-1 text-base text-fg-1 font-medium">{{ roomOf(violation) }}</text>
                  <StatusTag type="error" text="违约" class="mt-1 shrink-0" />
                </view>
                <text class="mt-1 block text-sm text-fg-2 tabular-nums">{{ timeOf(violation) }}</text>
                <text v-if="violation.Ausage" class="mt-0.5 block text-xs text-fg-3">用途：{{ violation.Ausage }}</text>
                <view class="mt-2 flex justify-end">
                  <button class="btn-outline btn-sm" @click="handleAppeal(violation.Aid)">
                    申诉
                  </button>
                </view>
              </view>
            </template>
          </view>
        </PageState>
      </view>
    </PageState>
  </view>
</template>
