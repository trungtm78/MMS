import { queryOne, queryMany } from '../db/pool';

export interface WorkReport {
  id: string;
  userId: string;
  reportType: string;
  content: string;
  location: string | null;
  images: string[];
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamReportStats {
  period: { year: number; month: number };
  taskStats: {
    totalAssigned: number;
    completed: number;
    onTime: number;
    overdue: number;
    completionRate: number;
    trend: { week: number; assigned: number; completed: number; overdue: number }[];
  };
  attendanceStats: {
    totalWorkdays: number;
    avgPresentRate: number;
    avgOnTimeRate: number;
    breakdown: { week: number; onTime: number; late: number; absent: number }[];
  };
  kpiStats: {
    avgScore: number;
    distribution: { range: string; count: number }[];
    top5: { rank: number; fullName: string; militiaCode: string; score: number }[];
    needsAttention: { fullName: string; militiaCode: string; score: number; reason: string }[];
  };
}

export async function createReport(userId: string, data: {
  reportType: string;
  content: string;
  location?: string;
  images?: string[];
}): Promise<WorkReport> {
  const report = await queryOne<{
    id: string;
    user_id: string;
    report_type: string;
    content: string;
    location: string | null;
    images: string[];
    status: string;
    reviewed_by: string | null;
    reviewed_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO work_reports (user_id, report_type, content, location, images, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [userId, data.reportType, data.content, data.location ?? null, JSON.stringify(data.images ?? [])]
  );

  if (!report) throw new Error('Failed to create report');

  return mapReport(report);
}

export async function getMyReports(userId: string, params: {
  reportType?: string;
  page: number;
  limit: number;
}): Promise<{ data: WorkReport[]; total: number }> {
  const conditions = [`user_id = $1`];
  const values: unknown[] = [userId];
  let idx = 2;

  if (params.reportType) {
    conditions.push(`report_type = $${idx++}`);
    values.push(params.reportType);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (params.page - 1) * params.limit;

  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM work_reports ${where}`,
    values
  );
  const total = parseInt(countRow?.count ?? '0');

  const rows = await queryMany<{
    id: string;
    user_id: string;
    report_type: string;
    content: string;
    location: string | null;
    images: string[];
    status: string;
    reviewed_by: string | null;
    reviewed_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT * FROM work_reports ${where}
     ORDER BY created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, params.limit, offset]
  );

  return { data: rows.map(mapReport), total };
}

export async function getTeamReport(params: {
  year: number;
  month: number;
  unitId?: string;
}): Promise<TeamReportStats> {
  const { year, month } = params;

  // ─── Task Stats ──────────────────────────────────────────────────────────────
  const taskRows = await queryMany<{
    total_assigned: string;
    completed: string;
    on_time: string;
    overdue: string;
  }>(
    `SELECT
       COUNT(ta.id) as total_assigned,
       COUNT(CASE WHEN ta.status = 'completed' THEN 1 END) as completed,
       COUNT(CASE WHEN ta.status = 'completed' AND (t.deadline IS NULL OR ta.completed_at <= t.deadline) THEN 1 END) as on_time,
       COUNT(CASE WHEN t.deadline < NOW() AND ta.status != 'completed' THEN 1 END) as overdue
     FROM task_assignments ta
     JOIN tasks t ON t.id = ta.task_id
     WHERE EXTRACT(YEAR FROM t.created_at) = $1
       AND EXTRACT(MONTH FROM t.created_at) = $2`,
    [year, month]
  );

  const ts = taskRows[0] ?? { total_assigned: '0', completed: '0', on_time: '0', overdue: '0' };
  const totalAssigned = parseInt(ts.total_assigned);
  const completedCount = parseInt(ts.completed);
  const onTimeCount = parseInt(ts.on_time);
  const overdueCount = parseInt(ts.overdue);
  const completionRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 1000) / 10 : 0;

  // Weekly trend (4 weeks)
  const trend = [];
  for (let w = 1; w <= 4; w++) {
    const weekStart = (w - 1) * 7 + 1;
    const weekEnd = w * 7;
    const wRows = await queryMany<{ assigned: string; completed: string; overdue: string }>(
      `SELECT
         COUNT(ta.id) as assigned,
         COUNT(CASE WHEN ta.status = 'completed' THEN 1 END) as completed,
         COUNT(CASE WHEN t.deadline < NOW() AND ta.status != 'completed' THEN 1 END) as overdue
       FROM task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
       WHERE EXTRACT(YEAR FROM t.created_at) = $1
         AND EXTRACT(MONTH FROM t.created_at) = $2
         AND EXTRACT(DAY FROM t.created_at) BETWEEN $3 AND $4`,
      [year, month, weekStart, weekEnd]
    );
    const wr = wRows[0] ?? { assigned: '0', completed: '0', overdue: '0' };
    trend.push({ week: w, assigned: parseInt(wr.assigned), completed: parseInt(wr.completed), overdue: parseInt(wr.overdue) });
  }

  // ─── Attendance Stats ─────────────────────────────────────────────────────────
  const attRows = await queryMany<{
    present: string;
    late: string;
    early_leave: string;
    total_days: string;
  }>(
    `SELECT
       COUNT(CASE WHEN status != 'absent' THEN 1 END) as present,
       COUNT(CASE WHEN status = 'late' THEN 1 END) as late,
       COUNT(CASE WHEN status = 'early_leave' THEN 1 END) as early_leave,
       COUNT(*) as total_days
     FROM attendance_records
     WHERE EXTRACT(YEAR FROM work_date) = $1
       AND EXTRACT(MONTH FROM work_date) = $2`,
    [year, month]
  );

  const att = attRows[0] ?? { present: '0', late: '0', early_leave: '0', total_days: '0' };
  const presentCount = parseInt(att.present);
  const lateCount = parseInt(att.late);
  const totalDaysAtt = parseInt(att.total_days);
  const avgPresentRate = totalDaysAtt > 0 ? Math.round((presentCount / totalDaysAtt) * 1000) / 10 : 0;
  const avgOnTimeRate = presentCount > 0 ? Math.round(((presentCount - lateCount) / presentCount) * 1000) / 10 : 0;

  const attBreakdown = [];
  for (let w = 1; w <= 4; w++) {
    const weekStart = (w - 1) * 7 + 1;
    const weekEnd = w * 7;
    const wRows = await queryMany<{ on_time: string; late: string; absent: string }>(
      `SELECT
         COUNT(CASE WHEN status NOT IN ('absent', 'late') THEN 1 END) as on_time,
         COUNT(CASE WHEN status = 'late' THEN 1 END) as late,
         COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent
       FROM attendance_records
       WHERE EXTRACT(YEAR FROM work_date) = $1
         AND EXTRACT(MONTH FROM work_date) = $2
         AND EXTRACT(DAY FROM work_date) BETWEEN $3 AND $4`,
      [year, month, weekStart, weekEnd]
    );
    const wr = wRows[0] ?? { on_time: '0', late: '0', absent: '0' };
    attBreakdown.push({ week: w, onTime: parseInt(wr.on_time), late: parseInt(wr.late), absent: parseInt(wr.absent) });
  }

  // ─── KPI Stats ────────────────────────────────────────────────────────────────
  const kpiRows = await queryMany<{
    full_name: string;
    militia_code: string;
    total_score: number;
  }>(
    `SELECT mp.full_name, mp.militia_code, ks.total_score
     FROM kpi_scores ks
     JOIN militia_profiles mp ON mp.id = ks.militia_id
     JOIN kpi_periods kp ON kp.id = ks.period_id
     WHERE kp.year = $1 AND kp.month = $2
     ORDER BY ks.total_score DESC`,
    [year, month]
  );

  const avgScore = kpiRows.length > 0
    ? Math.round(kpiRows.reduce((sum, r) => sum + Number(r.total_score), 0) / kpiRows.length * 10) / 10
    : 0;

  const distribution = [
    { range: '90-100', count: kpiRows.filter(r => Number(r.total_score) >= 90).length },
    { range: '80-89', count: kpiRows.filter(r => Number(r.total_score) >= 80 && Number(r.total_score) < 90).length },
    { range: '70-79', count: kpiRows.filter(r => Number(r.total_score) >= 70 && Number(r.total_score) < 80).length },
    { range: '0-69', count: kpiRows.filter(r => Number(r.total_score) < 70).length },
  ];

  const top5 = kpiRows.slice(0, 5).map((r, i) => ({
    rank: i + 1,
    fullName: r.full_name,
    militiaCode: r.militia_code,
    score: Number(r.total_score),
  }));

  const needsAttention = kpiRows
    .filter(r => Number(r.total_score) < 70)
    .map(r => ({
      fullName: r.full_name,
      militiaCode: r.militia_code,
      score: Number(r.total_score),
      reason: 'Điểm KPI thấp',
    }));

  return {
    period: { year, month },
    taskStats: {
      totalAssigned,
      completed: completedCount,
      onTime: onTimeCount,
      overdue: overdueCount,
      completionRate,
      trend,
    },
    attendanceStats: {
      totalWorkdays: 22, // business days in month (static estimate)
      avgPresentRate,
      avgOnTimeRate,
      breakdown: attBreakdown,
    },
    kpiStats: {
      avgScore,
      distribution,
      top5,
      needsAttention,
    },
  };
}

function mapReport(r: {
  id: string;
  user_id: string;
  report_type: string;
  content: string;
  location: string | null;
  images: unknown;
  status: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): WorkReport {
  return {
    id: r.id,
    userId: r.user_id,
    reportType: r.report_type,
    content: r.content,
    location: r.location,
    images: Array.isArray(r.images) ? r.images : [],
    status: r.status,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
