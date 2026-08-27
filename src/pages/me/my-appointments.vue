<script lang="ts" setup>
import type { IMyAppointmentsResponse } from '@/api/types/appoint'
import type { UvToastInstance } from '@/hooks/useApiException'
import { cancelAppoint, getMyAppointments, renewLongtermAppoint } from '@/api/appoint'
import ApiFieldError from '@/components/ApiFieldError.vue'
import { useApiException } from '@/hooks/useApiException'

definePage({
  style: {
    navigationBarTitleText: '我的预约',
  },
})

interface UvPopupInstance {
  open: () => void
  close: () => void
}

interface UvModalInstance {
  open: () => void
  close: () => void
}

const tabIndex = ref<number>(0)
const showLongterm = ref<boolean>(true)
const appointments = ref<IMyAppointmentsResponse>()
const loading = ref<boolean>(false)

// 续约相关
const showRenewPopup = ref<boolean>(false)
const currentRenewLongtermId = ref<number | null>(null)
const selectedWeeks = ref<number>(1)
const renewLoading = ref<boolean>(false)
const renewPopupRef = ref<UvPopupInstance | null>(null)
const cancelModalRef = ref<UvModalInstance | null>(null)
const pendingCancel = ref<{ id: number, isLongterm: boolean } | null>(null)
const toastRef = ref<UvToastInstance | null>(null)
const { clearFieldError, getFieldMessages, handleApiException, setFieldError, showMessage } = useApiException(toastRef)

const futureList = computed(() => appointments.value?.appoint_list_future || [])
const pastList = computed(() => appointments.value?.appoint_list_past || [])
const longtermList = computed(() => appointments.value?.appoint_list_longterm || [])
const hasLongtermPermission = computed(() => appointments.value?.has_longterm_permission || false)

// 普通预约列表，根据toggle过滤长期预约
const normalAppointList = computed(() => {
  if (showLongterm.value) {
    return futureList.value
  }
  else {
    // 过滤掉Atype为长期的预约
    return futureList.value.filter(item => item.Atype !== '长期预约')
  }
})

async function fetchData() {
  loading.value = true
  try {
    const res = await getMyAppointments()
    appointments.value = res
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
  }
  finally {
    loading.value = false
  }
}

function _getAppointListByTab(tabIndex: number) {
  if (hasLongtermPermission.value) {
    // 有权限：0=普通预约, 1=历史预约, 2=长期预约
    if (tabIndex === 0) {
      return normalAppointList.value
    }
    else if (tabIndex === 1) {
      return pastList.value
    }
    else {
      return longtermList.value
    }
  }
  else {
    // 无权限：0=普通预约, 1=历史预约
    if (tabIndex === 0) {
      return normalAppointList.value
    }
    else {
      return pastList.value
    }
  }
}

onShow(() => {
  fetchData()
})

function handleRenewLongterm(longterm_id: number) {
  currentRenewLongtermId.value = longterm_id
  selectedWeeks.value = 1
  showRenewPopup.value = true
  // 打开 popup
  nextTick(() => {
    if (renewPopupRef.value) {
      renewPopupRef.value.open()
    }
  })
}

function closeRenewPopup() {
  if (renewPopupRef.value) {
    renewPopupRef.value.close()
  }
  showRenewPopup.value = false
  currentRenewLongtermId.value = null
  selectedWeeks.value = 1
}

async function confirmRenew() {
  if (!currentRenewLongtermId.value) {
    setFieldError('times', '请选择续约周数。', 'required')
    showMessage('请选择续约周数。', 'warning')
    return
  }

  if (selectedWeeks.value <= 0) {
    setFieldError('times', '续约周数必须大于 0。', 'min_value')
    showMessage('续约周数必须大于 0。', 'warning')
    return
  }

  renewLoading.value = true
  try {
    await renewLongtermAppoint({
      longterm_id: currentRenewLongtermId.value,
      times: selectedWeeks.value,
    })
    showMessage('续约成功。', 'success')
    closeRenewPopup()
    fetchData()
  }
  catch (error) {
    handleApiException(error)
  }
  finally {
    renewLoading.value = false
  }
}

function handleCancelAppoint(aid: number, isLongterm: boolean) {
  pendingCancel.value = { id: aid, isLongterm }
  cancelModalRef.value?.open()
}

function confirmCancelAppoint() {
  const pending = pendingCancel.value
  if (!pending)
    return
  void _cancelAppoint(pending.id, pending.isLongterm)
  pendingCancel.value = null
}

async function _cancelAppoint(aid: number, isLongterm: boolean) {
  try {
    await cancelAppoint({
      type: isLongterm ? 'longterm' : 'appoint',
      cancel_id: aid,
    })
    showMessage('取消成功。', 'success')
    fetchData()
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
  }
}
</script>

<template>
  <uv-toast ref="toastRef" />
  <uv-modal
    ref="cancelModalRef"
    title="取消预约"
    :content="pendingCancel?.isLongterm ? '确定取消该长期预约吗？' : '确定取消该预约吗？'"
    show-cancel-button
    @confirm="confirmCancelAppoint"
  />
  <view class="min-h-screen bg-gray-50 pb-10">
    <view class="sticky top-0 z-10 bg-white shadow-sm">
      <view v-if="appointments || loading" class="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-2">
        <text class="text-sm text-gray-700">
          您有 {{ futureList.length || 0 }} 条预约待进行
        </text>
        <view class="flex items-center justify-center">
          <text class="mr-2 text-sm text-gray-700">
            显示长期预约
          </text>
          <wd-switch v-model="showLongterm" size="20px" />
        </view>
      </view>

      <wd-tabs v-model="tabIndex">
        <wd-tab title="普通预约">
          <!-- Content handled in list below -->
        </wd-tab>
        <wd-tab title="历史预约">
          <!-- Content handled in list below -->
        </wd-tab>
        <wd-tab v-if="hasLongtermPermission" title="长期预约">
          <!-- Content handled in list below -->
        </wd-tab>
      </wd-tabs>
    </view>

    <view class="p-4">
      <!-- Loading Skeleton or empty -->
      <view v-if="loading && !appointments" class="py-10 text-center text-gray-400">
        加载中...
      </view>

      <!-- 预约列表 (根据 Tab) -->
      <block v-else>
        <view v-if="_getAppointListByTab(tabIndex).length === 0" class="py-10 text-center text-gray-400">
          暂无预约记录
        </view>

        <!-- 长期预约卡片 -->
        <block v-if="hasLongtermPermission && tabIndex === 2">
          <view
            v-for="longterm in longtermList"

            :key="longterm.longterm_id"
            class="mb-4 overflow-hidden border border-blue-100 rounded-lg bg-white shadow-sm"
          >
            <!-- Header -->
            <view class="border-b border-blue-100 from-blue-50 to-cyan-50 bg-gradient-to-r px-4 py-3">
              <view class="flex items-start justify-between gap-2">
                <view class="flex-1">
                  <view class="mb-1 text-sm text-gray-600">
                    {{ longterm.appoint.Rid }}
                  </view>
                  <view class="text-base text-gray-800 font-bold">
                    {{ longterm.appoint.Rtitle }}
                  </view>
                </view>
                <wd-tag :type="longterm.status === '已通过' ? 'success' : (longterm.status === '审核中' ? 'warning' : 'danger')" plain>
                  {{ longterm.status }}
                </wd-tag>
              </view>
            </view>

            <!-- Content -->
            <view class="px-4 py-3 space-y-2.5">
              <!-- 周次和时间 -->
              <view class="flex items-center text-sm text-gray-700">
                <div class="i-carbon-calendar mr-2.5 text-lg text-blue-500" />
                <text class="font-medium">
                  {{ longterm.appoint.Aweek?.substring(0, 3) || '周一' }}
                </text>
                <text class="mx-2 text-gray-400">·</text>
                <text>{{ longterm.appoint.Astart_hour_minute }} - {{ longterm.appoint.Afinish_hour_minute }}</text>
              </view>

              <!-- 开始日期 -->
              <view class="flex items-center text-sm text-gray-700">
                <div class="i-carbon-time mr-2.5 text-lg text-blue-500" />
                <text>开始日期：</text>
                <text class="font-medium">{{ longterm.appoint.Astart?.split('T')?.[0] || '--' }} 起</text>
              </view>

              <!-- 周期 -->
              <view class="flex items-start text-sm text-gray-700">
                <div class="i-carbon-repeat mr-2.5 mt-0.5 flex-shrink-0 text-lg text-blue-500" />
                <view class="flex-1">
                  <text>
                    {{ longterm.interval === 1 ? '每周一次' : (longterm.interval === 2 ? '隔周一次' : `每 ${longterm.interval} 周一次`) }}
                  </text>
                  <text class="text-gray-600">，共 {{ longterm.times }} 次</text>
                </view>
              </view>

              <!-- 用途 -->
              <view v-if="longterm.appoint.Ausage" class="flex items-start text-sm text-gray-700">
                <div class="i-carbon-document mr-2.5 mt-0.5 flex-shrink-0 text-lg text-blue-500" />
                <view class="flex-1">
                  <text class="text-gray-600">用途：</text>
                  <text class="text-gray-800">{{ longterm.appoint.Ausage }}</text>
                </view>
              </view>

              <!-- 预约通知 -->
              <view v-if="longterm.appoint.Aannouncement" class="flex items-start border border-yellow-100 rounded-md bg-yellow-50 px-3 py-2 text-sm text-gray-700">
                <div class="i-carbon-notification mr-2 mt-0.5 flex-shrink-0 text-lg text-yellow-600" />
                <view class="flex-1">
                  <text class="text-yellow-900">{{ longterm.appoint.Aannouncement }}</text>
                </view>
              </view>
            </view>

            <!-- 审核意见（未通过时） -->
            <view v-if="longterm.status === '未通过' && longterm.review_comment" class="border-t border-red-100 bg-red-50 px-4 py-2">
              <text class="text-xs text-red-600">
                <text class="font-medium">审核意见：</text>{{ longterm.review_comment }}
              </text>
            </view>

            <!-- Actions -->
            <view class="flex items-center gap-2 border-t border-gray-100 px-4 py-3">
              <!-- 续约按钮（已通过且可续约） -->
              <button
                v-if="longterm.status === '已通过' && longterm.renewable"
                class="flex-1 rounded-lg bg-blue-500 py-2 text-sm text-white font-medium"
                @click="handleRenewLongterm(longterm.longterm_id)"
              >
                续约
              </button>

              <!-- 取消按钮（可取消） -->
              <button
                v-if="longterm.status !== '已取消' && longterm.status !== '未通过'"
                class="flex-1 border border-red-200 rounded-lg bg-red-50 py-2 text-sm text-red-600 font-medium"
                @click="handleCancelAppoint(longterm.longterm_id, true)"
              >
                取消预约
              </button>

              <!-- 其他状态按钮 -->
              <view v-if="longterm.status === '已取消' || longterm.status === '未通过'" class="flex-1 text-center">
                <text class="text-xs text-gray-500">无可用操作</text>
              </view>
            </view>
          </view>
        </block>

        <!-- 普通预约卡片 -->
        <block v-if="!(hasLongtermPermission && tabIndex === 2)">
          <view
            v-for="item in _getAppointListByTab(tabIndex)"
            :key="item.Aid"
            class="mb-4 overflow-hidden border rounded-lg bg-white shadow-sm"
            :class="tabIndex === 1 || (hasLongtermPermission && tabIndex === 1) ? 'border-gray-200' : 'border-green-100'"
          >
            <!-- Header -->
            <view
              class="border-b px-4 py-3"
              :class="tabIndex === 1 || (hasLongtermPermission && tabIndex === 1)
                ? 'border-gray-200 from-gray-50 to-gray-100 bg-gradient-to-r'
                : 'border-green-100 from-green-50 to-emerald-50 bg-gradient-to-r'"
            >
              <view class="flex items-start justify-between gap-2">
                <view class="flex-1">
                  <view v-if="item.Rid" class="mb-1 text-sm text-gray-600">
                    {{ item.Rid }}
                  </view>
                  <view class="text-base text-gray-800 font-bold">
                    {{ item.Rtitle }}
                  </view>
                </view>
                <wd-tag :type="tabIndex === 0 || (hasLongtermPermission && tabIndex === 1) ? 'success' : 'info'" plain>
                  {{ item.Astatus }}
                </wd-tag>
              </view>
            </view>

            <!-- Content -->
            <view class="px-4 py-3 space-y-2.5">
              <!-- 预约日期 -->
              <view class="flex items-center text-sm text-gray-700">
                <div
                  class="mr-2.5 text-lg"
                  :class="tabIndex === 1 || (hasLongtermPermission && tabIndex === 1) ? 'i-carbon-calendar text-gray-400' : 'i-carbon-calendar text-green-500'"
                />
                <text class="font-medium">{{ item.Astart?.split('T')?.[0] || '--' }}</text>
              </view>

              <!-- 预约时间 -->
              <view class="flex items-center text-sm text-gray-700">
                <div
                  class="mr-2.5 text-lg"
                  :class="tabIndex === 1 || (hasLongtermPermission && tabIndex === 1) ? 'i-carbon-time text-gray-400' : 'i-carbon-time text-green-500'"
                />
                <text>{{ item.Astart_hour_minute }} - {{ item.Afinish_hour_minute }}</text>
              </view>

              <!-- 发起人 -->
              <view v-if="item.major_student" class="flex items-start text-sm text-gray-700">
                <div
                  class="mr-2.5 mt-0.5 flex-shrink-0 text-lg"
                  :class="tabIndex === 1 || (hasLongtermPermission && tabIndex === 1) ? 'i-carbon-user text-gray-400' : 'i-carbon-user text-green-500'"
                />
                <view class="flex-1">
                  <text class="text-gray-600">发起人：</text>
                  <text class="text-gray-800">{{ item.major_student.Sname }}</text>
                </view>
              </view>

              <!-- 用途 -->
              <view v-if="item.Ausage" class="flex items-start text-sm text-gray-700">
                <div
                  class="mr-2.5 mt-0.5 flex-shrink-0 text-lg"
                  :class="tabIndex === 1 || (hasLongtermPermission && tabIndex === 1) ? 'i-carbon-document text-gray-400' : 'i-carbon-document text-green-500'"
                />
                <view class="flex-1">
                  <text class="text-gray-600">用途：</text>
                  <text class="text-gray-800">{{ item.Ausage }}</text>
                </view>
              </view>

              <!-- 人数 -->
              <view class="flex items-start text-sm text-gray-700">
                <div
                  class="mr-2.5 mt-0.5 flex-shrink-0 text-lg"
                  :class="tabIndex === 1 || (hasLongtermPermission && tabIndex === 1) ? 'i-carbon-group text-gray-400' : 'i-carbon-group text-green-500'"
                />
                <view class="flex-1">
                  <text class="text-gray-600">人数：</text>
                  <text class="text-gray-800">本院 {{ item.yp_num }} / 外院 {{ item.non_yp_num }} 人</text>
                </view>
              </view>
            </view>

            <!-- Actions -->
            <view v-if="item.can_cancel" class="flex items-center gap-2 border-t border-gray-100 px-4 py-3">
              <view class="flex-1">
                <text class="text-xs text-gray-500">如果不需要使用，请及时取消</text>
              </view>
              <button class="border border-red-200 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 font-medium" @click="handleCancelAppoint(item.Aid, false)">
                取消预约
              </button>
            </view>
          </view>
        </block>
      </block>
    </view>
  </view>

  <!-- 续约弹窗 -->
  <uv-popup ref="renewPopupRef" mode="bottom" :round="16" :close-on-click-overlay="true" @close="closeRenewPopup">
    <view class="bg-white pb-safe">
      <view class="border-b border-gray-100 px-4 py-4">
        <view class="text-center text-lg text-gray-800 font-bold">
          续约长期预约
        </view>
      </view>

      <view class="px-4 py-6">
        <view class="mb-6 text-center text-sm text-gray-600">
          请选择续约周数
        </view>

        <view class="flex items-center justify-center gap-6">
          <button
            class="h-14 w-14 flex items-center justify-center border-2 border-gray-300 rounded-full bg-white text-xl text-gray-600 font-bold"
            :disabled="selectedWeeks <= 1"
            :class="selectedWeeks <= 1 ? 'opacity-50' : 'active:bg-gray-50'"
            @click="selectedWeeks = Math.max(1, selectedWeeks - 1); clearFieldError('times')"
          >
            −
          </button>
          <view class="min-w-24 text-center">
            <text class="text-4xl text-gray-900 font-bold">{{ selectedWeeks }}</text>
            <text class="ml-2 text-base text-gray-500">周</text>
          </view>
          <button
            class="h-14 w-14 flex items-center justify-center border-2 border-gray-300 rounded-full bg-white text-xl text-gray-600 font-bold active:bg-gray-50"
            @click="selectedWeeks = selectedWeeks + 1; clearFieldError('times')"
          >
            +
          </button>
        </view>
        <ApiFieldError class="mt-3 text-center" :messages="getFieldMessages('times')" />
      </view>

      <view class="flex gap-3 px-4 pb-4 pt-2">
        <button
          class="flex-1 border border-gray-300 rounded-lg bg-white py-3 text-gray-700 font-medium active:bg-gray-50"
          :disabled="renewLoading"
          @click="closeRenewPopup"
        >
          取消
        </button>
        <button
          class="flex-1 rounded-lg bg-blue-500 py-3 text-white font-medium active:bg-blue-600"
          :disabled="renewLoading"
          @click="confirmRenew"
        >
          {{ renewLoading ? '提交中...' : '确认续约' }}
        </button>
      </view>
    </view>
  </uv-popup>
</template>

<style lang="scss" scoped>
:deep(.wd-tabs__nav) {
  background-color: transparent;
}
</style>
