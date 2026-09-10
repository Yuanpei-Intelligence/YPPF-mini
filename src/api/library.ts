import type {
  Book,
  LendRecordList,
  LibraryConfig,
  LibraryRecommendationsQuery,
  LibraryRecordsQuery,
  LibrarySearchQuery,
  LibraryWelcome,
} from './types/library'
import { http } from '@/http/http'

/**
 * 获取图书馆配置（开放时间等）
 */
export function getLibraryConfig() {
  return http.get<LibraryConfig>('/api/v2/library/config/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取推荐或最新书籍
 */
export function getLibraryRecommendations(query?: LibraryRecommendationsQuery) {
  return http.get<Book[]>('/api/v2/library/recommendations/', query, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取用户的借阅记录
 */
export function getLibraryRecords(query?: LibraryRecordsQuery) {
  return http.get<LendRecordList[]>('/api/v2/library/records/', query, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 根据各种条件搜索书籍
 */
export function searchLibraryBooks(query?: LibrarySearchQuery) {
  return http.get<Book[]>('/api/v2/library/search/', query, undefined, {
    errorPresentation: 'manual',
  })
}

/**
 * 获取图书馆欢迎页数据（包括活动、开放时间、借阅记录、推荐等）
 */
export function getLibraryWelcome() {
  return http.get<LibraryWelcome>('/api/v2/library/welcome/', undefined, undefined, {
    errorPresentation: 'manual',
  })
}
