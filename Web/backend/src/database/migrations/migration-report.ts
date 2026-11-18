import type { MigrationReport } from './migration-runner';

/**
 * The lines the migrate CLI prints. Files left pending by --through / MIGRATION_THROUGH make
 * the schema incomplete: a boot that kept the setting would otherwise start the application
 * on it and exit 0, so the run says so loudly.
 */
export function describeReport(report: MigrationReport): {
  lines: string[];
  warnings: string[];
} {
  const lines = [
    ...report.baselined.map((name) => `baselined ${name}`),
    ...report.applied.map((name) => `applied   ${name}`),
    ...report.pending.map((name) => `pending   ${name}`),
    `migrations: ${report.applied.length} applied, ${report.skipped.length} already applied, ${report.baselined.length} baselined, ${report.pending.length} pending`,
  ];
  const warnings =
    report.pending.length === 0
      ? []
      : [
          `WARNING: the schema is not complete. --through / MIGRATION_THROUGH stopped the run before ${report.pending.join(', ')}. Unset it to apply them; leave it set only for a release's online preparation, never for a normal start`,
        ];
  return { lines, warnings };
}
