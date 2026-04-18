// US-W010: KPI & Payroll API
import client from './client'
import type { KpiScore, PayrollPeriod, PaginatedResponse } from '@/types'

export interface AdjustKpiDto {
  adjustedScore: number
  adjustmentNote: string
}

export const payrollApi = {
  // Periods
  listPeriods: async (): Promise<PayrollPeriod[]> => {
    const response = await client.get<PayrollPeriod[]>('/payroll/periods')
    return response.data
  },

  // US-W010 AC-1: List KPI scores for a period
  listKpi: async (params: { periodId: string; page?: number; limit?: number }): Promise<PaginatedResponse<KpiScore>> => {
    const response = await client.get<PaginatedResponse<KpiScore>>('/payroll/kpi', { params })
    return response.data
  },

  // US-W010 AC-2: Adjust KPI for special case
  adjustKpi: async (id: string, dto: AdjustKpiDto): Promise<KpiScore> => {
    const response = await client.patch<KpiScore>(`/payroll/kpi/${id}`, dto)
    return response.data
  },

  // US-W010 AC-3: Lock payroll period
  lockPeriod: async (periodId: string): Promise<PayrollPeriod> => {
    const response = await client.post<PayrollPeriod>(`/payroll/periods/${periodId}/lock`)
    return response.data
  },

  // Reopen — admin only
  reopenPeriod: async (periodId: string): Promise<PayrollPeriod> => {
    const response = await client.post<PayrollPeriod>(`/payroll/periods/${periodId}/reopen`)
    return response.data
  },
}
