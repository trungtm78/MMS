// GET /tasks/report: task statistics limited to the tasks each caller may see
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import {
  businessDayEndSql,
  businessDayStartSql,
} from '../common/time/business-date';
import { FilesService } from '../files/files.service';
import { TasksService } from './tasks.service';

const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
const assignments = { getAssignedDqtvIds: jest.fn() };

const range = { from: '2026-01-01', to: '2026-10-01' };
const sqlOf = (call: number) => query.mock.calls[call][0];
const paramsOf = (call: number) => query.mock.calls[call][1] as unknown[];

function respond() {
  query
    .mockResolvedValueOnce([
      {
        total: 10,
        pending: 1,
        assigned: 2,
        inProgress: 3,
        completed: 3,
        cancelled: 1,
        statusOverdue: 0,
        overdue: 2,
      },
    ])
    .mockResolvedValueOnce([
      { type: 'patrol', count: 6 },
      { type: 'guard', count: 4 },
    ])
    .mockResolvedValueOnce([
      { priority: 'medium', count: 6 },
      { priority: 'high', count: 4 },
    ])
    .mockResolvedValueOnce([
      { month: '2026-09', total: 4, completed: 1, overdue: 1 },
      { month: '2026-10', total: 6, completed: 2, overdue: 1 },
    ])
    .mockResolvedValueOnce([
      {
        unitCode: 'KV-A',
        unitName: 'Khu vực A',
        total: 10,
        completed: 3,
        cancelled: 1,
        overdue: 2,
      },
    ])
    .mockResolvedValueOnce([{ total: 1 }])
    .mockResolvedValueOnce([
      {
        userId: 'd-1',
        fullName: 'Nguyễn Văn An',
        militiaCode: 'DQ-1',
        unitCode: 'KV-A',
        total: 4,
        completed: 2,
        inProgress: 1,
        cancelled: 0,
        overdue: 1,
      },
    ]);
}

describe('TasksService.getTaskReport', () => {
  let service: TasksService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: AssignmentsService, useValue: assignments },
        { provide: FilesService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(TasksService);
    query.mockReset();
    assignments.getAssignedDqtvIds.mockReset();
  });

  it('assembles every breakdown for a wide role narrowed to a unit', async () => {
    respond();

    const report = await service.getTaskReport(
      { sub: 'admin-1', role: 'system_admin', unitScope: null },
      { ...range, unitCode: 'KV-B', page: 1, limit: 20 },
    );

    expect(query).toHaveBeenCalledTimes(7);
    for (let call = 0; call < 6; call++) {
      expect(paramsOf(call)).toEqual([
        '2026-01-01',
        '2026-10-01',
        'KV-B',
        null,
        'admin-1',
      ]);
    }
    expect(paramsOf(6)).toEqual([
      '2026-01-01',
      '2026-10-01',
      'KV-B',
      null,
      'admin-1',
      20,
      0,
    ]);
    expect(report).toEqual({
      from: '2026-01-01',
      to: '2026-10-01',
      unitCode: 'KV-B',
      generatedAt: expect.any(Date) as Date,
      totals: {
        total: 10,
        pending: 1,
        assigned: 2,
        inProgress: 3,
        completed: 3,
        cancelled: 1,
        overdue: 2,
        completionRate: 33.3,
      },
      byStatus: [
        { status: 'pending', count: 1 },
        { status: 'assigned', count: 2 },
        { status: 'in_progress', count: 3 },
        { status: 'completed', count: 3 },
        { status: 'cancelled', count: 1 },
        { status: 'overdue', count: 0 },
      ],
      byType: [
        { type: 'patrol', count: 6 },
        { type: 'guard', count: 4 },
      ],
      byPriority: [
        { priority: 'medium', count: 6 },
        { priority: 'high', count: 4 },
      ],
      byMonth: [
        { month: '2026-09', total: 4, completed: 1, overdue: 1 },
        { month: '2026-10', total: 6, completed: 2, overdue: 1 },
      ],
      byUnit: [
        {
          unitCode: 'KV-A',
          unitName: 'Khu vực A',
          total: 10,
          completed: 3,
          cancelled: 1,
          overdue: 2,
          completionRate: 33.3,
        },
      ],
      byAssignee: {
        data: [
          {
            userId: 'd-1',
            fullName: 'Nguyễn Văn An',
            militiaCode: 'DQ-1',
            unitCode: 'KV-A',
            total: 4,
            completed: 2,
            inProgress: 1,
            cancelled: 0,
            overdue: 1,
            completionRate: 50,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    });
  });

  it('counts tasks created in the business days of the range, and open tasks past their deadline as overdue', async () => {
    respond();
    await service.getTaskReport(
      { sub: 'admin-1', role: 'system_admin', unitScope: null },
      range,
    );
    const scoped = sqlOf(0);
    expect(scoped).toContain(`t.created_at >= ${businessDayStartSql('$1')}`);
    expect(scoped).toContain(`t.created_at < ${businessDayEndSql('$2')}`);
    expect(scoped).toContain(
      "t.status = 'overdue' OR (t.deadline < now() AND t.status NOT IN ('completed', 'cancelled'))",
    );
    // a task belongs to its own unit, else to the unit of its first assignee
    expect(scoped).toMatch(/LEFT JOIN LATERAL/);
    // every month of the range appears, even without tasks
    expect(sqlOf(3)).toContain('generate_series');
  });

  it('locks unit staff to their unit whatever they request', async () => {
    respond();
    await service.getTaskReport(
      { sub: 'staff-1', role: 'office_staff', unitScope: 'KV-A' },
      { ...range, unitCode: 'KV-B' },
    );
    expect(paramsOf(0).slice(2, 4)).toEqual(['KV-A', null]);
  });

  it('limits a CA officer to tasks of their assigned DQTV and tasks they created', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValueOnce(['d-1', 'd-2']);
    respond();

    await service.getTaskReport(
      { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV-A' },
      range,
    );

    expect(assignments.getAssignedDqtvIds).toHaveBeenCalledWith('ca-1');
    expect(paramsOf(0).slice(2)).toEqual([null, ['d-1', 'd-2'], 'ca-1']);
    expect(sqlOf(0)).toContain('t.created_by = $5::uuid');
    expect(sqlOf(0)).toContain('sa.assignee_id = ANY($4::uuid[])');
  });

  it('limits a militia member to their own tasks, and the assignee breakdown to themselves', async () => {
    respond();
    await service.getTaskReport(
      { sub: 'dqtv-1', role: 'dqtv', unitScope: 'KV-A' },
      { ...range, unitCode: 'KV-B' },
    );
    expect(paramsOf(0).slice(2)).toEqual([null, ['dqtv-1'], 'dqtv-1']);
    // co-assignees of a shared task are not listed to a member
    expect(sqlOf(5)).toContain(
      '($4::uuid[] IS NULL OR ta.assignee_id = ANY($4::uuid[]))',
    );
    expect(sqlOf(6)).toContain(
      '($4::uuid[] IS NULL OR ta.assignee_id = ANY($4::uuid[]))',
    );
  });

  it('refuses a role outside the task readers', async () => {
    await expect(
      service.getTaskReport(
        { sub: 'area-1', role: 'police_area', unitScope: 'KV-A' },
        range,
      ),
    ).rejects.toThrow(new ForbiddenException('insufficient_role'));
    expect(query).not.toHaveBeenCalled();
  });

  it('clamps the assignee paging', async () => {
    respond();
    const report = await service.getTaskReport(
      { sub: 'admin-1', role: 'system_admin', unitScope: null },
      { ...range, page: -3, limit: 1000 },
    );
    expect(paramsOf(6).slice(5)).toEqual([100, 0]);
    expect(report.byAssignee).toMatchObject({ page: 1, limit: 100 });
  });
});
