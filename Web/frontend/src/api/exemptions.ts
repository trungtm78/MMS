// Exemption / deferral decisions — Web/backend/src/exemption/exemption.controller.ts,
// exemption.dto.ts, exemption.service.ts
import client from './client'

export type ExemptionType = 'exemption' | 'deferral'
export type ExemptionStatus = 'active' | 'expired' | 'revoked'

/** Row of GET /exemptions; `status` already reads "expired" once the expiry date has passed */
export interface ExemptionRecord {
  id: string
  militiaId: string
  militiaName: string
  militiaCode: string
  unitCode: string
  type: ExemptionType
  reason: string
  legalBasis: string
  effectiveDate: string // YYYY-MM-DD
  expiryDate: string | null // YYYY-MM-DD
  status: ExemptionStatus
  documents: string[]
  createdAt: string
  updatedAt: string
}

/** Body of POST /exemptions — CreateExemptionDto; the API rejects any other property */
export interface CreateExemptionBody {
  militiaId: string
  type: ExemptionType
  reason: string
  legalBasis: string
  effectiveDate: string
  expiryDate?: string
  documents?: string[]
}

/** GET /exemptions?status=&militiaId=&unitCode= */
export interface ExemptionQuery {
  status?: ExemptionStatus
  militiaId?: string
  unitCode?: string
}

/** The server answered, but not with the documented shape */
export class UnexpectedResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnexpectedResponseError'
  }
}

export const exemptionKeys = {
  all: ['exemptions'] as const,
  list: (query: ExemptionQuery) => ['exemptions', 'list', query] as const,
  revoke: ['exemptions', 'revoke'] as const,
}

export type ExemptionField = 'militiaId' | 'type' | 'reason' | 'legalBasis' | 'effectiveDate' | 'expiryDate'

/** CreateExemptionDto property names that validation_failed messages start with, per form field */
export const EXEMPTION_FORM_FIELDS: Readonly<Record<ExemptionField, readonly string[]>> = {
  militiaId: ['militiaId'],
  type: ['type'],
  reason: ['reason'],
  legalBasis: ['legalBasis'],
  effectiveDate: ['effectiveDate'],
  expiryDate: ['expiryDate'],
}

// Backend error codes of these endpoints are translated by the error table: errors.exemptions.<code>

/** Codes that concern one field of the create form, shown next to it (text: errors.exemptions.<code>) */
export const EXEMPTION_ERROR_FIELDS: Readonly<Record<string, ExemptionField>> = {
  militia_not_found: 'militiaId',
  unit_scope_violation: 'militiaId',
  expiry_before_effective: 'expiryDate',
  overlapping_active_exemption: 'effectiveDate',
}

export const exemptionsApi = {
  // GET /exemptions — ExemptionService.findAll returns a plain array, not a paginated envelope
  list: async (query: ExemptionQuery = {}): Promise<ExemptionRecord[]> => {
    const params = Object.fromEntries(Object.entries(query).filter(([, value]) => !!value))
    const response = Object.keys(params).length
      ? await client.get<unknown>('/exemptions', { params })
      : await client.get<unknown>('/exemptions')
    if (!Array.isArray(response.data)) {
      throw new UnexpectedResponseError('GET /exemptions did not return an array')
    }
    return response.data as ExemptionRecord[]
  },

  // POST /exemptions (system_admin, police_ward, ca_ward, office_staff)
  create: async (body: CreateExemptionBody): Promise<ExemptionRecord> => {
    const response = await client.post<ExemptionRecord>('/exemptions', body)
    return response.data
  },

  // PATCH /exemptions/:id/review { status: 'revoked' } — a decision only ever leaves "active"
  revoke: async (id: string): Promise<ExemptionRecord> => {
    const response = await client.patch<ExemptionRecord>(`/exemptions/${id}/review`, { status: 'revoked' })
    return response.data
  },
}
