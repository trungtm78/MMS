import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auditApi } from './audit'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('./client', () => ({ default: api }))

describe('auditApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } })
  })

  describe('list', () => {
    // Web/backend/src/audit/audit.controller.ts GET /audit query names
    it('sends every filter under the backend query name', async () => {
      await auditApi.list({
        action: 'PATCH:militia',
        entityType: 'militia',
        entityId: '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01',
        actorId: '5b1f8f7e-2f7a-4c1a-9d0e-000000000001',
        from: '2026-09-01',
        to: '2026-09-14',
        search: 'nguyen',
        page: 2,
        limit: 50,
      })

      expect(api.get).toHaveBeenCalledWith('/audit', {
        params: {
          action: 'PATCH:militia',
          entityType: 'militia',
          entityId: '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01',
          actorId: '5b1f8f7e-2f7a-4c1a-9d0e-000000000001',
          from: '2026-09-01',
          to: '2026-09-14',
          search: 'nguyen',
          page: 2,
          limit: 50,
        },
      })
    })

    it('leaves out empty filters and trims the search text', async () => {
      await auditApi.list({ action: '', search: '  trần  ', from: undefined, page: 1, limit: 20 })

      expect(api.get).toHaveBeenCalledWith('/audit', { params: { search: 'trần', page: 1, limit: 20 } })
    })

    it('does not send a whitespace-only search', async () => {
      await auditApi.list({ search: '   ', page: 1 })
      expect(api.get).toHaveBeenCalledWith('/audit', { params: { page: 1 } })
    })

    it.each(['14/09/2026', '2026-9-14', '2026-02-30', '2026-09-14T00:00:00Z'])(
      'refuses the date %s before calling the API (from/to are YYYY-MM-DD calendar days)',
      async (date) => {
        await expect(auditApi.list({ from: date })).rejects.toThrow(/YYYY-MM-DD/)
        await expect(auditApi.list({ to: date })).rejects.toThrow(/YYYY-MM-DD/)
        expect(api.get).not.toHaveBeenCalled()
      },
    )

    it('returns the { data, total, page, limit } envelope', async () => {
      const envelope = { data: [{ id: 'log-1' }], total: 1, page: 1, limit: 20 }
      api.get.mockResolvedValueOnce({ data: envelope })
      await expect(auditApi.list()).resolves.toEqual(envelope)
    })
  })

  describe('exportXlsx', () => {
    it('downloads GET /audit/export as a blob with the export filters', async () => {
      const blob = new Blob(['xlsx'])
      api.get.mockResolvedValueOnce({ data: blob })

      const result = await auditApi.exportXlsx({ from: '2026-08-01', to: '2026-09-14', action: 'DELETE:militia' })

      expect(result).toBe(blob)
      expect(api.get).toHaveBeenCalledWith('/audit/export', {
        params: { from: '2026-08-01', to: '2026-09-14', action: 'DELETE:militia' },
        responseType: 'blob',
      })
    })

    it('makes the backend error code readable when the blob request fails', async () => {
      // With responseType 'blob' axios hands the JSON error body over as a Blob
      const body = new Blob([JSON.stringify({ code: 'E001', message: 'date_range_exceeds_90_days', statusCode: 400 })], {
        type: 'application/json',
      })
      api.get.mockRejectedValueOnce({ isAxiosError: true, request: {}, response: { status: 400, data: body } })

      await expect(auditApi.exportXlsx({ from: '2026-01-01', to: '2026-09-14' })).rejects.toMatchObject({
        response: { status: 400, data: { message: 'date_range_exceeds_90_days' } },
      })
    })

    it('refuses an invalid export date before calling the API', async () => {
      await expect(auditApi.exportXlsx({ from: '2026-13-01', to: '2026-09-14' })).rejects.toThrow(/YYYY-MM-DD/)
      expect(api.get).not.toHaveBeenCalled()
    })
  })
})
