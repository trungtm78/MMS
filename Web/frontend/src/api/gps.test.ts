import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gpsApi, gpsKeys, mergeGpsLiveRow, type GpsLiveRow } from './gps'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('./client', () => ({ default: api }))

// Web/backend/src/gps/gps.service.ts GpsLiveDto as JSON (NUMERIC coordinates are numbers)
const row = (id: string, patch: Partial<GpsLiveRow> = {}): GpsLiveRow => ({
  id,
  militiaId: id,
  userId: `u-${id}`,
  name: 'Nguyễn Văn A',
  fullName: 'Nguyễn Văn A',
  unitCode: 'KV-A',
  lat: 10.762,
  lng: 106.66,
  accuracy: 12.5,
  lastUpdate: '2026-09-14T02:00:00.000Z',
  lastSeenAt: '2026-09-14T02:00:00.000Z',
  status: 'online',
  ...patch,
})

describe('gpsApi', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('reads the latest positions of the members in the caller scope', async () => {
    api.get.mockResolvedValue({ data: [row('m1')] })

    await expect(gpsApi.live()).resolves.toEqual([row('m1')])
    expect(api.get).toHaveBeenCalledWith('/gps/live')
  })

  it('keys the live query', () => {
    expect(gpsKeys.live).toEqual(['gps-live'])
  })
})

describe('mergeGpsLiveRow', () => {
  it('replaces the row of a member already listed, keeping the order', () => {
    const rows = [row('m1'), row('m2')]
    const moved = row('m2', { lat: 10.8, status: 'online', lastUpdate: '2026-09-14T02:05:00.000Z' })

    expect(mergeGpsLiveRow(rows, moved)).toEqual([row('m1'), moved])
    // The cached list is never mutated
    expect(rows[1]).toEqual(row('m2'))
  })

  it('appends a member not listed yet', () => {
    expect(mergeGpsLiveRow([row('m1')], row('m3'))).toEqual([row('m1'), row('m3')])
  })

  it('starts a list when none was loaded', () => {
    expect(mergeGpsLiveRow(undefined, row('m1'))).toEqual([row('m1')])
  })
})
