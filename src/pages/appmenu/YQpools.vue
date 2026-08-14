<script lang="ts" setup>
import type { AllPoolsResponse, Pool, PoolItem } from '@/api/types/YQpools'
import { PoolStatus, PoolType } from '@/api/types/YQpools'
import {
  getAllPools,
  getYQPointBalance,
  purchaseExchange,
  purchaseLottery,
  purchaseRandom,
} from '@/api/YQpools'
import { toBackendURL } from '@/utils'

definePage({
  style: {
    navigationBarTitleText: '元气商城',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTextStyle: 'white',
  },
})

// 帮助内容展开状态
const helpExpanded = ref(true)

// 每个奖池的奖品列表展开状态（key: pool.id，默认展开）
const expandedPools = ref<Record<number, boolean>>({})

function isPoolExpanded(poolId: number) {
  return expandedPools.value[poolId] !== false
}

function togglePoolExpanded(poolId: number) {
  expandedPools.value = {
    ...expandedPools.value,
    [poolId]: !(expandedPools.value[poolId] ?? true),
  }
}

// 用户元气值余额
const YQPointBalance = ref(0)

// 所有奖池数据
const allPools = ref<AllPoolsResponse | null>(null)

// 当前选中的奖池类型：'EXCHANGE' | 'LOTTERY' | 'RANDOM'
const activePoolType = ref<PoolType>(PoolType.EXCHANGE)

// 当前类别下的奖池列表（同类奖池以上下滑动列表展示，不再用名称标签切换）
const currentPools = computed(() => {
  if (!allPools.value)
    return []
  switch (activePoolType.value) {
    case PoolType.EXCHANGE:
      return allPools.value.exchange_pools.pools_info
    case PoolType.LOTTERY:
      return allPools.value.lottery_pools.pools_info
    case PoolType.RANDOM:
      return allPools.value.random_pools.pools_info
    default:
      return []
  }
})

// 加载数据
async function loadData() {
  try {
    const [poolsData, balanceData] = await Promise.all([
      getAllPools(),
      getYQPointBalance(),
    ])
    allPools.value = poolsData
    YQPointBalance.value = balanceData.YQpoint
  }
  catch (error) {
    console.error('加载数据失败:', error)
    uni.showToast({
      title: '加载失败',
      icon: 'none',
    })
  }
}

// 切换奖池类别（兑换/抽奖/盲盒）
function switchPoolType(type: PoolType) {
  activePoolType.value = type
}

// 奖池类别标签激活时的颜色：兑换-蓝、抽奖-紫、盲盒-黄
function getPoolTypeTabActiveClass(type: PoolType) {
  switch (type) {
    case PoolType.EXCHANGE:
      return 'bg-blue-600 text-white'
    case PoolType.LOTTERY:
      return 'bg-purple-600 text-white'
    case PoolType.RANDOM:
      return 'bg-yellow-500 text-white'
    default:
      return 'bg-blue-600 text-white'
  }
}

// 奖池信息中类别标签的颜色：兑换-蓝、抽奖-紫、盲盒-黄
function getPoolTypeBadgeClass(type: PoolType) {
  switch (type) {
    case PoolType.EXCHANGE:
      return 'bg-blue-100 text-blue-600'
    case PoolType.LOTTERY:
      return 'bg-purple-100 text-purple-600'
    case PoolType.RANDOM:
      return 'bg-yellow-100 text-yellow-600'
    default:
      return 'bg-blue-100 text-blue-600'
  }
}

// 格式化时间
function formatTime(time: string | null | undefined) {
  if (!time)
    return ''
  const date = new Date(time)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}年${month}月${day}日 ${hours}:${minutes}`
}

// 格式化活动时间
function formatActivityTime(pool: Pool) {
  const start = formatTime(pool.start)
  const end = pool.end ? formatTime(pool.end) : ''
  return end ? `${start} - ${end}` : start
}

// 检查是否可以兑换
function canExchange(item: PoolItem) {
  if (!item.exchange_price)
    return false
  if (item.exchange_price > YQPointBalance.value)
    return false
  if (item.remain_num === 0)
    return false
  if (item.my_exchange_time !== undefined && item.exchange_limit !== undefined) {
    if (item.my_exchange_time >= item.exchange_limit)
      return false
  }
  return true
}

// 获取兑换按钮状态文本
function getExchangeButtonText(item: PoolItem) {
  if (!item.exchange_price)
    return '兑换'
  if (item.exchange_price > YQPointBalance.value)
    return '元气值不足'
  if (item.remain_num === 0)
    return '奖品不足'
  if (item.my_exchange_time !== undefined && item.exchange_limit !== undefined) {
    if (item.my_exchange_time >= item.exchange_limit)
      return '次数已用完'
  }
  return '兑换'
}

// 兑换奖品
async function handleExchange(item: PoolItem) {
  if (!canExchange(item))
    return

  // 如果有规格选择，需要先打开详情
  if (item.exchange_attributes && Object.keys(item.exchange_attributes).length > 0) {
    // TODO: 打开详情弹窗选择规格
    uni.showToast({
      title: '请先选择规格',
      icon: 'none',
    })
    return
  }

  try {
    const res = await uni.showModal({
      title: '确认兑换',
      content: `确定要兑换 ${item.prize__name} 吗？`,
    })
    if (!res.confirm)
      return

    await purchaseExchange({
      poolitem_id: item.id,
    })

    uni.showToast({
      title: '兑换成功',
      icon: 'success',
    })

    // 重新加载数据
    await loadData()
  }
  catch (error: any) {
    console.error('兑换失败:', error)
    uni.showToast({
      title: error.message || '兑换失败',
      icon: 'none',
    })
  }
}

// 参与抽奖
async function handleLottery(pool: Pool) {
  if (!pool.ticket_price)
    return
  if (pool.ticket_price > YQPointBalance.value) {
    uni.showToast({
      title: '元气值不足',
      icon: 'none',
    })
    return
  }
  if (pool.status === PoolStatus.ENDED) {
    uni.showToast({
      title: '抽奖已结束',
      icon: 'none',
    })
    return
  }

  try {
    const res = await uni.showModal({
      title: '确认参与',
      content: `确定要参与该抽奖吗？将消耗 ${pool.ticket_price} 元气值`,
    })
    if (!res.confirm)
      return

    await purchaseLottery({
      pool_id: pool.id,
    })

    uni.showToast({
      title: '参与成功',
      icon: 'success',
    })

    // 重新加载数据
    await loadData()
  }
  catch (error: any) {
    console.error('参与抽奖失败:', error)
    uni.showToast({
      title: error.message || '参与失败',
      icon: 'none',
    })
  }
}

// 购买盲盒
async function handleRandom(pool: Pool) {
  if (!pool.ticket_price)
    return
  if (pool.ticket_price > YQPointBalance.value) {
    uni.showToast({
      title: '元气值不足',
      icon: 'none',
    })
    return
  }

  try {
    const res = await uni.showModal({
      title: '确认购买',
      content: `确定要购买该盲盒吗？将消耗 ${pool.ticket_price} 元气值`,
    })
    if (!res.confirm)
      return

    const result = await purchaseRandom({
      pool_id: pool.id,
    })

    // TODO: 显示盲盒开箱动画和结果
    uni.showToast({
      title: result.message || '购买成功',
      icon: 'success',
    })

    // 重新加载数据
    await loadData()
  }
  catch (error: any) {
    console.error('购买盲盒失败:', error)
    uni.showToast({
      title: error.message || '购买失败',
      icon: 'none',
    })
  }
}

// 页面加载
onMounted(() => {
  loadData()
})
</script>

<template>
  <view class="min-h-screen bg-gray-50">
    <!-- 使用帮助区域 -->
    <view class="mx-4 mt-4">
      <view class="rounded-lg bg-gray-100 p-4">
        <view
          class="flex items-center justify-between active:opacity-70"
          @click="helpExpanded = !helpExpanded"
        >
          <text class="text-base text-gray-800 font-bold">使用帮助</text>
          <text
            class="i-carbon-chevron-down text-lg transition-transform"
            :class="{ 'rotate-180': helpExpanded }"
          />
        </view>
        <view v-show="helpExpanded" class="mt-3 text-sm text-gray-700 leading-relaxed">
          <text decode="true">
            在这里，你可以将元气值兑换为奖品。\n

            商城奖池主要有三部分。
            <text class="font-bold">兑换奖池</text>，你可以用足额元气值直接兑换心仪奖品；
            <text class="font-bold">抽奖奖池（限定开启）</text>，抽奖服务于期待惊喜的你，你可以消耗一定元气值参与，时限结束将自动进行开奖！
            <text class="font-bold">盲盒奖池</text>，18元气值/次的即时开奖机会，空盲盒被抽走的越多，意味着你下一次中奖的概率越大！\n

            奖池内容定期更新，各奖池内容部分重合，但库存互相独立。在一个周期内，总量有限，兑完为止！周期结束后将会集中线下实物兑换。\n

            智慧书院项目组保留根据市场波动（×）对所有元气值消费渠道的定价权力！
          </text>
        </view>
      </view>
    </view>

    <!-- 奖池类型标签页和元气值显示 -->
    <view class="mx-4 mt-4">
      <view class="flex items-center gap-2">
        <!-- 标签页 -->
        <view class="flex flex-1 gap-2">
          <view
            v-for="type in [
              { value: PoolType.EXCHANGE, label: '兑换奖池' },
              { value: PoolType.LOTTERY, label: '抽奖奖池' },
              { value: PoolType.RANDOM, label: '盲盒奖池' },
            ]"
            :key="type.value"
            class="flex-1 rounded-lg px-2 py-2 text-center text-sm transition-colors active:opacity-70"
            :class="
              activePoolType === type.value
                ? getPoolTypeTabActiveClass(type.value)
                : 'bg-white text-gray-700'
            "
            @click="switchPoolType(type.value)"
          >
            {{ type.label }}
          </view>
        </view>
        <!-- 元气值余额显示 -->
        <view class="flex-shrink-0 rounded-lg bg-white px-3 py-2">
          <text class="text-sm text-green-600 font-bold">
            我的元气值: {{ YQPointBalance }}
          </text>
        </view>
      </view>
    </view>

    <!-- 当前类别下的奖池列表：上下滑动，每个奖池一块（不再用奖池名称标签切换） -->
    <view v-if="currentPools.length > 0" class="mx-4 mt-4 pb-10">
      <view
        v-for="pool in currentPools"
        :key="pool.id"
        class="mb-6"
      >
        <!-- 奖池信息头部 + 右侧展开/收起按钮（类似使用帮助） -->
        <view class="rounded-t-lg bg-white px-4 py-3 shadow-sm">
          <view class="flex items-center justify-between">
            <view class="flex flex-1 flex-wrap items-center gap-2">
              <text
                class="rounded px-2 py-1 text-xs"
                :class="getPoolTypeBadgeClass(pool.type)"
              >
                <text v-if="pool.type === PoolType.EXCHANGE">兑换</text>
                <text v-else-if="pool.type === PoolType.LOTTERY">抽奖</text>
                <text v-else-if="pool.type === PoolType.RANDOM">盲盒</text>
                <text>奖池</text>
              </text>
              <text class="text-sm text-gray-800 font-medium">{{ pool.title ?? pool.name ?? '—' }}</text>
            </view>
            <view
              class="flex-shrink-0 active:opacity-70"
              @click="togglePoolExpanded(pool.id)"
            >
              <text
                class="i-carbon-chevron-down text-lg text-gray-500 transition-transform"
                :class="{ 'rotate-180': isPoolExpanded(pool.id) }"
              />
            </view>
          </view>
          <view class="mt-2 text-xs text-gray-500">
            活动时间: {{ formatActivityTime(pool) }}
          </view>
          <view
            v-if="(pool.type === PoolType.LOTTERY || pool.type === PoolType.RANDOM) && pool.records_num !== undefined"
            class="mt-1 text-xs text-gray-600"
          >
            当前参与人数: {{ pool.records_num }}
          </view>
        </view>

        <!-- 可展开/收起的奖品列表区域 -->
        <view
          v-show="isPoolExpanded(pool.id)"
          class="border-x border-b border-gray-100 rounded-b-lg bg-gray-50 px-3 pb-3 pt-2"
        >
          <!-- 抽奖奖池 - 显示结果（如果已结束） -->
          <view
            v-if="pool.type === PoolType.LOTTERY && pool.status === PoolStatus.ENDED && pool.results"
            class="mb-4 rounded-lg bg-white p-4"
          >
            <view v-if="pool.results.big_prize_results?.length" class="mb-4">
              <text class="mb-2 block text-center text-base font-bold" style="color: gold;">
                <text class="i-carbon-trophy mr-1" />
                特别奖品获奖同学
              </text>
              <view
                v-for="result in pool.results.big_prize_results"
                :key="result.prize_name"
                class="mb-3"
              >
                <text class="block text-center text-sm font-semibold">{{ result.prize_name }}</text>
                <view class="mt-1 flex flex-wrap justify-center gap-2">
                  <text
                    v-for="winner in result.winners"
                    :key="winner"
                    class="text-xs text-gray-600"
                  >
                    {{ winner }}
                  </text>
                </view>
              </view>
            </view>
            <view>
              <text class="mb-2 block text-center text-base font-bold" style="color: gold;">
                <text class="i-carbon-gift mr-1" />
                获奖同学
              </text>
              <view
                v-for="result in pool.results.normal_prize_results"
                :key="result.prize_name"
                class="mb-3"
              >
                <text class="block text-center text-sm font-semibold">{{ result.prize_name }}</text>
                <view class="mt-1 flex flex-wrap justify-center gap-2">
                  <text
                    v-for="winner in result.winners"
                    :key="winner"
                    class="text-xs text-gray-600"
                  >
                    {{ winner }}
                  </text>
                </view>
              </view>
            </view>
          </view>

          <!-- 奖品列表 - 兑换奖池 -->
          <view
            v-if="pool.type === PoolType.EXCHANGE && pool.items && pool.items.length > 0"
            class="mb-4"
          >
            <scroll-view scroll-x class="w-full" enable-flex>
              <view class="flex gap-3 px-2">
                <view
                  v-for="item in pool.items"
                  :key="item.id"
                  class="flex-shrink-0 rounded-lg bg-white p-2 shadow-sm"
                  style="width: 150px;"
                >
                  <!-- 标题和库存 -->
                  <view class="mb-1.5 flex items-baseline justify-between">
                    <text class="text-xs text-gray-800 font-semibold">{{ item.prize__name }}</text>
                    <view class="flex items-baseline gap-0.5">
                      <text
                        class="text-xs font-bold"
                        :class="item.remain_num === 0 ? 'text-red-500' : 'text-green-600'"
                      >
                        {{ item.remain_num }}
                      </text>
                      <text class="text-[10px] text-gray-500">/ {{ item.origin_num }}</text>
                    </view>
                  </view>

                  <!-- 图片 -->
                  <view class="relative mb-1.5 w-full overflow-hidden rounded" style="aspect-ratio: 4/3;">
                    <image
                      v-if="item.prize__image"
                      :src="toBackendURL(item.prize__image)"
                      mode="aspectFill"
                      class="h-full w-full"
                    />
                    <view v-else class="h-full w-full flex items-center justify-center bg-gray-100">
                      <text class="i-carbon-image text-3xl text-gray-400" />
                    </view>
                  </view>

                  <!-- 详情链接 -->
                  <view class="mb-1.5 flex items-center gap-0.5 text-blue-600 active:opacity-70">
                    <text class="i-carbon-information text-xs" />
                    <text class="text-[10px]">详情</text>
                  </view>

                  <!-- 兑换按钮 -->
                  <view
                    class="flex gap-0 overflow-hidden rounded"
                    style="border-width: 1px; border-style: solid"
                    :style="{ borderColor: canExchange(item) ? '#16a34a' : '#4b5563' }"
                  >
                    <view
                      class="flex-1 rounded-l px-2 py-1.5 text-center text-[10px] text-white"
                      :class="canExchange(item) ? 'bg-green-600' : 'bg-gray-600'"
                    >
                      {{ item.exchange_price || 0 }}元气值
                    </view>
                    <view
                      class="flex-1 rounded-r bg-white px-2 py-1.5 text-center text-[10px] text-gray-700 active:bg-gray-50"
                      :class="canExchange(item) ? '' : 'opacity-50'"
                      @click="handleExchange(item)"
                    >
                      {{ getExchangeButtonText(item) }}
                    </view>
                  </view>
                </view>
              </view>
            </scroll-view>
          </view>

          <!-- 奖品列表 - 抽奖/盲盒奖池 -->
          <view
            v-if="(pool.type === PoolType.LOTTERY || pool.type === PoolType.RANDOM) && pool.items && pool.items.length > 0"
            class="mb-4"
          >
            <!-- 特别奖品 -->
            <view
              v-for="item in pool.items.filter(i => i.is_big_prize)"
              :key="item.id"
              class="mb-4"
            >
              <text class="mb-1 block text-center text-sm text-green-600 font-bold">
                <text class="i-carbon-gift mr-1" />
                特别奖品
              </text>
              <text class="mb-1 block text-center text-xs">{{ item.prize__name }}</text>
              <view v-if="item.probability" class="mb-1 text-center text-[10px] text-gray-500">
                获取概率 {{ item.probability }}%
              </view>
              <view class="relative mx-auto w-3/4 overflow-hidden rounded" style="aspect-ratio: 4/3;">
                <image
                  v-if="item.prize__image"
                  :src="toBackendURL(item.prize__image)"
                  mode="aspectFill"
                  class="h-full w-full"
                />
                <view v-else class="h-full w-full flex items-center justify-center bg-gray-100">
                  <text class="i-carbon-image text-3xl text-gray-400" />
                </view>
              </view>
            </view>

            <!-- 全部奖品 -->
            <text class="mb-1.5 block text-center text-xs text-gray-600">
              <text class="i-carbon-gift mr-1" />
              全部奖品
            </text>
            <scroll-view scroll-x class="w-full" enable-flex>
              <view class="flex gap-2 px-2">
                <view
                  v-for="item in pool.items"
                  :key="item.id"
                  class="flex-shrink-0 rounded-lg bg-white p-1.5 shadow-sm"
                  style="width: 150px;"
                >
                  <view class="relative w-full overflow-hidden rounded" style="aspect-ratio: 4/3;">
                    <image
                      v-if="item.prize__image"
                      :src="toBackendURL(item.prize__image)"
                      mode="aspectFill"
                      class="h-full w-full"
                    />
                    <view v-else class="h-full w-full flex items-center justify-center bg-gray-100">
                      <text class="i-carbon-image text-2xl text-gray-400" />
                    </view>
                  </view>
                  <text class="mt-1.5 block text-center text-[10px] font-semibold">{{ item.prize__name }}</text>
                  <text v-if="item.origin_num" class="mt-0.5 block text-center text-[10px] text-gray-500">
                    X {{ item.origin_num }}
                  </text>
                </view>
              </view>
            </scroll-view>
          </view>

          <!-- 参与按钮 - 抽奖奖池 -->
          <view
            v-if="pool.type === PoolType.LOTTERY"
            class="mb-4"
          >
            <view
              v-if="pool.status === PoolStatus.ENDED"
              class="w-full rounded bg-gray-300 px-4 py-3 text-center text-sm text-gray-600"
            >
              抽奖已结束
            </view>
            <view
              v-else
              class="flex gap-0 overflow-hidden rounded"
              style="border-width: 1px; border-style: solid"
              :style="{ borderColor: (pool.ticket_price != null && pool.ticket_price <= YQPointBalance) ? '#16a34a' : '#4b5563' }"
            >
              <view
                class="flex-1 rounded-l px-4 py-3 text-center text-sm text-white"
                :class="pool.ticket_price && pool.ticket_price > YQPointBalance ? 'bg-gray-600' : 'bg-green-600'"
              >
                {{ pool.ticket_price || 0 }} 元气值 / 次
              </view>
              <view
                class="flex-1 rounded-r bg-white px-4 py-3 text-center text-sm text-gray-700 active:bg-gray-50"
                :class="pool.ticket_price && pool.ticket_price > YQPointBalance ? 'opacity-50' : ''"
                @click="handleLottery(pool)"
              >
                {{ pool.ticket_price && pool.ticket_price > YQPointBalance ? '元气值不足' : '参与抽奖' }}
              </view>
            </view>
          </view>

          <!-- 购买按钮 - 盲盒奖池 -->
          <view
            v-if="pool.type === PoolType.RANDOM"
            class="mb-4 flex gap-0 overflow-hidden rounded"
            style="border-width: 1px; border-style: solid"
            :style="{ borderColor: (pool.ticket_price != null && pool.ticket_price <= YQPointBalance) ? '#16a34a' : '#4b5563' }"
          >
            <view
              class="flex-1 rounded-l px-4 py-3 text-center text-sm text-white"
              :class="pool.ticket_price && pool.ticket_price > YQPointBalance ? 'bg-gray-600' : 'bg-green-600'"
            >
              {{ pool.ticket_price || 0 }} 元气值 / 次
            </view>
            <view
              class="flex-1 rounded-r bg-white px-4 py-3 text-center text-sm text-gray-700 active:bg-gray-50"
              :class="pool.ticket_price && pool.ticket_price > YQPointBalance ? 'opacity-50' : ''"
              @click="handleRandom(pool)"
            >
              {{ pool.ticket_price && pool.ticket_price > YQPointBalance ? '元气值不足' : '购买盲盒' }}
            </view>
          </view>

          <!-- 空状态 -->
          <view
            v-if="!pool.items || pool.items.length === 0"
            class="py-6 text-center text-xs text-gray-500"
          >
            暂无奖品
          </view>
        </view>
      </view>
    </view>

    <!-- 当前类别下无奖池 -->
    <view
      v-else-if="currentPools.length === 0"
      class="mx-4 py-12 text-center text-gray-500"
    >
      当前暂无该类别的奖池
    </view>
  </view>
</template>

<style lang="scss" scoped>
.rotate-180 {
  transform: rotate(180deg);
}
</style>
