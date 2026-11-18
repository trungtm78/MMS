// US-W008: SOS alert API — Web/backend/src/sos. GET /sos/alerts and GET /sos/:id
// (sos-alerts.service.ts) read the incidents of the caller's scope, POST /sos raises one, and
// PATCH /sos/:id/status (sos.service.ts updateStatus) moves one along SOS_STATUS_TRANSITIONS.
// GET /sos answers the same scoped page as GET /sos/alerts, which also narrows by unit: use that.
import client from './client'
import type { PaginatedResponse } from '@/types'

// incident-values.ts INCIDENT_TYPES (migration 007)
export const SOS_INCIDENT_TYPES = ['sos', 'security', 'fire', 'medical', 'accident', 'utility', 'other'] as const
export type SosIncidentType = (typeof SOS_INCIDENT_TYPES)[number]

// incidents.severity, most severe first (the order of the dispatch queue)
export const SOS_SEVERITIES = ['urgent', 'high', 'medium', 'low'] as const
export type SosSeverity = (typeof SOS_SEVERITIES)[number]

// incident-values.ts INCIDENT_STATUSES
export const SOS_INCIDENT_STATUSES = ['open', 'acknowledged', 'responding', 'resolved', 'closed'] as const
export type SosIncidentStatus = (typeof SOS_INCIDENT_STATUSES)[number]

/** A status an alert can be moved to: no move leads back to open */
export type SosStatusTarget = Exclude<SosIncidentStatus, 'open'>

/**
 * incident-values.ts SOS_STATUS_TRANSITIONS: forward through acknowledged and responding,
 * resolved or closed from any open state, a resolved alert taken up again or closed, and a
 * closed alert never reopened. Any other move answers 409 invalid_status_transition.
 */
export const SOS_STATUS_TRANSITIONS: Readonly<Record<SosIncidentStatus, readonly SosStatusTarget[]>> = {
  open: ['acknowledged', 'responding', 'resolved', 'closed'],
  acknowledged: ['responding', 'resolved', 'closed'],
  responding: ['resolved', 'closed'],
  resolved: ['responding', 'closed'],
  closed: [],
}

/** Whether PATCH /sos/:id/status accepts moving an alert from one status to another */
export function canMoveIncident(from: SosIncidentStatus, to: SosIncidentStatus): boolean {
  const allowed: readonly SosIncidentStatus[] = SOS_STATUS_TRANSITIONS[from]
  return allowed.includes(to)
}

// statusGroup: open, acknowledged and responding are active; resolved and closed are handled
export type SosStatusGroup = 'active' | 'resolved'

// The ?status= groups of GET /sos/alerts
export const SOS_STATUS_FILTERS = ['all', 'active', 'resolved'] as const
export type SosStatusFilter = (typeof SOS_STATUS_FILTERS)[number]

// sos.controller.ts CreateSosBodyDto limits
export const SOS_TITLE_MAX_LENGTH = 255
export const SOS_TEXT_MAX_LENGTH = 2000

/** POST /sos: title of 1-255 characters, message up to 2000, valid coordinates; anything else answers 400 */
export interface CreateSosDto {
  incidentType: SosIncidentType
  severity: SosSeverity
  title: string
  message?: string
  lat?: number
  lng?: number
}

// sos.service.ts create RETURNING
export interface SosCreated {
  id: string
  /** SOS-YYYYMMDD-XXXXXX */
  code: string
  incidentType: SosIncidentType
  severity: SosSeverity
  title: string
  message: string
  lat: number | null
  lng: number | null
  status: SosIncidentStatus
  createdAt: string
}

// sos-alerts.service.ts ALERT_SELECT: an item of GET /sos/alerts, and GET /sos/:id
export interface SosIncident {
  id: string
  /** SOS-YYYYMMDD-XXXXXX */
  code: string
  incidentType: SosIncidentType
  severity: SosSeverity
  title: string
  message: string | null
  lat: number | null
  lng: number | null
  locationName: string | null
  status: SosIncidentStatus
  statusGroup: SosStatusGroup
  reporterId: string
  reporterName: string
  reporterUnitCode: string | null
  assignedTo: string | null
  assignedToName: string | null
  resolutionNote: string | null
  createdAt: string
  updatedAt: string | null
  /** Kept when a resolved alert is closed */
  resolvedAt: string | null
}

export interface SosAlertPage extends PaginatedResponse<SosIncident> {
  /** Across the caller's whole scope, whatever the filters */
  counts: { active: number; resolved: number }
}

export interface SosAlertFilters {
  status?: SosStatusFilter
  severity?: SosSeverity
  unitCode?: string
  page?: number
  /** 1-100, 20 by default */
  limit?: number
}

// sos.controller.ts UpdateStatusBodyDto: assignedTo is the id of an active user (else 400 assignee_not_found)
export interface UpdateSosStatusBody {
  status: SosStatusTarget
  assignedTo?: string
  resolutionNote?: string
}

// sos.service.ts updateStatus RETURNING
export interface SosStatusUpdate {
  id: string
  code: string
  incidentType: SosIncidentType
  severity: SosSeverity
  title: string
  status: SosIncidentStatus
  assignedTo: string | null
  resolvedAt: string | null
}

export const sosKeys = {
  alerts: ['sos-alerts'] as const,
  alertList: (filters: SosAlertFilters) => ['sos-alerts', filters] as const,
}

export const sosApi = {
  // GET /sos/alerts — active alerts first, then the most severe, then the newest
  listAlerts: async (filters: SosAlertFilters): Promise<SosAlertPage> =>
    (await client.get<SosAlertPage>('/sos/alerts', { params: filters })).data,

  // GET /sos/:id — an alert outside the caller's scope answers 404 incident_not_found
  get: async (id: string): Promise<SosIncident> => (await client.get<SosIncident>(`/sos/${id}`)).data,

  // US-W008 AC-1: DQTV submit SOS
  create: async (dto: CreateSosDto): Promise<SosCreated> => (await client.post<SosCreated>('/sos', dto)).data,

  // PATCH /sos/:id/status (responders: sos.controller.ts updateStatus @Roles), within the caller's scope
  updateStatus: async (id: string, body: UpdateSosStatusBody): Promise<SosStatusUpdate> =>
    (await client.patch<SosStatusUpdate>(`/sos/${id}/status`, body)).data,

  // US-W008 AC-3: CA acknowledge
  acknowledge: (id: string): Promise<SosStatusUpdate> => sosApi.updateStatus(id, { status: 'acknowledged' }),

  // US-W008 AC-3: CA resolve
  resolve: (id: string): Promise<SosStatusUpdate> => sosApi.updateStatus(id, { status: 'resolved' }),
}
