import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { businessDate } from '../common/time/business-date';
import { TenantJobRunner } from '../database/tenancy/tenant-job-runner';
import { TenantContext } from '../database/tenancy/tenant-context';

@Injectable()
export class ComplianceAlertsService {
  private readonly logger = new Logger(ComplianceAlertsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly tenantJobs: TenantJobRunner,
  ) {}

  // A check that is still running at the next tick is not started again
  @Cron('0 8 * * *', { waitForCompletion: true }) // 8am daily
  async checkComplianceAlerts(): Promise<void> {
    await this.tenantJobs.run(
      'ComplianceAlertsService.checkComplianceAlerts',
      () => this.runCheck(),
    );
  }

  /**
   * The check for the tenant in scope (the whole ward in legacy mode). A failure is rethrown,
   * so the job runner reports that tenant as failed and logs it once, with the tenant and
   * the stack.
   */
  async runCheck(): Promise<void> {
    const tenant = TenantContext.current()?.tenantId ?? 'legacy';
    this.logger.log(`Running compliance alerts check for tenant ${tenant}...`);

    try {
      // The training year is the Vietnamese calendar year; count whole calendar days
      // from today to 31 December (0 on the last day)
      const today = businessDate();
      const year = today.year;
      const daysUntilYearEnd = Math.round(
        (Date.UTC(year, 11, 31) - Date.UTC(year, today.month - 1, today.day)) /
          86_400_000,
      );

      // Only alert if < 60 days until year end
      if (daysUntilYearEnd > 60) {
        this.logger.log(
          `Year-end ${daysUntilYearEnd} days away — skipping compliance alerts`,
        );
        return;
      }

      // DQTV with totalDays < 12 this year (at-risk of not meeting 15-day requirement)
      const atRisk = await this.dataSource.query<
        {
          militiaId: string;
          militiaName: string;
          unitCode: string;
          totalDays: string;
        }[]
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

      // Announce over WebSocket to the connected users of the tenant in scope
      const summary = {
        type: 'compliance_alert',
        year,
        daysUntilYearEnd,
        atRiskCount: atRisk.length,
        message: `${atRisk.length} DQTV chưa đạt yêu cầu huấn luyện năm ${year} (< 12 ngày, còn ${daysUntilYearEnd} ngày đến cuối năm)`,
        checkedAt: new Date().toISOString(),
      };

      this.notificationsGateway.emitToTenant('compliance_alert', summary);

      // Log to audit trail
      await this.dataSource.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, after_json, created_at)
         VALUES (NULL, 'COMPLIANCE_ALERT', 'training_compliance', $1::jsonb, NOW())`,
        [JSON.stringify(summary)],
      );
    } catch (err) {
      // One line, no stack: the runner logs the failure with its stack
      this.logger.error(
        `Compliance alerts check failed for tenant ${tenant}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}
