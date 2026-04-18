import { queryOne, queryMany } from '../db/pool';
import { getMilitiaProfileByUserId } from './user.service';

export interface KPIScore {
  id: string;
  periodId: string;
  periodYear: number;
  periodMonth: number;
  militiaId: string;
  attendanceScore: number;
  taskScore: number;
  disciplineScore: number;
  attitudeScore: number;
  supervisorScore: number;
  totalScore: number;
  rank: number | null;
  rankInUnit: number | null;
  comments: string | null;
}

export interface KPIPeriod {
  id: string;
  year: number;
  month: number;
  status: string;
  ruleVersion: string;
}

export interface KPIRanking {
  rank: number;
  militiaId: string;
  militiaName: string;
  militiaCode: string;
  totalScore: number;
  isMe: boolean;
}

export async function getCurrentKPI(userId: string): Promise<KPIScore | null> {
  const profile = await getMilitiaProfileByUserId(userId);
  if (!profile) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  let score = await queryOne<KPIScore>(
    `SELECT ks.*, kp.year as period_year, kp.month as period_month
     FROM kpi_scores ks
     JOIN kpi_periods kp ON ks.period_id = kp.id
     WHERE ks.militia_id = $1 AND kp.year = $2 AND kp.month = $3`,
    [profile.id, year, month]
  );

  // Calculate scores if not exists
  if (!score) {
    score = await calculateKPIScore(profile.id, year, month);
  }

  return score;
}

export async function getKPIHistory(
  userId: string,
  options?: { page?: number; limit?: number }
): Promise<{ scores: KPIScore[]; total: number }> {
  const profile = await getMilitiaProfileByUserId(userId);
  if (!profile) return { scores: [], total: 0 };

  const { page = 1, limit = 12 } = options || {};
  const offset = (page - 1) * limit;

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM kpi_scores WHERE militia_id = $1`,
    [profile.id]
  );
  const total = parseInt(countResult?.count || '0');

  const scores = await queryMany<KPIScore>(
    `SELECT ks.*, kp.year as period_year, kp.month as period_month
     FROM kpi_scores ks
     JOIN kpi_periods kp ON ks.period_id = kp.id
     WHERE ks.militia_id = $1
     ORDER BY kp.year DESC, kp.month DESC
     LIMIT $2 OFFSET $3`,
    [profile.id, limit, offset]
  );

  return { scores, total };
}

export async function getKPIRanking(
  userId: string,
  year?: number,
  month?: number
): Promise<{ myRank: number; total: number; topUsers: KPIRanking[] }> {
  const profile = await getMilitiaProfileByUserId(userId);
  if (!profile) return { myRank: 0, total: 0, topUsers: [] };

  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1;

  const period = await queryOne<{ id: string }>(
    'SELECT id FROM kpi_periods WHERE year = $1 AND month = $2',
    [targetYear, targetMonth]
  );

  if (!period) return { myRank: 0, total: 0, topUsers: [] };

  // Get my rank
  const myScore = await queryOne<{ rank: number | null }>(
    `SELECT rank FROM kpi_scores WHERE period_id = $1 AND militia_id = $2`,
    [period.id, profile.id]
  );

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    'SELECT COUNT(*)::text as count FROM kpi_scores WHERE period_id = $1',
    [period.id]
  );
  const total = parseInt(countResult?.count || '0');

  // Get top 10 users
  const topUsers = await queryMany<{
    rank: number;
    militia_id: string;
    militia_name: string;
    militia_code: string;
    total_score: number;
  }>(
    `SELECT 
      ks.rank,
      ks.militia_id,
      mp.full_name as militia_name,
      mp.militia_code,
      ks.total_score
    FROM kpi_scores ks
    JOIN militia_profiles mp ON ks.militia_id = mp.id
    WHERE ks.period_id = $1
    ORDER BY ks.total_score DESC
    LIMIT 10`,
    [period.id]
  );

  return {
    myRank: myScore?.rank || 0,
    total,
    topUsers: topUsers.map(u => ({
      rank: u.rank,
      militiaId: u.militia_id,
      militiaName: u.militia_name,
      militiaCode: u.militia_code,
      totalScore: u.total_score,
      isMe: u.militia_id === profile.id,
    })),
  };
}

async function calculateKPIScore(
  militiaId: string,
  year: number,
  month: number
): Promise<KPIScore | null> {
  // Get or create period
  let period = await queryOne<{ id: string }>(
    'SELECT id FROM kpi_periods WHERE year = $1 AND month = $2',
    [year, month]
  );

  if (!period) {
    period = await queryOne<{ id: string }>(
      `INSERT INTO kpi_periods (year, month, status, rule_version)
       VALUES ($1, $2, 'open', '1.0')
       RETURNING id`,
      [year, month]
    );
  }

  if (!period) return null;

  // Calculate attendance score (based on on-time rate)
  const attendanceStats = await queryOne<{
    total_days: string;
    late_days: string;
  }>(
    `SELECT 
      COUNT(*)::text as total_days,
      COUNT(*) FILTER (WHERE status = 'late')::text as late_days
    FROM attendance_records 
    WHERE militia_id = $1 
    AND EXTRACT(YEAR FROM work_date) = $2 
    AND EXTRACT(MONTH FROM work_date) = $3`,
    [militiaId, year, month]
  );

  const totalDays = parseInt(attendanceStats?.total_days || '0');
  const lateDays = parseInt(attendanceStats?.late_days || '0');
  const attendanceScore = totalDays > 0 ? ((totalDays - lateDays) / totalDays) * 100 : 0;

  // Calculate task score
  const taskStats = await queryOne<{
    completed: string;
    on_time: string;
    total: string;
  }>(
    `SELECT 
      COUNT(*)::text as total,
      COUNT(*) FILTER (WHERE ta.status = 'completed')::text as completed,
      COUNT(*) FILTER (WHERE ta.status = 'completed' AND ta.completed_at <= t.deadline)::text as on_time
    FROM task_assignments ta
    JOIN tasks t ON ta.task_id = t.id
    WHERE ta.assignee_id IN (SELECT user_id FROM militia_profiles WHERE id = $1)
    AND EXTRACT(YEAR FROM ta.assigned_at) = $2 
    AND EXTRACT(MONTH FROM ta.assigned_at) = $3`,
    [militiaId, year, month]
  );

  const completedTasks = parseInt(taskStats?.completed || '0');
  const onTimeTasks = parseInt(taskStats?.on_time || '0');
  const taskScore = completedTasks > 0 ? (onTimeTasks / completedTasks) * 100 : 0;

  // Discipline score (no violations = 100)
  const disciplineScore = 100;

  // Attitude score (default)
  const attitudeScore = 95;

  // Supervisor score (default)
  const supervisorScore = 90;

  // Calculate total score with weights
  const totalScore =
    attendanceScore * 0.25 +
    taskScore * 0.30 +
    disciplineScore * 0.15 +
    attitudeScore * 0.15 +
    supervisorScore * 0.15;

  // Insert or update score
  const score = await queryOne<KPIScore>(
    `INSERT INTO kpi_scores (
      period_id, militia_id, attendance_score, task_score, discipline_score,
      attitude_score, supervisor_score, total_score
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (period_id, militia_id) 
    DO UPDATE SET 
      attendance_score = $3,
      task_score = $4,
      discipline_score = $5,
      attitude_score = $6,
      supervisor_score = $7,
      total_score = $8,
      updated_at = NOW()
    RETURNING *`,
    [
      period.id, militiaId, attendanceScore, taskScore, disciplineScore,
      attitudeScore, supervisorScore, totalScore
    ]
  );

  return score;
}
