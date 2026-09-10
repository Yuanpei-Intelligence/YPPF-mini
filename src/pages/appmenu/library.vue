<script lang="ts" setup>
import type { Book, LendRecordList, LendRecordType, LibrarySearchQuery } from '@/api/types/library'
import type { StatusTagType } from '@/components/StatusTag.vue'
import type { UvToastInstance } from '@/hooks/useApiException'
import {
  getLibraryConfig,
  getLibraryRecommendations,
  getLibraryRecords,
  searchLibraryBooks,
} from '@/api/library'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { tokens } from '@/style/tokens'
import { formatChineseDate } from '@/utils/format'

definePage({
  style: {
    navigationBarTitleText: '元培书房',
  },
})

const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

const TABS = [{ name: '馆藏查询' }, { name: '我的借阅' }]
const activeTab = ref(0)

// 开馆时间（辅助信息，加载失败时隐藏）
const openingHours = ref('')

// 馆藏查询
const searchKeyword = ref('')
const onlyAvailable = ref(false)
const searched = ref(false)
const searching = ref(false)
const searchError = ref('')
const searchResults = ref<Book[]>([])

// 我的借阅
const records = ref<LendRecordList[]>([])
const recordsLoading = ref(false)
const recordsLoaded = ref(false)
const recordsError = ref('')

// 随机推荐
const recommendations = ref<Book[]>([])
const recommendationsLoading = ref(true)
const recommendationsError = ref('')

const RECORD_STATUS: Record<LendRecordType, { text: string, type: StatusTagType }> = {
  normal: { text: '借阅中', type: 'processing' },
  approaching: { text: '即将到期', type: 'warning' },
  overtime: { text: '已逾期', type: 'error' },
  returned: { text: '已归还', type: 'success' },
  overtime_returned: { text: '逾期归还', type: 'default' },
}

function recordStatus(type: LendRecordType) {
  return RECORD_STATUS[type] ?? RECORD_STATUS.normal
}

async function loadLibraryConfig() {
  try {
    const config = await getLibraryConfig()
    openingHours.value = `${config.opening_time_start}–${config.opening_time_end}`
  }
  catch (error) {
    // 开馆时间只是装饰性信息：失败时不展示该行，也不单独打扰用户
    handleApiException(error, { showToast: false })
  }
}

async function loadRecommendations() {
  recommendationsLoading.value = true
  recommendationsError.value = ''
  try {
    recommendations.value = await getLibraryRecommendations({ num: 5 })
  }
  catch (error) {
    console.error('加载推荐书籍失败:', error)
    recommendationsError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    recommendationsLoading.value = false
  }
}

async function loadRecords() {
  if (recordsLoading.value)
    return
  recordsLoading.value = true
  recordsError.value = ''
  try {
    records.value = await getLibraryRecords({ returned: 'all' })
    recordsLoaded.value = true
  }
  catch (error) {
    console.error('加载借阅记录失败:', error)
    if (recordsLoaded.value)
      handleApiException(error)
    else
      recordsError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    recordsLoading.value = false
  }
}

async function handleSearch() {
  const keywords = searchKeyword.value.trim()
  if (!keywords && !onlyAvailable.value) {
    showMessage('请输入搜索关键词', 'warning')
    return
  }
  if (searching.value)
    return
  searching.value = true
  searched.value = true
  searchError.value = ''
  try {
    const query: LibrarySearchQuery = {}
    if (keywords)
      query.keywords = keywords
    // 「只看可借阅」= 已归还的书籍
    if (onlyAvailable.value)
      query.returned = true
    searchResults.value = await searchLibraryBooks(query)
  }
  catch (error) {
    console.error('搜索失败:', error)
    searchError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    searching.value = false
  }
}

function onTabChange(item: { index: number }) {
  activeTab.value = item.index
  if (item.index === 1)
    void loadRecords()
}

onMounted(() => {
  void loadLibraryConfig()
  void loadRecommendations()
})
</script>

<template>
  <view class="yp-page px-4 py-3">
    <uv-toast ref="toastRef" />

    <!-- 封面：2:1 比例，随屏宽缩放 -->
    <view class="overflow-hidden rounded-lg bg-card">
      <view class="relative w-full bg-fill pt-[50%]">
        <image
          src="/static/images/background.jpg"
          mode="aspectFill"
          class="absolute left-0 top-0 h-full w-full"
        />
      </view>
      <view v-if="openingHours" class="flex items-center gap-1 px-4 py-3 text-xs text-fg-3">
        <view class="i-carbon-time" />
        <text>今日开馆 {{ openingHours }}</text>
      </view>
    </view>

    <!-- 馆藏查询 / 我的借阅 -->
    <view class="mt-3 overflow-hidden rounded-lg bg-card">
      <uv-tabs
        :list="TABS"
        :current="activeTab"
        :scrollable="false"
        :line-color="tokens.primary"
        :active-style="{ color: tokens.text1, fontWeight: 600 }"
        :inactive-style="{ color: tokens.text2 }"
        @change="onTabChange"
      />

      <view v-if="activeTab === 0" class="p-4">
        <uv-search
          v-model="searchKeyword"
          placeholder="搜索书名 / 作者 / 索书号"
          action-text="搜索"
          :animation="false"
          :bg-color="tokens.bgFill"
          :color="tokens.text1"
          :placeholder-color="tokens.text3"
          :search-icon-color="tokens.text3"
          :action-style="{ color: tokens.primary }"
          height="36"
          @search="handleSearch"
          @custom="handleSearch"
        />
        <view class="mt-2 flex items-center justify-between">
          <text class="min-h-88rpx flex items-center text-sm text-fg-2" @click="onlyAvailable = !onlyAvailable">只看可借阅</text>
          <uv-switch v-model="onlyAvailable" size="20" :active-color="tokens.primary" />
        </view>

        <view class="mt-2">
          <PageState
            v-if="searched"
            :loading="searching"
            :error="searchError"
            :empty="searchResults.length === 0"
            empty-text="没有找到相关图书"
            empty-icon="i-carbon-search"
            compact
            @retry="handleSearch"
          >
            <view
              v-for="(book, idx) in searchResults"
              :key="book.id"
              class="flex items-start gap-3 rounded-md bg-fill p-3"
              :class="{ 'mt-3': idx > 0 }"
            >
              <view class="i-carbon-book mt-1 shrink-0 text-fg-3" />
              <view class="min-w-0 flex-1">
                <view class="flex items-start justify-between gap-2">
                  <text class="line-clamp-2 flex-1 text-base text-fg-1 font-medium">{{ book.title || '未知书名' }}</text>
                  <StatusTag :type="book.returned ? 'success' : 'default'" :text="book.returned ? '可借阅' : '已借出'" />
                </view>
                <text class="mt-1 block text-sm text-fg-2">{{ book.author || '未知作者' }}<text v-if="book.publisher"> · {{ book.publisher }}</text></text>
                <text v-if="book.identity_code" class="mt-1 block text-xs text-fg-3">索书号 {{ book.identity_code }}</text>
              </view>
            </view>
          </PageState>
          <text v-else class="block py-4 text-center text-xs text-fg-3">输入关键词查找馆藏，或打开「只看可借阅」后直接搜索</text>
        </view>
      </view>

      <view v-else class="p-4">
        <PageState
          :loading="recordsLoading && !recordsLoaded"
          :error="recordsError"
          :empty="records.length === 0"
          empty-text="还没有借阅记录"
          empty-icon="i-carbon-book"
          compact
          @retry="loadRecords"
        >
          <view
            v-for="(record, idx) in records"
            :key="record.id"
            class="rounded-md bg-fill p-3"
            :class="{ 'mt-3': idx > 0 }"
          >
            <view class="flex items-start justify-between gap-2">
              <text class="line-clamp-2 flex-1 text-base text-fg-1 font-medium">{{ record.book_id__title || '未知书籍' }}</text>
              <StatusTag :type="recordStatus(record.type).type" :text="recordStatus(record.type).text" />
            </view>
            <text class="mt-1 block text-xs text-fg-3">借于 {{ formatChineseDate(record.lend_time, false) }}<text v-if="record.due_time"> · 应还 {{ formatChineseDate(record.due_time, false) }}</text></text>
          </view>
        </PageState>
      </view>
    </view>

    <!-- 随机推荐 -->
    <view class="mt-6">
      <text class="block px-1 yp-section-title">随机推荐</text>
      <view class="mt-3">
        <PageState
          :loading="recommendationsLoading"
          :error="recommendationsError"
          :empty="recommendations.length === 0"
          empty-text="还没有推荐图书"
          empty-icon="i-carbon-book"
          compact
          @retry="loadRecommendations"
        >
          <scroll-view scroll-x enable-flex class="w-full">
            <view class="flex gap-3">
              <view
                v-for="book in recommendations"
                :key="book.id"
                class="w-400rpx shrink-0 yp-card-flat"
              >
                <view class="i-carbon-book text-lg text-primary" />
                <text class="line-clamp-2 mt-2 block text-base text-fg-1 font-medium">{{ book.title || '未知书名' }}</text>
                <text class="mt-1 block truncate text-sm text-fg-2">{{ book.author || '未知作者' }}</text>
                <text class="mt-2 block text-xs text-fg-3">索书号 {{ book.identity_code || '—' }}</text>
              </view>
            </view>
          </scroll-view>
        </PageState>
      </view>
    </view>
  </view>
</template>
