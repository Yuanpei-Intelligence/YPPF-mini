import type { ICarouselRes } from './types/carousel'
import { http } from '@/http/http'

export function getCarouselList() {
  return http.get<ICarouselRes>('/api/v2/generic/carousel/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}
