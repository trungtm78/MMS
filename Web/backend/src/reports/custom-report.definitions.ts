// Custom report (báo cáo tùy chỉnh) definitions. A request picks a dataset, a breakdown
// and a status filter by name; each name maps to SQL written here, and request values only
// ever bind parameters: $1 from, $2 to (YYYY-MM-DD), $3 the unit scope, $4 the row limit
// of a breakdown. Every measure is cast so node-postgres returns numbers.
import { BadRequestException } from '@nestjs/common';
import { sqlLabelCase } from '../common/sql/sql-label';
import {
  BUSINESS_TZ,
  businessDayEndSql,
  businessDayStartSql,
} from '../common/time/business-date';
import { KPI_RECOMMENDATIONS } from '../kpi/kpi-dashboard.service';
import { TASK_OVERDUE_SQL, TASK_UNIT_JOIN } from '../tasks/task-report';

export const CUSTOM_REPORT_DATASETS = [
  'attendance',
  'tasks',
  'kpi',
  'payroll',
] as const;
export type CustomReportDataset = (typeof CUSTOM_REPORT_DATASETS)[number];

export const CUSTOM_REPORT_GROUPINGS = [
  'none',
  'unit',
  'member',
  'day',
  'month',
  'status',
  'type',
  'priority',
  'assignee',
] as const;
export type CustomReportGrouping = (typeof CUSTOM_REPORT_GROUPINGS)[number];

export type ReportColumnType =
  | 'text'
  | 'number'
  | 'percent'
  | 'currency'
  | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

export interface CustomReportQuery {
  sql: string;
  /** Breakdown columns, then the measures */
  columns: ReportColumn[];
  measures: ReportColumn[];
}

interface SqlColumn extends ReportColumn {
  sql: string;
}

interface GroupingDefinition {
  columns: SqlColumn[];
  joins?: string;
  groupBy: string;
  orderBy: string;
}

interface DatasetDefinition {
  title: string;
  from: string;
  where: string;
  /** ?status= value -> SQL predicate */
  statuses: Readonly<Record<string, string>>;
  measures: SqlColumn[];
  groupings: Partial<
    Record<Exclude<CustomReportGrouping, 'none'>, GroupingDefinition>
  >;
}

const column = (
  key: string,
  label: string,
  sql: string,
  type: ReportColumnType = 'text',
): SqlColumn => ({ key, label, type, sql });
const counted = (key: string, label: string, sql: string) =>
  column(key, label, `${sql}::int`, 'number');
const money = (key: string, label: string, columnSql: string) =>
  column(key, label, `COALESCE(SUM(${columnSql}), 0)::float8`, 'currency');

const byUnit = (codeSql: string, nameSql: string): GroupingDefinition => ({
  columns: [
    column('unitCode', 'Mã đơn vị', codeSql),
    column('unitName', 'Đơn vị', nameSql),
  ],
  groupBy: `${codeSql}, ${nameSql}`,
  orderBy: `${codeSql} NULLS LAST`,
});

const byMember = (unitCodeSql: string): GroupingDefinition => ({
  columns: [
    column('militiaId', 'ID DQTV', 'mp.id'),
    column('militiaCode', 'Mã DQTV', 'mp.militia_code'),
    column('fullName', 'Họ tên', 'mp.full_name'),
    column('unitCode', 'Mã đơn vị', unitCodeSql),
  ],
  groupBy: `mp.id, mp.militia_code, mp.full_name, ${unitCodeSql}`,
  orderBy: `${unitCodeSql}, mp.full_name, mp.id`,
});

const byExpression = (
  key: string,
  label: string,
  sql: string,
  type: ReportColumnType = 'text',
): GroupingDefinition => ({
  columns: [column(key, label, sql, type)],
  groupBy: sql,
  orderBy: sql,
});

const byCode = (
  key: string,
  codeLabel: string,
  label: string,
  codeSql: string,
  labels: Record<string, string>,
): GroupingDefinition => ({
  columns: [
    column(key, codeLabel, codeSql),
    column(`${key}Label`, label, sqlLabelCase(codeSql, labels)),
  ],
  groupBy: codeSql,
  orderBy: codeSql,
});

const ATTENDANCE_STATUS_LABELS = {
  checked_in: 'Có mặt (chưa ra ca)',
  checked_out: 'Có mặt',
  late: 'Đi muộn',
  early_leave: 'Về sớm',
  absent: 'Vắng',
};
const TASK_STATUS_LABELS = {
  pending: 'Chờ giao',
  assigned: 'Đã giao',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  overdue: 'Quá hạn',
};
const TASK_TYPE_LABELS = {
  patrol: 'Tuần tra',
  guard: 'Canh gác',
  inspection: 'Kiểm tra',
  support: 'Hỗ trợ',
  training: 'Huấn luyện',
  admin: 'Hành chính',
  other: 'Khác',
};
const TASK_PRIORITY_LABELS = {
  urgent: 'Khẩn cấp',
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};
const RECOMMENDATION_LABELS: Record<string, string> = Object.fromEntries(
  KPI_RECOMMENDATIONS.map((r) => [r.recommendation, r.label]),
);
const PAYROLL_APPROVAL_LABELS = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

const inBusinessMonthsOf = (monthStartSql: string) =>
  `${monthStartSql} BETWEEN date_trunc('month', $1::date::timestamp)::date AND $2::date`;

const TASK_DAY = `to_char(t.created_at AT TIME ZONE '${BUSINESS_TZ}', 'YYYY-MM-DD')`;
const TASK_MONTH = `to_char(t.created_at AT TIME ZONE '${BUSINESS_TZ}', 'YYYY-MM')`;
const KPI_MONTH_START = 'make_date(ke.year::int, ke.month::int, 1)';
const PAYROLL_MONTH_START = 'make_date(pp.year, pp.month, 1)';

const DEFINITIONS: Readonly<Record<CustomReportDataset, DatasetDefinition>> = {
  // Attendance records of the business days in the range
  attendance: {
    title: 'Báo cáo chấm công',
    from: `attendance_records ar
  JOIN militia_profiles mp ON mp.id = ar.militia_id
  JOIN units u ON u.id = mp.unit_id`,
    where: `ar.work_date BETWEEN $1::date AND $2::date
  AND ($3::text IS NULL OR u.code = $3)`,
    statuses: {
      present: `ar.status IN ('checked_in', 'checked_out')`,
      late: `ar.status = 'late'`,
      early_leave: `ar.status = 'early_leave'`,
      absent: `ar.status = 'absent'`,
    },
    measures: [
      counted('records', 'Số lượt chấm công', 'COUNT(*)'),
      counted('members', 'Số DQTV', 'COUNT(DISTINCT ar.militia_id)'),
      counted(
        'present',
        'Có mặt',
        `COUNT(*) FILTER (WHERE ar.status IN ('checked_in', 'checked_out'))`,
      ),
      counted('late', 'Đi muộn', `COUNT(*) FILTER (WHERE ar.status = 'late')`),
      counted(
        'earlyLeave',
        'Về sớm',
        `COUNT(*) FILTER (WHERE ar.status = 'early_leave')`,
      ),
      counted('absent', 'Vắng', `COUNT(*) FILTER (WHERE ar.status = 'absent')`),
      column(
        'workHours',
        'Tổng giờ công',
        'COALESCE(ROUND(SUM(ar.work_hours), 2), 0)::float8',
        'number',
      ),
      column(
        'attendanceRate',
        'Tỷ lệ có mặt (%)',
        `COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE ar.status <> 'absent') / NULLIF(COUNT(*), 0), 1), 0)::float8`,
        'percent',
      ),
    ],
    groupings: {
      unit: byUnit('u.code', 'u.name'),
      member: byMember('u.code'),
      day: {
        columns: [column('date', 'Ngày', 'ar.work_date::text', 'date')],
        groupBy: 'ar.work_date',
        orderBy: 'ar.work_date',
      },
      month: byExpression('month', 'Tháng', `to_char(ar.work_date, 'YYYY-MM')`),
      status: byCode(
        'status',
        'Mã trạng thái',
        'Trạng thái',
        'ar.status',
        ATTENDANCE_STATUS_LABELS,
      ),
    },
  },

  // Tasks created in the business days of the range, each in its own unit (TASK_UNIT_JOIN)
  tasks: {
    title: 'Báo cáo nhiệm vụ',
    from: `tasks t
  ${TASK_UNIT_JOIN}`,
    where: `t.created_at >= ${businessDayStartSql('$1')}
  AND t.created_at < ${businessDayEndSql('$2')}
  AND ($3::text IS NULL OR tu.code = $3)`,
    statuses: {
      pending: `t.status = 'pending'`,
      assigned: `t.status = 'assigned'`,
      in_progress: `t.status = 'in_progress'`,
      completed: `t.status = 'completed'`,
      cancelled: `t.status = 'cancelled'`,
      overdue: TASK_OVERDUE_SQL,
    },
    // DISTINCT: the breakdown by assignee joins a task once per assignee
    measures: [
      counted('tasks', 'Tổng nhiệm vụ', 'COUNT(DISTINCT t.id)'),
      counted(
        'pending',
        'Chờ giao',
        `COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending')`,
      ),
      counted(
        'assigned',
        'Đã giao',
        `COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'assigned')`,
      ),
      counted(
        'inProgress',
        'Đang thực hiện',
        `COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'in_progress')`,
      ),
      counted(
        'completed',
        'Hoàn thành',
        `COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed')`,
      ),
      counted(
        'cancelled',
        'Đã hủy',
        `COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'cancelled')`,
      ),
      counted(
        'overdue',
        'Quá hạn',
        `COUNT(DISTINCT t.id) FILTER (WHERE ${TASK_OVERDUE_SQL})`,
      ),
      column(
        'completionRate',
        'Tỷ lệ hoàn thành (%)',
        `COALESCE(ROUND(100.0 * COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') / NULLIF(COUNT(DISTINCT t.id) FILTER (WHERE t.status <> 'cancelled'), 0), 1), 0)::float8`,
        'percent',
      ),
    ],
    groupings: {
      unit: byUnit('tu.code', 'tu.name'),
      day: byExpression('date', 'Ngày', TASK_DAY, 'date'),
      month: byExpression('month', 'Tháng', TASK_MONTH),
      status: byCode(
        'status',
        'Mã trạng thái',
        'Trạng thái',
        't.status',
        TASK_STATUS_LABELS,
      ),
      type: byCode(
        'type',
        'Mã loại',
        'Loại nhiệm vụ',
        't.type',
        TASK_TYPE_LABELS,
      ),
      priority: byCode(
        'priority',
        'Mã mức độ',
        'Mức độ ưu tiên',
        't.priority',
        TASK_PRIORITY_LABELS,
      ),
      assignee: {
        joins: `JOIN task_assignments ta ON ta.task_id = t.id
  JOIN users au ON au.id = ta.assignee_id`,
        columns: [
          column('userId', 'ID người thực hiện', 'ta.assignee_id'),
          column('fullName', 'Người thực hiện', 'au.full_name'),
        ],
        groupBy: 'ta.assignee_id, au.full_name',
        orderBy: 'au.full_name, ta.assignee_id',
      },
    },
  },

  // KPI evaluations of the months the range touches, on the 100-point scale of
  // /kpi/summary-report; a member belongs to the unit of their militia profile
  kpi: {
    title: 'Báo cáo KPI & hiệu suất',
    from: `kpi_evaluations ke
  JOIN LATERAL (
    SELECT pmp.id, pmp.full_name, pmp.militia_code, pmp.unit_id
    FROM militia_profiles pmp
    WHERE pmp.user_id = ke.target_user_id
    ORDER BY pmp.created_at, pmp.id
    LIMIT 1
  ) mp ON true
  JOIN units u ON u.id = mp.unit_id`,
    where: `${inBusinessMonthsOf(KPI_MONTH_START)}
  AND ($3::text IS NULL OR u.code = $3)`,
    statuses: Object.fromEntries(
      KPI_RECOMMENDATIONS.map((r) => [
        r.recommendation,
        `ke.recommendation = '${r.recommendation}'`,
      ]),
    ),
    measures: [
      counted('evaluations', 'Số lượt đánh giá', 'COUNT(*)'),
      counted(
        'members',
        'Số DQTV được đánh giá',
        'COUNT(DISTINCT ke.target_user_id)',
      ),
      column(
        'averageScore',
        'Điểm trung bình (thang 100)',
        'ROUND(AVG(ke.weighted_score) * 10, 1)::float8',
        'number',
      ),
      column(
        'minScore',
        'Điểm thấp nhất',
        'ROUND(MIN(ke.weighted_score) * 10, 1)::float8',
        'number',
      ),
      column(
        'maxScore',
        'Điểm cao nhất',
        'ROUND(MAX(ke.weighted_score) * 10, 1)::float8',
        'number',
      ),
      ...KPI_RECOMMENDATIONS.map((r) =>
        counted(
          r.recommendation,
          `Đề xuất: ${r.label}`,
          `COUNT(*) FILTER (WHERE ke.recommendation = '${r.recommendation}')`,
        ),
      ),
    ],
    groupings: {
      unit: byUnit('u.code', 'u.name'),
      member: byMember('u.code'),
      month: byExpression(
        'month',
        'Tháng',
        `to_char(${KPI_MONTH_START}, 'YYYY-MM')`,
      ),
      status: byCode(
        'status',
        'Mã đề xuất',
        'Đề xuất',
        'ke.recommendation',
        RECOMMENDATION_LABELS,
      ),
    },
  },

  // Payroll items of the periods whose month the range touches
  payroll: {
    title: 'Báo cáo lương & phụ cấp',
    from: `payroll_items pi
  JOIN payroll_periods pp ON pp.id = pi.payroll_period_id
  JOIN militia_profiles mp ON mp.id = pi.militia_id
  JOIN units u ON u.id = mp.unit_id`,
    where: `${inBusinessMonthsOf(PAYROLL_MONTH_START)}
  AND ($3::text IS NULL OR u.code = $3)`,
    statuses: {
      pending: `pi.approval_status = 'pending'`,
      approved: `pi.approval_status = 'approved'`,
      rejected: `pi.approval_status = 'rejected'`,
    },
    measures: [
      counted('items', 'Số bảng lương', 'COUNT(*)'),
      counted('members', 'Số DQTV', 'COUNT(DISTINCT pi.militia_id)'),
      money('baseSalary', 'Lương cơ bản', 'pi.base_salary'),
      money(
        'attendanceAllowance',
        'Phụ cấp chuyên cần',
        'pi.attendance_allowance',
      ),
      money('taskBonus', 'Thưởng nhiệm vụ', 'pi.task_bonus'),
      money('kpiBonus', 'Thưởng KPI', 'pi.kpi_bonus'),
      money('trainingAllowance', 'Phụ cấp huấn luyện', 'pi.training_allowance'),
      money('otherAllowance', 'Phụ cấp khác', 'pi.other_allowance'),
      money('deduction', 'Khấu trừ', 'pi.deduction'),
      money('netSalary', 'Thực lĩnh', 'pi.net_salary'),
    ],
    groupings: {
      unit: byUnit('u.code', 'u.name'),
      member: byMember('u.code'),
      month: byExpression(
        'month',
        'Tháng',
        `to_char(${PAYROLL_MONTH_START}, 'YYYY-MM')`,
      ),
      status: byCode(
        'status',
        'Mã trạng thái duyệt',
        'Trạng thái duyệt',
        'pi.approval_status',
        PAYROLL_APPROVAL_LABELS,
      ),
    },
  },
};

// Own keys only: "__proto__", "constructor" and the like never name a definition
const hasOwn = (map: object, key: string): boolean =>
  Object.keys(map).includes(key);

const publicColumn = ({ key, label, type }: SqlColumn): ReportColumn => ({
  key,
  label,
  type,
});

function definitionOf(dataset: string): DatasetDefinition {
  if (!hasOwn(DEFINITIONS, dataset)) {
    throw new BadRequestException('invalid_dataset');
  }
  return DEFINITIONS[dataset as CustomReportDataset];
}

export function customReportTitle(dataset: CustomReportDataset): string {
  return definitionOf(dataset).title;
}

export function supportedGroupings(
  dataset: CustomReportDataset,
): CustomReportGrouping[] {
  const { groupings } = definitionOf(dataset);
  return CUSTOM_REPORT_GROUPINGS.filter(
    (g) => g === 'none' || hasOwn(groupings, g),
  );
}

export function supportedStatuses(dataset: CustomReportDataset): string[] {
  return Object.keys(definitionOf(dataset).statuses);
}

/** The statement for a dataset, breakdown and optional status, from definitions only. */
export function buildCustomReportQuery(
  dataset: CustomReportDataset,
  grouping: CustomReportGrouping,
  status?: string,
): CustomReportQuery {
  const definition = definitionOf(dataset);
  let group: GroupingDefinition | null = null;
  if (grouping !== 'none') {
    if (!hasOwn(definition.groupings, grouping)) {
      throw new BadRequestException('group_by_not_supported');
    }
    group = definition.groupings[grouping]!;
  }
  if (status !== undefined && !hasOwn(definition.statuses, status)) {
    throw new BadRequestException('status_not_supported');
  }

  const selected = [...(group?.columns ?? []), ...definition.measures];
  const lines = [
    `SELECT ${selected.map((c) => `${c.sql} AS "${c.key}"`).join(',\n       ')}`,
    `FROM ${definition.from}`,
  ];
  if (group?.joins) lines.push(`  ${group.joins}`);
  lines.push(`WHERE ${definition.where}`);
  if (status !== undefined)
    lines.push(`  AND (${definition.statuses[status]})`);
  if (group) {
    lines.push(
      `GROUP BY ${group.groupBy}`,
      `ORDER BY ${group.orderBy}`,
      'LIMIT $4',
    );
  }

  return {
    sql: lines.join('\n'),
    columns: selected.map(publicColumn),
    measures: definition.measures.map(publicColumn),
  };
}
