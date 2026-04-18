import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryMany } from '../db/pool';

export type TaskType = 'patrol' | 'guard' | 'inspection' | 'support' | 'training' | 'admin' | 'other';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';
export type AssignmentStatus = 'assigned' | 'accepted' | 'rejected' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: Date | null;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  unitId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  completedBy: string | null;
  assignments: TaskAssignment[];
}

export interface TaskAssignment {
  id: string;
  taskId: string;
  assigneeId: string;
  assigneeName: string;
  assignedBy: string;
  assignedByName: string;
  status: AssignmentStatus;
  assignedAt: Date;
  acceptedAt: Date | null;
  completedAt: Date | null;
  note: string | null;
  progress: number;
}

export interface TaskListOptions {
  assigneeId?: string;
  status?: TaskStatus;
  type?: TaskType;
  priority?: TaskPriority;
  unitId?: string;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
}

export async function generateTaskCode(): Promise<string> {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  
  const result = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM tasks 
     WHERE EXTRACT(YEAR FROM created_at) = $1 
     AND EXTRACT(MONTH FROM created_at) = $2`,
    [year, month]
  );

  const count = parseInt(result?.count || '0') + 1;
  return `NV-${year}${month}-${String(count).padStart(4, '0')}`;
}

// US-004: Cross-system task assignment
// BR-005: Task lifecycle is controlled - Create task with proper state
export async function createTask(
  data: {
    title: string;
    description?: string;
    type: TaskType;
    priority: TaskPriority;
    deadline?: Date;
    location?: { name?: string; lat?: number; lng?: number };
    unitId?: string;
    assigneeIds: string[];
  },
  createdBy: string
): Promise<Task> {
  const code = await generateTaskCode();
  const taskId = uuidv4();

  await queryOne(
    `INSERT INTO tasks (id, code, title, description, type, priority, deadline, 
     location_name, location_lat, location_lng, unit_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      taskId, code, data.title, data.description || null, data.type, data.priority,
      data.deadline || null, data.location?.name || null, data.location?.lat || null,
      data.location?.lng || null, data.unitId || null, createdBy
    ]
  );

  // Create assignments
  for (const assigneeId of data.assigneeIds) {
    await queryOne(
      `INSERT INTO task_assignments (task_id, assignee_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [taskId, assigneeId, createdBy]
    );
  }

  // Update task status to assigned if there are assignees
  if (data.assigneeIds.length > 0) {
    await queryOne(
      'UPDATE tasks SET status = $1 WHERE id = $2',
      ['assigned', taskId]
    );
  }

  return getTaskById(taskId) as Promise<Task>;
}

export async function getTaskById(taskId: string): Promise<Task | null> {
  const task = await queryOne<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    type: TaskType;
    priority: TaskPriority;
    status: TaskStatus;
    deadline: Date | null;
    location_name: string | null;
    location_lat: number | null;
    location_lng: number | null;
    unit_id: string | null;
    created_by: string;
    created_at: Date;
    updated_at: Date;
    completed_at: Date | null;
    completed_by: string | null;
  }>(
    `SELECT * FROM tasks WHERE id = $1`,
    [taskId]
  );

  if (!task) return null;

  const assignments = await queryMany<{
    id: string;
    task_id: string;
    assignee_id: string;
    assignee_name: string;
    assigned_by: string;
    assigned_by_name: string;
    status: AssignmentStatus;
    assigned_at: Date;
    accepted_at: Date | null;
    completed_at: Date | null;
    note: string | null;
    progress: number;
  }>(
    `SELECT 
      ta.id, ta.task_id, ta.assignee_id, ta.assigned_by, ta.status, 
      ta.assigned_at, ta.accepted_at, ta.completed_at, ta.note,
      u1.full_name as assignee_name,
      u2.full_name as assigned_by_name,
      COALESCE(tu.progress, 0) as progress
    FROM task_assignments ta
    JOIN users u1 ON ta.assignee_id = u1.id
    JOIN users u2 ON ta.assigned_by = u2.id
    LEFT JOIN LATERAL (
      SELECT progress FROM task_updates 
      WHERE task_assignment_id = ta.id 
      ORDER BY updated_at DESC LIMIT 1
    ) tu ON true
    WHERE ta.task_id = $1`,
    [taskId]
  );

  return {
    id: task.id,
    code: task.code,
    title: task.title,
    description: task.description,
    type: task.type,
    priority: task.priority,
    status: task.status,
    deadline: task.deadline,
    locationName: task.location_name,
    locationLat: task.location_lat,
    locationLng: task.location_lng,
    unitId: task.unit_id,
    createdBy: task.created_by,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    completedBy: task.completed_by,
    assignments: assignments.map(a => ({
      id: a.id,
      taskId: a.task_id,
      assigneeId: a.assignee_id,
      assigneeName: a.assignee_name,
      assignedBy: a.assigned_by,
      assignedByName: a.assigned_by_name,
      status: a.status,
      assignedAt: a.assigned_at,
      acceptedAt: a.accepted_at,
      completedAt: a.completed_at,
      note: a.note,
      progress: a.progress,
    })),
  };
}

export async function getTasks(options: TaskListOptions): Promise<{ tasks: Task[]; total: number }> {
  const { assigneeId, status, type, priority, unitId, fromDate, toDate, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (assigneeId) {
    conditions.push(`EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND ta.assignee_id = $${paramCount++})`);
    values.push(assigneeId);
  }
  if (status) {
    conditions.push(`t.status = $${paramCount++}`);
    values.push(status);
  }
  if (type) {
    conditions.push(`t.type = $${paramCount++}`);
    values.push(type);
  }
  if (priority) {
    conditions.push(`t.priority = $${paramCount++}`);
    values.push(priority);
  }
  if (unitId) {
    conditions.push(`t.unit_id = $${paramCount++}`);
    values.push(unitId);
  }
  if (fromDate) {
    conditions.push(`t.deadline >= $${paramCount++}`);
    values.push(fromDate);
  }
  if (toDate) {
    conditions.push(`t.deadline <= $${paramCount++}`);
    values.push(toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM tasks t ${whereClause}`,
    values
  );
  const total = parseInt(countResult?.count || '0');

  const tasks = await queryMany<{ id: string }>(
    `SELECT t.id FROM tasks t ${whereClause}
     ORDER BY 
       CASE t.priority 
         WHEN 'urgent' THEN 1 
         WHEN 'high' THEN 2 
         WHEN 'medium' THEN 3 
         WHEN 'low' THEN 4 
       END,
       t.deadline ASC NULLS LAST,
       t.created_at DESC
     LIMIT $${paramCount++} OFFSET $${paramCount++}`,
    [...values, limit, offset]
  );

  const taskDetails = await Promise.all(
    tasks.map(t => getTaskById(t.id))
  );

  return {
    tasks: taskDetails.filter((t): t is Task => t !== null),
    total,
  };
}

export async function acceptTask(taskId: string, userId: string): Promise<Task | null> {
  const assignment = await queryOne<{ id: string }>(
    `SELECT id FROM task_assignments WHERE task_id = $1 AND assignee_id = $2`,
    [taskId, userId]
  );

  if (!assignment) return null;

  await queryOne(
    `UPDATE task_assignments 
     SET status = 'accepted', accepted_at = NOW() 
     WHERE id = $1`,
    [assignment.id]
  );

  await queryOne(
    `UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1 AND status = 'assigned'`,
    [taskId]
  );

  return getTaskById(taskId);
}

export async function updateTaskProgress(
  taskId: string,
  userId: string,
  data: { progress: number; note?: string; location?: { lat: number; lng: number } }
): Promise<Task | null> {
  const assignment = await queryOne<{ id: string }>(
    `SELECT id FROM task_assignments WHERE task_id = $1 AND assignee_id = $2`,
    [taskId, userId]
  );

  if (!assignment) return null;

  await queryOne(
    `INSERT INTO task_updates (task_assignment_id, progress, note, location_lat, location_lng, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      assignment.id,
      data.progress,
      data.note || null,
      data.location?.lat || null,
      data.location?.lng || null,
      userId,
    ]
  );

  if (data.progress === 100) {
    await queryOne(
      `UPDATE task_assignments SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [assignment.id]
    );

    await queryOne(
      `UPDATE tasks SET status = 'completed', completed_at = NOW(), completed_by = $1, updated_at = NOW() WHERE id = $2`,
      [userId, taskId]
    );
  } else {
    await queryOne(
      `UPDATE task_assignments SET status = 'in_progress' WHERE id = $1 AND status = 'accepted'`,
      [assignment.id]
    );

    await queryOne(
      `UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );
  }

  return getTaskById(taskId);
}
