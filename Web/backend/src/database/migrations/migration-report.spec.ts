// What the migrate CLI prints: an unattended boot must never mistake a run that stopped
// early (MIGRATION_THROUGH left set) for a complete one.
import { describeReport } from './migration-report';

const report = {
  applied: ['038_a.sql'],
  skipped: ['037_x.sql', '036_y.sql'],
  baselined: [],
  pending: [] as string[],
};

describe('describeReport', () => {
  it('lists what was applied and summarises the run, with no warning when nothing is pending', () => {
    expect(describeReport(report)).toEqual({
      lines: [
        'applied   038_a.sql',
        'migrations: 1 applied, 2 already applied, 0 baselined, 0 pending',
      ],
      warnings: [],
    });
  });

  it('warns, naming the files and the setting, when a run stopped before the last file', () => {
    const { lines, warnings } = describeReport({
      ...report,
      pending: ['039_b.sql', '040_c.sql'],
    });

    expect(lines).toEqual([
      'applied   038_a.sql',
      'pending   039_b.sql',
      'pending   040_c.sql',
      'migrations: 1 applied, 2 already applied, 0 baselined, 2 pending',
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('WARNING');
    expect(warnings[0]).toContain('039_b.sql, 040_c.sql');
    expect(warnings[0]).toContain('MIGRATION_THROUGH');
    expect(warnings[0]).toContain('--through');
    expect(warnings[0]).toContain('not complete');
  });

  it('lists baselined files first', () => {
    expect(
      describeReport({ ...report, baselined: ['001_a.sql'] }).lines[0],
    ).toBe('baselined 001_a.sql');
  });
});
