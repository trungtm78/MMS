import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface DashboardStats {
  totalMilitia: number;
  activeToday: number;
  pendingTasks: number;
  pendingApprovals: number;
  activeSosAlerts: number;
}

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getStats(): Promise<DashboardStats> {
    const today = new Date().toISOString().split('T')[0];
    // Single CTE — 1 round trip instead of 5 queries
    const [row] = await this.ds.query<Record<string, string>[]>(
      `SELECT
         (SELECT COUNT(*) FROM militia_profiles WHERE status = 'active')          AS total_militia,
         (SELECT COUNT(*) FROM attendance_records WHERE work_date = $1::date)     AS active_today,
         (SELECT COUNT(*) FROM tasks WHERE status = 'pending')                    AS pending_tasks,
         (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending')           AS pending_approvals,
         (SELECT COUNT(*) FROM incidents WHERE status IN ('open', 'responding'))  AS active_sos`,
      [today],
    );
    return {
      totalMilitia: parseInt(row['total_militia'] ?? '0', 10),
      activeToday: parseInt(row['active_today'] ?? '0', 10),
      pendingTasks: parseInt(row['pending_tasks'] ?? '0', 10),
      pendingApprovals: parseInt(row['pending_approvals'] ?? '0', 10),
      activeSosAlerts: parseInt(row['active_sos'] ?? '0', 10),
    };
  }
}
