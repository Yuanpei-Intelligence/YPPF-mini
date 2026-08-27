import type {
  AllPoolsResponse,
  ExchangePurchaseRequest,
  LotteryPurchaseRequest,
  Pool,
  PoolListResponse,
  PurchaseResponse,
  RandomPurchaseRequest,
  RandomPurchaseResponse,
  YQPointBalanceResponse,
} from './types/YQpools.ts'
import { http } from '@/http/http'

/**
 * 获取所有奖池（兑换、抽奖、盲盒）
 */
export function getAllPools() {
  return http.get<AllPoolsResponse>('/api/v2/YQpools/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取兑换奖池列表
 */
export function getExchangePools() {
  return http.get<PoolListResponse>('/api/v2/YQpools/exchange/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取抽奖奖池列表
 */
export function getLotteryPools() {
  return http.get<PoolListResponse>('/api/v2/YQpools/lottery/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取盲盒奖池列表
 */
export function getRandomPools() {
  return http.get<PoolListResponse>('/api/v2/YQpools/random/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取单个奖池信息
 * @param id 奖池ID
 */
export function getPool(id: number) {
  return http.get<Pool>(`/api/v2/YQpools/${id}/`, undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取元气值余额
 */
export function getYQPointBalance() {
  return http.get<YQPointBalanceResponse>('/api/v2/YQpools/balance/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 兑换奖品
 * @param data 兑换请求参数
 */
export function purchaseExchange(data: ExchangePurchaseRequest) {
  return http.post<PurchaseResponse>(
    '/api/v2/YQpools/exchange/purchase/',
    data,
    undefined,
    undefined,
    { errorPresentation: 'manual' },
  )
}

/**
 * 购买抽奖
 * @param data 抽奖购买请求参数
 */
export function purchaseLottery(data: LotteryPurchaseRequest) {
  return http.post<PurchaseResponse>(
    '/api/v2/YQpools/lottery/purchase/',
    data,
    undefined,
    undefined,
    { errorPresentation: 'manual' },
  )
}

/**
 * 购买盲盒
 * @param data 盲盒购买请求参数
 */
export function purchaseRandom(data: RandomPurchaseRequest) {
  return http.post<RandomPurchaseResponse>(
    '/api/v2/YQpools/random/purchase/',
    data,
    undefined,
    undefined,
    { errorPresentation: 'manual' },
  )
}
