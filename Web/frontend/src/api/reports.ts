// Report endpoints: GET /reports/custom and /reports/custom/export (custom-reports.controller.ts)
// and GET /tasks/report (tasks.controller.ts:174).
import client from '@/api/client'
import { withJsonErrorBody } from '@/lib/api-error'

// ─── Custom report ────────────────────────────────────────────────────────────

export type CustomReportDataset = 'attendance' | 'tasks' | 'kpi' | 'payroll'

export type CustomReportGrouping = 'none' | 'unit' | 'member' | 'day' | 'month' | 'status' | 'type' | 'priority' | 'assignee'

/** The breakdowns and status filters each dataset accepts (custom-report.definitions.ts), in the backend's order */
export const CUSTOM_REPORT_CHOICES = {
  attendance: {
    groupings: ['none', 'unit', 'member', 'day', 'month', 'status'],
    statuses: ['present', 'late', 'early_leave', 'absent'],
  },
  tasks: {
    groupings: ['none', 'unit', 'day', 'month', 'status', 'type', 'priority', 'assignee'],
    statuses: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue'],
  },
  kpi: {
    groupings: ['none', 'unit', 'member', 'month', 'status'],
    statuses: ['reward', 'maintain', 'training', 'warning', 'discipline'],
  },
  payroll: {
    groupings: ['none', 'unit', 'member', 'month', 'status'],
    statuses: ['pending', 'approved', 'rejected'],
  },
} as const satisfies Record<CustomReportDataset, { groupings: readonly CustomReportGrouping[]; statuses: readonly string[] }>

export type ReportColumnType = 'text' | 'number' | 'percent' | 'currency' | 'date'

export interface ReportColumn {
  key: string
  label: string
  type: ReportColumnType
}

export interface CustomReportQuery {
  dataset: CustomReportDataset
  from: string
  to: string
  groupBy: CustomReportGrouping
  /** Blank for every status */
  status?: string
  /** Blank for the whole scope of the caller */
  unitCode?: string
  limit?: number
}

export interface CustomReportResult {
  dataset: CustomReportDataset
  title: string
  from: string
  to: string
  /** The unit the report is limited to; null for the whole ward */
  unitCode: string | null
  groupBy: CustomReportGrouping
  status: string | null
  generatedAt: string
  /** Breakdown columns, then the measures */
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  rowCount: number
  rowLimit: number
  /** More breakdown rows exist than rowLimit */
  truncated: boolean
  /** The measures over the whole scope and range, whatever the breakdown */
  summary: { key: string; label: string; value: unknown }[]
}

// ─── Task report ──────────────────────────────────────────────────────────────

export type TaskReportStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'overdue'

/** Counts, per task: completion rate = completed among the tasks not cancelled, in percent */
interface TaskCounts {
  total: number
  completed: number
  cancelled: number
  overdue: number
  completionRate: number
}

export interface TaskReport {
  from: string
  to: string
  unitCode: string | null
  generatedAt: string
  totals: TaskCounts & { pending: number; assigned: number; inProgress: number }
  byStatus: { status: TaskReportStatus; count: number }[]
  byType: { type: string | null; count: number }[]
  byPriority: { priority: string | null; count: number }[]
  byMonth: { month: string; total: number; completed: number; overdue: number }[]
  byUnit: (TaskCounts & { unitCode: string | null; unitName: string | null })[]
  byAssignee: {
    data: (TaskCounts & { userId: string; fullName: string; militiaCode: string | null; unitCode: string | null; inProgress: number })[]
    total: number
    page: number
    limit: number
  }
}

/** Blank dates mean the backend default: twelve business months ending today */
export interface TaskReportQuery {
  from?: string
  to?: string
  unitCode?: string
  /** Page of the per-assignee breakdown */
  page: number
  limit: number
}

/** The backend reads a missing filter as "no filter": blank values are not sent */
function withoutBlanks(params: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''))
}

export const reportsApi = {
  custom: async (query: CustomReportQuery): Promise<CustomReportResult> => {
    const response = await client.get<CustomReportResult>('/reports/custom', { params: withoutBlanks(query) })
    return response.data
  },

  /** The same report as an xlsx workbook (up to 5000 breakdown rows) */
  exportCustom: async (query: CustomReportQuery): Promise<Blob> => {
    try {
      const response = await client.get<Blob>('/reports/custom/export', {
        params: withoutBlanks(query),
        responseType: 'blob',
      })
      return response.data
    } catch (err) {
      throw await withJsonErrorBody(err)
    }
  },

  tasks: async (query: TaskReportQuery): Promise<TaskReport> => {
    const response = await client.get<TaskReport>('/tasks/report', { params: withoutBlanks(query) })
    return response.data
  },

  // GET /training/compliance-report (training.controller.ts:58): every active member of the scope
  trainingCompliance: async (query: TrainingComplianceQuery): Promise<TrainingComplianceRow[]> => {
    const response = await client.get<TrainingComplianceRow[]>('/training/compliance-report', { params: withoutBlanks(query) })
    return response.data
  },

  // GET /training/export (training.controller.ts:75): the same report as an xlsx workbook
  exportTrainingCompliance: async (query: TrainingComplianceQuery): Promise<Blob> => {
    try {
      const response = await client.get<Blob>('/training/export', {
        params: withoutBlanks(query),
        responseType: 'blob',
      })
      return response.data
    } catch (err) {
      throw await withJsonErrorBody(err)
    }
  },
}

// ─── Training compliance report ───────────────────────────────────────────────

/** A member's result for the year: 15 training days or more pass, 10 or more warn, fewer fail */
export type TrainingComplianceResult = 'pass' | 'warning' | 'fail'

/** One row of GET /training/compliance-report (training.service.ts TrainingComplianceRow) */
export interface TrainingComplianceRow {
  militiaId: string
  militiaName: string
  militiaCode: string
  unitCode: string
  /** Training days of the year per type */
  military: number
  political: number
  fire: number
  firstAid: number
  other: number
  totalDays: number
  requiredDays: number
  /** The result as the backend words it; read it with trainingComplianceResult */
  status: string
}

/** A blank unit covers the whole scope of the caller */
export interface TrainingComplianceQuery {
  year: number
  unitCode?: string
}

// The backend words the result in Vietnamese (ĐẠT, CẢNH BÁO, KHÔNG ĐẠT); without diacritics they read:
const RESULT_BY_PLAIN_WORD: Readonly<Partial<Record<string, TrainingComplianceResult>>> = {
  DAT: 'pass',
  'CANH BAO': 'warning',
  'KHONG DAT': 'fail',
}

/** The result a backend status word stands for; null for a word the page does not know */
export function trainingComplianceResult(status: string): TrainingComplianceResult | null {
  const plainWord = status
    .normalize('NFD')
    // Combining marks go; the letter Đ (U+0110) has no decomposition and becomes D
    .replace(/[̀-ͯ]/g, '')
    .replace(/Đ/g, 'D')
    .trim()
    .toUpperCase()
  return RESULT_BY_PLAIN_WORD[plainWord] ?? null
}
