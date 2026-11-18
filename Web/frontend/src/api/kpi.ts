// KPI overview and KPI report — Web/backend/src/kpi. GET /kpi/dashboard (kpi-dashboard.service.ts)
// answers the overview of a month for the caller's unit scope; GET /kpi/summary-report and
// GET /kpi/export (kpi.service.ts) the per-member report of a payroll period. Metric names and
// units, grade and recommendation labels arrive with the data, labelled by the backend.
import client from './client'

export type KpiComparison = 'min' | 'max'

export interface KpiDateWindow {
  from: string
  to: string
}

export interface KpiPeriod {
  year: number
  month: number
  /** MM/YYYY */
  label: string
  from: string
  to: string
  /** The payroll period asked for, when the month was given as one */
  periodId: string | null
}

// kpi-grades.ts KPI_GRADES: bands of a score on the 100-point scale, best first
export const KPI_GRADES = [
  { grade: 'excellent', minScore: 90 },
  { grade: 'good', minScore: 75 },
  { grade: 'fair', minScore: 60 },
  { grade: 'needs_improvement', minScore: 0 },
] as const
export type KpiGrade = (typeof KPI_GRADES)[number]['grade']

/** The grade band of a score, as kpi-grades.ts gradeOf grades it */
export function gradeOf(score: number): KpiGrade {
  return (KPI_GRADES.find((band) => score >= band.minScore) ?? KPI_GRADES[KPI_GRADES.length - 1]).grade
}

export const KPI_EVALUATION_PERIODS = ['monthly', 'quarterly', 'yearly'] as const
export type KpiEvaluationPeriod = (typeof KPI_EVALUATION_PERIODS)[number]

export const KPI_RECOMMENDATIONS = ['reward', 'maintain', 'training', 'warning', 'discipline'] as const
export type KpiRecommendation = (typeof KPI_RECOMMENDATIONS)[number]

// kpi-dashboard.service.ts metrics()
export interface KpiMetric {
  key: string
  name: string
  unit: string
  /** 'min': the target is a floor to reach; 'max': a ceiling to stay under (lower is better) */
  comparison: KpiComparison
  window: KpiDateWindow
  /** Average over the scope's members, null when there is nothing to average */
  current: number | null
  target: number
  met: boolean
  membersMeeting: number
  memberCount: number
}

export interface KpiGradeCount {
  grade: KpiGrade
  label: string
  minScore: number
  count: number
  /** Share of the evaluated members, 0-100 */
  pct: number
}

export interface KpiRecommendationCount {
  recommendation: KpiRecommendation
  label: string
  count: number
}

export interface KpiUnitScore {
  unitCode: string
  unitName: string
  memberCount: number
  evaluatedCount: number
  /** 0-100, null when no member of the unit was evaluated */
  averageScore: number | null
}

export interface KpiRankedMember {
  militiaId: string
  userId: string | null
  fullName: string
  militiaCode: string
  unitCode: string
  score: number
  grade: KpiGrade
  gradeLabel: string
}

export interface KpiTrendPoint {
  year: number
  month: number
  /** YYYY-MM */
  label: string
  /** null for a month without evaluations: a gap, not a zero */
  averageScore: number | null
  evaluatedCount: number
}

// settings/kpi-targets.service.ts KpiTargetsView
export interface KpiTargets {
  minAttendanceDays: number
  minTasksCompleted: number
  maxOverdueTasks: number
  minTrainingHours: number
  evaluationPeriod: KpiEvaluationPeriod
  effectiveFrom: string | null
  updatedAt: string | null
  updatedBy: { id: string; fullName: string | null } | null
  isDefault: boolean
}

// kpi-dashboard.service.ts getDashboard()
export interface KpiDashboard {
  period: KpiPeriod
  unitCode: string | null
  generatedAt: string
  memberCount: number
  evaluatedCount: number
  notEvaluatedCount: number
  /** Evaluated members over members, 0-100 */
  coverageRate: number
  averageScore: number | null
  distribution: KpiGradeCount[]
  recommendations: KpiRecommendationCount[]
  byUnit: KpiUnitScore[]
  top: KpiRankedMember[]
  bottom: KpiRankedMember[]
  trend: KpiTrendPoint[]
  targets: KpiTargets
  metrics: KpiMetric[]
}

// kpi.service.ts KpiSummaryItem: criteria and supervisor scores on the 0-10 scale (two decimals),
// total on the 100-point scale (one decimal), all JSON numbers; rank and rankInUnit converted
// from BIGINT by the service
export interface KpiSummaryItem {
  militiaId: string
  name: string
  code: string
  unit: string
  attendanceScore: number | null
  taskScore: number | null
  disciplineScore: number | null
  attitudeScore: number | null
  supervisorScore: number | null
  total: number | null
  rank: number
  rankInUnit: number
  /** The backend's xếp loại label */
  xepLoai: string
}

/** GET /kpi/dashboard: a month as year and month or as a payroll period (the current Vietnamese month by default) */
export interface KpiDashboardParams {
  year?: number
  month?: number
  periodId?: string
  unitCode?: string
  /** Members listed among the best and the weakest, 1-20 (5 by default) */
  top?: number
  /** Months of trend ending with the period, 1-24 (6 by default) */
  trendMonths?: number
}

export interface KpiReportParams {
  periodId: string
  unitCode?: string
}

export const kpiKeys = {
  all: ['kpi'] as const,
  dashboard: (params: KpiDashboardParams) => ['kpi', 'dashboard', params] as const,
  report: (params: KpiReportParams) => ['kpi', 'summary-report', params] as const,
}

export const kpiApi = {
  // GET /kpi/dashboard — kpi-dashboard.controller.ts
  getDashboard: async (params: KpiDashboardParams): Promise<KpiDashboard> =>
    (await client.get<KpiDashboard>('/kpi/dashboard', { params })).data,

  // GET /kpi/summary-report — kpi.controller.ts
  getSummaryReport: async (params: KpiReportParams): Promise<KpiSummaryItem[]> =>
    (await client.get<KpiSummaryItem[]>('/kpi/summary-report', { params })).data,

  // GET /kpi/export → xlsx; an error body arrives as a Blob too (read it with withJsonErrorBody)
  exportReport: async (params: KpiReportParams): Promise<Blob> =>
    (await client.get<Blob>('/kpi/export', { params, responseType: 'blob' })).data,
}
