import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SOS_INCIDENT_STATUSES, SOS_INCIDENT_TYPES, SOS_STATUS_TRANSITIONS, canMoveIncident, sosApi } from './sos'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('./client', () => ({ default: api }))

describe('sosApi', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
  })

  it('lists GET /sos/alerts with its filters and returns the page', async () => {
    const page = { data: [], total: 0, page: 2, limit: 50, counts: { active: 0, resolved: 0 } }
    api.get.mockResolvedValueOnce({ data: page })

    await expect(sosApi.listAlerts({ status: 'active', severity: 'urgent', unitCode: 'KP1', page: 2, limit: 50 })).resolves.toBe(page)
    expect(api.get).toHaveBeenCalledWith('/sos/alerts', { params: { status: 'active', severity: 'urgent', unitCode: 'KP1', page: 2, limit: 50 } })
  })

  it('reads one alert with GET /sos/:id', async () => {
    const alert = { id: 'inc-1', code: 'SOS-20260914-A1B2C3', status: 'open', statusGroup: 'active' }
    api.get.mockResolvedValueOnce({ data: alert })

    await expect(sosApi.get('inc-1')).resolves.toBe(alert)
    expect(api.get).toHaveBeenCalledWith('/sos/inc-1')
  })

  it('raises an alert with POST /sos and returns it with its code', async () => {
    // sos.service.ts create RETURNING
    const created = {
      id: 'inc-9',
      code: 'SOS-20260914-Q7W8E9',
      incidentType: 'medical',
      severity: 'high',
      title: 'Người bị ngã',
      message: '',
      lat: 10.75,
      lng: 106.62,
      status: 'open',
      createdAt: '2026-09-14T02:00:00.000Z',
    }
    api.post.mockResolvedValueOnce({ data: created })

    const body = { incidentType: 'medical', severity: 'high', title: 'Người bị ngã', lat: 10.75, lng: 106.62 } as const
    await expect(sosApi.create(body)).resolves.toBe(created)
    expect(api.post).toHaveBeenCalledWith('/sos', body)
  })

  it.each([
    ['updateStatus', () => sosApi.updateStatus('inc-1', { status: 'responding', resolutionNote: 'Đang tới' }), { status: 'responding', resolutionNote: 'Đang tới' }],
    ['resolve', () => sosApi.resolve('inc-1'), { status: 'resolved' }],
    ['acknowledge', () => sosApi.acknowledge('inc-1'), { status: 'acknowledged' }],
  ])('%s sends PATCH /sos/:id/status', async (_, call, body) => {
    const updated = { id: 'inc-1', code: 'SOS-20260914-A1B2C3', status: body.status }
    api.patch.mockResolvedValueOnce({ data: updated })

    await expect(call()).resolves.toBe(updated)
    expect(api.patch).toHaveBeenCalledWith('/sos/inc-1/status', body)
  })
})

// Web/backend/src/sos/incident-values.ts
describe('SOS incident values', () => {
  it('knows the incident types the backend accepts', () => {
    expect(SOS_INCIDENT_TYPES).toEqual(['sos', 'security', 'fire', 'medical', 'accident', 'utility', 'other'])
  })

  it('copies the status transitions of the backend', () => {
    expect(SOS_STATUS_TRANSITIONS).toEqual({
      open: ['acknowledged', 'responding', 'resolved', 'closed'],
      acknowledged: ['responding', 'resolved', 'closed'],
      responding: ['resolved', 'closed'],
      resolved: ['responding', 'closed'],
      closed: [],
    })
  })

  const ALLOWED = new Set([
    'open>acknowledged',
    'open>responding',
    'open>resolved',
    'open>closed',
    'acknowledged>responding',
    'acknowledged>resolved',
    'acknowledged>closed',
    'responding>resolved',
    'responding>closed',
    'resolved>responding',
    'resolved>closed',
  ])

  it.each(SOS_INCIDENT_STATUSES.flatMap((from) => SOS_INCIDENT_STATUSES.map((to) => [from, to] as const)))(
    'decides whether %s may move to %s',
    (from, to) => {
      expect(canMoveIncident(from, to)).toBe(ALLOWED.has(`${from}>${to}`))
    },
  )
})
