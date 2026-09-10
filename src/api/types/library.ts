/**
 * 图书馆相关类型定义
 */

/**
 * 图书馆配置
 */
export interface LibraryConfig {
  opening_time_start: string
  opening_time_end: string
  organization_name: string
}

/**
 * 书籍信息
 */
export interface Book {
  id: number
  title: string | null
  author: string | null
  publisher: string | null
  identity_code: string | null
  returned: boolean
}

export type LendRecordType
  = | 'normal'
    | 'overtime'
    | 'approaching'
    | 'returned'
    | 'overtime_returned'

/**
 * 借阅记录
 */
export interface LendRecordList {
  id: number
  book_id__title: string | null
  lend_time: string
  due_time: string
  return_time: string | null
  status?: number
  type: LendRecordType
}

/** 书房活动 */
export interface LibraryActivity {
  id: number
  title: string
  start: string
  end: string
  location: string
  introduction: string
  status: string
  status_display: string
  URL: string
}

/**
 * 图书馆欢迎页数据
 */
export interface LibraryWelcome {
  activities: LibraryActivity[]
  opening_time_start: string
  opening_time_end: string
  records_list: LendRecordList[]
  recommendation: Book[]
}

/**
 * 推荐书籍查询参数
 */
export interface LibraryRecommendationsQuery {
  /** 是否返回最新书籍（而非随机推荐） */
  newest?: boolean
  /** 返回的最大书籍数量（默认：5） */
  num?: number
}

/**
 * 借阅记录查询参数
 */
export interface LibraryRecordsQuery {
  /** 按归还状态筛选（true/false/all） */
  returned?: 'all' | 'false' | 'true'
}

/**
 * 书籍搜索查询参数
 */
export interface LibrarySearchQuery {
  /** 作者（部分匹配） */
  author?: string
  /** 身份码（部分匹配） */
  identity_code?: string
  /** 关键词（在标题、作者、出版社、身份码中搜索） */
  keywords?: string
  /** 出版社（部分匹配） */
  publisher?: string
  /** 按归还状态筛选 */
  returned?: boolean
  /** 书名（部分匹配） */
  title?: string
}
