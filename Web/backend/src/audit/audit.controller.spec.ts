import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockQuery = jest.fn();
const mockDataSource = { query: mockQuery };

async function buildController(): Promise<AuditController> {
  const module = await Test.createTestingModule({
    controllers: [AuditController],
    providers: [{ provide: getDataSourceToken(), useValue: mockDataSource }],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return module.get(AuditController);
}

const auditRow = {
  id: 'a1', actorId: 'u1', actorName: 'Admin', action: 'CREATE',
  entityType: 'militia_profile', entityId: 'm1',
  beforeJson: null, afterJson: null, ipAddress: '127.0.0.1', createdAt: '2026-04-01T00:00:00Z',
};

describe('AuditController', () => {
  let controller: AuditController;

  beforeEach(async () => {
    controller = await buildController();
    mockQuery.mockReset();
  });

  it('1. GET /audit returns paginated audit logs', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([auditRow]);

    const result = await controller.list(undefined, undefined, undefined, undefined, undefined, 1, 50);

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ action: 'CREATE', entityType: 'militia_profile' });
  });

  it('2. GET /audit-logs (alias) returns same result', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([auditRow]);

    const result = await controller.listAlias(undefined, undefined, undefined, undefined, undefined, 1, 50);

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('3. Filters by action', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await controller.list('DELETE', undefined, undefined, undefined, undefined, 1, 50);

    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('al.action');
    const countParams = mockQuery.mock.calls[0][1] as unknown[];
    expect(countParams[0]).toBe('DELETE');
  });

  it('4. Pagination: limit capped at 100', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await controller.list(undefined, undefined, undefined, undefined, undefined, 1, 200);

    const dataSql = mockQuery.mock.calls[1][0] as string;
    const dataParams = mockQuery.mock.calls[1][1] as unknown[];
    // limit param (index 5) capped at 100
    expect(dataParams[5]).toBe(100);
    expect(dataSql).toContain('LIMIT');
  });

  it('5. Returns empty list when no logs', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    const result = await controller.list();

    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 50 });
  });
});
