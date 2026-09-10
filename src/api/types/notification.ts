export enum NotificationStatus {
  DONE = 0,
  UNDONE = 1,
  DELETED = 2,
}

export enum NotificationType {
  NEEDREAD = 0,
  NEEDDO = 1,
}

export interface Notification {
  id: number
  sender: number
  sender_name: string
  status: NotificationStatus
  status_display: string
  title?: string | null
  title_display: string
  content: string
  start_time: string
  finish_time: string | null
  typename: NotificationType
  typename_display: string
  URL?: string | null
  anonymous_flag: boolean
}

export interface NotificationStatistics {
  total: number
  unread: number
  read: number
  need_read: number
  need_do: number
}

export interface NotificationStatusUpdate {
  status: NotificationStatus
}

export interface NotificationBulkOperationResult {
  message: string
  count: number
}

export interface NotificationListQuery {
  ordering?: '-finish_time' | '-start_time' | 'finish_time' | 'start_time'
  status?: NotificationStatus
  typename?: NotificationType
}
