import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentsService } from '../assignments/assignments.service';
import { ROLES_KEY } from '../common/guards/roles.guard';
import { DQTV_ROLES } from '../common/constants/roles';
import { OfficialDocumentsController } from '../official-documents/official-documents.controller';
import { WorkReportsController } from '../work-reports/work-reports.controller';
import {
  ABANDONED_UPLOAD_BATCH,
  ABANDONED_UPLOAD_HOURS,
  FILE_PURPOSES,
  FilesService,
  OFFICIAL_DOCUMENT_READER_ROLES,
  RECORD_MANAGER_ROLES,
} from './files.service';

const mockDs = { query: jest.fn() };
const mockRunner = { query: jest.fn() };
const mockAssignments = { getAssignedDqtvIds: jest.fn() };
const settings: Record<string, string | undefined> = {};
const mockConfig = { get: jest.fn((key: string) => settings[key]) };

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];
const sqlOf = (mock: jest.Mock, call: number) => String(callsOf(mock)[call][0]);
const paramsOf = (mock: jest.Mock, call: number) =>
  callsOf(mock)[call][1] as unknown[];

const KEY = '3f0c1e4a-8d1b-4a53-9a57-2d1f4b7c9e10';
const SHA = 'ab'.repeat(32);

describe('FilesService', () => {
  let service: FilesService;
  let uploadDir: string;

  beforeEach(async () => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-files-spec-'));
    Object.assign(settings, {
      apiPrefix: 'api/v1/mms_core',
      UPLOAD_DIR: uploadDir,
    });
    const mod = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: getDataSourceToken(), useValue: mockDs },
        { provide: AssignmentsService, useValue: mockAssignments },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = mod.get(FilesService);
    mockDs.query.mockReset();
    mockRunner.query.mockReset();
    mockAssignments.getAssignedDqtvIds.mockReset();
  });

  afterEach(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

  describe('record', () => {
    const upload = {
      storageKey: KEY,
      originalName: 'ảnh hiện trường.jpg',
      mimeType: 'image/jpeg',
      size: 2048,
      sha256: SHA,
    };

    it('stores the upload as owned by the caller and answers its id and download url', async () => {
      mockDs.query.mockResolvedValueOnce([
        {
          id: 'f-1',
          name: 'ảnh hiện trường.jpg',
          mimeType: 'image/jpeg',
          size: '2048',
        },
      ]);

      await expect(
        service.record('user-1', upload, 'work_report'),
      ).resolves.toEqual({
        id: 'f-1',
        url: '/api/v1/mms_core/files/f-1',
        name: 'ảnh hiện trường.jpg',
        mimeType: 'image/jpeg',
        size: 2048,
      });
      expect(sqlOf(mockDs.query, 0)).toMatch(
        /INSERT INTO files \(storage_key, original_name, mime_type, size, checksum, category, uploaded_by\)/,
      );
      expect(paramsOf(mockDs.query, 0)).toEqual([
        KEY,
        'ảnh hiện trường.jpg',
        'image/jpeg',
        2048,
        SHA,
        'work_report',
        'user-1',
      ]);
    });

    it('records the general purpose when none is declared', async () => {
      mockDs.query.mockResolvedValueOnce([
        { id: 'f-1', name: 'a', mimeType: 'image/png', size: '1' },
      ]);

      await service.record('user-1', upload);

      expect(paramsOf(mockDs.query, 0)[5]).toBe('general');
    });

    // The url is what a client requests, so it carries the global API prefix
    it('builds the url from the configured API prefix', () => {
      settings.apiPrefix = '/api/v2/other/';
      expect(service.urlOf('f-9')).toBe('/api/v2/other/files/f-9');
    });
  });

  describe('uploadDir', () => {
    it('uses UPLOAD_DIR, else ./uploads', () => {
      expect(service.uploadDir()).toBe(uploadDir);
      settings.UPLOAD_DIR = undefined;
      expect(service.uploadDir()).toBe(path.join(process.cwd(), 'uploads'));
    });
  });

  // ── Download access ──────────────────────────────────────────────────────
  // owner · ward-wide roles · readers of the record the file is attached to (404 otherwise)
  describe('openForDownload', () => {
    const fileRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'f-1',
      storageKey: KEY,
      name: 'a.jpg',
      mimeType: 'image/jpeg',
      size: '3',
      uploadedBy: 'author-1',
      relatedType: null,
      relatedId: null,
      createdTask: false,
      ...overrides,
    });
    const store = () => fs.writeFileSync(path.join(uploadDir, KEY), 'abc');
    const notFound = new NotFoundException('file_not_found');
    const workReportFile = () =>
      fileRow({ relatedType: 'work_report', relatedId: 'wr-1' });

    const areaOfficer = {
      sub: 'area-1',
      role: 'police_area',
      unitScope: 'KV1',
    };
    const caOfficer = { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV1' };
    const otherDqtv = { sub: 'dq-2', role: 'dqtv', unitScope: 'KV1' };

    it('gives the owner their own file, even unattached', async () => {
      store();
      mockDs.query.mockResolvedValueOnce([fileRow()]);

      await expect(
        service.openForDownload(
          { sub: 'author-1', role: 'dqtv', unitScope: null },
          'f-1',
        ),
      ).resolves.toEqual({
        file: {
          id: 'f-1',
          url: '/api/v1/mms_core/files/f-1',
          name: 'a.jpg',
          mimeType: 'image/jpeg',
          size: 3,
        },
        path: path.join(uploadDir, KEY),
      });
      expect(sqlOf(mockDs.query, 0)).toMatch(
        /FROM files f\s+WHERE f\.id = \$1/,
      );
      expect(sqlOf(mockDs.query, 0)).toMatch(
        /f\.related_type = 'task_report' AND EXISTS \(\s*SELECT 1 FROM task_reports tr JOIN tasks t ON t\.id = tr\.task_id\s+WHERE tr\.id = f\.related_id AND t\.created_by = \$2\)/,
      );
      expect(paramsOf(mockDs.query, 0)).toEqual(['f-1', 'author-1']);
    });

    it('answers 404 for an unknown file', async () => {
      mockDs.query.mockResolvedValueOnce([]);

      await expect(service.openForDownload(areaOfficer, 'f-x')).rejects.toThrow(
        notFound,
      );
    });

    it('gives ward-wide roles any file', async () => {
      store();
      mockDs.query.mockResolvedValueOnce([fileRow()]);

      await expect(
        service.openForDownload(
          { sub: 'w', role: 'police_ward', unitScope: null },
          'f-1',
        ),
      ).resolves.toMatchObject({ file: { id: 'f-1' } });
    });

    // An upload nobody attached yet is private to its owner
    it('hides an unattached upload from everyone else, managers included', async () => {
      store();
      mockDs.query.mockResolvedValueOnce([fileRow()]);

      await expect(service.openForDownload(areaOfficer, 'f-1')).rejects.toThrow(
        notFound,
      );
      expect(mockDs.query).toHaveBeenCalledTimes(1);
    });

    it('gives unit managers the attachments of reports written by members of their unit', async () => {
      store();
      mockDs.query
        .mockResolvedValueOnce([workReportFile()])
        .mockResolvedValueOnce([{ inUnit: true }]);

      await expect(
        service.openForDownload(areaOfficer, 'f-1'),
      ).resolves.toMatchObject({ file: { id: 'f-1' } });
      const sql = sqlOf(mockDs.query, 1);
      expect(sql).toMatch(/uim\.user_id = \$1::uuid AND uimu\.code = \$2/);
      expect(sql).toMatch(/uis\.user_id = \$1::uuid AND uisu\.code = \$2/);
      expect(paramsOf(mockDs.query, 1)).toEqual(['author-1', 'KV1']);
    });

    it('hides attachments of reports from another unit', async () => {
      store();
      mockDs.query
        .mockResolvedValueOnce([workReportFile()])
        .mockResolvedValueOnce([{ inUnit: false }]);

      await expect(service.openForDownload(areaOfficer, 'f-1')).rejects.toThrow(
        notFound,
      );
    });

    it('gives ward-level managers without a unit scope every report attachment', async () => {
      store();
      mockDs.query.mockResolvedValueOnce([workReportFile()]);

      await expect(
        service.openForDownload(
          { sub: 's', role: 'office_staff', unitScope: null },
          'f-1',
        ),
      ).resolves.toMatchObject({ file: { id: 'f-1' } });
      expect(mockDs.query).toHaveBeenCalledTimes(1);
    });

    it('limits CA officers to attachments by the DQTV assigned to them', async () => {
      store();
      mockDs.query.mockResolvedValue([workReportFile()]);
      mockAssignments.getAssignedDqtvIds
        .mockResolvedValueOnce(['author-1'])
        .mockResolvedValueOnce(['someone-else']);

      await expect(
        service.openForDownload(caOfficer, 'f-1'),
      ).resolves.toMatchObject({ file: { id: 'f-1' } });
      await expect(service.openForDownload(caOfficer, 'f-1')).rejects.toThrow(
        notFound,
      );
      expect(mockAssignments.getAssignedDqtvIds).toHaveBeenCalledWith('ca-1');
    });

    // Each role held grants what it grants: the union, whichever role is the primary one
    describe('a holder of both a unit role and ca_officer', () => {
      const roles = ['police_area', 'ca_officer'];
      const asArea = {
        sub: 'pc-1',
        role: 'police_area',
        roles,
        unitScope: 'KV1',
      };
      const asOfficer = { ...asArea, role: 'ca_officer' };
      // The author is in the unit when `inUnit`, and assigned to the actor when `assigned`
      const reportBy = (inUnit: boolean, assigned: boolean) => {
        mockDs.query.mockImplementation((sql: string) =>
          Promise.resolve(
            sql.includes('FROM files f') ? [workReportFile()] : [{ inUnit }],
          ),
        );
        mockAssignments.getAssignedDqtvIds.mockResolvedValue(
          assigned ? ['author-1'] : ['someone-else'],
        );
      };

      it.each([
        ['police_area', asArea],
        ['ca_officer', asOfficer],
      ])(
        'reads report attachments by an assigned DQTV of another unit (primary %s)',
        async (_primary, actor) => {
          store();
          reportBy(false, true);

          await expect(
            service.openForDownload(actor, 'f-1'),
          ).resolves.toMatchObject({ file: { id: 'f-1' } });
        },
      );

      it.each([
        ['police_area', asArea],
        ['ca_officer', asOfficer],
      ])(
        'reads report attachments by an unassigned member of their unit (primary %s)',
        async (_primary, actor) => {
          store();
          reportBy(true, false);

          await expect(
            service.openForDownload(actor, 'f-1'),
          ).resolves.toMatchObject({ file: { id: 'f-1' } });
        },
      );

      it('still hides attachments by someone neither in the unit nor assigned', async () => {
        store();
        reportBy(false, false);

        await expect(service.openForDownload(asOfficer, 'f-1')).rejects.toThrow(
          notFound,
        );
        await expect(service.openForDownload(asArea, 'f-1')).rejects.toThrow(
          notFound,
        );
      });

      it.each([
        ['an assigned DQTV of another unit', 'dq-2', 'KV9'],
        ['an unassigned member of their unit', 'dq-9', 'KV1'],
      ])(
        'reads the profile documents of %s whichever role is primary',
        async (_label, owner, unitCode) => {
          store();
          mockDs.query.mockImplementation((sql: string) =>
            Promise.resolve(
              sql.includes('FROM files f')
                ? [
                    fileRow({
                      relatedType: 'militia_profile',
                      relatedId: 'mp-1',
                    }),
                  ]
                : [{ userId: owner, unitCode }],
            ),
          );
          mockAssignments.getAssignedDqtvIds.mockResolvedValue(['dq-2']);

          for (const actor of [asArea, asOfficer]) {
            await expect(
              service.openForDownload(actor, 'f-1'),
            ).resolves.toMatchObject({ file: { id: 'f-1' } });
          }
        },
      );
    });

    it.each([
      ['another DQTV member', otherDqtv],
      // Not a role that reads reports, however wide its unit
      [
        'a leader who does not manage records',
        { sub: 'l', role: 'ubnd_leader', unitScope: null },
      ],
      // A missing scope never widens an area role; the refusal is concealed as 404
      [
        'an area role without a unit scope',
        { ...areaOfficer, unitScope: null },
      ],
    ])('hides report attachments from %s', async (_label, actor) => {
      store();
      mockDs.query.mockResolvedValueOnce([workReportFile()]);

      await expect(service.openForDownload(actor, 'f-1')).rejects.toThrow(
        notFound,
      );
      expect(mockDs.query).toHaveBeenCalledTimes(1);
    });

    it('gives the creator of a task the photos of its reports', async () => {
      store();
      mockDs.query.mockResolvedValueOnce([
        fileRow({
          relatedType: 'task_report',
          relatedId: 'tr-1',
          createdTask: true,
        }),
      ]);

      await expect(
        service.openForDownload(
          { sub: 'creator', role: 'office_staff', unitScope: 'KV9' },
          'f-1',
        ),
      ).resolves.toMatchObject({ file: { id: 'f-1' } });
      expect(mockDs.query).toHaveBeenCalledTimes(1);
    });

    it('gives readers of official documents the documents files, and nobody else', async () => {
      store();
      const documentFile = fileRow({
        relatedType: 'official_document',
        relatedId: 'doc-1',
      });
      mockDs.query.mockResolvedValue([documentFile]);

      await expect(
        service.openForDownload(
          { sub: 's', role: 'office_staff', unitScope: 'KV2' },
          'f-1',
        ),
      ).resolves.toMatchObject({ file: { id: 'f-1' } });
      await expect(service.openForDownload(otherDqtv, 'f-1')).rejects.toThrow(
        notFound,
      );
    });

    // Migration 034: documents of a militia profile follow the profile read rule
    describe('documents of a militia profile', () => {
      const profileFile = () =>
        fileRow({ relatedType: 'militia_profile', relatedId: 'mp-1' });
      const profile = (userId: string | null, unitCode = 'KV1') => [
        { userId, unitCode },
      ];

      it('gives the member the documents of their own profile', async () => {
        store();
        mockDs.query
          .mockResolvedValueOnce([profileFile()])
          .mockResolvedValueOnce(profile('dq-2'));

        await expect(
          service.openForDownload(otherDqtv, 'f-1'),
        ).resolves.toMatchObject({ file: { id: 'f-1' } });
        expect(sqlOf(mockDs.query, 1)).toMatch(
          /FROM militia_profiles mp\s+JOIN units u ON u\.id = mp\.unit_id\s+WHERE mp\.id = \$1/,
        );
        expect(paramsOf(mockDs.query, 1)).toEqual(['mp-1']);
      });

      it("hides another member's profile documents from a member", async () => {
        store();
        mockDs.query
          .mockResolvedValueOnce([profileFile()])
          .mockResolvedValueOnce(profile('dq-9'));

        await expect(service.openForDownload(otherDqtv, 'f-1')).rejects.toThrow(
          notFound,
        );
      });

      it("gives staff of the profile's unit its documents, and not staff of another unit", async () => {
        store();
        mockDs.query.mockImplementation((sql: string) =>
          Promise.resolve(
            sql.includes('FROM files f') ? [profileFile()] : profile('dq-9'),
          ),
        );

        await expect(
          service.openForDownload(
            { sub: 's', role: 'office_staff', unitScope: 'KV1' },
            'f-1',
          ),
        ).resolves.toMatchObject({ file: { id: 'f-1' } });
        await expect(
          service.openForDownload({ ...areaOfficer, unitScope: 'KV2' }, 'f-1'),
        ).rejects.toThrow(notFound);
      });

      it('limits CA officers to the profiles of the DQTV assigned to them', async () => {
        store();
        mockDs.query.mockImplementation((sql: string) =>
          Promise.resolve(
            sql.includes('FROM files f') ? [profileFile()] : profile('dq-2'),
          ),
        );
        mockAssignments.getAssignedDqtvIds
          .mockResolvedValueOnce(['dq-2'])
          .mockResolvedValueOnce(['someone-else']);

        await expect(
          service.openForDownload(caOfficer, 'f-1'),
        ).resolves.toMatchObject({ file: { id: 'f-1' } });
        await expect(service.openForDownload(caOfficer, 'f-1')).rejects.toThrow(
          notFound,
        );
      });

      it.each([
        ['a deleted profile', { ...areaOfficer }, []],
        [
          'an area role without a unit scope',
          { ...areaOfficer, unitScope: null },
          profile('dq-2'),
        ],
        [
          'a role that does not read profiles',
          { sub: 'x', role: 'accountant', unitScope: 'KV1' },
          profile('dq-2'),
        ],
      ])('conceals the documents from %s', async (_label, actor, rows) => {
        store();
        mockDs.query
          .mockResolvedValueOnce([profileFile()])
          .mockResolvedValueOnce(rows);

        await expect(service.openForDownload(actor, 'f-1')).rejects.toThrow(
          notFound,
        );
      });
    });

    // Migration 034: instructions attached to a task follow the task read rule (task-sql.ts)
    describe('attachments of a task', () => {
      const taskFile = () => fileRow({ relatedType: 'task', relatedId: 't-1' });

      it('gives an assignee the attachments of a task assigned to them', async () => {
        store();
        mockDs.query
          .mockResolvedValueOnce([taskFile()])
          .mockResolvedValueOnce([{ readable: true }]);

        await expect(
          service.openForDownload(otherDqtv, 'f-1'),
        ).resolves.toMatchObject({ file: { id: 'f-1' } });
        const sql = sqlOf(mockDs.query, 1);
        expect(sql).toMatch(/FROM tasks t/);
        expect(sql).toMatch(/WHERE t\.id = \$1/);
        expect(sql).toMatch(/tu\.code = \$2/);
        expect(sql).toMatch(/t\.created_by = \$4::uuid/);
        expect(sql).toMatch(/sa\.assignee_id = ANY\(\$3::uuid\[\]\)/);
        expect(paramsOf(mockDs.query, 1)).toEqual([
          't-1',
          null,
          ['dq-2'],
          'dq-2',
        ]);
      });

      it("reads managers' task scope: their unit, or the DQTV assigned to a CA officer", async () => {
        store();
        mockDs.query
          .mockResolvedValueOnce([taskFile()])
          .mockResolvedValueOnce([{ readable: false }])
          .mockResolvedValueOnce([taskFile()])
          .mockResolvedValueOnce([{ readable: true }]);
        mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce(['dq-7']);

        await expect(
          service.openForDownload(
            { sub: 's', role: 'office_staff', unitScope: 'KV1' },
            'f-1',
          ),
        ).rejects.toThrow(notFound);
        expect(paramsOf(mockDs.query, 1)).toEqual(['t-1', 'KV1', null, 's']);

        await expect(
          service.openForDownload(caOfficer, 'f-1'),
        ).resolves.toMatchObject({ file: { id: 'f-1' } });
        expect(paramsOf(mockDs.query, 3)).toEqual([
          't-1',
          null,
          ['dq-7'],
          'ca-1',
        ]);
      });

      // police_area reads no tasks: held with ca_officer, only the CA officer grant applies
      it('reads tasks for police_area with ca_officer only through the DQTV assigned', async () => {
        store();
        mockDs.query
          .mockResolvedValueOnce([taskFile()])
          .mockResolvedValueOnce([{ readable: true }]);
        mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce(['dq-7']);

        await expect(
          service.openForDownload(
            {
              sub: 'pc-1',
              role: 'police_area',
              roles: ['police_area', 'ca_officer'],
              unitScope: 'KV1',
            },
            'f-1',
          ),
        ).resolves.toMatchObject({ file: { id: 'f-1' } });
        expect(mockDs.query).toHaveBeenCalledTimes(2);
        expect(paramsOf(mockDs.query, 1)).toEqual([
          't-1',
          null,
          ['dq-7'],
          'pc-1',
        ]);
      });

      // police_area reads no tasks (TASK_STAFF_ROLES); the refusal is concealed as 404
      it('conceals task attachments from roles that read no tasks, without querying the task', async () => {
        store();
        mockDs.query.mockResolvedValueOnce([taskFile()]);

        await expect(
          service.openForDownload(areaOfficer, 'f-1'),
        ).rejects.toThrow(notFound);
        expect(mockDs.query).toHaveBeenCalledTimes(1);
      });
    });

    it('answers 404 when the stored content is gone', async () => {
      mockDs.query.mockResolvedValueOnce([fileRow()]);

      await expect(
        service.openForDownload(
          { sub: 'author-1', role: 'dqtv', unitScope: null },
          'f-1',
        ),
      ).rejects.toThrow(notFound);
    });

    it('never turns a storage key that is not a server-made UUID into a path', async () => {
      fs.writeFileSync(path.join(uploadDir, 'x.txt'), 'secret');
      mockDs.query.mockResolvedValueOnce([
        fileRow({ storageKey: '../' + path.basename(uploadDir) + '/x.txt' }),
      ]);

      await expect(
        service.openForDownload(
          { sub: 'author-1', role: 'dqtv', unitScope: null },
          'f-1',
        ),
      ).rejects.toThrow(notFound);
    });
  });

  // ── Attaching files to a record ─────────────────────────────────────────
  describe('attach', () => {
    const row = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      uploadedBy: 'author-1',
      relatedId: null,
      category: 'general',
      name: `${id}.jpg`,
      mimeType: 'image/jpeg',
      size: '10',
      ...overrides,
    });
    const input = (overrides: Record<string, unknown> = {}) => ({
      ownerId: 'author-1',
      fileIds: ['f-2', 'f-1'],
      relatedType: 'work_report' as const,
      relatedId: 'wr-1',
      ...overrides,
    });

    it('does nothing for no files', async () => {
      await expect(
        service.attach(mockRunner, input({ fileIds: [] })),
      ).resolves.toEqual([]);
      expect(mockRunner.query).not.toHaveBeenCalled();
    });

    it('locks the files, claims them for the record and answers them in the order given', async () => {
      mockRunner.query
        .mockResolvedValueOnce([row('f-1'), row('f-2')])
        .mockResolvedValueOnce([[{ id: 'f-1' }, { id: 'f-2' }], 2]);

      await expect(service.attach(mockRunner, input())).resolves.toEqual([
        {
          id: 'f-2',
          url: '/api/v1/mms_core/files/f-2',
          name: 'f-2.jpg',
          mimeType: 'image/jpeg',
          size: 10,
        },
        {
          id: 'f-1',
          url: '/api/v1/mms_core/files/f-1',
          name: 'f-1.jpg',
          mimeType: 'image/jpeg',
          size: 10,
        },
      ]);
      expect(sqlOf(mockRunner.query, 0)).toMatch(
        /FROM files f\s+WHERE f\.id = ANY\(\$1::uuid\[\]\)\s+FOR UPDATE/,
      );
      expect(paramsOf(mockRunner.query, 0)).toEqual([['f-2', 'f-1']]);
      expect(sqlOf(mockRunner.query, 1)).toMatch(
        /UPDATE files SET related_type = \$1, related_id = \$2\s+WHERE id = ANY\(\$3::uuid\[\]\) AND related_id IS NULL\s+RETURNING id/,
      );
      expect(paramsOf(mockRunner.query, 1)).toEqual([
        'work_report',
        'wr-1',
        ['f-2', 'f-1'],
      ]);
      expect(mockDs.query).not.toHaveBeenCalled();
    });

    // Someone else's upload answers like an unknown id, so ids cannot be probed
    it.each([
      ['unknown', [row('f-1')]],
      [
        'uploaded by someone else',
        [row('f-1'), row('f-2', { uploadedBy: 'x' })],
      ],
    ])('refuses a file that is %s and claims nothing', async (_label, rows) => {
      mockRunner.query.mockResolvedValueOnce(rows);

      await expect(service.attach(mockRunner, input())).rejects.toThrow(
        new BadRequestException('file_not_found'),
      );
      expect(mockRunner.query).toHaveBeenCalledTimes(1);
    });

    it('refuses a file already attached to a record', async () => {
      mockRunner.query.mockResolvedValueOnce([
        row('f-1'),
        row('f-2', { relatedId: 'tr-9' }),
      ]);

      await expect(service.attach(mockRunner, input())).rejects.toThrow(
        new ConflictException('file_already_attached'),
      );
      expect(mockRunner.query).toHaveBeenCalledTimes(1);
    });

    it('refuses the same file twice without querying', async () => {
      await expect(
        service.attach(mockRunner, input({ fileIds: ['f-1', 'f-1'] })),
      ).rejects.toThrow(new BadRequestException('duplicate_file_ids'));
      expect(mockRunner.query).not.toHaveBeenCalled();
    });

    it('refuses a file uploaded for another kind of record', async () => {
      mockRunner.query.mockResolvedValueOnce([
        row('f-1'),
        row('f-2', { category: 'task_report' }),
      ]);

      await expect(service.attach(mockRunner, input())).rejects.toThrow(
        new BadRequestException('file_purpose_mismatch'),
      );
    });

    it('refuses anything but images where only images belong', async () => {
      mockRunner.query.mockResolvedValueOnce([
        row('f-1'),
        row('f-2', { mimeType: 'application/pdf' }),
      ]);

      await expect(
        service.attach(mockRunner, input({ imagesOnly: true })),
      ).rejects.toThrow(new BadRequestException('file_type_not_allowed'));
    });

    it('answers 409 when a concurrent request claimed a file first', async () => {
      mockRunner.query
        .mockResolvedValueOnce([row('f-1'), row('f-2')])
        .mockResolvedValueOnce([[{ id: 'f-1' }], 1]);

      await expect(service.attach(mockRunner, input())).rejects.toThrow(
        new ConflictException('file_already_attached'),
      );
    });
  });

  // The download rules name the roles that read each kind of record; keep them in step
  // T20 agent: uploads never attached to a record stayed forever, rows and content
  describe('purgeAbandonedUploads', () => {
    afterEach(() => jest.restoreAllMocks());
    const purged = (...keys: string[]) =>
      mockDs.query.mockResolvedValueOnce([
        keys.map((storageKey) => ({ storageKey })),
        keys.length,
      ]);

    it('deletes uploads left unattached for a day, in bounded batches that skip files being attached, and their content', async () => {
      fs.writeFileSync(path.join(uploadDir, KEY), 'content');
      purged(KEY);

      await expect(service.purgeAbandonedUploads()).resolves.toBe(1);

      const sql = sqlOf(mockDs.query, 0);
      expect(sql).toMatch(/f\.related_id IS NULL/);
      expect(sql).toMatch(
        /f\.created_at < now\(\) - make_interval\(hours => \$1\)/,
      );
      expect(sql).toMatch(
        /ORDER BY f\.created_at\s+LIMIT \$2\s+FOR UPDATE SKIP LOCKED/,
      );
      expect(paramsOf(mockDs.query, 0)).toEqual([
        ABANDONED_UPLOAD_HOURS,
        ABANDONED_UPLOAD_BATCH,
      ]);
      expect(ABANDONED_UPLOAD_HOURS).toBe(24);
      expect(ABANDONED_UPLOAD_BATCH).toBe(500);
      expect(fs.existsSync(path.join(uploadDir, KEY))).toBe(false);
    });

    // Rows written before files became records may still be referenced without related_id
    it('keeps every file another table still references', async () => {
      purged();

      await service.purgeAbandonedUploads();

      const sql = sqlOf(mockDs.query, 0);
      for (const table of [
        'official_documents',
        'task_evidences',
        'task_report_photos',
        'work_report_attachments',
      ]) {
        expect(sql).toMatch(
          new RegExp(
            `NOT EXISTS \\(SELECT 1 FROM ${table} \\w+ WHERE \\w+\\.file_id = f\\.id\\)`,
          ),
        );
      }
    });

    // A batch of 500 files unlinked one after another held the hourly job for seconds
    it('removes the content of a batch together, not one file after another', async () => {
      const keys = [KEY, randomUUID(), randomUUID()];
      purged(...keys);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const unlink = jest
        .spyOn(fs.promises, 'unlink')
        .mockImplementation(() => gate);

      const purging = service.purgeAbandonedUploads();
      // Every removal starts before the first one finishes
      await new Promise((resolve) => setImmediate(resolve));
      expect(unlink).toHaveBeenCalledTimes(keys.length);
      release();

      await expect(purging).resolves.toBe(keys.length);
    });

    it('counts a deleted row whose content was already gone', async () => {
      purged(KEY);

      await expect(service.purgeAbandonedUploads()).resolves.toBe(1);
    });

    it('takes another batch while a batch comes back full', async () => {
      const keys = Array.from({ length: ABANDONED_UPLOAD_BATCH }, () =>
        randomUUID(),
      );
      purged(...keys);
      purged(KEY);

      await expect(service.purgeAbandonedUploads()).resolves.toBe(
        ABANDONED_UPLOAD_BATCH + 1,
      );
      expect(mockDs.query).toHaveBeenCalledTimes(2);
    });

    it('keeps the deleted row deleted and reports content it could not remove', async () => {
      fs.mkdirSync(path.join(uploadDir, KEY));
      fs.writeFileSync(path.join(uploadDir, KEY, 'inner'), 'x');
      purged(KEY);
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(service.purgeAbandonedUploads()).resolves.toBe(1);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`Could not remove the content of ${KEY}`),
      );
    });

    it('never turns a stored key that is not a server-made UUID into a path', async () => {
      const outside = path.join(
        path.dirname(uploadDir),
        `mms-keep-${Date.now()}`,
      );
      fs.writeFileSync(outside, 'not an upload');
      purged(`../${path.basename(outside)}`);
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await service.purgeAbandonedUploads();

      expect(fs.existsSync(outside)).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('not a server-made storage key'),
      );
      fs.rmSync(outside, { force: true });
    });

    it('logs how many uploads a scheduled run removed', async () => {
      purged(KEY);
      const log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      await service.purgeAbandonedUploadsOnSchedule();

      expect(log).toHaveBeenCalledWith('Purged 1 abandoned uploads');
    });

    it('stays quiet when a scheduled run finds nothing to remove', async () => {
      purged();
      const log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      await service.purgeAbandonedUploadsOnSchedule();

      expect(log).not.toHaveBeenCalled();
    });

    it('reports a failed scheduled run to the log instead of failing the scheduler', async () => {
      mockDs.query.mockRejectedValueOnce(new Error('db down'));
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.purgeAbandonedUploadsOnSchedule(),
      ).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(
        'Purging abandoned uploads failed: db down',
        expect.stringContaining('db down'),
      );
    });
  });

  // Migration 034 lets uploads declare and attach to tasks and militia profiles
  it('accepts tasks and militia profiles as upload purposes', () => {
    expect(FILE_PURPOSES).toEqual([
      'general',
      'task_report',
      'work_report',
      'official_document',
      'task',
      'militia_profile',
    ]);
  });

  describe('reader roles', () => {
    const rolesOf = (controller: object) =>
      [...(Reflect.getMetadata(ROLES_KEY, controller) as string[])].sort();

    it('match the roles of the official documents routes', () => {
      expect([...OFFICIAL_DOCUMENT_READER_ROLES].sort()).toEqual(
        rolesOf(OfficialDocumentsController),
      );
    });

    it('match the non-member roles of the work reports routes', () => {
      expect([...RECORD_MANAGER_ROLES].sort()).toEqual(
        rolesOf(WorkReportsController).filter((r) => !DQTV_ROLES.has(r)),
      );
    });
  });
});
