import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantJobRunner } from '../database/tenancy/tenant-job-runner';

@Injectable()
export class GpsRetentionService {
  private readonly logger = new Logger(GpsRetentionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantJobs: TenantJobRunner,
  ) {}

  // gps_points is a tenant table: each tenant's points are purged under its scope (a
  // failing tenant is logged by the runner and does not stop the others). A run that is
  // still going at the next tick is not started again.
  @Cron('0 2 * * *', { waitForCompletion: true }) // every day at 02:00
  async purgeOldGpsPoints(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    await this.tenantJobs.run(
      'GpsRetentionService.purgeOldGpsPoints',
      async (tenantId) => {
        // The Postgres driver answers a DELETE without RETURNING with [rows, rowCount]
        const [, deleted] = await this.dataSource.query<
          [unknown[], number | null]
        >(`DELETE FROM gps_points WHERE captured_at < $1::timestamptz`, [
          cutoff.toISOString(),
        ]);
        this.logger.log(
          `GPS retention, tenant ${tenantId ?? 'legacy'}: deleted ${deleted ?? 0} rows older than 90 days`,
        );
      },
    );
  }
}
