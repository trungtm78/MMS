import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentsService } from '../assignments/assignments.service';
import { FilesService } from '../files/files.service';
import { WorkReportsService } from './work-reports.service';

const mockQuery = jest.fn();
const mockManager = { query: jest.fn() };
const mockDs = { query: mockQuery, transaction: jest.fn() };
const mockAssignments = { getAssignedDqtvIds: jest.fn() };
const mockFiles = { attach: jest.fn(), views: jest.fn() };
const fileView = (id: string) => ({
  id,
  url: `/api/v1/mms_core/files/${id}`,
  name: `${id}.jpg`,
  mimeType: 'image/jpeg',
  size: 10,
});

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];
const sqlOf = (mock: jest.Mock, call: number) => String(callsOf(mock)[call][0]);
const paramsOf = (mock: jest.Mock, call: number) =>
  callsOf(mock)[call][1] as unknown[];

const dqtv = { sub: 'user-1', role: 'dqtv_member', unitScope: null };
const wardChief = { sub: 'ward-1', role: 'police_ward', unitScope: null };
const areaOfficer = { sub: 'area-1', role: 'police_area', unitScope: 'KV2' };
const caOfficer = { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV2' };
const wardStaff = { sub: 'staff-1', role: 'office_staff', unitScope: null };

async function build() {
  const mod = await Test.createTestingModule({
    providers: [
      WorkReportsService,
      { provide: getDataSourceToken(), useValue: mockDs },
      { provide: AssignmentsService, useValue: mockAssignments },
      { provide: FilesService, useValue: mockFiles },
    ],
  }).compile();
  return mod.get(WorkReportsService);
}

// SQL runs against the migrated schema in test/api-contract.e2e-spec.ts
describe('WorkReportsService', () => {
  let service: WorkReportsService;

  beforeEach(async () => {
    service = await build();
    jest.resetAllMocks();
    mockDs.transaction.mockImplementation(
      (work: (mgr: typeof mockManager) => unknown) => work(mockManager),
    );
    mockFiles.attach.mockResolvedValue([]);
    mockFiles.views.mockImplementation((rows: { id: string }[] | null) =>
      (rows ?? []).map((r) => fileView(r.id)),
    );
  });

  describe('list', () => {
    const emptyPage = () =>
      mockQuery
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

    it('shows DQTV members only their own reports, whatever author they ask for', async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([
          { id: 'wr-1', reportType: 'daily', title: 'Report' },
        ]);

      const result = await service.list({
        actor: dqtv,
        userId: 'someone-else',
        page: 1,
        limit: 10,
      });

      expect(result.total).toBe(1);
      expect(sqlOf(mockQuery, 0)).toContain('wr.created_by = $1');
      expect(paramsOf(mockQuery, 0)).toEqual(['user-1']);
    });

    it('lets wide roles see every report and filter by author', async () => {
      emptyPage();

      await service.list({ actor: wardChief, userId: 'u-9' });

      expect(paramsOf(mockQuery, 0)).toEqual(['u-9']);
    });

    it('limits area roles to reports whose author belongs to their unit', async () => {
      emptyPage();

      await service.list({ actor: areaOfficer, userId: 'u-9' });

      const sql = sqlOf(mockQuery, 0);
      // Membership through a militia profile in the unit or an account scope on it
      expect(sql).toMatch(
        /FROM militia_profiles uim[\s\S]*uim\.user_id = wr\.created_by/,
      );
      expect(sql).toMatch(
        /FROM user_unit_scopes uis[\s\S]*uis\.user_id = wr\.created_by/,
      );
      expect(paramsOf(mockQuery, 0)).toEqual(['u-9', 'KV2']);
    });

    it('refuses an area role without a unit scope', async () => {
      await expect(
        service.list({ actor: { ...areaOfficer, unitScope: null } }),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('limits CA officers to reports by the DQTV assigned to them', async () => {
      mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce([
        'dq-1',
        'dq-2',
      ]);
      emptyPage();

      await service.list({ actor: caOfficer });

      expect(mockAssignments.getAssignedDqtvIds).toHaveBeenCalledWith('ca-1');
      expect(sqlOf(mockQuery, 0)).toMatch(
        /wr\.created_by = ANY\(\$1::uuid\[\]\)/,
      );
      expect(paramsOf(mockQuery, 0)).toEqual([['dq-1', 'dq-2']]);
    });

    it('shows a CA officer with no assignments an empty page without querying reports', async () => {
      mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce([]);

      await expect(
        service.list({ actor: caOfficer, page: 2, limit: 5 }),
      ).resolves.toEqual({
        data: [],
        total: 0,
        page: 2,
        limit: 5,
      });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('gives ward-level staff without a unit scope the whole ward', async () => {
      emptyPage();

      await service.list({ actor: wardStaff });

      expect(paramsOf(mockQuery, 0)).toEqual([]);
    });

    // PoliceApp filters the team's reports by week or month and by status
    it('filters by review status and Vietnamese calendar days', async () => {
      emptyPage();

      await service.list({
        actor: wardChief,
        reviewStatus: 'pending',
        from: '2026-10-01',
        to: '2026-10-07',
      });

      const sql = sqlOf(mockQuery, 0);
      expect(sql).toContain('wr.review_status = $1');
      expect(sql).toContain(
        "wr.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')",
      );
      expect(sql).toContain(
        "wr.created_at < (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')",
      );
      expect(paramsOf(mockQuery, 0)).toEqual([
        'pending',
        '2026-10-01',
        '2026-10-07',
      ]);
    });

    it('rejects dates that are not YYYY-MM-DD', async () => {
      await expect(
        service.list({ actor: wardChief, from: '2026-02-30' }),
      ).rejects.toThrow(new BadRequestException('invalid_date'));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("returns each report's author name", async () => {
      emptyPage();

      await service.list({ actor: wardChief });

      const listSql = sqlOf(mockQuery, 1);
      expect(listSql).toMatch(
        /LEFT JOIN users author ON author\.id = wr\.created_by/,
      );
      expect(listSql).toMatch(/author\.full_name AS "authorName"/);
    });

    it('returns the report body, location and review fields', async () => {
      emptyPage();

      await service.list({ actor: wardChief });

      const listSql = sqlOf(mockQuery, 1);
      for (const column of [
        'wr.content',
        'wr.location',
        'wr.review_status',
        'wr.review_note',
      ]) {
        expect(listSql).toContain(column);
      }
    });
  });

  describe('create', () => {
    it('stores content, location and period with review_status pending', async () => {
      mockManager.query.mockResolvedValueOnce([
        { id: 'wr-2', reviewStatus: 'pending' },
      ]);

      const result = await service.create('user-1', {
        reportType: 'incident',
        title: 'Sự vụ KP3',
        content: 'Va chạm giao thông',
        location: 'KP3',
        period: '2026-09',
      });

      expect(result['reviewStatus']).toBe('pending');
      expect(result['attachments']).toEqual([]);
      expect(sqlOf(mockManager.query, 0)).toContain("'pending'");
      expect(paramsOf(mockManager.query, 0)).toEqual([
        'user-1',
        'incident',
        'Sự vụ KP3',
        'Va chạm giao thông',
        '2026-09',
        'KP3',
      ]);
      // No attachments: nothing to link
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    // The report and its attachments are written together, or not at all
    it('attaches the author uploads to the report in the order given, in one transaction', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'wr-2', reviewStatus: 'pending' }])
        .mockResolvedValueOnce([]);
      mockFiles.attach.mockResolvedValueOnce([
        fileView('f-2'),
        fileView('f-1'),
      ]);

      const result = await service.create('user-1', {
        reportType: 'incident',
        title: 'Sự vụ',
        content: 'Chi tiết',
        attachmentIds: ['f-2', 'f-1'],
      });

      expect(mockDs.transaction).toHaveBeenCalledTimes(1);
      expect(mockFiles.attach).toHaveBeenCalledWith(mockManager, {
        ownerId: 'user-1',
        fileIds: ['f-2', 'f-1'],
        relatedType: 'work_report',
        relatedId: 'wr-2',
      });
      expect(sqlOf(mockManager.query, 1)).toMatch(
        /INSERT INTO work_report_attachments \(work_report_id, file_id, position\)\s+SELECT \$1, a\.file_id, a\.ord - 1\s+FROM unnest\(\$2::uuid\[\]\) WITH ORDINALITY AS a\(file_id, ord\)/,
      );
      expect(paramsOf(mockManager.query, 1)).toEqual(['wr-2', ['f-2', 'f-1']]);
      expect(result['attachments']).toEqual([fileView('f-2'), fileView('f-1')]);
    });

    it('creates nothing more when an attachment is refused', async () => {
      mockManager.query.mockResolvedValueOnce([{ id: 'wr-2' }]);
      mockFiles.attach.mockRejectedValueOnce(
        new BadRequestException('file_not_found'),
      );

      await expect(
        service.create('user-1', {
          reportType: 'daily',
          title: 'T',
          content: 'C',
          attachmentIds: ['f-9'],
        }),
      ).rejects.toThrow(new BadRequestException('file_not_found'));
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });
  });

  // ── attachments in reads ──────────────────────────────────────────────────
  describe('attachments of listed reports', () => {
    it('lists each report with its attachments in their order, with download urls', async () => {
      mockQuery.mockResolvedValueOnce([{ count: '1' }]).mockResolvedValueOnce([
        {
          id: 'wr-1',
          title: 'Báo cáo',
          attachments: [
            { id: 'f-2', name: 'f-2.jpg', mimeType: 'image/jpeg', size: 10 },
          ],
        },
      ]);

      const result = await service.list({ actor: wardChief });

      expect(result.data).toEqual([
        { id: 'wr-1', title: 'Báo cáo', attachments: [fileView('f-2')] },
      ]);
      expect(sqlOf(mockQuery, 1)).toMatch(
        /COALESCE\(\(\s*SELECT json_agg\(json_build_object\('id', f\.id, 'name', f\.original_name, 'mimeType', f\.mime_type, 'size', f\.size\)\s+ORDER BY wra\.position\)\s+FROM work_report_attachments wra\s+JOIN files f ON f\.id = wra\.file_id\s+WHERE wra\.work_report_id = wr\.id\s*\), '\[\]'::json\) AS attachments/,
      );
    });
  });

  // GET /work-reports/:id: the same audience as the list; anything else answers 404
  describe('findOne', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: 'wr-1',
      title: 'Báo cáo',
      createdBy: 'user-1',
      authorUnits: ['KV2'],
      attachments: [
        { id: 'f-1', name: 'f-1.jpg', mimeType: 'image/jpeg', size: 10 },
      ],
      ...overrides,
    });
    const notFound = new NotFoundException('work_report_not_found');

    it('returns a report with its attachments, without its author units', async () => {
      mockQuery.mockResolvedValueOnce([row()]);

      await expect(service.findOne('wr-1', dqtv)).resolves.toEqual({
        id: 'wr-1',
        title: 'Báo cáo',
        createdBy: 'user-1',
        attachments: [fileView('f-1')],
      });
      const sql = sqlOf(mockQuery, 0);
      expect(sql).toMatch(/WHERE wr\.id = \$1/);
      expect(sql).toMatch(/AS "authorUnits"/);
      expect(sql).toMatch(/AS attachments/);
      expect(sql).toMatch(/author\.full_name AS "authorName"/);
      expect(paramsOf(mockQuery, 0)).toEqual(['wr-1']);
    });

    it('answers 404 for an unknown report', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await expect(service.findOne('wr-x', wardChief)).rejects.toThrow(
        notFound,
      );
    });

    it.each([
      [
        "another member's report to a DQTV member",
        dqtv,
        row({ createdBy: 'user-2' }),
      ],
      [
        'a report from another unit to an area officer',
        areaOfficer,
        row({ authorUnits: ['KV1'] }),
      ],
    ])('answers 404 for %s', async (_label, actor, found) => {
      mockQuery.mockResolvedValueOnce([found]);

      await expect(service.findOne('wr-1', actor)).rejects.toThrow(notFound);
    });

    it('limits CA officers to reports by the DQTV assigned to them', async () => {
      mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce(['dq-1']);
      mockQuery.mockResolvedValueOnce([row({ createdBy: 'dq-2' })]);

      await expect(service.findOne('wr-1', caOfficer)).rejects.toThrow(
        notFound,
      );
    });

    it('shows area officers the reports of their unit', async () => {
      mockQuery.mockResolvedValueOnce([row({ createdBy: 'dq-7' })]);

      await expect(service.findOne('wr-1', areaOfficer)).resolves.toMatchObject(
        { id: 'wr-1' },
      );
    });
  });

  describe('review', () => {
    const report = (overrides: Record<string, unknown> = {}) => ({
      id: 'wr-3',
      reviewStatus: 'pending',
      createdBy: 'dq-1',
      authorUnits: ['KV1'],
      ...overrides,
    });

    it('requires a reviewer role', async () => {
      await expect(
        service.review('wr-3', { reviewStatus: 'approved' }, dqtv),
      ).rejects.toThrow(new ForbiddenException('only_ca_can_review'));
      expect(mockDs.transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown report', async () => {
      mockManager.query.mockResolvedValueOnce([]);

      await expect(
        service.review('unknown', { reviewStatus: 'rejected' }, wardChief),
      ).rejects.toThrow(new NotFoundException('work_report_not_found'));
    });

    // Out-of-scope reports answer like unknown ones so ids cannot be probed
    it('treats a report outside the reviewer unit as unknown', async () => {
      mockManager.query.mockResolvedValueOnce([
        report({ authorUnits: ['KV1'] }),
      ]);

      await expect(
        service.review('wr-3', { reviewStatus: 'approved' }, areaOfficer),
      ).rejects.toThrow(new NotFoundException('work_report_not_found'));
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it('treats a report by an unassigned author as unknown for CA officers', async () => {
      mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce(['dq-1']);
      mockManager.query.mockResolvedValueOnce([
        report({ createdBy: 'dq-2', authorUnits: ['KV2'] }),
      ]);

      await expect(
        service.review('wr-3', { reviewStatus: 'approved' }, caOfficer),
      ).rejects.toThrow(new NotFoundException('work_report_not_found'));
    });

    it('refuses to let reviewers approve their own report', async () => {
      mockManager.query.mockResolvedValueOnce([
        report({ createdBy: 'ward-1' }),
      ]);

      await expect(
        service.review('wr-3', { reviewStatus: 'approved' }, wardChief),
      ).rejects.toThrow(new ForbiddenException('cannot_review_own_report'));
    });

    it('refuses to change a report that was already reviewed', async () => {
      mockManager.query.mockResolvedValueOnce([
        report({ reviewStatus: 'approved' }),
      ]);

      await expect(
        service.review('wr-3', { reviewStatus: 'rejected' }, wardChief),
      ).rejects.toThrow(new ConflictException('work_report_already_reviewed'));
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it('locks the pending report and records the decision', async () => {
      mockManager.query
        .mockResolvedValueOnce([report()])
        .mockResolvedValueOnce([{ id: 'wr-3', reviewStatus: 'approved' }]);

      const result = await service.review(
        'wr-3',
        { reviewStatus: 'approved', reviewNote: 'Đạt' },
        wardChief,
      );

      expect(result['reviewStatus']).toBe('approved');
      expect(sqlOf(mockManager.query, 0)).toMatch(/FOR UPDATE OF wr/);
      expect(sqlOf(mockManager.query, 1)).toMatch(
        /UPDATE work_reports\s+SET review_status = \$1, review_note = \$2, reviewed_by = \$3,\s+reviewed_at = now\(\), updated_at = now\(\)\s+WHERE id = \$4 AND review_status = 'pending'/,
      );
      expect(paramsOf(mockManager.query, 1)).toEqual([
        'approved',
        'Đạt',
        'ward-1',
        'wr-3',
      ]);
    });
  });
});
