import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext } from './tenant-context';

export type TenantJobOutcome =
  | { tenantId: string; ok: true }
  | { tenantId: string; ok: false; error: string };

// Scheduled jobs have no request: they run once per tenant, each under that tenant's
// scope, so Row-Level Security answers for them exactly as it does for a request. A tenant
// that fails does not stop the others.
@Injectable()
export class TenantJobRunner {
  private readonly logger = new Logger(TenantJobRunner.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async forEachTenant(
    job: (tenantId: string) => Promise<void>,
  ): Promise<TenantJobOutcome[]> {
    // No scope here: the function is SECURITY DEFINER and answers the tenant ids only
    const rows = await this.dataSource.query<{ id: string }[]>(
      'SELECT id FROM maintenance_tenant_ids()',
    );
    const outcomes: TenantJobOutcome[] = [];
    for (const { id: tenantId } of rows) {
      try {
        await TenantContext.runAs({ tenantId }, () => job(tenantId));
        outcomes.push({ tenantId, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Job failed for tenant ${tenantId}: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
        outcomes.push({ tenantId, ok: false, error: message });
      }
    }
    return outcomes;
  }
}
