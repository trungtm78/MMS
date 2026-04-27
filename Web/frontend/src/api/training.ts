import client from './client'

export interface TrainingRecord {
  id: string
  militiaId: string
  trainingType: 'military' | 'political' | 'fire' | 'first_aid' | 'other'
  fromDate: string
  toDate: string
  totalDays: number
  location: string | null
  instructor: string | null
  result: 'pass' | 'fail' | 'not_evaluated'
  certificateNo: string | null
  notes: string | null
  createdAt: string
}

export interface PaginatedTraining {
  data: TrainingRecord[]
  total: number
  page: number
  limit: number
}

export const trainingApi = {
  // Use militiaId + year to avoid fetching all-member data (NĐ 13/2023 data minimization)
  listRecords: (params: { militiaId: string; year?: number; limit?: number }) =>
    client.get<PaginatedTraining>('/training', { params }).then((r) => r.data),
}
