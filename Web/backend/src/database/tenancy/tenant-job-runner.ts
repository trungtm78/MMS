import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext } from './tenant-context';
import { isTenancyEnforced, TenancyConfigError } from './tenancy-mode';

export type TenantJobOutcome =
  | { tenantId: string | null; ok: true }
  | { tenantId: string | null; ok: false; error: string };

export const DEFAULT_TENANT_JOB_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * TENANT_JOB_TIMEOUT_MS: how long one scheduled job may take for one tenant before the runner
 * moves on without it. Unset or empty is the default (10 minutes); anything that is not a
 * positive whole number of milliseconds fails, like the other tenancy settings.
 */
export function readTenantJobTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = (env.TENANT_JOB_TIMEOUT_MS ?? '').trim();
  if (!raw) return DEFAULT_TENANT_JOB_TIMEOUT_MS;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
    throw new TenancyConfigError(
      `Invalid TENANT_JOB_TIMEOUT_MS ${JSON.stringify(env.TENANT_JOB_TIMEOUT_MS)}: use a positive whole number of milliseconds`,
    );
  }
  return value;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Scheduled jobs have no request: they run once per tenant, each under that tenant's
// scope, so Row-Level Security answers for them exactly as it does for a request. A tenant
// that fails, or does not settle in time, does not stop the others.
@Injectable()
export class TenantJobRunner {
  private readonly logger = new Logger(TenantJobRunner.name);
  private readonly timeoutMs = readTenantJobTimeoutMs();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * The way a scheduled job runs: in legacy mode once, unscoped (tenantId null; the single
   * tenant of the database), in enforced mode once per tenant under its scope. Callers do not
   * branch on the mode; a failure (including a failure to list the tenants) is logged under
   * `jobName` and returned, never thrown. A run that takes longer than the timeout is
   * abandoned, see `forEachTenant`.
   */
  async run(
    jobName: string,
    job: (tenantId: string | null) => Promise<void>,
  ): Promise<TenantJobOutcome[]> {
    if (!isTenancyEnforced()) {
      return [await this.attempt(jobName, null, job, false)];
    }
    try {
      return await this.forEachTenant(job, jobName);
    } catch (error) {
      const message = errorMessage(error);
      this.logger.error(
        `${jobName}: could not list the tenants: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return [{ tenantId: null, ok: false, error: message }];
    }
  }

  /**
   * Runs the job for each tenant in turn. A tenant whose job does not settle within the
   * timeout is logged and left behind so the next tenant runs: a pending promise cannot be
   * cancelled, so that job may still be running (and writing) while the others go on. Its
   * late settlement is logged under its own tenant and can never reject unhandled.
   */
  async forEachTenant(
    job: (tenantId: string) => Promise<void>,
    jobName?: string,
  ): Promise<TenantJobOutcome[]> {
    // No scope here: the function is SECURITY DEFINER and answers the tenant ids only
    const rows = await this.dataSource.query<{ id: string }[]>(
      'SELECT id FROM maintenance_tenant_ids()',
    );
    const outcomes: TenantJobOutcome[] = [];
    for (const { id: tenantId } of rows) {
      outcomes.push(await this.attempt(jobName, tenantId, job, true));
    }
    return outcomes;
  }

  private async attempt(
    jobName: string | undefined,
    tenantId: string | null,
    job: (tenantId: string | null) => Promise<void>,
    scoped: boolean,
  ): Promise<TenantJobOutcome> {
    const prefix = jobName ? `${jobName}: ` : '';
    const where = tenantId === null ? ' (legacy mode)' : ` ${tenantId}`;
    const forTenant = tenantId === null ? where : ` for tenant${where}`;
    // The tenant is captured here, so a late settlement is reported under the tenant it
    // belongs to whatever the loop has moved on to
    const work = (async () =>
      scoped && tenantId !== null
        ? TenantContext.runAs({ tenantId }, () => job(tenantId))
        : job(tenantId))();
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.timeoutMs);
    });
    try {
      const winner = await Promise.race([
        work.then(() => 'done' as const),
        timedOut,
      ]);
      if (winner === 'timeout') {
        this.logger.error(`${prefix}Job timed out${forTenant}`);
        work.then(
          () =>
            this.logger.warn(
              `${prefix}The job abandoned after its timeout${forTenant} has since finished`,
            ),
          (late: unknown) =>
            this.logger.warn(
              `${prefix}The job abandoned after its timeout${forTenant} has since failed: ${errorMessage(late)}`,
            ),
        );
        return {
          tenantId,
          ok: false,
          error: `timed out after ${this.timeoutMs} ms`,
        };
      }
      return { tenantId, ok: true };
    } catch (error) {
      const message = errorMessage(error);
      this.logger.error(
        `${prefix}Job failed${forTenant}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { tenantId, ok: false, error: message };
    } finally {
      clearTimeout(timer);
    }
  }
}
