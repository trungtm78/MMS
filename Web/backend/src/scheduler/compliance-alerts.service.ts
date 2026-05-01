import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class ComplianceAlertsService {
  private readonly logger = new Logger(ComplianceAlertsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Cron('0 8 * * *') // 8am daily
  async checkComplianceAlerts(): Promise<void> {
    this.logger.log('Running compliance alerts check...');

    try {
      const year = new Date().getFullYear();
      // Year-end: days remaining in current year
      const yearEnd = new Date(year, 11, 31);
      const now = new Date();
      const daysUntilYearEnd = Math.ceil(
        (yearEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Only alert if < 60 days until year end
      if (daysUntilYearEnd > 60) {
        this.logger.log(`Year-end ${daysUntilYearEnd} days away — skipping compliance alerts`);
        return;
      }

      // DQTV with totalDays < 12 this year (at-risk of not meeting 15-day requirement)
      const atRisk = await this.dataSource.query<
        { militiaId: string; militiaName: string; unitCode: string; totalDays: string }[]
      >(
        `SELECT
           mp.id             AS "militiaId",
           mp.full_name      AS "militiaName",
           u.code            AS "unitCode",
           COALESCE(SUM(tr.total_days), 0) AS "totalDays"
         FROM militia_profiles mp
         JOIN units u ON u.id = mp.unit_id
         LEFT JOIN training_records tr
           ON tr.militia_id = mp.id
          AND EXTRACT(YEAR FROM tr.from_date)::int = $1
         WHERE mp.status = 'active'
         GROUP BY mp.id, mp.full_name, u.code
         HAVING COALESCE(SUM(tr.total_days), 0) < 12
         ORDER BY COALESCE(SUM(tr.total_days), 0) ASC
         LIMIT 500`,
        [year],
      );

      if (!atRisk.length) {
        this.logger.log('No at-risk DQTV found for compliance alerts');
        return;
      }

      this.logger.warn(
        `Compliance alert: ${atRisk.length} DQTV at risk of missing ${year} training requirement`,
      );

      // Broadcast via WebSocket to all connected admin users
      const summary = {
        type: 'compliance_alert',
        year,
        daysUntilYearEnd,
        atRiskCount: atRisk.length,
        message: `${atRisk.length} DQTV chưa đạt yêu cầu huấn luyện năm ${year} (< 12 ngày, còn ${daysUntilYearEnd} ngày đến cuối năm)`,
        checkedAt: new Date().toISOString(),
      };

      this.notificationsGateway.server?.emit('compliance_alert', summary);

      // Log to audit trail
      await this.dataSource.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, after_json, created_at)
         VALUES (NULL, 'COMPLIANCE_ALERT', 'training_compliance', $1::jsonb, NOW())`,
        [JSON.stringify(summary)],
      );
    } catch (err) {
      this.logger.error('Compliance alerts check failed', err);
    }
  }
}
