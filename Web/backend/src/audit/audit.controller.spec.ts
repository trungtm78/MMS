import type { Response } from 'express';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.service';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { ExcelExportService } from '../common/services/excel-export.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';

// Typed so mock.calls yields [sql, params] tuples rather than any
const mockQuery = jest.fn<Promise<unknown>, [sql: string, params: unknown[]]>();
const mockDataSource = { query: mockQuery };

const mockExcelExportService = {
  createWorkbook: jest.fn().mockReturnValue({
    addWorksheet: jest.fn().mockReturnValue({
      columnCount: 8,
      getRow: jest.fn().mockReturnValue({
        getCell: jest.fn().mockReturnValue({
          value: '',
          font: {},
          fill: {},
          alignment: {},
          border: {},
          note: '',
        }),
        height: 0,
      }),
      getColumn: jest.fn().mockReturnValue({ key: '', width: 0 }),
      mergeCells: jest.fn(),
      views: [],
      autoFilter: null,
      lastRow: { number: 5 },
    }),
    creator: '',
    lastModifiedBy: '',
    created: new Date(),
    modified: new Date(),
  }),
  addGovernmentHeader: jest.fn().mockReturnValue(8),
  addStyledTable: jest.fn(),
  addSummaryStatsTable: jest.fn(),
  addDocumentHash: jest.fn(),
  streamToResponse: jest.fn(),
};

async function buildController(): Promise<AuditController> {
  const module = await Test.createTestingModule({
    controllers: [AuditController],
    providers: [
      { provide: getDataSourceToken(), useValue: mockDataSource },
      { provide: ExcelExportService, useValue: mockExcelExportService },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return module.get(AuditController);
}

const admin: { user: JwtPayload } = {
  user: { sub: 'u1', username: 'admin', role: 'system_admin', unitScope: null },
};

const auditRow = {
  id: 'a1',
  actorId: 'u1',
  actorName: 'Admin',
  action: 'CREATE',
  entityType: 'militia_profile',
  entityId: 'm1',
  beforeJson: null,
  afterJson: null,
  ipAddress: '127.0.0.1',
  createdAt: '2026-04-01T00:00:00Z',
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

    const result = await controller.list(
      admin,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      50,
    );

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      action: 'CREATE',
      entityType: 'militia_profile',
    });
  });

  it('2. GET /audit-logs (alias) returns same result', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([auditRow]);

    const result = await controller.listAlias(
      admin,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      50,
    );

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('3. Filters by action', async () => {
    mockQuery.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValueOnce([]);

    await controller.list(
      admin,
      'DELETE',
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      50,
    );

    const countSql = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('al.action');
    const countParams = mockQuery.mock.calls[0][1];
    expect(countParams[0]).toBe('DELETE');
  });

  it('4. Pagination: limit capped at 100', async () => {
    mockQuery.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValueOnce([]);

    await controller.list(
      admin,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      200,
    );

    const dataSql = mockQuery.mock.calls[1][0];
    const dataParams = mockQuery.mock.calls[1][1];
    // limit param (index 8) capped at 100
    expect(dataParams[8]).toBe(100);
    expect(dataSql).toContain('LIMIT');
  });

  describe('list filters', () => {
    const paramsOf = (call: number) =>
      (mockQuery.mock.calls as unknown[][])[call][1] as unknown[];
    const sqlOf = (call: number) =>
      (mockQuery.mock.calls as unknown[][])[call][0] as string;

    beforeEach(() => {
      mockQuery
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);
    });

    it('bounds from/to by Vietnamese midnights, including the whole last day', async () => {
      await controller.list(
        admin,
        undefined,
        undefined,
        undefined,
        '2026-04-01',
        '2026-04-10',
        1,
        50,
      );

      for (const call of [0, 1]) {
        expect(paramsOf(call).slice(0, 5)).toEqual([
          null,
          null,
          null,
          '2026-04-01',
          '2026-04-10',
        ]);
        expect(sqlOf(call)).toContain(
          "($4::date IS NULL OR al.created_at >= ($4::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))",
        );
        expect(sqlOf(call)).toContain(
          "($5::date IS NULL OR al.created_at < (($5::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))",
        );
      }
    });

    it('rejects dates that are not YYYY-MM-DD', async () => {
      await expect(
        controller.list(
          admin,
          undefined,
          undefined,
          undefined,
          'yesterday',
          undefined,
          1,
          50,
        ),
      ).rejects.toThrow(new BadRequestException('invalid_date'));
      await expect(
        controller.list(
          admin,
          undefined,
          undefined,
          undefined,
          undefined,
          '2026-02-30',
          1,
          50,
        ),
      ).rejects.toThrow(new BadRequestException('invalid_date'));
    });

    // The militia profile page shows the history of one profile
    it('filters by the audited entity', async () => {
      const profileId = '0b7a4a7e-1f0c-4b8e-9d6a-2c1e5f3a9b10';

      await controller.list(
        admin,
        undefined,
        'militia_profile',
        undefined,
        undefined,
        undefined,
        1,
        50,
        profileId,
      );

      expect(paramsOf(0)).toEqual([
        null,
        'militia_profile',
        null,
        null,
        null,
        profileId,
        null,
        null,
      ]);
      expect(sqlOf(0)).toContain(
        '($6::uuid IS NULL OR al.entity_id = $6::uuid)',
      );
      expect(sqlOf(1)).toContain(
        '($6::uuid IS NULL OR al.entity_id = $6::uuid)',
      );
    });

    // The activity log page's search box
    it('searches action, entity type and actor, treating wildcards literally', async () => {
      await controller.list(
        admin,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        50,
        undefined,
        '100%_admin',
      );

      expect(paramsOf(0)[6]).toBe('%100\\%\\_admin%');
      expect(sqlOf(0)).toMatch(/al\.action ILIKE \$7/);
      expect(sqlOf(0)).toMatch(/u\.full_name ILIKE \$7/);
      expect(sqlOf(0)).toMatch(/LEFT JOIN users u ON u\.id = al\.actor_id/);
    });

    it('treats page and limit below 1 as 1', async () => {
      const result = await controller.list(
        admin,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        0,
        -5,
      );

      expect(result).toMatchObject({ page: 1, limit: 1 });
      expect(paramsOf(1).slice(8)).toEqual([1, 0]);
    });
  });

  // Codex round 2: area roles read every entry of the ward, including IP addresses and
  // change contents
  describe('unit scope', () => {
    const paramsOf = (call: number) =>
      (mockQuery.mock.calls as unknown[][])[call][1] as unknown[];
    const sqlOf = (call: number) =>
      (mockQuery.mock.calls as unknown[][])[call][0] as string;
    const areaOfficer: { user: JwtPayload } = {
      user: {
        sub: 'a1',
        username: 'area',
        role: 'police_area',
        unitScope: 'KV1',
      },
    };

    beforeEach(() => {
      mockQuery
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);
    });

    it('limits an area officer to entries whose actor belongs to their unit', async () => {
      await controller.list(areaOfficer);

      for (const call of [0, 1]) {
        expect(paramsOf(call)[7]).toBe('KV1');
        expect(sqlOf(call)).toMatch(
          /\(\$8::text IS NULL OR \([\s\S]*uim\.user_id = al\.actor_id[\s\S]*uis\.user_id = al\.actor_id/,
        );
      }
      expect(paramsOf(1).slice(8)).toEqual([50, 0]);
    });

    it('lets the alias apply the same scope', async () => {
      await controller.listAlias(areaOfficer);

      expect(paramsOf(0)[7]).toBe('KV1');
    });

    it('shows ward-wide roles every entry', async () => {
      await controller.list({
        user: { ...areaOfficer.user, role: 'police_ward' },
      });

      expect(paramsOf(0)[7]).toBeNull();
    });

    it('refuses an area role without a unit scope', async () => {
      mockQuery.mockReset();

      await expect(
        controller.list({ user: { ...areaOfficer.user, unitScope: null } }),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  it('5. Returns empty list when no logs', async () => {
    mockQuery.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValueOnce([]);

    const result = await controller.list(admin);

    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 50 });
  });

  it('6. list reads the client address from audit_logs.ip', async () => {
    mockQuery.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValueOnce([]);

    await controller.list(admin);

    const dataSql = (mockQuery.mock.calls as unknown[][])[1][0] as string;
    expect(dataSql).toMatch(/al\.ip AS "ipAddress"/);
    expect(dataSql).not.toMatch(/ip_address/);
  });

  describe('export period on a UTC server', () => {
    useUtcServerClock(VN_1_OCTOBER_0130);

    it('defaults to the last 30 Vietnamese days, bounded by Vietnamese midnights', async () => {
      mockQuery.mockResolvedValueOnce([]);
      const res = {} as Response;

      await controller.exportAuditLog(res);

      const [sql, params] = (mockQuery.mock.calls as unknown[][])[0] as [
        string,
        unknown[],
      ];
      expect(params).toEqual([null, null, '2026-09-01', '2026-10-01']);
      expect(sql).toMatch(
        /al\.created_at >= \(\$3::date::timestamp AT TIME ZONE 'Asia\/Ho_Chi_Minh'\)/,
      );
      expect(sql).toMatch(
        /al\.created_at < \(\(\$4::date \+ 1\)::timestamp AT TIME ZONE 'Asia\/Ho_Chi_Minh'\)/,
      );
      expect(mockExcelExportService.streamToResponse).toHaveBeenLastCalledWith(
        expect.anything(),
        res,
        'NhatKy_KiemToan_2026-09-01_2026-10-01_2026-10-01.xlsx',
      );
    });
  });

  it('7. export reads audit_logs.ip and the actor role codes through user_roles', async () => {
    mockQuery.mockResolvedValueOnce([]);

    await controller.exportAuditLog({} as Response, '2026-04-01', '2026-04-10');

    const sql = (mockQuery.mock.calls as unknown[][])[0][0] as string;
    expect(sql).toMatch(/al\.ip AS "ipAddress"/);
    expect(sql).toMatch(/FROM user_roles ur/);
    expect(sql).toMatch(/JOIN roles r ON r\.id = ur\.role_id/);
    // Roles aggregated once per user, not once per exported row
    expect(sql).toMatch(/GROUP BY ur\.user_id/);
    expect(sql).toMatch(
      /LEFT JOIN actor_roles ar ON ar\.user_id = al\.actor_id/,
    );
    expect(sql).not.toMatch(/LATERAL/);
    expect(sql).not.toMatch(/ip_address|\bu\.role\b/);
  });
});
