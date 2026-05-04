import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { GpsService } from './gps.service';

const mockQuery = jest.fn();
const mockDs = { query: mockQuery };

async function build() {
  const mod = await Test.createTestingModule({
    providers: [GpsService, { provide: getDataSourceToken(), useValue: mockDs }],
  }).compile();
  return mod.get(GpsService);
}

describe('GpsService', () => {
  let service: GpsService;

  beforeEach(async () => {
    service = await build();
    mockQuery.mockReset();
  });

  // ── recordLocation ────────────────────────────────────────────────────────

  it('1. recordLocation throws NotFoundException when no militia profile for userId', async () => {
    mockQuery.mockResolvedValueOnce([]); // SELECT returns empty
    await expect(service.recordLocation('user-no-profile', { lat: 10.762, lng: 106.660 }))
      .rejects.toThrow(NotFoundException);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('militia_profiles');
    expect(sql).toContain('user_id');
  });

  it('2. recordLocation resolves militia_id from userId and calls CTE insert', async () => {
    const militiaId = 'militia-uuid-123';
    mockQuery
      .mockResolvedValueOnce([{ id: militiaId }]) // SELECT militia_profiles
      .mockResolvedValueOnce([]);                  // CTE INSERT
    await service.recordLocation('user-uuid-456', { lat: 10.762, lng: 106.660 });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const cteSql: string = mockQuery.mock.calls[1][0];
    const cteParams: unknown[] = mockQuery.mock.calls[1][1];
    // Must use resolved militiaId, not the original userId
    expect(cteParams[0]).toBe(militiaId);
    expect(cteSql).toContain('gps_points');
    expect(cteSql).toContain('gps_latest');
    expect(cteSql).toContain('ON CONFLICT');
    expect(cteSql).toContain('WITH ins AS');
  });

  it('3. recordLocation uses provided capturedAt when given', async () => {
    const capturedAt = '2026-01-15T10:30:00.000Z';
    mockQuery
      .mockResolvedValueOnce([{ id: 'militia-1' }])
      .mockResolvedValueOnce([]);
    await service.recordLocation('user-1', { lat: 10.0, lng: 106.0, capturedAt });
    const params: unknown[] = mockQuery.mock.calls[1][1];
    expect(params[4]).toBe(capturedAt);
  });

  it('4. recordLocation defaults capturedAt to ISO string when not provided', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'militia-1' }])
      .mockResolvedValueOnce([]);
    await service.recordLocation('user-1', { lat: 10.0, lng: 106.0 });
    const params: unknown[] = mockQuery.mock.calls[1][1];
    const capturedAt = params[4] as string;
    expect(capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // ── getLive ───────────────────────────────────────────────────────────────

  it('5. getLive returns array with new field names and backward-compat aliases', async () => {
    const now = new Date().toISOString();
    mockQuery.mockResolvedValueOnce([
      {
        id: 'militia-1', militiaId: 'militia-1',
        userId: 'user-1',
        name: 'Nguyen Van A', fullName: 'Nguyen Van A',
        lat: 10.762, lng: 106.660, accuracy: 5,
        lastUpdate: now, lastSeenAt: now,
        status: 'online',
      },
    ]);
    const result = await service.getLive();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('militia-1');
    expect(result[0].name).toBe('Nguyen Van A');
    expect(result[0].lastUpdate).toBe(now);
    // backward-compat aliases
    expect(result[0].militiaId).toBe('militia-1');
    expect(result[0].fullName).toBe('Nguyen Van A');
    expect(result[0].lastSeenAt).toBe(now);
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('gps_latest');
    expect(sql).toContain('"lastUpdate"');
    expect(sql).toContain('"lastSeenAt"');
  });

  it('6. getLive returns empty array when no GPS data exists', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const result = await service.getLive();
    expect(result).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  // ── getHistory (existing, kept) ────────────────────────────────────────────

  it('7. getHistory applies date range filter when from/to provided', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '5' }])
      .mockResolvedValueOnce([{ id: 'gp1', lat: 10.0, lng: 106.0, capturedAt: '2025-01-01T00:00:00Z' }]);
    const result = await service.getHistory('m1', '2025-01-01', '2025-01-31', 1, 10);
    expect(result.total).toBe(5);
    expect(result.data).toHaveLength(1);
    const countSql: string = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('captured_at >=');
    expect(countSql).toContain('captured_at <=');
  });

  it('8. getHistory caps limit at 200', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);
    await service.getHistory('m1', undefined, undefined, 1, 9999);
    const params: unknown[] = mockQuery.mock.calls[1][1];
    expect(params).toContain(200);
  });
});
