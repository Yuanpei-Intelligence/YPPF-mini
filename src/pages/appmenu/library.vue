<script lang="ts" setup>
import type {
  Book,
  LendRecordList,
  LendRecordType,
  LibrarySearchQuery,
} from '@/api/types/library'
import type { UvToastInstance } from '@/hooks/useApiException'
import {
  getLibraryConfig,
  getLibraryRecommendations,
  getLibraryRecords,
  searchLibraryBooks,
} from '@/api/library'
import { useApiException } from '@/hooks/useApiException'

definePage({
  style: {
    navigationBarTitleText: '图书馆',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
  },
})

// 开放时间
const openingHours = ref('')
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

// Tab展开状态
const searchExpanded = ref(true)
const recordsExpanded = ref(false)

// 搜索相关
const searchKeyword = ref('')
const searchResults = ref<Book[]>([])
const searching = ref(false)

// 是否只显示可借阅
const onlyAvailable = ref(false)

// 推荐书籍
const recommendations = ref<Book[]>([])

// 借阅记录
const records = ref<LendRecordList[]>([])

// 轮播图当前索引：0-随机推荐，1-近期活动
const carouselIndex = ref(0)

// 轮播图定时器
let carouselTimer: number | null = null

// 加载图书馆配置
async function loadLibraryConfig() {
  try {
    const config = await getLibraryConfig()
    openingHours.value = `${config.opening_time_start} - ${config.opening_time_end}`
  }
  catch (error) {
    console.error('加载配置失败:', error)
    handleApiException(error)
  }
}

// 加载推荐书籍
async function loadRecommendations() {
  try {
    recommendations.value = await getLibraryRecommendations({ num: 5 })
  }
  catch (error) {
    console.error('加载推荐书籍失败:', error)
    handleApiException(error)
  }
}

// 加载借阅记录
async function loadRecords() {
  try {
    records.value = await getLibraryRecords({ returned: 'all' })
  }
  catch (error) {
    console.error('加载借阅记录失败:', error)
    handleApiException(error)
  }
}

// 搜索书籍
async function handleSearch() {
  // 如果没有输入关键词且没有选择"可借阅"，提示输入
  if (!searchKeyword.value.trim() && !onlyAvailable.value) {
    showMessage('请输入搜索关键词', 'warning')
    return
  }

  try {
    searching.value = true
    const query: LibrarySearchQuery = {}

    // 如果有搜索关键词，添加keywords参数
    if (searchKeyword.value.trim()) {
      query.keywords = searchKeyword.value.trim()
    }

    // 如果选择了"可借阅"，只搜索已归还的书籍（已归还=可借阅）
    if (onlyAvailable.value) {
      query.returned = true
    }

    searchResults.value = await searchLibraryBooks(query)
  }
  catch (error) {
    console.error('搜索失败:', error)
    handleApiException(error)
  }
  finally {
    searching.value = false
  }
}

// 切换搜索框展开/收缩
function toggleSearch() {
  searchExpanded.value = !searchExpanded.value
  if (searchExpanded.value) {
    recordsExpanded.value = false
  }
}

// 切换借阅记录展开/收缩
function toggleRecords() {
  recordsExpanded.value = !recordsExpanded.value
  if (recordsExpanded.value) {
    searchExpanded.value = false
    loadRecords()
  }
}

function getRecordStatusInfo(type: LendRecordType) {
  if (type === 'returned') {
    return { text: '已归还', className: 'bg-green-100 text-green-600' }
  }
  if (type === 'overtime_returned') {
    return { text: '逾期归还', className: 'bg-gray-100 text-gray-600' }
  }
  if (type === 'overtime') {
    return { text: '已逾期', className: 'bg-red-100 text-red-600' }
  }
  if (type === 'approaching') {
    return { text: '即将到期', className: 'bg-yellow-100 text-yellow-700' }
  }
  return { text: '借阅中', className: 'bg-orange-100 text-orange-600' }
}

// 格式化时间
function formatTime(time: string | undefined) {
  if (!time)
    return '未知'
  const date = new Date(time)
  return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

// 启动轮播图自动切换
function startCarouselTimer() {
  // 清除之前的定时器
  if (carouselTimer !== null) {
    clearInterval(carouselTimer)
  }
  // 每10秒自动切换
  carouselTimer = setInterval(() => {
    carouselIndex.value = carouselIndex.value === 0 ? 1 : 0
  }, 10000) as unknown as number
}

// 手动切换轮播图（重置定时器）
function switchCarousel(index: number) {
  carouselIndex.value = index
  startCarouselTimer()
}

// 页面加载
onMounted(() => {
  loadLibraryConfig()
  loadRecommendations()
  startCarouselTimer()
})

// 页面卸载时清除定时器
onUnmounted(() => {
  if (carouselTimer !== null) {
    clearInterval(carouselTimer)
    carouselTimer = null
  }
})
</script>

<template>
  <view class="min-h-screen bg-gray-50">
    <uv-toast ref="toastRef" />
    <!-- 顶部背景图片区域 -->
    <view
      class="relative w-full overflow-hidden"
      style="background-size: 100%; height: calc(100vw * 0.4); min-height: 420px; max-height: 600px; border-bottom-left-radius: 0; border-bottom-right-radius: 0;"
    >
      <image
        src="@img/background.jpg"
        mode="aspectFill"
        class="h-full w-full"
      />
      <!-- 右上角开放时间 -->
      <view class="absolute right-3 top-3 z-10">
        <text class="text-base text-black" style="font-size: 16px;">
          <text class="i-carbon-play mr-1" />
          今日开馆: {{ openingHours || '07:00 - 23:00' }}
        </text>
      </view>

      <!-- 搜索框区域 -->
      <view
        class="absolute left-[10%] w-[80%] rounded-lg"
        style="opacity: 0.95; top: 15%;"
      >
        <!-- Tab按钮行 -->
        <view class="flex">
          <!-- 馆藏查询Tab -->
          <view
            class="flex-1 cursor-pointer rounded-tl-lg px-4 py-2"
            :class="searchExpanded ? 'bg-blue-50' : 'bg-blue-100'"
            @click="toggleSearch"
          >
            <view class="flex items-center justify-between">
              <text class="text-base text-gray-800">
                <text class="i-carbon-search mr-1" />
                馆藏查询
              </text>
              <text class="i-carbon-chevron-down text-xs" :class="{ 'rotate-180': searchExpanded }" />
            </view>
          </view>

          <!-- 我的借阅Tab -->
          <view
            class="flex-1 cursor-pointer rounded-tr-lg px-4 py-2"
            :class="recordsExpanded ? 'bg-blue-50' : 'bg-blue-100'"
            @click="toggleRecords"
          >
            <text class="text-base text-gray-800">
              <text class="i-carbon-time mr-1" />
              我的借阅
            </text>
          </view>
        </view>

        <!-- 馆藏查询内容（可展开/收缩） -->
        <view
          v-show="searchExpanded"
          class="rounded-bl-lg rounded-br-lg bg-blue-50 p-4"
        >
          <view class="mb-3">
            <view class="flex items-center gap-2">
              <input
                v-model="searchKeyword"
                class="flex-1 border-2 border-blue-500 rounded-lg bg-white px-4 py-2.5 text-sm"
                placeholder="搜索书名/作者/索书号/出版社"
                @confirm="handleSearch"
              >
              <view
                class="cursor-pointer rounded-lg bg-blue-600 px-6 py-2.5 text-sm text-white active:bg-blue-700"
                @click="handleSearch"
              >
                搜索
              </view>
            </view>
          </view>

          <!-- 可借阅选项 -->
          <view class="flex items-center justify-end gap-2">
            <view
              class="h-5 w-5 flex cursor-pointer items-center justify-center border-2 rounded transition"
              :class="onlyAvailable ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'"
              @click="onlyAvailable = !onlyAvailable"
            >
              <view v-if="onlyAvailable" class="i-carbon-checkmark text-xs text-white" />
            </view>
            <text class="text-sm text-gray-600">可借阅</text>
          </view>

          <!-- 搜索结果 -->
          <view v-if="searchResults.length > 0" class="mt-4 max-h-60 overflow-auto">
            <view
              v-for="book in searchResults"
              :key="book.id"
              class="mb-2 border border-gray-200 rounded-lg bg-white p-3"
            >
              <view class="text-base text-gray-800 font-bold">
                {{ book.title }}
              </view>
              <view class="mt-1 text-xs text-gray-500">
                {{ book.author || '未知作者' }} · {{ book.publisher || '未知出版社' }}
              </view>
              <view v-if="book.identity_code" class="mt-1 text-xs text-gray-400">
                索书号：{{ book.identity_code }}
              </view>
            </view>
          </view>
        </view>

        <!-- 我的借阅内容（可展开/收缩） -->
        <view
          v-show="recordsExpanded"
          class="max-h-60 overflow-auto rounded-bl-lg rounded-br-lg bg-blue-50 p-4"
        >
          <view v-if="records.length === 0" class="py-8 text-center text-gray-500">
            当前您没有借阅的书籍！
          </view>
          <view v-else class="space-y-2">
            <view
              v-for="record in records"
              :key="record.id"
              class="border border-gray-200 rounded-lg bg-white p-3"
            >
              <view class="mb-2">
                <view class="text-base text-gray-800 font-bold">
                  {{ record.book_id__title || '未知书籍' }}
                </view>
              </view>
              <view class="flex items-center justify-between text-xs text-gray-500">
                <text>借阅时间：{{ formatTime(record.lend_time) }}</text>
                <view
                  class="rounded-full px-2 py-1"
                  :class="getRecordStatusInfo(record.type).className"
                >
                  {{ getRecordStatusInfo(record.type).text }}
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 下方内容区域 -->
    <view class="rounded-t-2xl bg-white">
      <!-- 轮播图指示器 -->
      <view class="flex justify-center gap-2 py-4">
        <view
          class="h-2 w-8 cursor-pointer rounded-full transition"
          :class="carouselIndex === 0 ? 'bg-blue-600' : 'bg-gray-300'"
          @click="switchCarousel(0)"
        />
        <view
          class="h-2 w-8 cursor-pointer rounded-full transition"
          :class="carouselIndex === 1 ? 'bg-blue-600' : 'bg-gray-300'"
          @click="switchCarousel(1)"
        />
      </view>

      <!-- 轮播内容 -->
      <view class="relative overflow-hidden" style="min-height: 290px;">
        <!-- 随机推荐 -->
        <view v-show="carouselIndex === 0" class="pb-4">
          <view class="mb-4 px-4 text-lg text-gray-800 font-bold">
            随机推荐
          </view>
          <scroll-view
            scroll-x
            class="w-full"
            enable-flex
          >
            <view class="flex flex-row gap-3 px-4">
              <view
                v-for="book in recommendations"
                :key="book.id"
                class="flex-shrink-0 rounded-xl bg-white p-4 shadow-sm"
                style="width: 280px;"
              >
                <view class="flex items-start justify-between">
                  <view class="i-carbon-book mr-3 text-4xl text-blue-600" />
                  <view class="flex-1">
                    <view class="text-right text-base text-blue-600 font-bold">
                      {{ book.title }}
                    </view>
                    <view v-if="book.author" class="mt-1 text-right text-sm text-gray-500">
                      {{ book.author }}
                    </view>
                  </view>
                </view>
                <view class="mt-3 flex items-center justify-between border-t border-blue-100 pt-3 text-sm text-blue-600">
                  <text>索书号</text>
                  <text>{{ book.identity_code || '未知' }}</text>
                </view>
              </view>
            </view>
          </scroll-view>
        </view>

        <!-- 近期活动 -->
        <view v-show="carouselIndex === 1" class="px-4 pb-4">
          <view class="mb-4 text-lg text-gray-800 font-bold">
            近期活动
          </view>
          <view class="py-8 text-center text-gray-500">
            没有找到书房的活动~
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.rotate-180 {
  transform: rotate(180deg);
}
</style>
