import type {
  Notification,
  NotificationBulkOperationResult,
  NotificationListQuery,
  NotificationStatistics,
  NotificationStatusUpdate,
} from './types/notification'
import { http } from '@/http/http'

export function listNotifications(query?: NotificationListQuery) {
  return http.get<Notification[]>('/api/v2/notification/', query, undefined, {
    errorPresentation: 'manual',
  })
}

export function getNotification(id: number) {
  return http.get<Notification>(`/api/v2/notification/${id}/`, undefined, undefined, {
    errorPresentation: 'manual',
  })
}

export function toggleNotificationStatus(id: number) {
  return http.post<Notification>(
    `/api/v2/notification/${id}/toggle-status/`,
    undefined,
    undefined,
    undefined,
    { errorPresentation: 'manual' },
  )
}

export function updateNotificationStatus(id: number, payload: NotificationStatusUpdate) {
  return http<Notification>({
    url: `/api/v2/notification/${id}/update-status/`,
    method: 'PATCH',
    data: payload,
    errorPresentation: 'manual',
  })
}

export function deleteAllReadNotifications() {
  return http.post<NotificationBulkOperationResult>(
    '/api/v2/notification/delete-all-read/',
    undefined,
    undefined,
    undefined,
    { errorPresentation: 'manual' },
  )
}

export function markAllNotificationsRead() {
  return http.post<NotificationBulkOperationResult>(
    '/api/v2/notification/mark-all-read/',
    undefined,
    undefined,
    undefined,
    { errorPresentation: 'manual' },
  )
}

export function getNotificationStatistics() {
  return http.get<NotificationStatistics>(
    '/api/v2/notification/statistics/',
    undefined,
    undefined,
    { errorPresentation: 'manual' },
  )
}
