<script lang="ts" setup>
import type { AllPoolsResponse, Pool, PoolItem } from '@/api/types/YQpools'
import type { UvToastInstance } from '@/hooks/useApiException'
import { PoolStatus, PoolType } from '@/api/types/YQpools'
import {
  getAllPools,
  getYQPointBalance,
  purchaseExchange,
  purchaseLottery,
  purchaseRandom,
} from '@/api/YQpools'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { useConfirm } from '@/hooks/useConfirm'
import { tokens } from '@/style/tokens'
import { toBackendURL } from '@/utils'
import { formatDateTimeRange, formatNumber, formatSmartDateTime } from '@/utils/format'

definePage({
  style: {
    navigationBarTitleText: '元气商城',
  },
})

const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
const { confirm } = useConfirm()

const POOL_TABS = [
  { name: '兑换奖池', type: PoolType.EXCHANGE, empty: '还没有开放的兑换奖池' },
  { name: '抽奖奖池', type: PoolType.LOTTERY, empty: '还没有开放的抽奖奖池' },
  { name: '盲盒奖池', type: PoolType.RANDOM, empty: '还没有开放的盲盒奖池' },
]
const activeTab = ref(0)
const activePoolType = computed(() => POOL_TABS[activeTab.value].type)
const emptyText = computed(() => POOL_TABS[activeTab.value].empty)

const YQPointBalance = ref(0)
const allPools = ref<AllPoolsResponse | null>(null)
const loading = ref(true)
const loadError = ref('')
const purchasing = ref(false)

const currentPools = computed<Pool[]>(() => {
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

async function loadData() {
  const initial = allPools.value === null
  if (initial) {
    loading.value = true
    loadError.value = ''
  }
  try {
    const [poolsData, balanceData] = await Promise.all([
      getAllPools(),
      getYQPointBalance(),
    ])
    allPools.value = poolsData
    YQPointBalance.value = balanceData.YQpoint
  }
  catch (error) {
    console.error('加载奖池失败:', error)
    // 首屏失败只显示页内错误；已有数据时的刷新失败保留数据并 toast 一次
    if (initial)
      loadError.value = handleApiException(error, { showToast: false }).message
    else
      handleApiException(error)
  }
  finally {
    loading.value = false
  }
}

function onTabChange(item: { index: number }) {
  activeTab.value = item.index
}

function poolTime(pool: Pool) {
  return pool.end ? formatDateTimeRange(pool.start, pool.end) : `${formatSmartDateTime(pool.start)} 起`
}

function isEnded(pool: Pool) {
  return pool.status === PoolStatus.ENDED
}

// ---- 兑换奖池 ----
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

function exchangeButtonText(item: PoolItem) {
  if (!item.exchange_price)
    return '兑换'
  if (item.exchange_price > YQPointBalance.value)
    return '元气值不足'
  if (item.remain_num === 0)
    return '已兑完'
  if (item.my_exchange_time !== undefined && item.exchange_limit !== undefined) {
    if (item.my_exchange_time >= item.exchange_limit)
      return '次数已用完'
  }
  return '兑换'
}

// ---- 抽奖 / 盲盒奖池 ----
function canEnter(pool: Pool) {
  if (isEnded(pool) || !pool.ticket_price)
    return false
  return pool.ticket_price <= YQPointBalance.value
}

function enterButtonText(pool: Pool) {
  const action = pool.type === PoolType.LOTTERY ? '参与抽奖' : '购买盲盒'
  if (isEnded(pool))
    return pool.type === PoolType.LOTTERY ? '抽奖已结束' : '已结束'
  if (!pool.ticket_price)
    return '暂不可参与'
  if (pool.ticket_price > YQPointBalance.value)
    return '元气值不足'
  return `${action} · ${formatNumber(pool.ticket_price)} 元气值`
}

async function runPurchase(request: () => Promise<{ message: string }>, successMessage?: string) {
  if (purchasing.value)
    return
  purchasing.value = true
  try {
    const result = await request()
    showMessage(successMessage ?? result.message ?? '购买成功', 'success')
    await loadData()
  }
  catch (error) {
    console.error('商城购买失败:', error)
    handleApiException(error)
  }
  finally {
    purchasing.value = false
  }
}

async function handleExchange(item: PoolItem) {
  if (!canExchange(item) || purchasing.value)
    return
  if (item.exchange_attributes?.length) {
    // 规格选择尚未在小程序实现
    showMessage('该奖品需选择规格，请在网页版兑换', 'warning')
    return
  }
  const ok = await confirm({
    title: '兑换奖品',
    content: `将消耗 ${formatNumber(item.exchange_price)} 元气值兑换「${item.prize__name || '该奖品'}」。`,
    confirmText: '兑换',
    cancelText: '再想想',
  })
  if (!ok)
    return
  await runPurchase(() => purchaseExchange({ poolitem_id: item.id }), '兑换成功')
}

async function handleLottery(pool: Pool) {
  if (!canEnter(pool) || purchasing.value)
    return
  const ok = await confirm({
    title: '参与抽奖',
    content: `将消耗 ${formatNumber(pool.ticket_price)} 元气值参与「${pool.title || '该奖池'}」抽奖。`,
    confirmText: '参与',
    cancelText: '再想想',
  })
  if (!ok)
    return
  await runPurchase(() => purchaseLottery({ pool_id: pool.id }), '参与成功')
}

async function handleRandom(pool: Pool) {
  if (!canEnter(pool) || purchasing.value)
    return
  const ok = await confirm({
    title: '购买盲盒',
    content: `将消耗 ${formatNumber(pool.ticket_price)} 元气值购买一次「${pool.title || '该奖池'}」盲盒。`,
    confirmText: '购买',
    cancelText: '再想想',
  })
  if (!ok)
    return
  // 盲盒结果由后端 message 描述
  await runPurchase(() => purchaseRandom({ pool_id: pool.id }))
}

onMounted(() => {
  void loadData()
})
</script>

<template>
  <view class="yp-page px-4 py-3 pb-6">
    <uv-toast ref="toastRef" />

    <!-- 元气值余额 -->
    <view class="yp-card-flat">
      <text class="block text-xs text-fg-3">我的元气值</text>
      <text class="mt-1 block text-2xl text-fg-1 font-semibold">{{ formatNumber(YQPointBalance) }}</text>
    </view>

    <!-- 使用帮助（默认收起） -->
    <view class="mt-3 overflow-hidden rounded-lg bg-card">
      <uv-collapse :value="[]" :border="false">
        <uv-collapse-item name="help" title="使用帮助" label="兑换、抽奖、盲盒三种玩法，库存兑完为止">
          <view class="text-sm text-fg-2 leading-relaxed">
            <text class="block">元气值可以在这里换成奖品。商城有三类奖池：</text>
            <text class="mt-2 block"><text class="text-fg-1 font-medium">兑换奖池</text>：用足额元气值直接兑换心仪奖品。</text>
            <text class="mt-1 block"><text class="text-fg-1 font-medium">抽奖奖池</text>：限时开启，消耗一定元气值参与，截止后自动开奖。</text>
            <text class="mt-1 block"><text class="text-fg-1 font-medium">盲盒奖池</text>：按每次标价消耗元气值，即时开奖；空盒被抽走得越多，下一次中奖的概率越大。</text>
            <text class="mt-2 block">奖池内容定期更新，各奖池库存互相独立、兑完为止；周期结束后统一线下发放。</text>
            <text class="mt-2 block text-xs text-fg-3">智慧书院项目组保留对元气值消费渠道的定价权。</text>
          </view>
        </uv-collapse-item>
      </uv-collapse>
    </view>

    <!-- 奖池类别 -->
    <view class="mt-3 overflow-hidden rounded-lg bg-card">
      <uv-tabs
        :list="POOL_TABS"
        :current="activeTab"
        :scrollable="false"
        :line-color="tokens.primary"
        :active-style="{ color: tokens.text1, fontWeight: 600 }"
        :inactive-style="{ color: tokens.text2 }"
        @change="onTabChange"
      />
    </view>

    <PageState
      :loading="loading"
      :error="loadError"
      :empty="currentPools.length === 0"
      :empty-text="emptyText"
      empty-icon="i-carbon-shopping-cart"
      @retry="loadData"
    >
      <view
        v-for="pool in currentPools"
        :key="pool.id"
        class="mt-3 yp-card-flat"
      >
        <!-- 奖池信息 -->
        <view class="flex items-start justify-between gap-2">
          <text class="line-clamp-2 flex-1 text-base text-fg-1 font-medium">{{ pool.title || '未命名奖池' }}</text>
          <StatusTag :type="isEnded(pool) ? 'default' : 'processing'" :text="isEnded(pool) ? '已结束' : '进行中'" />
        </view>
        <text class="mt-1 block text-xs text-fg-3">{{ poolTime(pool) }}</text>
        <text v-if="pool.type !== PoolType.EXCHANGE && pool.records_num !== undefined" class="mt-1 block text-xs text-fg-3">已参与 {{ formatNumber(pool.records_num) }} 人次</text>

        <!-- 抽奖结果（已结束的抽奖奖池） -->
        <view
          v-if="pool.type === PoolType.LOTTERY && isEnded(pool) && pool.results"
          class="mt-3 rounded-md bg-fill p-3"
        >
          <template v-if="pool.results.big_prize_results?.length">
            <text class="block text-sm text-fg-1 font-medium">特别奖品获奖同学</text>
            <view
              v-for="result in pool.results.big_prize_results"
              :key="result.prize_name"
              class="mt-2"
            >
              <text class="block text-sm text-fg-2">{{ result.prize_name }}</text>
              <text class="block text-xs text-fg-3">{{ result.winners.join('、') || '—' }}</text>
            </view>
          </template>
          <text class="block text-sm text-fg-1 font-medium" :class="{ 'mt-3': pool.results.big_prize_results?.length }">获奖同学</text>
          <view
            v-for="result in pool.results.normal_prize_results"
            :key="result.prize_name"
            class="mt-2"
          >
            <text class="block text-sm text-fg-2">{{ result.prize_name }}</text>
            <text class="block text-xs text-fg-3">{{ result.winners.join('、') || '—' }}</text>
          </view>
        </view>

        <!-- 奖品 -->
        <view v-if="pool.items && pool.items.length > 0" class="grid grid-cols-2 mt-3 gap-3">
          <view
            v-for="item in pool.items"
            :key="item.id"
            class="overflow-hidden rounded-md bg-fill"
          >
            <view class="relative w-full pt-[100%]">
              <image
                v-if="item.prize__image"
                :src="toBackendURL(item.prize__image)"
                mode="aspectFill"
                class="absolute left-0 top-0 h-full w-full"
              />
              <view v-else class="absolute left-0 top-0 h-full w-full flex items-center justify-center">
                <view class="i-carbon-image text-3xl text-fg-4" />
              </view>
            </view>
            <view class="p-3">
              <view class="flex items-start gap-1">
                <text class="line-clamp-2 flex-1 text-sm text-fg-1">{{ item.prize__name || '未命名奖品' }}</text>
                <StatusTag v-if="item.is_big_prize" type="warning" text="特别奖品" />
              </view>
              <template v-if="pool.type === PoolType.EXCHANGE">
                <text class="mt-1 block text-primary font-medium">{{ formatNumber(item.exchange_price ?? 0) }}<text class="text-xs"> 元气值</text></text>
                <text class="mt-1 block text-xs text-fg-3">剩余 {{ item.remain_num }} / {{ item.origin_num }}</text>
                <view
                  class="btn-secondary mt-2 btn-block btn-sm"
                  :class="{ 'opacity-50': !canExchange(item) || purchasing }"
                  @click="handleExchange(item)"
                >
                  {{ exchangeButtonText(item) }}
                </view>
              </template>
              <text v-else class="mt-1 block text-xs text-fg-3">共 {{ item.origin_num }} 份<text v-if="item.probability"> · 概率 {{ item.probability }}%</text></text>
            </view>
          </view>
        </view>
        <text v-else class="mt-3 block py-4 text-center text-xs text-fg-3">还没有奖品</text>

        <!-- 主操作：抽奖 / 盲盒 -->
        <view
          v-if="pool.type === PoolType.LOTTERY"
          class="btn-primary mt-3 btn-block"
          :class="{ 'opacity-50': !canEnter(pool) || purchasing }"
          @click="handleLottery(pool)"
        >
          {{ enterButtonText(pool) }}
        </view>
        <view
          v-else-if="pool.type === PoolType.RANDOM"
          class="btn-primary mt-3 btn-block"
          :class="{ 'opacity-50': !canEnter(pool) || purchasing }"
          @click="handleRandom(pool)"
        >
          {{ enterButtonText(pool) }}
        </view>
      </view>
    </PageState>
  </view>
</template>
