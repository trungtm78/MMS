// Task statistics (GET /tasks/report): the SQL, fixed placeholders only, and the
// arithmetic around it. Every statement starts from the same scoped set of tasks:
// $1 from, $2 to (business days of creation), the caller's MemberReach as $3 everyone, $4 unit,
// $5 member user ids, and $6 the caller.
import {
  BUSINESS_TZ,
  businessDayEndSql,
  businessDayStartSql,
} from '../common/time/business-date';
import { assertBoundedDateRange } from '../common/validation/date-range';
import {
  TASK_OVERDUE_SQL,
  TASK_STATUSES,
  TASK_UNIT_JOIN,
  taskScopeSql,
} from './task-sql';

export { TASK_OVERDUE_SQL, TASK_STATUSES, TASK_UNIT_JOIN };

// A year and a day, so a report can run from one date to the same date a year later
export const TASK_REPORT_MAX_DAYS = 366;

// Tasks created in the range, in the caller's scope: every task ($3), the unit ($4), and for
// CA officers and members the tasks assigned to the member ids ($5) or created by the
// caller ($6)
const SCOPED_TASKS = `WITH scoped AS (
  SELECT t.id, t.type, t.priority, t.status, t.created_at,
         tu.code AS unit_code, tu.name AS unit_name,
         ${TASK_OVERDUE_SQL} AS is_overdue
  FROM tasks t
  ${TASK_UNIT_JOIN}
  WHERE t.created_at >= ${businessDayStartSql('$1')}
    AND t.created_at < ${businessDayEndSql('$2')}
    AND ${taskScopeSql({ everyone: '$3', unit: '$4', userIds: '$5', caller: '$6' })}
)`;

// Every line of a task the caller's unit grant covers; otherwise only the lines of the
// members they reach, so members see their own line only, never a co-assignee's
const ASSIGNEES_IN_SCOPE = `($3::boolean OR ($4::text IS NOT NULL AND s.unit_code = $4) OR ta.assignee_id = ANY($5::uuid[]))`;

export const TASK_REPORT_SQL = {
  totals: `${SCOPED_TASKS}
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned,
           COUNT(*) FILTER (WHERE status = 'in_progress')::int AS "inProgress",
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
           COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
           COUNT(*) FILTER (WHERE status = 'overdue')::int AS "statusOverdue",
           COUNT(*) FILTER (WHERE is_overdue)::int AS overdue
    FROM scoped`,
  byType: `${SCOPED_TASKS}
    SELECT type, COUNT(*)::int AS count
    FROM scoped GROUP BY type ORDER BY count DESC, type`,
  byPriority: `${SCOPED_TASKS}
    SELECT priority, COUNT(*)::int AS count
    FROM scoped GROUP BY priority
    ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
  // Every month of the range, empty ones included, by the Vietnamese month of creation
  byMonth: `${SCOPED_TASKS}
    SELECT to_char(m.month, 'YYYY-MM') AS month,
           COUNT(s.id)::int AS total,
           COUNT(s.id) FILTER (WHERE s.status = 'completed')::int AS completed,
           COUNT(s.id) FILTER (WHERE s.is_overdue)::int AS overdue
    FROM generate_series(date_trunc('month', $1::date::timestamp),
                         date_trunc('month', $2::date::timestamp),
                         interval '1 month') AS m(month)
    LEFT JOIN scoped s
      ON date_trunc('month', s.created_at AT TIME ZONE '${BUSINESS_TZ}') = m.month
    GROUP BY m.month
    ORDER BY m.month`,
  byUnit: `${SCOPED_TASKS}
    SELECT unit_code AS "unitCode", unit_name AS "unitName",
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
           COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
           COUNT(*) FILTER (WHERE is_overdue)::int AS overdue
    FROM scoped
    GROUP BY unit_code, unit_name
    ORDER BY total DESC, unit_code NULLS LAST`,
  assigneeCount: `${SCOPED_TASKS}
    SELECT COUNT(DISTINCT ta.assignee_id)::int AS total
    FROM scoped s
    JOIN task_assignments ta ON ta.task_id = s.id
    WHERE ${ASSIGNEES_IN_SCOPE}`,
  // $7 limit, $8 offset
  assigneePage: `${SCOPED_TASKS}
    SELECT ta.assignee_id AS "userId", u.full_name AS "fullName",
           mp.militia_code AS "militiaCode", mu.code AS "unitCode",
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE s.status = 'completed')::int AS completed,
           COUNT(*) FILTER (WHERE s.status = 'in_progress')::int AS "inProgress",
           COUNT(*) FILTER (WHERE s.status = 'cancelled')::int AS cancelled,
           COUNT(*) FILTER (WHERE s.is_overdue)::int AS overdue
    FROM scoped s
    JOIN task_assignments ta ON ta.task_id = s.id
    JOIN users u ON u.id = ta.assignee_id
    LEFT JOIN LATERAL (
      SELECT pmp.militia_code, pmp.unit_id FROM militia_profiles pmp
      WHERE pmp.user_id = ta.assignee_id ORDER BY pmp.created_at, pmp.id LIMIT 1
    ) mp ON true
    LEFT JOIN units mu ON mu.id = mp.unit_id
    WHERE ${ASSIGNEES_IN_SCOPE}
    GROUP BY ta.assignee_id, u.full_name, mp.militia_code, mu.code
    ORDER BY total DESC, u.full_name, ta.assignee_id
    LIMIT $7 OFFSET $8`,
} as const;

export interface TaskReportTotals {
  total: number;
  pending: number;
  assigned: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  /** Open tasks past their deadline, whatever their status says */
  overdue: number;
  /** Completed among the tasks not cancelled, in percent */
  completionRate: number;
}

export interface TaskReport {
  from: string;
  to: string;
  unitCode: string | null;
  generatedAt: Date;
  totals: TaskReportTotals;
  byStatus: { status: (typeof TASK_STATUSES)[number]; count: number }[];
  byType: { type: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  byMonth: {
    month: string;
    total: number;
    completed: number;
    overdue: number;
  }[];
  byUnit: {
    unitCode: string | null;
    unitName: string | null;
    total: number;
    completed: number;
    cancelled: number;
    overdue: number;
    completionRate: number;
  }[];
  byAssignee: {
    data: {
      userId: string;
      fullName: string;
      militiaCode: string | null;
      unitCode: string | null;
      total: number;
      completed: number;
      inProgress: number;
      cancelled: number;
      overdue: number;
      completionRate: number;
    }[];
    total: number;
    page: number;
    limit: number;
  };
}

/** The range a report covers: twelve business months ending today by default. */
export function resolveTaskReportRange(
  query: { from?: string; to?: string },
  today: string,
): { from: string; to: string } {
  const to = query.to ?? today;
  let from = query.from;
  if (!from) {
    const [year, month] = to.split('-').map(Number);
    from = new Date(Date.UTC(year, month - 12, 1)).toISOString().slice(0, 10);
  }
  assertBoundedDateRange(from, to, TASK_REPORT_MAX_DAYS);
  return { from, to };
}

/** Completed tasks among those not cancelled, in percent to one decimal; 0 when none. */
export function completionRate(
  completed: number,
  total: number,
  cancelled: number,
): number {
  const due = total - cancelled;
  return due > 0 ? Math.round((completed / due) * 1000) / 10 : 0;
}
