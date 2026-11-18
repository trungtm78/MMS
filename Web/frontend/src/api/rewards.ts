// Khen thưởng (reward) and kỷ luật (discipline) decisions — Web/backend/src/rewards. The code
// lists copy reward-codes.ts; each record carries the backend label of its codes, and the forms
// label the codes from the locale file (rewards.codes.*).
import client from './client'

// Thông tư 93/2024/TT-BQP (amended by 62/2025/TT-BQP), individual titles and forms
export const REWARD_FORMS = [
  'chien_si_thi_dua_toan_quoc',
  'chien_si_thi_dua_toan_quan',
  'chien_si_thi_dua_co_so',
  'chien_si_tien_tien',
  'huan_chuong',
  'huy_chuong',
  'danh_hieu_vinh_du_nha_nuoc',
  'giai_thuong_nha_nuoc',
  'ky_niem_chuong',
  'bang_khen',
  'giay_khen',
] as const
export type RewardForm = (typeof REWARD_FORMS)[number]

export const REWARD_AUTHORITIES = [
  'state',
  'prime_minister',
  'ministry_of_defence',
  'ministry_or_province',
  'military_region',
  'provincial_military_command',
  'district',
  'commune',
] as const
export type RewardAuthority = (typeof REWARD_AUTHORITIES)[number]

// District-level administrations ended with the two-tier local government model
export const DISTRICT_LEVEL_ENDED_ON = '2025-07-01'

export const REWARD_FORM_AUTHORITIES: Readonly<Record<RewardForm, readonly RewardAuthority[]>> = {
  chien_si_thi_dua_toan_quoc: ['prime_minister'],
  chien_si_thi_dua_toan_quan: ['ministry_of_defence'],
  chien_si_thi_dua_co_so: ['military_region', 'provincial_military_command', 'district', 'commune'],
  chien_si_tien_tien: ['provincial_military_command', 'district', 'commune'],
  huan_chuong: ['state'],
  huy_chuong: ['state'],
  danh_hieu_vinh_du_nha_nuoc: ['state'],
  giai_thuong_nha_nuoc: ['state'],
  ky_niem_chuong: ['ministry_of_defence'],
  bang_khen: ['prime_minister', 'ministry_of_defence', 'ministry_or_province', 'military_region'],
  giay_khen: ['military_region', 'provincial_military_command', 'district', 'commune'],
}

/**
 * The authorities that may confer `form` on a decision dated `issuedDate` (YYYY-MM-DD), in
 * REWARD_AUTHORITIES order — the rule of reward-codes.ts authorityAllowedFor.
 */
export function authoritiesFor(form: RewardForm, issuedDate: string): RewardAuthority[] {
  // YYYY-MM-DD strings compare in calendar order
  return REWARD_AUTHORITIES.filter(
    (authority) =>
      REWARD_FORM_AUTHORITIES[form].includes(authority) &&
      (authority !== 'district' || issuedDate < DISTRICT_LEVEL_ENDED_ON),
  )
}

// What the reward recognises: regular achievement, an exceptional deed, a campaign, a period of service
export const REWARD_BASES = ['achievement', 'ad_hoc', 'thematic', 'contribution'] as const
export type RewardBasis = (typeof REWARD_BASES)[number]

// Luật Dân quân tự vệ 2019 Điều 48, Thông tư 75/2020/TT-BQP Điều 8
export const DISCIPLINE_FORMS = ['khien_trach', 'canh_cao', 'giang_chuc', 'cach_chuc', 'tuoc_danh_hieu'] as const
export type DisciplineForm = (typeof DISCIPLINE_FORMS)[number]

// Giáng chức and cách chức apply to command positions only
export const COMMAND_ONLY_DISCIPLINE_FORMS: readonly DisciplineForm[] = ['giang_chuc', 'cach_chuc']

export const DISCIPLINE_STATUSES = ['active', 'appealed', 'overturned'] as const
export type DisciplineStatus = (typeof DISCIPLINE_STATUSES)[number]

export const APPEAL_OUTCOMES = ['upheld', 'overturned'] as const
export type AppealOutcome = (typeof APPEAL_OUTCOMES)[number]

// Khiếu nại lần đầu and lần hai (Luật Khiếu nại 2011)
export const MAX_APPEAL_ROUNDS = 2

// rewards.service.ts RewardRecord
export interface RewardRecord {
  id: string
  militiaId: string
  militiaName: string
  militiaCode: string
  unitCode: string
  unitName: string
  rewardType: RewardForm
  rewardTypeLabel: string
  issuingAuthority: RewardAuthority
  issuingAuthorityLabel: string
  basis: RewardBasis
  criteria: string | null
  decisionNumber: string | null
  issuedDate: string
  createdBy: string
  createdByName: string
  createdAt: string
}

// discipline.service.ts DisciplineRecord
export interface DisciplineRecord {
  id: string
  militiaId: string
  militiaName: string
  militiaCode: string
  unitCode: string
  unitName: string
  disciplineType: DisciplineForm
  disciplineTypeLabel: string
  violation: string
  violationDate: string | null
  decisionDate: string
  decisionNumber: string | null
  issuedBy: string | null
  status: DisciplineStatus
  /** Filing date of the latest appeal */
  appealedAt: string | null
  appealRounds: number
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

// discipline.service.ts AppealRecord
export interface AppealRecord {
  id: string
  round: number
  reason: string
  filedDate: string
  filedBy: string
  filedByName: string
  outcome: AppealOutcome | null
  resolution: string | null
  decidedDate: string | null
  decidedBy: string | null
  decidedByName: string | null
  createdAt: string
  decidedAt: string | null
}

export interface DisciplineDetail extends DisciplineRecord {
  appeals: AppealRecord[]
}

// rewards.dto.ts CreateRewardDto
export interface CreateRewardBody {
  militiaId: string
  rewardType: RewardForm
  issuingAuthority: RewardAuthority
  basis?: RewardBasis
  criteria?: string
  decisionNumber?: string
  issuedDate: string
}

// rewards.dto.ts CreateDisciplineDto
export interface CreateDisciplineBody {
  militiaId: string
  disciplineType: DisciplineForm
  violation: string
  violationDate?: string
  decisionDate: string
  decisionNumber?: string
  issuedBy?: string
}

// rewards.dto.ts FileAppealDto — filedDate defaults to today in Vietnam
export interface FileAppealBody {
  reason: string
  filedDate?: string
}

// rewards.dto.ts DecideAppealDto — decidedDate defaults to today in Vietnam
export interface DecideAppealBody {
  outcome: AppealOutcome
  resolution: string
  decidedDate?: string
}

/** discipline.service.ts fileAppeal: an active decision with an appeal round left */
export function canFileAppeal(record: Pick<DisciplineRecord, 'status' | 'appealRounds'>): boolean {
  return record.status === 'active' && record.appealRounds < MAX_APPEAL_ROUNDS
}

/** The appeal still waiting for a decision, if any */
export function openAppeal(detail: Pick<DisciplineDetail, 'appeals'>): AppealRecord | undefined {
  return detail.appeals.find((appeal) => appeal.outcome === null)
}

export const rewardKeys = {
  rewards: ['rewards'] as const,
  discipline: ['discipline'] as const,
  disciplineDetail: (id: string) => ['discipline', id] as const,
  report: ['rewards-report'] as const,
}

export const rewardsApi = {
  // GET /rewards — staff read their unit scope, DQTV members their own decisions
  listRewards: async (): Promise<RewardRecord[]> => (await client.get<RewardRecord[]>('/rewards')).data,

  // POST /rewards (REWARD_STAFF_ROLES)
  createReward: async (body: CreateRewardBody): Promise<RewardRecord> =>
    (await client.post<RewardRecord>('/rewards', body)).data,

  // GET /discipline
  listDiscipline: async (): Promise<DisciplineRecord[]> => (await client.get<DisciplineRecord[]>('/discipline')).data,

  // GET /discipline/:id — the decision with its appeals
  getDiscipline: async (id: string): Promise<DisciplineDetail> =>
    (await client.get<DisciplineDetail>(`/discipline/${id}`)).data,

  // POST /discipline (REWARD_STAFF_ROLES)
  createDiscipline: async (body: CreateDisciplineBody): Promise<DisciplineRecord> =>
    (await client.post<DisciplineRecord>('/discipline', body)).data,

  // PATCH /discipline/:id/appeal (REWARD_READER_ROLES)
  fileAppeal: async (id: string, body: FileAppealBody): Promise<DisciplineDetail> =>
    (await client.patch<DisciplineDetail>(`/discipline/${id}/appeal`, body)).data,

  // PATCH /discipline/:id/appeal/decision (REWARD_STAFF_ROLES)
  decideAppeal: async (id: string, body: DecideAppealBody): Promise<DisciplineDetail> =>
    (await client.patch<DisciplineDetail>(`/discipline/${id}/appeal/decision`, body)).data,
}
