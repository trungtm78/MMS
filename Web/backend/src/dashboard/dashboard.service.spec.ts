import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';

const mockQuery = jest.fn();
const mockDs = { query: mockQuery };

async function build() {
  const mod = await Test.createTestingModule({
    providers: [DashboardService, { provide: getDataSourceToken(), useValue: mockDs }],
  }).compile();
  return mod.get(DashboardService);
}

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    service = await build();
    mockQuery.mockReset();
  });

  it('1. getStats returns all 5 counters', async () => {
    mockQuery.mockResolvedValueOnce([{
      total_militia: '42',
      active_today: '10',
      pending_tasks: '3',
      pending_approvals: '2',
      active_sos: '1',
    }]);

    const result = await service.getStats();

    expect(result.totalMilitia).toBe(42);
    expect(result.activeToday).toBe(10);
    expect(result.pendingTasks).toBe(3);
    expect(result.pendingApprovals).toBe(2);
    expect(result.activeSosAlerts).toBe(1);
  });

  it('2. Empty DB returns all zeros', async () => {
    mockQuery.mockResolvedValueOnce([{
      total_militia: '0', active_today: '0',
      pending_tasks: '0', pending_approvals: '0', active_sos: '0',
    }]);

    const result = await service.getStats();

    expect(result).toEqual({
      totalMilitia: 0, activeToday: 0, pendingTasks: 0, pendingApprovals: 0, activeSosAlerts: 0,
    });
  });

  it('3. Single CTE query issued (1 round trip)', async () => {
    mockQuery.mockResolvedValueOnce([{
      total_militia: '5', active_today: '2', pending_tasks: '1', pending_approvals: '0', active_sos: '0',
    }]);

    await service.getStats();

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('total_militia');
    expect(sql).toContain('active_today');
    expect(sql).toContain('pending_tasks');
    expect(sql).toContain('pending_approvals');
    expect(sql).toContain('active_sos');
  });
});
