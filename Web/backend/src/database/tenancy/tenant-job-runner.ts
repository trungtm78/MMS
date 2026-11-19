import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext } from './tenant-context';
import { isTenancyEnforced } from './tenancy-mode';

export type TenantJobOutcome =
  | { tenantId: string | null; ok: true }
  | { tenantId: string | null; ok: false; error: string };

// Scheduled jobs have no request: they run once per tenant, each under that tenant's
// scope, so Row-Level Security answers for them exactly as it does for a request. A tenant
// that fails does not stop the others.
@Injectable()
export class TenantJobRunner {
  private readonly logger = new Logger(TenantJobRunner.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * The way a scheduled job runs: in legacy mode once, unscoped (tenantId null; the single
   * tenant of the database), in enforced mode once per tenant under its scope. Callers do not
   * branch on the mode; a failure is logged and returned, never thrown.
   */
  async run(
    job: (tenantId: string | null) => Promise<void>,
  ): Promise<TenantJobOutcome[]> {
    if (isTenancyEnforced()) return this.forEachTenant(job);
    try {
      await job(null);
      return [{ tenantId: null, ok: true }];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Job failed (legacy mode): ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return [{ tenantId: null, ok: false, error: message }];
    }
  }

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
