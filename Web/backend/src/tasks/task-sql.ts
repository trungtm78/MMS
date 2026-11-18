// SQL shared by the task routes and the task statistics, fixed placeholders only.
//
// Which tasks a caller reaches follows resolveMemberReach with the task staff roles, the
// union of what every role held grants:
// - unit staff: the tasks of their unit (the task's own unit, else its first assignee's)
// - CA officers: the tasks assigned to their DQTV, and the tasks they created
// - militia members: the tasks assigned to them
// police_area and other roles outside TASK_STAFF_ROLES grant nothing here, also when held
// beside ca_officer.

// tasks.status (migration 003), in lifecycle order
export const TASK_STATUSES = [
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
  'overdue',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

// Overdue: marked so, or still open past its deadline
export const TASK_OVERDUE_SQL = `(t.status = 'overdue' OR (t.deadline < now() AND t.status NOT IN ('completed', 'cancelled')))`;

// The unit a task belongs to, as tu(code, name): its own unit, else the unit of the member
// assigned to it first. One unit per task, so breakdowns by unit never count a task twice.
export const TASK_UNIT_JOIN = `LEFT JOIN LATERAL (
    SELECT candidate.code, candidate.name
    FROM (
      SELECT 0 AS rank, own.code, own.name, NULL::timestamptz AS assigned_at
      FROM units own WHERE own.id = t.unit_id
      UNION ALL
      SELECT 1, au.code, au.name, ta0.assigned_at
      FROM task_assignments ta0
      JOIN militia_profiles amp ON amp.user_id = ta0.assignee_id
      JOIN units au ON au.id = amp.unit_id
      WHERE ta0.task_id = t.id
    ) candidate
    ORDER BY candidate.rank, candidate.assigned_at, candidate.code
    LIMIT 1
  ) tu ON true`;

/**
 * Placeholders of a MemberReach (everyone boolean, unit code text, member user ids uuid[])
 * and of the caller (uuid).
 */
export interface TaskScopePlaceholders {
  everyone: string;
  unit: string;
  userIds: string;
  caller: string;
}

/** Tasks t (with TASK_UNIT_JOIN) inside the caller's scope. */
export function taskScopeSql({
  everyone,
  unit,
  userIds,
  caller,
}: TaskScopePlaceholders): string {
  return `(${everyone}::boolean
    OR (${unit}::text IS NOT NULL AND tu.code = ${unit})
    OR (${userIds}::uuid[] IS NOT NULL AND (t.created_by = ${caller}::uuid OR EXISTS (
      SELECT 1 FROM task_assignments sa
      WHERE sa.task_id = t.id AND sa.assignee_id = ANY(${userIds}::uuid[])))))`;
}

/**
 * A task as GET /tasks and GET /tasks/:id return it: one row per task, whose assignee fields
 * come from its first assignment the caller may see (every line of a task their unit grant
 * or their authorship covers; otherwise only the lines of the members they reach, so members
 * see their own line, never a co-assignee's), with the overdue flag and the unit it belongs to.
 */
export function taskRowSelect({
  everyone,
  unit,
  userIds,
  caller,
}: TaskScopePlaceholders): string {
  return `SELECT t.id, t.code, t.title, t.description, t.type, t.priority, t.status,
       t.deadline, t.created_at AS "createdAt", t.updated_at AS "updatedAt",
       ${TASK_OVERDUE_SQL} AS overdue,
       tu.code AS "unitCode",
       fa.assignee_id AS "assigneeId", fa.full_name AS "assigneeName",
       fa.militia_id AS "militiaId", fa.militia_code AS "militiaCode",
       t.location_name AS "locationName",
       t.location_lat::float8 AS "locationLat",
       t.location_lng::float8 AS "locationLng"
  FROM tasks t
  ${TASK_UNIT_JOIN}
  LEFT JOIN LATERAL (
    SELECT ta.assignee_id, u.full_name, mp.id AS militia_id, mp.militia_code
    FROM task_assignments ta
    JOIN users u ON u.id = ta.assignee_id
    LEFT JOIN militia_profiles mp ON mp.user_id = ta.assignee_id
    WHERE ta.task_id = t.id
      AND (${everyone}::boolean
           OR (${unit}::text IS NOT NULL AND tu.code = ${unit})
           OR (${userIds}::uuid[] IS NOT NULL AND t.created_by = ${caller}::uuid)
           OR ta.assignee_id = ANY(${userIds}::uuid[]))
    ORDER BY ta.assigned_at, ta.id
    LIMIT 1
  ) fa ON true`;
}
