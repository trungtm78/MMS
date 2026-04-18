// US-SS-06: TasksService — create task + assign to militia member
// Schema Delta: task_assignments.assignee_id → users.id
// SmartSelect picks militia_profiles.id → service resolves user_id
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CreateTaskDto {
  title: string;
  description?: string;
  type?: string;
  priority?: string;
  deadline?: string;
  unitId?: string;
  // US-SS-06 AC: assigneeMilitiaId → resolved to user_id internally
  assigneeMilitiaId: string;
  createdByUserId: string;
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
}

@Injectable()
export class TasksService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // US-SS-06 AC-1: Create task with militia assignee
  // Guard: militia must have user_id (linked user account)
  async createTask(dto: CreateTaskDto): Promise<TaskWithAssignee> {
    // US-SS-06: Resolve militia → user_id
    const militiaRows = await this.dataSource.query<
      {
        id: string;
        userId: string | null;
        fullName: string;
        militiaCode: string;
      }[]
    >(
      `SELECT id, user_id AS "userId", full_name AS "fullName", militia_code AS "militiaCode"
       FROM militia_profiles WHERE id = $1 LIMIT 1`,
      [dto.assigneeMilitiaId],
    );

    if (!militiaRows.length) {
      throw new NotFoundException('militia_not_found');
    }
    const militia = militiaRows[0];

    // US-SS-06 AC-2: Guard — militia must have linked user account
    if (!militia.userId) {
      throw new BadRequestException('militia_no_user_account');
    }

    // Generate task code: TASK-YYYYMMDD-XXXXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const taskCode = `TASK-${dateStr}-${randSuffix}`;

    // Insert task
    const taskRows = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO tasks (code, title, description, type, priority, status, deadline, unit_id, created_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6::timestamptz, $7::uuid, $8::uuid)
       RETURNING id`,
      [
        taskCode,
        dto.title,
        dto.description ?? null,
        dto.type ?? 'other',
        dto.priority ?? 'medium',
        dto.deadline ?? null,
        dto.unitId ?? null,
        dto.createdByUserId,
      ],
    );
    const taskId = taskRows[0].id;

    // Insert assignment — assignee_id = militia's user_id (NOT militia profile id)
    await this.dataSource.query(
      `INSERT INTO task_assignments (task_id, assignee_id, assigned_by, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'assigned')`,
      [taskId, militia.userId, dto.createdByUserId],
    );

    return {
      id: taskId,
      code: taskCode,
      title: dto.title,
      description: dto.description ?? null,
      type: dto.type ?? 'other',
      priority: dto.priority ?? 'medium',
      status: 'pending',
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      createdAt: new Date(),
      assigneeId: militia.userId,
      assigneeName: militia.fullName,
      militiaId: militia.id,
      militiaCode: militia.militiaCode,
    };
  }

  // List tasks (for dashboard)
  async listTasks(
    params: { page?: number; limit?: number; status?: string } = {},
  ): Promise<TaskWithAssignee[]> {
    const limit = Math.min(params.limit ?? 20, 100);
    const offset = ((params.page ?? 1) - 1) * limit;

    return this.dataSource.query<TaskWithAssignee[]>(
      `SELECT
         t.id, t.code, t.title, t.description, t.type, t.priority, t.status,
         t.deadline, t.created_at AS "createdAt",
         ta.assignee_id AS "assigneeId",
         u.full_name AS "assigneeName",
         mp.id AS "militiaId",
         mp.militia_code AS "militiaCode"
       FROM tasks t
       LEFT JOIN task_assignments ta ON ta.task_id = t.id
       LEFT JOIN users u ON u.id = ta.assignee_id
       LEFT JOIN militia_profiles mp ON mp.user_id = ta.assignee_id
       WHERE ($1::text IS NULL OR t.status = $1)
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [params.status ?? null, limit, offset],
    );
  }

  // Paginated list with total — pagination contract: {data, total, page, limit}
  async listTasksPaginated(
    params: { page?: number; limit?: number; status?: string; unitCode?: string } = {},
  ): Promise<{ data: TaskWithAssignee[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const offset = (page - 1) * limit;

    const countResult = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(DISTINCT t.id) as count FROM tasks t
       LEFT JOIN task_assignments ta ON ta.task_id = t.id
       WHERE ($1::text IS NULL OR t.status = $1)`,
      [params.status ?? null],
    );
    const total = parseInt(countResult[0]?.count ?? '0', 10);

    const data = await this.dataSource.query<TaskWithAssignee[]>(
      `SELECT t.id, t.code, t.title, t.description, t.type, t.priority, t.status,
              t.deadline, t.created_at AS "createdAt",
              ta.assignee_id AS "assigneeId",
              u.full_name AS "assigneeName",
              mp.id AS "militiaId",
              mp.militia_code AS "militiaCode"
       FROM tasks t
       LEFT JOIN task_assignments ta ON ta.task_id = t.id
       LEFT JOIN users u ON u.id = ta.assignee_id
       LEFT JOIN militia_profiles mp ON mp.user_id = ta.assignee_id
       WHERE ($1::text IS NULL OR t.status = $1)
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [params.status ?? null, limit, offset],
    );

    return { data, total, page, limit };
  }
}
