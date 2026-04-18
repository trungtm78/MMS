// Regression: ISSUE-002 — searchMilitia() must return paginated envelope {data, total, page, limit}
// Found by /qa on 2026-04-19
// Report: .gstack/qa-reports/qa-report-localhost-2026-04-19.md
import { describe, it, expect, vi, beforeEach } from 'vitest'
import client from './client'
import { searchMilitia } from './militia'

vi.mock('./client')

describe('searchMilitia return shape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns paginated envelope when backend returns one', async () => {
    const envelope = { data: [{ id: '1', fullName: 'Test' }], total: 1, page: 1, limit: 20 }
    vi.mocked(client.get).mockResolvedValueOnce({ data: envelope })

    const result = await searchMilitia({ q: 'test' })

    expect(result).toHaveProperty('data')
    expect(result).toHaveProperty('total')
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.total).toBe(1)
  })

  it('wraps a legacy raw array in a paginated envelope', async () => {
    const rawArray = [{ id: '1', fullName: 'Test' }, { id: '2', fullName: 'Test2' }]
    vi.mocked(client.get).mockResolvedValueOnce({ data: rawArray })

    const result = await searchMilitia({ q: 'test', page: 2, limit: 10 })

    expect(result.data).toEqual(rawArray)
    expect(result.total).toBe(2)
    expect(result.page).toBe(2)
    expect(result.limit).toBe(10)
  })

  it('data field is always an array — never undefined', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({ data: { data: [], total: 0, page: 1, limit: 20 } })

    const result = await searchMilitia({})

    expect(Array.isArray(result.data)).toBe(true)
  })
})
