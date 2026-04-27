import { Test } from '@nestjs/testing';
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

  it('1. recordLocation inserts gps_point and upserts gps_latest', async () => {
    mockQuery.mockResolvedValue([]);
    await service.recordLocation('militia-1', { lat: 10.762, lng: 106.660 });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const sql1: string = mockQuery.mock.calls[0][0];
    const sql2: string = mockQuery.mock.calls[1][0];
    expect(sql1).toContain('gps_points');
    expect(sql2).toContain('gps_latest');
    expect(sql2).toContain('ON CONFLICT');
  });

  it('2. getLive returns array from gps_latest join militia_profiles', async () => {
    mockQuery.mockResolvedValueOnce([
      { militiaId: 'm1', fullName: 'Nguyen Van A', lat: 10.762, lng: 106.660, lastSeenAt: new Date().toISOString(), status: 'online' },
    ]);
    const result = await service.getLive();
    expect(result).toHaveLength(1);
    expect(result[0].militiaId).toBe('m1');
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('gps_latest');
  });

  it('3. getHistory applies date range filter when from/to provided', async () => {
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

  it('4. getHistory caps limit at 200', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);
    await service.getHistory('m1', undefined, undefined, 1, 9999);
    const dataSql: string = mockQuery.mock.calls[1][0];
    const params: unknown[] = mockQuery.mock.calls[1][1];
    expect(params).toContain(200);
    expect(dataSql).toContain('LIMIT');
  });
});
