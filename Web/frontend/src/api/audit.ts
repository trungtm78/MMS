// US-W012: Audit log API (read-only — immutable) — Web/backend/src/audit/audit.controller.ts
import client from './client'
import { withJsonErrorBody } from '@/lib/api-error'
import type { AuditLog } from '@/types'

/** One row of GET /audit (also served as GET /audit-logs) */
export type AuditLogEntry = AuditLog

export interface AuditLogList {
  data: AuditLogEntry[]
  total: number
  page: number
  limit: number
}

/** Query of GET /audit, named exactly like the controller's @Query parameters */
export interface AuditLogFilter {
  action?: string
  entityType?: string
  /** UUID of one audited record */
  entityId?: string
  /** UUID of the acting user */
  actorId?: string
  /** Vietnamese calendar day YYYY-MM-DD, inclusive */
  from?: string
  /** Vietnamese calendar day YYYY-MM-DD, inclusive */
  to?: string
  /** Matches action, entity type, actor full name and username */
  search?: string
  page?: number
  /** 1..100 on the server */
  limit?: number
}

/** Query of GET /audit/export (system_admin, at most 90 days) */
export interface AuditExportFilter {
  from: string
  to: string
  action?: string
  entityType?: string
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar day written YYYY-MM-DD (mirrors isIsoDate in common/time/business-date.ts) */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// The API answers 400 invalid_date; failing here keeps a programming error out of the network
function assertDates(filter: { from?: string; to?: string }): void {
  for (const [name, value] of [['from', filter.from], ['to', filter.to]] as const) {
    if (value && !isIsoDate(value)) {
      throw new Error(`Audit filter "${name}" must be a YYYY-MM-DD calendar day, got "${value}"`)
    }
  }
}

// Drops unset and blank values; trims text
function toParams(filter: object): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(filter)) {
    if (typeof value === 'string') {
      const text = value.trim()
      if (text) params[key] = text
    } else if (typeof value === 'number') {
      params[key] = value
    }
  }
  return params
}

export const auditApi = {
  // US-W012 AC-1: Search audit log — system_admin, police_ward, police_area
  list: async (filter: AuditLogFilter = {}): Promise<AuditLogList> => {
    assertDates(filter)
    const response = await client.get<AuditLogList>('/audit', { params: toParams(filter) })
    return response.data
  },

  // US-W012 AC-2: Excel export — system_admin only
  exportXlsx: async (filter: AuditExportFilter): Promise<Blob> => {
    assertDates(filter)
    try {
      const response = await client.get<Blob>('/audit/export', {
        params: toParams(filter),
        responseType: 'blob',
      })
      return response.data
    } catch (err) {
      throw await withJsonErrorBody(err)
    }
  },
}
