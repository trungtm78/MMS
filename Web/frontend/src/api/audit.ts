// US-W012: Audit log API (read-only — immutable)
import client from './client'
import type { AuditLog, PaginatedResponse } from '@/types'

export interface AuditLogFilter {
  actor?: string
  action?: string
  resource?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

export const auditApi = {
  // US-W012 AC-1: Search audit log — admin/police_ward only
  list: async (params?: AuditLogFilter): Promise<PaginatedResponse<AuditLog>> => {
    const response = await client.get<PaginatedResponse<AuditLog>>('/audit', { params })
    return response.data
  },

  // US-W012 AC-2: Export to CSV
  exportCsv: async (params?: AuditLogFilter): Promise<Blob> => {
    const response = await client.get('/audit/export', {
      params,
      responseType: 'blob',
    })
    return response.data
  },
}
