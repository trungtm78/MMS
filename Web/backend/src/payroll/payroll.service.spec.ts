import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

const mockQuery = jest.fn();
const mockMgrQuery = jest.fn();
const mockTransaction = jest.fn(async (cb: (mgr: { query: typeof mockMgrQuery }) => Promise<unknown>) => {
  return cb({ query: mockMgrQuery });
});
const mockDataSource = { query: mockQuery, transaction: mockTransaction };

async function buildService(): Promise<PayrollService> {
  const module = await Test.createTestingModule({
    providers: [
      PayrollService,
      { provide: getDataSourceToken(), useValue: mockDataSource },
    ],
  }).compile();
  return module.get(PayrollService);
}

const actor = {
  sub: 'user-1',
  username: 'admin',
  role: 'system_admin',
  unitScope: null,
};

describe('PayrollService', () => {
  let service: PayrollService;

  beforeEach(async () => {
    service = await buildService();
    mockQuery.mockReset();
    mockMgrQuery.mockReset();
    mockTransaction.mockImplementation(async (cb: (mgr: { query: typeof mockMgrQuery }) => Promise<unknown>) => cb({ query: mockMgrQuery }));
  });

  // ── listPeriods ──────────────────────────────────────────────────────────

  it('1. listPeriods returns records sorted by year DESC, month DESC', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '2' }]) // COUNT
      .mockResolvedValueOnce([
        {
          id: 'p-1', month: 4, year: 2026, status: 'draft',
          lockedBy: null, lockedAt: null, createdAt: new Date().toISOString(),
        },
        {
          id: 'p-2', month: 3, year: 2026, status: 'locked',
          lockedBy: 'user-1', lockedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
        },
      ]);

    const result = await service.listPeriods(1, 20);

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].month).toBe(4);
    expect(result.data[1].month).toBe(3);
    // Verify ORDER BY is in the SQL
    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).toContain('ORDER BY year DESC, month DESC');
  });

  it('2. listPeriods with empty table returns {data:[], total:0, page:1, limit:20}', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    const result = await service.listPeriods(1, 20);

    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  // ── getKpiScores ─────────────────────────────────────────────────────────

  it('3. getKpiScores uses COUNT DISTINCT — militia with multiple kpi_evaluations shows correct attendanceDays', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'period-1' }]) // period exists check
      .mockResolvedValueOnce([{ count: '1' }])     // COUNT militia
      .mockResolvedValueOnce([
        {
          id: 'mp-1', militiaId: 'mp-1', militiaName: 'Nguyễn Văn A',
          periodId: 'period-1',
          attendanceDays: 20, // should not be multiplied by kpi_evaluations count
          taskCompleted: 5,
          taskTotal: 8,
          score: '85.0',
          adjustedScore: null,
          adjustmentNote: null,
          adjustedBy: null,
        },
      ]);

    const result = await service.getKpiScores('period-1', 1, 20);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].attendanceDays).toBe(20);

    // Verify COUNT DISTINCT is in the SQL
    const sql = mockQuery.mock.calls[2][0] as string;
    expect(sql).toContain("COUNT(DISTINCT ar.id)");
    expect(sql).toContain("ar.status != 'absent'");
  });

  it('4. getKpiScores with non-existent periodId throws NotFoundException', async () => {
    mockQuery.mockResolvedValueOnce([]); // period exists check returns empty

    await expect(service.getKpiScores('no-such-period', 1, 20)).rejects.toThrow(
      new NotFoundException('period_not_found'),
    );
  });

  // ── lockPeriod ───────────────────────────────────────────────────────────

  it('5. lockPeriod happy path sets status=locked, locked_by, locked_at', async () => {
    const now = new Date();
    // 3 queries inside transaction: SELECT, INSERT, UPDATE RETURNING
    mockMgrQuery
      .mockResolvedValueOnce([{ status: 'draft' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'period-1', month: 4, year: 2026, status: 'locked',
        lockedBy: 'user-1', lockedAt: now.toISOString(), createdAt: now.toISOString(),
      }]);

    const result = await service.lockPeriod('period-1', actor);

    expect(result.status).toBe('locked');
    expect(result.lockedBy).toBe('user-1');
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('6. lockPeriod called twice throws ConflictException', async () => {
    // SELECT returns status=locked → ConflictException thrown before INSERT/UPDATE
    mockMgrQuery.mockResolvedValueOnce([{ status: 'locked' }]);

    await expect(service.lockPeriod('period-1', actor)).rejects.toThrow(
      new ConflictException('period_already_locked'),
    );
  });

  // ── createPeriod ─────────────────────────────────────────────────────────

  describe('createPeriod', () => {
    it('7. should create a new payroll period and return it', async () => {
      const now = new Date().toISOString();
      mockQuery.mockResolvedValueOnce([{
        id: 'p-new', year: 2026, month: 5, status: 'draft', createdAt: now,
      }]);

      const result = await service.createPeriod(2026, 5);

      expect(result).toBeDefined();
      expect(result['year']).toBe(2026);
      expect(result['month']).toBe(5);
      expect(result['status']).toBe('draft');
    });

    it('8. should throw ConflictException on duplicate year+month (code 23505)', async () => {
      mockQuery.mockRejectedValueOnce({ code: '23505' });

      await expect(service.createPeriod(2026, 5)).rejects.toThrow(ConflictException);
    });

    it('9. should rethrow unknown DB errors', async () => {
      const dbErr = new Error('connection_lost');
      mockQuery.mockRejectedValueOnce(dbErr);

      await expect(service.createPeriod(2026, 5)).rejects.toThrow('connection_lost');
    });
  });

  // ── reopenPeriod ─────────────────────────────────────────────────────────

  describe('reopenPeriod', () => {
    it('10. should reopen a locked period and set status to draft', async () => {
      const now = new Date().toISOString();
      mockMgrQuery
        .mockResolvedValueOnce([{ status: 'locked' }])   // SELECT status
        .mockResolvedValueOnce([{                          // UPDATE RETURNING
          id: 'period-1', year: 2026, month: 4, status: 'draft', updatedAt: now,
        }])
        .mockResolvedValueOnce([]);                        // INSERT audit_log

      const result = await service.reopenPeriod('period-1', actor);

      expect(result['status']).toBe('draft');
      expect(mockTransaction).toHaveBeenCalled();
    });

    it('11. should throw BadRequestException if period is not locked', async () => {
      mockMgrQuery.mockResolvedValueOnce([{ status: 'draft' }]);

      await expect(service.reopenPeriod('period-1', actor)).rejects.toThrow(
        new BadRequestException('period_not_locked'),
      );
    });

    it('12. should throw NotFoundException if period does not exist', async () => {
      mockMgrQuery.mockResolvedValueOnce([]); // empty → not found

      await expect(service.reopenPeriod('no-such-id', actor)).rejects.toThrow(
        new NotFoundException('period_not_found'),
      );
    });
  });
});
