import type { ShareAssets } from './types/share'
import { http } from '@/http/http'

const manualErrorPresentation = { errorPresentation: 'manual' } as const

/**
 * 课表海报用的小程序码 / 公众号二维码与标语。
 * 两个码任一不可用时为 null；调用方把请求失败当作“没有二维码”，不能因此不出图
 */
export function getShareAssets() {
  return http.get<ShareAssets>('/api/v2/timetable/share/assets/', undefined, undefined, manualErrorPresentation)
}
