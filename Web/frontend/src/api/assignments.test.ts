import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CA_OFFICER_ROLES,
  createAssignment,
  getAssignments,
  getAvailableDqtv,
  getCaOfficers,
  removeAssignment,
} from './assignments'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

type Row = { id: string; fullName: string; role: string; unitScope: string | null }

const officer = (id: string, role: string): Row => ({ id, fullName: `Cán bộ ${id}`, role, unitScope: null })

// GET /admin/users?role=&page=&limit= answers (admin.service.ts listUsers: at most 100 per page)
function serveUsers(byRole: Record<string, Row[]>, pageLimit = 100) {
  api.get.mockImplementation((url: string, config: { params: { role: string; page: number; limit: number } }) => {
    if (url !== '/admin/users') return Promise.reject(new Error(`unexpected GET ${url}`))
    const { role, page } = config.params
    const rows = byRole[role] ?? []
    const data = rows.slice((page - 1) * pageLimit, page * pageLimit)
    return Promise.resolve({ data: { data, total: rows.length, page, limit: pageLimit } })
  })
}

const usersCalls = () => api.get.mock.calls.filter(([url]) => url === '/admin/users')

describe('api/assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockReset()
    api.post.mockReset()
    api.delete.mockReset()
  })

  // Web/backend/src/common/constants/roles.ts CA_ROLES: everyone GET /assignments treats as a CA officer
  it('knows every CA role of the backend', () => {
    expect([...CA_OFFICER_ROLES].sort()).toEqual(['ca_area', 'ca_officer', 'ca_ward', 'police_area', 'police_ward'])
  })

  describe('getCaOfficers', () => {
    it('asks GET /admin/users for every CA role and merges the answers', async () => {
      serveUsers({
        police_ward: [officer('pw', 'police_ward')],
        police_area: [officer('pa', 'police_area')],
        ca_officer: [officer('co', 'ca_officer')],
        ca_ward: [officer('cw', 'ca_ward')],
        ca_area: [officer('caa', 'ca_area')],
      })

      const officers = await getCaOfficers()

      for (const role of CA_OFFICER_ROLES) {
        expect(api.get).toHaveBeenCalledWith('/admin/users', { params: { role, page: 1, limit: 100 } })
      }
      expect(officers.map((o) => o.id).sort()).toEqual(['caa', 'co', 'cw', 'pa', 'pw'])
    })

    it('lists a person holding several CA roles once', async () => {
      const both = officer('both', 'police_ward')
      serveUsers({ police_ward: [both], ca_officer: [{ ...both, role: 'police_ward' }] })

      expect(await getCaOfficers()).toEqual([both])
    })

    it('reads every page when a role has more than 100 officers', async () => {
      const many = Array.from({ length: 150 }, (_, i) => officer(`pw-${i}`, 'police_ward'))
      serveUsers({ police_ward: many })

      const officers = await getCaOfficers()

      expect(officers).toHaveLength(150)
      expect(api.get).toHaveBeenCalledWith('/admin/users', { params: { role: 'police_ward', page: 2, limit: 100 } })
      expect(usersCalls().filter(([, config]) => config.params.role === 'police_ward')).toHaveLength(2)
    })

    it('stops at an empty page even if the total says otherwise', async () => {
      api.get.mockImplementation((_url: string, config: { params: { role: string; page: number } }) =>
        Promise.resolve({
          data: {
            data: config.params.role === 'police_ward' && config.params.page === 1 ? [officer('pw', 'police_ward')] : [],
            total: 500,
            page: config.params.page,
            limit: 100,
          },
        }),
      )

      expect(await getCaOfficers()).toHaveLength(1)
      expect(usersCalls().filter(([, config]) => config.params.role === 'police_ward')).toHaveLength(2)
    })

    it('fails when one of the requests fails', async () => {
      api.get.mockRejectedValue({ response: { status: 403, data: { message: 'insufficient_role' } } })
      await expect(getCaOfficers()).rejects.toMatchObject({ response: { status: 403 } })
    })
  })

  it('reads the assignments of one officer', async () => {
    const rows = [{ id: 'a1' }]
    api.get.mockResolvedValue({ data: rows })

    await expect(getAssignments('ca-1')).resolves.toBe(rows)
    expect(api.get).toHaveBeenCalledWith('/assignments', { params: { caUserId: 'ca-1' } })
  })

  it('creates an assignment with exactly CreateAssignmentDto', async () => {
    api.post.mockResolvedValue({ data: { id: 'a1' } })

    await expect(createAssignment('ca-1', 'dqtv-1')).resolves.toEqual({ id: 'a1' })
    expect(api.post).toHaveBeenCalledWith('/assignments', { caUserId: 'ca-1', dqtvUserId: 'dqtv-1' })
  })

  it('removes an assignment', async () => {
    api.delete.mockResolvedValue({ data: undefined })

    await removeAssignment('a1')
    expect(api.delete).toHaveBeenCalledWith('/assignments/a1')
  })

  describe('getAvailableDqtv', () => {
    it('lists the militia not yet assigned to the officer, keeping members without an account', async () => {
      const rows = [
        { id: 'mp-1', userId: 'dqtv-1', fullName: 'Lê Văn B', unitCode: 'KP1' },
        { id: 'mp-2', userId: null, fullName: 'Chưa Có Tài Khoản', unitCode: 'KP2' },
      ]
      api.get.mockResolvedValue({ data: { data: rows, total: 2, page: 1, limit: 50 } })

      await expect(getAvailableDqtv('ca-1', 'Lê')).resolves.toEqual(rows)
      expect(api.get).toHaveBeenCalledWith('/militia', { params: { q: 'Lê', limit: 50, excludeAssignedTo: 'ca-1' } })
    })

    it('sends an empty search when there is none', async () => {
      api.get.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 50 } })

      await getAvailableDqtv('ca-1')
      expect(api.get).toHaveBeenCalledWith('/militia', { params: { q: '', limit: 50, excludeAssignedTo: 'ca-1' } })
    })
  })
})
