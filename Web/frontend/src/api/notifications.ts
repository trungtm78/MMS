// Notification centre API — Web/backend/src/notifications/notifications.controller.ts
import client from './client'

/** One row of GET /notifications: a broadcast notification plus the caller's receipt */
export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  entityType: string | null
  entityId: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

export interface NotificationList {
  data: AppNotification[]
  total: number
  page: number
  limit: number
}

export interface NotificationQuery {
  /** true = read only, false = unread only, undefined = all */
  read?: boolean
  page?: number
  /** 1..100 on the server */
  limit?: number
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (query: NotificationQuery) => ['notifications', 'list', query] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
}

export const notificationsApi = {
  // GET /notifications?page=&limit=&read=
  list: async ({ read, page = 1, limit = 20 }: NotificationQuery = {}): Promise<NotificationList> => {
    const params: Record<string, number | boolean> = { page, limit }
    if (read !== undefined) params.read = read
    const response = await client.get<NotificationList>('/notifications', { params })
    return response.data
  },

  // The unread total comes from the same endpoint: read=false, one row, keep `total`
  unreadCount: async (): Promise<number> => {
    const { total } = await notificationsApi.list({ read: false, page: 1, limit: 1 })
    return total
  },

  // PATCH /notifications/:id/read — 404 notification_not_found for someone else's receipt
  markRead: async (id: string): Promise<void> => {
    await client.patch(`/notifications/${id}/read`)
  },

  // DELETE /notifications/:id — dismisses the caller's own notification; 404 otherwise
  remove: async (id: string): Promise<void> => {
    await client.delete(`/notifications/${id}`)
  },

  // POST /notifications/read-all → { updated }
  markAllRead: async (): Promise<{ updated: number }> => {
    const response = await client.post<{ updated: number }>('/notifications/read-all')
    return response.data
  },
}
