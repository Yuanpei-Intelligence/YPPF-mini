/**
 * YQpools 相关类型定义
 */

/**
 * 奖池类型
 */
export enum PoolType {
  /** 兑换奖池 */
  EXCHANGE = '兑换',
  /** 抽奖奖池 */
  LOTTERY = '抽奖',
  /** 盲盒奖池 */
  RANDOM = '盲盒',
}

/**
 * 奖池状态
 */
export enum PoolStatus {
  /** 进行中 */
  ACTIVE = 0,
  /** 已结束 */
  ENDED = 1,
}

/**
 * 效果代码（用于盲盒购买）
 */
export enum EffectCode {
  /** 开出奖品 */
  PRIZE = 0,
  /** 开出空盒 */
  EMPTY_BOX = 1,
  /** 无效果 */
  NO_EFFECT = 2,
}

export interface ExchangeAttribute {
  name: string
  range: string[]
}

/**
 * 奖品信息（奖池中的物品）
 */
export interface PoolItem {
  id: number
  /** 原始数量 */
  origin_num: number
  /** 已消耗数量 */
  consumed_num: number
  /** 剩余数量 */
  remain_num: number
  /** 兑换价格（元气值） */
  exchange_price?: number
  /** 兑换限制（单人最多兑换次数） */
  exchange_limit?: number
  /** 是否为大奖 */
  is_big_prize?: boolean
  /** 奖品名称 */
  prize__name?: string
  /** 奖品更多信息 */
  prize__more_info?: string
  /** 奖品库存 */
  prize__stock?: number
  /** 奖品参考价格 */
  prize__reference_price?: number
  /** 奖品图片 */
  prize__image?: string
  /** 奖品ID */
  prize__id?: number
  /** 兑换属性（如尺寸、颜色等） */
  exchange_attributes?: ExchangeAttribute[]
  /** 概率（盲盒奖池） */
  probability?: number
  /** 我的兑换次数（兑换奖池） */
  my_exchange_time?: number
}

/**
 * 抽奖结果（已结束的抽奖奖池）
 */
export interface LotteryResult {
  /** 奖品名称 */
  prize_name: string
  /** 奖品图片 */
  prize_image: string
  /** 中奖者名单 */
  winners: string[]
}

/**
 * 抽奖结果详情
 */
export interface LotteryResults {
  /** 大奖结果 */
  big_prize_results: LotteryResult[]
  /** 普通奖结果 */
  normal_prize_results: LotteryResult[]
}

/**
 * 奖池信息
 */
export interface Pool {
  id: number
  /** 奖池名称 */
  title: string
  /** 奖池类型 */
  type: PoolType
  /** 开始时间 */
  start: string
  /** 结束时间 */
  end: string | null
  /** 门票价格（抽奖和盲盒） */
  ticket_price?: number
  /** 状态（0=进行中，1=已结束） */
  status: PoolStatus
  /** 容量（总数量） */
  capacity?: number
  /** 奖品列表 */
  items?: PoolItem[]
  /** 我的参与次数（抽奖和盲盒） */
  my_entry_time?: number
  /** 总参与次数（抽奖和盲盒） */
  records_num?: number
  /** 抽奖结果（已结束的抽奖奖池） */
  results?: LotteryResults
  /** 活动ID（如果有关联活动） */
  activity?: number | null
  /** 空盒补偿下限（盲盒） */
  empty_YQPoint_compensation_lowerbound?: number
  /** 空盒补偿上限（盲盒） */
  empty_YQPoint_compensation_upperbound?: number
}

/**
 * 奖池列表响应
 */
export interface PoolListResponse {
  /** 奖池信息列表 */
  pools_info: Pool[]
}

/**
 * 所有奖池响应
 */
export interface AllPoolsResponse {
  /** 兑换奖池 */
  exchange_pools: PoolListResponse
  /** 抽奖奖池 */
  lottery_pools: PoolListResponse
  /** 盲盒奖池 */
  random_pools: PoolListResponse
}

/**
 * 兑换购买请求参数
 */
export interface ExchangePurchaseRequest {
  /** 奖池物品ID */
  poolitem_id: number
  /** 兑换属性（如尺寸、颜色等，如果需要） */
  attributes?: Record<string, string>
}

/**
 * 抽奖购买请求参数
 */
export interface LotteryPurchaseRequest {
  /** 奖池ID */
  pool_id: number
}

/**
 * 盲盒购买请求参数
 */
export interface RandomPurchaseRequest {
  /** 奖池ID */
  pool_id: number
}

/**
 * 购买响应（通用）
 */
export interface PurchaseResponse {
  /** 是否成功 */
  succeed: true
  /** 响应消息 */
  message: string
}

/**
 * 盲盒购买响应
 */
export interface RandomPurchaseResponse extends PurchaseResponse {
  /** 获得的奖品ID（空盒时为null） */
  prize_id: number | null
  /** 效果代码：0=开出奖品，1=开出空盒，2=无效果 */
  effect_code: EffectCode
  /** 空盒补偿的元气值（非空盒时为0） */
  compensate_YQPoint: number
}

/**
 * 元气值余额响应
 */
export interface YQPointBalanceResponse {
  /** 当前元气值余额 */
  YQpoint: number
}
