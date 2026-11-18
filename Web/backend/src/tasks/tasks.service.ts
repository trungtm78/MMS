// US-SS-06: TasksService — tasks, their assignment to militia members and their lifecycle.
// Every route acts as its caller: managers reach the tasks of their member scope (task-sql.ts),
// assignees their own assignment; any other task answers 404 task_not_found, so ids cannot
// be probed. Schema Delta: task_assignments.assignee_id → users.id; SmartSelect picks
// militia_profiles.id and the service resolves the member's account.
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { queryRows } from '../database/query-rows';
import { AssignmentsService } from '../assignments/assignments.service';
import { insertWithRecordCode } from '../common/codes/record-code';
import {
  FilesService,
  type FileView,
  type ViewRow,
} from '../files/files.service';
import {
  memberScopeSql,
  resolveMemberScope,
  type MemberScope,
  type MemberScopeActor,
} from '../common/access/member-scope';
import {
  TASK_REPORT_SQL,
  completionRate,
  type TaskReport,
} from './task-report';
import {
  TASK_OVERDUE_SQL,
  TASK_STATUSES,
  TASK_UNIT_JOIN,
  taskRowSelect,
  taskScopeSql,
} from './task-sql';
import { TASK_STAFF_ROLES } from './task-roles';

// An assignee accepts a task not yet under way; a completed or cancelled task is closed;
// managers edit a task before it is under way
const ACCEPTABLE_STATUSES: readonly string[] = [
  'pending',
  'assigned',
  'overdue',
];
const CLOSED_STATUSES: readonly string[] = ['completed', 'cancelled'];
const EDITABLE_STATUSES: readonly string[] = ['pending', 'assigned'];

// The caller's scope as $1 unit, $2 member user ids, $3 caller
const SCOPED_SQL = taskScopeSql({ unit: '$1', userIds: '$2', caller: '$3' });
const TASK_ROW_SQL = taskRowSelect({ userIds: '$2', caller: '$3' });
// $4: a stored status, or 'overdue' for the open tasks past their deadline
const STATUS_FILTER_SQL = `($4::text IS NULL OR ($4 = 'overdue' AND ${TASK_OVERDUE_SQL}) OR ($4 <> 'overdue' AND t.status = $4))`;

export interface CreateTaskInput {
  title: string;
  description?: string;
  type?: string;
  priority?: string;
  deadline?: string;
  unitId?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  // US-SS-06 AC: assigneeMilitiaId → resolved to user_id internally
  assigneeMilitiaId: string;
  // The creator's uploads, attached to the task with it (migration 034)
  attachmentIds?: string[];
}

export interface TaskWithAssignee {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  deadline: Date | null;
  createdAt: Date;
  assigneeId: string;
  assigneeName: string;
  militiaId: string;
  militiaCode: string;
  locationName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  /** Open past its deadline, whatever the stored status says */
  overdue?: boolean;
  unitCode?: string | null;
  /** Files the creator attached (POST /tasks, GET /tasks/:id) */
  attachments?: FileView[];
}

export interface TaskListParams {
  status?: string;
  unitCode?: string;
  page?: number;
  limit?: number;
}

interface LockedAssignment {
  id: string;
  status: string;
  assignmentId: string;
}

@Injectable()
export class TasksService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly assignmentsService: AssignmentsService,
    private readonly files: FilesService,
  ) {}

  private scopeOf(
    actor: MemberScopeActor,
    requestedUnit?: string,
  ): Promise<MemberScope> {
    return resolveMemberScope(actor, {
      staffRoles: TASK_STAFF_ROLES,
      assignments: this.assignmentsService,
      requestedUnit,
    });
  }

  // US-SS-06 AC-1: a task for a member of the creator's scope (CA officers: the DQTV assigned
  // to them), assigned to the member's account; the task and its assignment in one transaction
  async createTask(
    actor: MemberScopeActor,
    dto: CreateTaskInput,
  ): Promise<TaskWithAssignee> {
    const scope = await this.scopeOf(actor);
    const [militia] = await this.dataSource.query<
      {
        id: string;
        userId: string | null;
        fullName: string;
        militiaCode: string;
      }[]
    >(
      `SELECT mp.id, mp.user_id AS "userId", mp.full_name AS "fullName", mp.militia_code AS "militiaCode"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.id = $1 AND ${memberScopeSql(2, 3)}
       LIMIT 1`,
      [dto.assigneeMilitiaId, scope.unit, scope.userIds],
    );
    if (!militia) throw new NotFoundException('militia_not_found');
    if (!militia.userId) {
      throw new BadRequestException('militia_no_user_account');
    }
    const assigneeId = militia.userId;

    return this.dataSource.transaction(async (mgr) => {
      const { id, code } = await insertWithRecordCode(
        'TASK',
        async (candidate) => {
          const rows = await mgr.query<{ id: string }[]>(
            `INSERT INTO tasks (code, title, description, type, priority, status, deadline, unit_id, created_by,
                                location_name, location_lat, location_lng)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6::timestamptz, $7::uuid, $8::uuid, $9, $10, $11)
             ON CONFLICT (code) DO NOTHING
             RETURNING id`,
            [
              candidate,
              dto.title,
              dto.description ?? null,
              dto.type ?? 'other',
              dto.priority ?? 'medium',
              dto.deadline ?? null,
              dto.unitId ?? null,
              actor.sub,
              dto.locationName ?? null,
              dto.locationLat ?? null,
              dto.locationLng ?? null,
            ],
          );
          return rows[0] ? { id: rows[0].id, code: candidate } : null;
        },
      );

      // assignee_id = the member's account (NOT the militia profile id)
      await mgr.query(
        `INSERT INTO task_assignments (task_id, assignee_id, assigned_by, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'assigned')`,
        [id, assigneeId, actor.sub],
      );

      // A refused file (another user's, already attached, uploaded for another record)
      // rolls the task back with it
      const attachments = await this.files.attach(mgr, {
        ownerId: actor.sub,
        fileIds: dto.attachmentIds ?? [],
        relatedType: 'task',
        relatedId: id,
      });

      return {
        id,
        code,
        title: dto.title,
        description: dto.description ?? null,
        type: dto.type ?? 'other',
        priority: dto.priority ?? 'medium',
        status: 'pending',
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        createdAt: new Date(),
        assigneeId,
        assigneeName: militia.fullName,
        militiaId: militia.id,
        militiaCode: militia.militiaCode,
        locationName: dto.locationName ?? null,
        locationLat: dto.locationLat ?? null,
        locationLng: dto.locationLng ?? null,
        attachments,
      };
    });
  }

  // GET /tasks — {data, total, page, limit} over the tasks of the caller's scope, one row per
  // task, newest first
  async listTasksPaginated(
    actor: MemberScopeActor,
    params: TaskListParams = {},
  ): Promise<{
    data: TaskWithAssignee[];
    total: number;
    page: number;
    limit: number;
  }> {
    const status = params.status || null;
    const statuses: readonly string[] = TASK_STATUSES;
    if (status !== null && !statuses.includes(status)) {
      throw new BadRequestException('invalid_status');
    }
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const scope = await this.scopeOf(actor, params.unitCode);
    const filter = [scope.unit, scope.userIds, actor.sub, status];

    const [count] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*)::int AS total
       FROM tasks t
       ${TASK_UNIT_JOIN}
       WHERE ${SCOPED_SQL} AND ${STATUS_FILTER_SQL}`,
      filter,
    );
    const data = await this.dataSource.query<TaskWithAssignee[]>(
      `${TASK_ROW_SQL}
       WHERE ${SCOPED_SQL} AND ${STATUS_FILTER_SQL}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $5 OFFSET $6`,
      [...filter, limit, (page - 1) * limit],
    );

    return { data, total: Number(count?.total ?? 0), page, limit };
  }

  // GET /tasks/:id — a task of the caller's scope
  async getTaskById(
    actor: MemberScopeActor,
    id: string,
  ): Promise<TaskWithAssignee> {
    const scope = await this.scopeOf(actor);
    const [task] = await this.dataSource.query<TaskWithAssignee[]>(
      `${TASK_ROW_SQL}
       WHERE ${SCOPED_SQL} AND t.id = $4`,
      [scope.unit, scope.userIds, actor.sub, id],
    );
    if (!task) throw new NotFoundException('task_not_found');
    // Whoever reads the task reads its attachments (FilesService rule for tasks)
    const attachments = await this.dataSource.query<ViewRow[]>(
      `SELECT f.id, f.original_name AS name, f.mime_type AS "mimeType", f.size
       FROM files f
       WHERE f.related_type = 'task' AND f.related_id = $1
       ORDER BY f.created_at, f.id`,
      [id],
    );
    return { ...task, attachments: this.files.views(attachments) };
  }

  // POST /tasks/:id/accept — the assignee starts a task not yet under way
  async acceptTask(
    actor: MemberScopeActor,
    id: string,
  ): Promise<TaskWithAssignee> {
    await this.dataSource.transaction(async (mgr) => {
      const task = await this.lockAssignedTask(mgr, actor, id);
      if (!ACCEPTABLE_STATUSES.includes(task.status)) {
        throw new ConflictException('task_not_acceptable');
      }
      await mgr.query(
        `UPDATE tasks SET status = 'in_progress', updated_at = now() WHERE id = $1`,
        [id],
      );
      await mgr.query(
        `UPDATE task_assignments SET status = 'accepted', accepted_at = COALESCE(accepted_at, now()) WHERE id = $1`,
        [task.assignmentId],
      );
    });
    return this.getTaskById(actor, id);
  }

  // PATCH /tasks/:id/progress — the assignee records progress on an open task; the only
  // status they set this way is in_progress (completion takes a report)
  async updateProgress(
    actor: MemberScopeActor,
    id: string,
    dto: { progress: number; note?: string; status?: string },
  ): Promise<TaskWithAssignee> {
    await this.dataSource.transaction(async (mgr) => {
      const task = await this.lockAssignedTask(mgr, actor, id);
      if (CLOSED_STATUSES.includes(task.status)) {
        throw new ConflictException('task_closed');
      }
      await mgr.query(
        `INSERT INTO task_updates (task_assignment_id, progress, status, note, updated_by)
         VALUES ($1::uuid, $2, $3, $4, $5::uuid)`,
        [
          task.assignmentId,
          dto.progress,
          dto.status ?? null,
          dto.note ?? null,
          actor.sub,
        ],
      );
      if (dto.status === 'in_progress' && task.status !== 'in_progress') {
        await mgr.query(
          `UPDATE tasks SET status = 'in_progress', updated_at = now() WHERE id = $1`,
          [id],
        );
      } else {
        await mgr.query(`UPDATE tasks SET updated_at = now() WHERE id = $1`, [
          id,
        ]);
      }
    });
    return this.getTaskById(actor, id);
  }

  // POST /tasks/:id/report — the assignee's completion report on an open task. One
  // transaction: the report, its photos and the completed task stand or fall together.
  // photoIds are ids from POST /files/upload: images the submitter uploaded and has not
  // attached elsewhere (FilesService.attach), kept in the order given (task_report_photos).
  async submitReport(
    actor: MemberScopeActor,
    taskId: string,
    dto: {
      description: string;
      completedAt?: string;
      location?: string;
      audioNoteUrl?: string;
      photoIds?: string[];
    },
  ): Promise<{
    id: string;
    taskId: string;
    submittedAt: Date;
    photos: FileView[];
  }> {
    return this.dataSource.transaction(async (mgr) => {
      const task = await this.lockAssignedTask(mgr, actor, taskId);
      if (CLOSED_STATUSES.includes(task.status)) {
        throw new ConflictException('task_closed');
      }

      const inserted = await mgr.query<{ id: string; submittedAt?: Date }[]>(
        `INSERT INTO task_reports
           (task_id, submitted_by, description, completed_at, location, audio_note_url)
         VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5, $6)
         RETURNING id, created_at AS "submittedAt"`,
        [
          taskId,
          actor.sub,
          dto.description,
          dto.completedAt ?? null,
          dto.location ?? null,
          dto.audioNoteUrl ?? null,
        ],
      );
      const reportId = inserted[0].id;

      const photos = dto.photoIds?.length
        ? await this.files.attach(mgr, {
            ownerId: actor.sub,
            fileIds: dto.photoIds,
            relatedType: 'task_report',
            relatedId: reportId,
            imagesOnly: true,
          })
        : [];
      if (photos.length > 0) {
        await mgr.query(
          `INSERT INTO task_report_photos (task_report_id, file_id, position)
           SELECT $1, p.file_id, p.ord - 1
           FROM unnest($2::uuid[]) WITH ORDINALITY AS p(file_id, ord)`,
          [reportId, photos.map((photo) => photo.id)],
        );
      }

      await mgr.query(
        `UPDATE tasks SET status = 'completed', completed_at = now(), completed_by = $2, updated_at = now() WHERE id = $1`,
        [taskId, actor.sub],
      );
      await mgr.query(
        `UPDATE task_assignments SET status = 'completed', completed_at = now() WHERE id = $1`,
        [task.assignmentId],
      );

      return {
        id: reportId,
        taskId,
        submittedAt: inserted[0].submittedAt ?? new Date(),
        photos,
      };
    });
  }

  // PATCH /tasks/:id — edit a task of the caller's scope before it is under way
  async updateTask(
    actor: MemberScopeActor,
    taskId: string,
    dto: {
      title?: string;
      description?: string;
      type?: string;
      priority?: string;
      deadline?: string;
    },
  ): Promise<Record<string, unknown>> {
    const scope = await this.scopeOf(actor);
    return this.dataSource.transaction(async (mgr) => {
      const task = await this.lockScopedTask(mgr, scope, actor, taskId);
      if (!EDITABLE_STATUSES.includes(task.status)) {
        throw new ConflictException('task_cannot_be_edited_in_current_status');
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      if (dto.title !== undefined) {
        fields.push(`title = $${idx++}`);
        values.push(dto.title);
      }
      if (dto.description !== undefined) {
        fields.push(`description = $${idx++}`);
        values.push(dto.description);
      }
      if (dto.type !== undefined) {
        fields.push(`type = $${idx++}`);
        values.push(dto.type);
      }
      if (dto.priority !== undefined) {
        fields.push(`priority = $${idx++}`);
        values.push(dto.priority);
      }
      if (dto.deadline !== undefined) {
        fields.push(`deadline = $${idx++}`);
        values.push(dto.deadline);
      }
      if (fields.length === 0) {
        throw new BadRequestException('no_fields_to_update');
      }
      fields.push(`updated_at = now()`);
      values.push(taskId);

      const rows = await queryRows<Record<string, unknown>>(
        mgr,
        `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, title, status, priority, deadline, updated_at AS "updatedAt"`,
        values,
      );
      return rows[0];
    });
  }

  // DELETE /tasks/:id — cancel a task of the caller's scope, keeping who did it, when and why
  async cancelTask(
    actor: MemberScopeActor,
    taskId: string,
    reason: string,
  ): Promise<void> {
    const scope = await this.scopeOf(actor);
    await this.dataSource.transaction(async (mgr) => {
      const task = await this.lockScopedTask(mgr, scope, actor, taskId);
      if (CLOSED_STATUSES.includes(task.status)) {
        throw new ConflictException('task_cannot_be_cancelled');
      }
      await mgr.query(
        `UPDATE tasks
         SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3, updated_at = now()
         WHERE id = $1`,
        [taskId, actor.sub, reason],
      );
    });
  }

  // GET /tasks/report — statistics over the tasks created in the range that the caller
  // may see: members their own, CA officers those of their assigned DQTV and those they
  // created, other staff their unit (ward-wide roles may narrow to one). page/limit apply
  // to the per-assignee breakdown.
  async getTaskReport(
    actor: MemberScopeActor,
    params: {
      from: string;
      to: string;
      unitCode?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<TaskReport> {
    const scope = await this.scopeOf(actor, params.unitCode);
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const scopeParams = [
      params.from,
      params.to,
      scope.unit,
      scope.userIds,
      actor.sub,
    ];
    const run = <T>(sql: string, extra: unknown[] = []) =>
      this.dataSource.query<T>(sql, [...scopeParams, ...extra]);

    type Counts = Omit<TaskReport['totals'], 'completionRate'> & {
      statusOverdue: number;
    };
    const [counts] = await run<Counts[]>(TASK_REPORT_SQL.totals);
    const byType = await run<TaskReport['byType']>(TASK_REPORT_SQL.byType);
    const byPriority = await run<TaskReport['byPriority']>(
      TASK_REPORT_SQL.byPriority,
    );
    const byMonth = await run<TaskReport['byMonth']>(TASK_REPORT_SQL.byMonth);
    const units = await run<
      Omit<TaskReport['byUnit'][number], 'completionRate'>[]
    >(TASK_REPORT_SQL.byUnit);
    const [assigneeCount] = await run<{ total: number }[]>(
      TASK_REPORT_SQL.assigneeCount,
    );
    const assignees = await run<
      Omit<TaskReport['byAssignee']['data'][number], 'completionRate'>[]
    >(TASK_REPORT_SQL.assigneePage, [limit, (page - 1) * limit]);

    const c = counts ?? {
      total: 0,
      pending: 0,
      assigned: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      statusOverdue: 0,
      overdue: 0,
    };
    return {
      from: params.from,
      to: params.to,
      unitCode: scope.unit,
      generatedAt: new Date(),
      totals: {
        total: c.total,
        pending: c.pending,
        assigned: c.assigned,
        inProgress: c.inProgress,
        completed: c.completed,
        cancelled: c.cancelled,
        overdue: c.overdue,
        completionRate: completionRate(c.completed, c.total, c.cancelled),
      },
      byStatus: [
        { status: 'pending', count: c.pending },
        { status: 'assigned', count: c.assigned },
        { status: 'in_progress', count: c.inProgress },
        { status: 'completed', count: c.completed },
        { status: 'cancelled', count: c.cancelled },
        { status: 'overdue', count: c.statusOverdue },
      ],
      byType,
      byPriority,
      byMonth,
      byUnit: units.map((u) => ({
        ...u,
        completionRate: completionRate(u.completed, u.total, u.cancelled),
      })),
      byAssignee: {
        data: assignees.map((a) => ({
          ...a,
          completionRate: completionRate(a.completed, a.total, a.cancelled),
        })),
        total: Number(assigneeCount?.total ?? 0),
        page,
        limit,
      },
    };
  }

  // The caller's own assignment of a task, with the task row locked; anyone else gets 404
  private async lockAssignedTask(
    mgr: EntityManager,
    actor: MemberScopeActor,
    id: string,
  ): Promise<LockedAssignment> {
    const [task] = await mgr.query<LockedAssignment[]>(
      `SELECT t.id, t.status, ta.id AS "assignmentId"
       FROM tasks t
       JOIN task_assignments ta ON ta.task_id = t.id AND ta.assignee_id = $2
       WHERE t.id = $1
       FOR UPDATE OF t`,
      [id, actor.sub],
    );
    if (!task) throw new NotFoundException('task_not_found');
    return task;
  }

  // A task of the caller's scope, locked; anything outside it gets 404
  private async lockScopedTask(
    mgr: EntityManager,
    scope: MemberScope,
    actor: MemberScopeActor,
    id: string,
  ): Promise<{ id: string; status: string }> {
    const [task] = await mgr.query<{ id: string; status: string }[]>(
      `SELECT t.id, t.status
       FROM tasks t
       ${TASK_UNIT_JOIN}
       WHERE ${SCOPED_SQL} AND t.id = $4
       FOR UPDATE OF t`,
      [scope.unit, scope.userIds, actor.sub, id],
    );
    if (!task) throw new NotFoundException('task_not_found');
    return task;
  }
}
