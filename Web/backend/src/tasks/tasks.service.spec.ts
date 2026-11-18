import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { FilesService } from '../files/files.service';
import { memberReachSql } from '../common/access/member-scope';
import { useUtcServerClock, VN_1_OCTOBER_0130 } from '../../test/support/clock';
import { TASK_OVERDUE_SQL } from './task-report';

const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
const mockDataSource = { query, transaction: jest.fn() };
// The transaction's manager shares the query mock, so call order stays observable
mockDataSource.transaction.mockImplementation(
  (work: (mgr: typeof mockDataSource) => Promise<unknown>) =>
    work(mockDataSource),
);
const mockAssignmentsService = { getAssignedDqtvIds: jest.fn() };
const mockFiles = { attach: jest.fn(), views: jest.fn() };

const sqlOf = (call: number) => String(query.mock.calls[call][0]);
const paramsOf = (call: number) => query.mock.calls[call][1] as unknown[];

const admin = { sub: 'admin-1', role: 'system_admin', unitScope: null };
const staffA = { sub: 'staff-1', role: 'office_staff', unitScope: 'KV-A' };
const caOfficer = { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV-A' };
const member = { sub: 'dqtv-1', role: 'dqtv', unitScope: 'KV-A' };

const militia = (userId: string | null = 'dqtv-1') => ({
  id: 'militia-1',
  userId,
  fullName: 'Nguyen Van A',
  militiaCode: 'DQTV001',
});

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AssignmentsService, useValue: mockAssignmentsService },
        { provide: FilesService, useValue: mockFiles },
      ],
    }).compile();
    service = module.get<TasksService>(TasksService);
    jest.clearAllMocks();
    query.mockReset();
    mockFiles.attach.mockReset();
    mockFiles.views.mockReset();
    mockFiles.attach.mockResolvedValue([]);
    mockFiles.views.mockReturnValue([]);
  });

  const attachmentView = {
    id: 'f-1',
    url: '/api/v1/mms_core/files/f-1',
    name: 'Sơ đồ tuyến.pdf',
    mimeType: 'application/pdf',
    size: 300,
  };

  describe('createTask', () => {
    const dto = { title: 'Tuần tra khu vực', assigneeMilitiaId: 'militia-1' };
    const created = () =>
      query
        .mockResolvedValueOnce([militia()])
        .mockResolvedValueOnce([{ id: 'task-1' }])
        .mockResolvedValueOnce([]);

    it('creates the task and its assignment in one transaction', async () => {
      created();

      const result = await service.createTask(admin, dto);

      expect(result).toMatchObject({
        id: 'task-1',
        status: 'pending',
        assigneeId: 'dqtv-1',
        assigneeName: 'Nguyen Van A',
      });
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(sqlOf(1)).toMatch(/INSERT INTO tasks/);
      expect(sqlOf(1)).toMatch(/ON CONFLICT \(tenant_id, code\) DO NOTHING/);
      expect(paramsOf(1)[7]).toBe('admin-1');
      expect(sqlOf(2)).toMatch(/INSERT INTO task_assignments/);
      expect(paramsOf(2)).toEqual(['task-1', 'dqtv-1', 'admin-1']);
    });

    // Web agent T29: the task form could not send files, so its upload was removed
    it('attaches the creator uploads to the task in the same transaction', async () => {
      created();
      mockFiles.attach.mockResolvedValueOnce([attachmentView]);

      await expect(
        service.createTask(admin, { ...dto, attachmentIds: ['f-1'] }),
      ).resolves.toMatchObject({ id: 'task-1', attachments: [attachmentView] });

      expect(mockFiles.attach).toHaveBeenCalledWith(mockDataSource, {
        ownerId: 'admin-1',
        fileIds: ['f-1'],
        relatedType: 'task',
        relatedId: 'task-1',
      });
    });

    it('answers a task created without files with no attachments', async () => {
      created();

      await expect(service.createTask(admin, dto)).resolves.toMatchObject({
        attachments: [],
      });
      expect(mockFiles.attach).toHaveBeenCalledWith(
        mockDataSource,
        expect.objectContaining({ fileIds: [], relatedType: 'task' }),
      );
    });

    // A refused file (someone else's, already attached, another purpose) creates no task
    it('propagates a refused file out of the transaction', async () => {
      created();
      mockFiles.attach.mockRejectedValueOnce(
        new ConflictException('file_already_attached'),
      );

      await expect(
        service.createTask(admin, { ...dto, attachmentIds: ['f-1'] }),
      ).rejects.toThrow(new ConflictException('file_already_attached'));
    });

    // The caller's role was never passed to the service, so the CA assignment check never
    // ran, and unit staff could give a task to a member of any unit
    it('looks the member up inside the caller member scope', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.createTask(staffA, dto)).rejects.toThrow(
        new NotFoundException('militia_not_found'),
      );

      expect(sqlOf(0)).toContain(
        memberReachSql({ everyone: '$2', unit: '$3', userIds: '$4' }),
      );
      expect(paramsOf(0)).toEqual(['militia-1', false, 'KV-A', null]);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('limits a CA officer to the DQTV assigned to them, and to nobody when none is', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([]);
      query.mockResolvedValueOnce([]);

      await expect(service.createTask(caOfficer, dto)).rejects.toThrow(
        new NotFoundException('militia_not_found'),
      );

      expect(mockAssignmentsService.getAssignedDqtvIds).toHaveBeenCalledWith(
        'ca-1',
      );
      expect(paramsOf(0)).toEqual(['militia-1', false, null, []]);
    });

    it('refuses a member without an account', async () => {
      query.mockResolvedValueOnce([militia(null)]);

      await expect(service.createTask(admin, dto)).rejects.toThrow(
        new BadRequestException('militia_no_user_account'),
      );
    });

    describe('task code', () => {
      useUtcServerClock(VN_1_OCTOBER_0130);

      it('stamps the Vietnamese date and draws another code when one is taken', async () => {
        query
          .mockResolvedValueOnce([militia()])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'task-1' }])
          .mockResolvedValueOnce([]);

        const result = await service.createTask(admin, dto);

        expect(paramsOf(1)[0]).toMatch(/^TASK-20261001-[0-9A-HJKMNP-TV-Z]{6}$/);
        expect(paramsOf(2)[0]).not.toBe(paramsOf(1)[0]);
        expect(result.code).toBe(paramsOf(2)[0]);
      });
    });

    // tasks.location_name/lat/lng exist since migration 003; the apps send where to go
    it('stores and returns the task location', async () => {
      created();

      const result = await service.createTask(admin, {
        ...dto,
        locationName: 'Chợ Phú Định',
        locationLat: 10.7501,
        locationLng: 106.6302,
      });

      expect(sqlOf(1)).toMatch(/location_name, location_lat, location_lng/);
      expect(paramsOf(1).slice(8)).toEqual(['Chợ Phú Định', 10.7501, 106.6302]);
      expect(result).toMatchObject({
        locationName: 'Chợ Phú Định',
        locationLat: 10.7501,
        locationLng: 106.6302,
      });
    });

    it('uses medium priority by default', async () => {
      created();

      const result = await service.createTask(admin, dto);

      expect(result.priority).toBe('medium');
    });
  });

  describe('listTasksPaginated', () => {
    const page = (rows: unknown[] = [], total = rows.length) =>
      query.mockResolvedValueOnce([{ total }]).mockResolvedValueOnce(rows);

    // Flutter agent: GET /tasks listed every unit's tasks, one row per assignment, while
    // total counted tasks
    it('counts and pages the tasks of the caller scope, one row per task', async () => {
      page([{ id: 'task-1' }], 25);

      const result = await service.listTasksPaginated(staffA, {
        page: 2,
        limit: 10,
        unitCode: 'KV-B',
      });

      expect(result).toEqual({
        data: [{ id: 'task-1' }],
        total: 25,
        page: 2,
        limit: 10,
      });
      expect(sqlOf(0)).toMatch(
        /SELECT COUNT\(\*\)::int AS total\s+FROM tasks t/,
      );
      expect(paramsOf(0)).toEqual([false, 'KV-A', null, 'staff-1', null]);
      expect(paramsOf(1)).toEqual([
        false,
        'KV-A',
        null,
        'staff-1',
        null,
        10,
        10,
      ]);
      // The first assignment in the caller's view stands for the task
      expect(sqlOf(1)).toMatch(/LEFT JOIN LATERAL \(\s*SELECT ta\.assignee_id/);
      expect(sqlOf(1)).toMatch(/ORDER BY ta\.assigned_at, ta\.id\s+LIMIT 1/);
      expect(sqlOf(1)).toMatch(/ORDER BY t\.created_at DESC, t\.id DESC/);
    });

    it('limits a militia member to their tasks, and a CA officer to their DQTV and the tasks they created', async () => {
      page();
      await service.listTasksPaginated(member, {});
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce(['d-1']);
      page();
      await service.listTasksPaginated(caOfficer, {});

      expect(paramsOf(0)).toEqual([false, null, ['dqtv-1'], 'dqtv-1', null]);
      expect(paramsOf(2)).toEqual([false, null, ['d-1'], 'ca-1', null]);
      expect(sqlOf(2)).toContain('t.created_by = $4::uuid');
      expect(sqlOf(2)).toContain('sa.assignee_id = ANY($3::uuid[])');
    });

    // Every role held counts, whatever its priority: a unit staff role and ca_officer reach
    // the tasks of the unit and those of the DQTV assigned
    it.each(['office_staff', 'ca_officer'])(
      'gives office_staff with ca_officer the unit and the assigned DQTV (primary %s)',
      async (primary) => {
        mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([
          'd-1',
        ]);
        page();

        await service.listTasksPaginated(
          {
            sub: 'sc-1',
            role: primary,
            roles: ['office_staff', 'ca_officer'],
            unitScope: 'KV-A',
          },
          {},
        );

        expect(paramsOf(0)).toEqual([false, 'KV-A', ['d-1'], 'sc-1', null]);
      },
    );

    // police_area reads no tasks: held beside ca_officer it must not lend its unit scope
    it.each(['police_area', 'ca_officer'])(
      'limits police_area with ca_officer to what ca_officer reads, never the unit (primary %s)',
      async (primary) => {
        mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce([
          'd-1',
        ]);
        page();

        await service.listTasksPaginated(
          {
            sub: 'pc-1',
            role: primary,
            roles: ['police_area', 'ca_officer'],
            unitScope: 'KV-A',
          },
          { unitCode: 'KV-A' },
        );

        expect(paramsOf(0)).toEqual([false, null, ['d-1'], 'pc-1', null]);
      },
    );

    // Flutter agent: nothing ever stores "overdue", so the stored status never matched it
    it('reads the overdue filter as open tasks past their deadline, and flags every row', async () => {
      page();

      await service.listTasksPaginated(admin, { status: 'overdue' });

      expect(paramsOf(0)[4]).toBe('overdue');
      expect(sqlOf(0)).toContain(`($5 = 'overdue' AND ${TASK_OVERDUE_SQL})`);
      expect(sqlOf(1)).toContain(`${TASK_OVERDUE_SQL} AS overdue`);
    });

    it('refuses an unknown status before querying', async () => {
      await expect(
        service.listTasksPaginated(admin, { status: 'done' }),
      ).rejects.toThrow(new BadRequestException('invalid_status'));
      expect(query).not.toHaveBeenCalled();
    });

    it('clamps paging', async () => {
      page();

      const result = await service.listTasksPaginated(admin, {
        page: 0,
        limit: 500,
      });

      expect(paramsOf(1).slice(5)).toEqual([100, 0]);
      expect(result).toMatchObject({ page: 1, limit: 100 });
    });
  });

  describe('getTaskById', () => {
    it('reads a task of the caller scope with its attachments', async () => {
      const stored = [
        {
          id: 'f-1',
          name: 'Sơ đồ tuyến.pdf',
          mimeType: 'application/pdf',
          size: '300',
        },
      ];
      query
        .mockResolvedValueOnce([{ id: 'task-1', title: 'Tuần tra' }])
        .mockResolvedValueOnce(stored);
      mockFiles.views.mockReturnValueOnce([attachmentView]);

      await expect(service.getTaskById(member, 'task-1')).resolves.toEqual({
        id: 'task-1',
        title: 'Tuần tra',
        attachments: [attachmentView],
      });

      expect(paramsOf(0)).toEqual([
        false,
        null,
        ['dqtv-1'],
        'dqtv-1',
        'task-1',
      ]);
      expect(sqlOf(0)).toMatch(/AND t\.id = \$5/);
      expect(sqlOf(1)).toMatch(
        /FROM files f\s+WHERE f\.related_type = 'task' AND f\.related_id = \$1/,
      );
      expect(sqlOf(1)).toMatch(/ORDER BY f\.created_at, f\.id/);
      expect(paramsOf(1)).toEqual(['task-1']);
      expect(mockFiles.views).toHaveBeenCalledWith(stored);
    });

    // Flutter agent: GET /tasks/:id had no caller check
    it('answers a task outside the caller scope like a missing one', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.getTaskById(staffA, 'task-9')).rejects.toThrow(
        new NotFoundException('task_not_found'),
      );
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  // The assignee's own task, locked while it changes; other callers learn nothing about it
  const assignedTask = (status: string) =>
    query.mockResolvedValueOnce([
      { id: 'task-1', status, assignmentId: 'assign-1' },
    ]);

  describe('acceptTask', () => {
    it('starts a pending task for its assignee under the task row lock', async () => {
      assignedTask('pending');
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'task-1', status: 'in_progress' }]);

      await expect(service.acceptTask(member, 'task-1')).resolves.toMatchObject(
        { status: 'in_progress' },
      );

      expect(sqlOf(0)).toMatch(
        /JOIN task_assignments ta ON ta\.task_id = t\.id AND ta\.assignee_id = \$2/,
      );
      expect(sqlOf(0)).toMatch(/FOR UPDATE OF t/);
      expect(paramsOf(0)).toEqual(['task-1', 'dqtv-1']);
      expect(sqlOf(1)).toMatch(/UPDATE tasks SET status = 'in_progress'/);
      expect(sqlOf(2)).toMatch(
        /UPDATE task_assignments SET status = 'accepted', accepted_at = COALESCE\(accepted_at, now\(\)\) WHERE id = \$1/,
      );
      expect(paramsOf(2)).toEqual(['assign-1']);
    });

    it('answers a task the caller is not assigned to like a missing one', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.acceptTask(member, 'task-9')).rejects.toThrow(
        new NotFoundException('task_not_found'),
      );
    });

    // Flutter agent: accepting anything but a pending task silently did nothing
    it.each(['in_progress', 'completed', 'cancelled'])(
      'refuses to accept a %s task',
      async (status) => {
        assignedTask(status);

        await expect(service.acceptTask(member, 'task-1')).rejects.toThrow(
          new ConflictException('task_not_acceptable'),
        );
        expect(query).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('updateProgress', () => {
    it('records progress and starts the task when the assignee says so', async () => {
      assignedTask('assigned');
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'task-1', status: 'in_progress' }]);

      await service.updateProgress(member, 'task-1', {
        progress: 40,
        note: 'Đã đến nơi',
        status: 'in_progress',
      });

      expect(sqlOf(1)).toMatch(/INSERT INTO task_updates/);
      expect(paramsOf(1)).toEqual([
        'assign-1',
        40,
        'in_progress',
        'Đã đến nơi',
        'dqtv-1',
      ]);
      expect(sqlOf(2)).toMatch(
        /UPDATE tasks SET status = 'in_progress', updated_at = now\(\) WHERE id = \$1/,
      );
    });

    it('only touches the task when no status is given', async () => {
      assignedTask('in_progress');
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'task-1' }]);

      await service.updateProgress(member, 'task-1', { progress: 60 });

      expect(sqlOf(2)).toMatch(
        /UPDATE tasks SET updated_at = now\(\) WHERE id = \$1/,
      );
    });

    // Flutter agent: a progress update could set any status, reopening finished tasks
    it.each(['completed', 'cancelled'])(
      'refuses progress on a %s task',
      async (status) => {
        assignedTask(status);

        await expect(
          service.updateProgress(member, 'task-1', { progress: 10 }),
        ).rejects.toThrow(new ConflictException('task_closed'));
        expect(query).toHaveBeenCalledTimes(1);
      },
    );

    it('answers a task the caller is not assigned to like a missing one', async () => {
      query.mockResolvedValueOnce([]);

      await expect(
        service.updateProgress(member, 'task-9', { progress: 10 }),
      ).rejects.toThrow(new NotFoundException('task_not_found'));
    });
  });

  describe('submitReport', () => {
    const reportDto = {
      description: 'Đã hoàn thành tuần tra khu vực đúng lịch.',
      completedAt: '2026-04-19T08:00:00Z',
      location: 'Khu vực 1',
    };
    const photo = (id: string) => ({
      id,
      url: `/api/v1/mms_core/files/${id}`,
      name: `${id}.jpg`,
      mimeType: 'image/jpeg',
      size: 10,
    });

    it('records the report and completes the task and its assignment in one transaction', async () => {
      assignedTask('in_progress');
      query
        .mockResolvedValueOnce([{ id: 'report-1', submittedAt: new Date() }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.submitReport(member, 'task-1', reportDto);

      expect(result).toMatchObject({
        id: 'report-1',
        taskId: 'task-1',
        photos: [],
      });
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(sqlOf(0)).toMatch(/FOR UPDATE OF t/);
      expect(sqlOf(1)).toMatch(
        /INSERT INTO task_reports\s*\(task_id, submitted_by, description, completed_at, location, audio_note_url\)/,
      );
      expect(sqlOf(2)).toMatch(
        /UPDATE tasks SET status = 'completed', completed_at = now\(\), completed_by = \$2, updated_at = now\(\) WHERE id = \$1/,
      );
      expect(paramsOf(2)).toEqual(['task-1', 'dqtv-1']);
      expect(sqlOf(3)).toMatch(
        /UPDATE task_assignments SET status = 'completed', completed_at = now\(\) WHERE id = \$1/,
      );
      expect(paramsOf(3)).toEqual(['assign-1']);
    });

    // Flutter agent: a report completed even a cancelled task
    it.each(['completed', 'cancelled'])(
      'refuses a report on a %s task',
      async (status) => {
        assignedTask(status);

        await expect(
          service.submitReport(member, 'task-1', reportDto),
        ).rejects.toThrow(new ConflictException('task_closed'));
        expect(query).toHaveBeenCalledTimes(1);
      },
    );

    it('answers a task the caller is not assigned to like a missing one', async () => {
      query.mockResolvedValueOnce([]);

      await expect(
        service.submitReport(member, 'task-9', reportDto),
      ).rejects.toThrow(new NotFoundException('task_not_found'));
    });

    // photoIds are ids from POST /files/upload: images the submitter uploaded, linked in order
    it('attaches the submitter photos to the report in the order given', async () => {
      mockFiles.attach.mockResolvedValueOnce([photo('p-2'), photo('p-1')]);
      assignedTask('in_progress');
      query
        .mockResolvedValueOnce([{ id: 'report-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.submitReport(member, 'task-1', {
        ...reportDto,
        photoIds: ['p-2', 'p-1'],
      });

      expect(mockFiles.attach).toHaveBeenCalledWith(mockDataSource, {
        ownerId: 'dqtv-1',
        fileIds: ['p-2', 'p-1'],
        relatedType: 'task_report',
        relatedId: 'report-1',
        imagesOnly: true,
      });
      expect(sqlOf(2)).toMatch(
        /INSERT INTO task_report_photos \(task_report_id, file_id, position\)\s+SELECT \$1, p\.file_id, p\.ord - 1\s+FROM unnest\(\$2::uuid\[\]\) WITH ORDINALITY AS p\(file_id, ord\)/,
      );
      expect(paramsOf(2)).toEqual(['report-1', ['p-2', 'p-1']]);
      expect(sqlOf(3)).toMatch(/UPDATE tasks SET status = 'completed'/);
      expect(result.photos).toEqual([photo('p-2'), photo('p-1')]);
    });

    it('neither records the report nor completes the task when a photo is refused', async () => {
      mockFiles.attach.mockRejectedValueOnce(
        new BadRequestException('file_type_not_allowed'),
      );
      assignedTask('in_progress');
      query.mockResolvedValueOnce([{ id: 'report-1' }]);

      await expect(
        service.submitReport(member, 'task-1', {
          ...reportDto,
          photoIds: ['doc-1'],
        }),
      ).rejects.toThrow(new BadRequestException('file_type_not_allowed'));
      expect(
        query.mock.calls.some(([sql]) => /UPDATE tasks/.test(String(sql))),
      ).toBe(false);
    });
  });

  // A task the manager reaches, locked while it changes
  const scopedTask = (status: string) =>
    query.mockResolvedValueOnce([{ id: 'task-1', status }]);

  describe('updateTask', () => {
    it('edits a pending task of the caller scope under its row lock', async () => {
      scopedTask('pending');
      query.mockResolvedValueOnce([[{ id: 'task-1', title: 'New Title' }], 1]);

      await expect(
        service.updateTask(staffA, 'task-1', {
          title: 'New Title',
          priority: 'high',
        }),
      ).resolves.toEqual({ id: 'task-1', title: 'New Title' });

      expect(sqlOf(0)).toMatch(/FOR UPDATE OF t/);
      expect(sqlOf(0)).toMatch(/AND t\.id = \$5/);
      expect(paramsOf(0)).toEqual([false, 'KV-A', null, 'staff-1', 'task-1']);
      expect(paramsOf(1)).toEqual(['New Title', 'high', 'task-1']);
    });

    it('answers a task outside the caller scope like a missing one', async () => {
      query.mockResolvedValueOnce([]);

      await expect(
        service.updateTask(staffA, 'task-9', { title: 'X' }),
      ).rejects.toThrow(new NotFoundException('task_not_found'));
      expect(query).toHaveBeenCalledTimes(1);
    });

    it.each(['in_progress', 'completed', 'cancelled'])(
      'refuses to edit a %s task',
      async (status) => {
        scopedTask(status);

        await expect(
          service.updateTask(admin, 'task-1', { title: 'X' }),
        ).rejects.toThrow(
          new ConflictException('task_cannot_be_edited_in_current_status'),
        );
      },
    );

    it('refuses an edit without fields', async () => {
      scopedTask('assigned');

      await expect(service.updateTask(admin, 'task-1', {})).rejects.toThrow(
        new BadRequestException('no_fields_to_update'),
      );
    });
  });

  describe('cancelTask', () => {
    // The reason was accepted and then discarded
    it('cancels an open task of the caller scope, keeping who cancelled it, when and why', async () => {
      scopedTask('in_progress');
      query.mockResolvedValueOnce([[], 1]);

      await expect(
        service.cancelTask(admin, 'task-1', 'Lý do hủy'),
      ).resolves.toBeUndefined();

      expect(paramsOf(0)).toEqual([true, null, null, 'admin-1', 'task-1']);
      expect(sqlOf(1)).toMatch(
        /UPDATE tasks\s+SET status = 'cancelled', cancelled_at = now\(\), cancelled_by = \$2, cancel_reason = \$3, updated_at = now\(\)\s+WHERE id = \$1/,
      );
      expect(paramsOf(1)).toEqual(['task-1', 'admin-1', 'Lý do hủy']);
    });

    it.each(['completed', 'cancelled'])(
      'refuses to cancel a %s task',
      async (status) => {
        scopedTask(status);

        await expect(
          service.cancelTask(admin, 'task-1', 'reason'),
        ).rejects.toThrow(new ConflictException('task_cannot_be_cancelled'));
      },
    );

    it('answers a task outside the caller scope like a missing one', async () => {
      mockAssignmentsService.getAssignedDqtvIds.mockResolvedValueOnce(['d-1']);
      query.mockResolvedValueOnce([]);

      await expect(
        service.cancelTask(caOfficer, 'task-9', 'reason'),
      ).rejects.toThrow(new NotFoundException('task_not_found'));
      expect(paramsOf(0)).toEqual([false, null, ['d-1'], 'ca-1', 'task-9']);
    });
  });
});
