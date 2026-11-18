// The custom report builds SQL from whitelisted definitions only: request values pick a
// definition or bind a parameter, and never reach the statement text
import { BadRequestException } from '@nestjs/common';
import {
  CUSTOM_REPORT_DATASETS,
  buildCustomReportQuery,
  supportedGroupings,
  supportedStatuses,
  type CustomReportDataset,
} from './custom-report.definitions';

const combinations = CUSTOM_REPORT_DATASETS.flatMap((dataset) =>
  supportedGroupings(dataset).flatMap((grouping) =>
    [undefined, ...supportedStatuses(dataset)].map(
      (status) => [dataset, grouping, status] as const,
    ),
  ),
);

describe('buildCustomReportQuery', () => {
  it('offers the four datasets of the report page', () => {
    expect(CUSTOM_REPORT_DATASETS).toEqual([
      'attendance',
      'tasks',
      'kpi',
      'payroll',
    ]);
  });

  it.each(CUSTOM_REPORT_DATASETS)(
    'gives %s a summary, a breakdown by unit and one by month',
    (dataset) => {
      expect(supportedGroupings(dataset)).toEqual(
        expect.arrayContaining(['none', 'unit', 'month']),
      );
    },
  );

  it.each(combinations)(
    '%s by %s with status %p binds only its fixed parameters',
    (dataset, grouping, status) => {
      const { sql, columns, measures } = buildCustomReportQuery(
        dataset,
        grouping,
        status,
      );

      const placeholders = [...new Set(sql.match(/\$\d+/g))].sort();
      if (grouping === 'none') {
        expect(placeholders).toEqual(['$1', '$2', '$3']);
        // lateral joins pick one unit or profile with LIMIT 1; the summary itself is one row
        expect(sql).not.toMatch(/GROUP BY|LIMIT \$4/);
      } else {
        expect(placeholders).toEqual(['$1', '$2', '$3', '$4']);
        expect(sql).toMatch(/GROUP BY[\s\S]+ORDER BY[\s\S]+LIMIT \$4$/);
      }
      // the unit scope is always a bound parameter
      expect(sql).toContain('$3::text IS NULL OR');

      expect(measures.length).toBeGreaterThan(0);
      expect(columns.slice(columns.length - measures.length)).toEqual(measures);
      const keys = columns.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const column of columns) {
        expect(column.label).toBeTruthy();
        expect(['text', 'number', 'percent', 'currency', 'date']).toContain(
          column.type,
        );
      }
    },
  );

  it.each<[CustomReportDataset, string]>([
    ['payroll', 'priority'],
    ['attendance', 'assignee'],
    ['kpi', 'type'],
    ['tasks', 'member'],
    ['attendance', 'unit; DROP TABLE users'],
    ['tasks', '__proto__'],
    ['kpi', 'constructor'],
    ['payroll', 'toString'],
  ])('refuses to break %s down by %p', (dataset, grouping) => {
    expect(() => buildCustomReportQuery(dataset, grouping as never)).toThrow(
      new BadRequestException('group_by_not_supported'),
    );
  });

  it.each(['staff', '__proto__', 'hasOwnProperty'])(
    'refuses the dataset %p',
    (dataset) => {
      expect(() => buildCustomReportQuery(dataset as never, 'none')).toThrow(
        new BadRequestException('invalid_dataset'),
      );
    },
  );

  it.each<[CustomReportDataset, string]>([
    ['attendance', 'approved'],
    ['tasks', "completed' OR 1=1 --"],
    ['kpi', '__proto__'],
    ['payroll', 'late'],
  ])('refuses the %s status %p', (dataset, status) => {
    expect(() => buildCustomReportQuery(dataset, 'none', status)).toThrow(
      new BadRequestException('status_not_supported'),
    );
  });

  it('applies a status as its declared predicate', () => {
    expect(
      buildCustomReportQuery('attendance', 'none', 'present').sql,
    ).toContain("ar.status IN ('checked_in', 'checked_out')");
    expect(buildCustomReportQuery('tasks', 'unit', 'overdue').sql).toContain(
      't.deadline < now()',
    );
    expect(buildCustomReportQuery('payroll', 'none', 'approved').sql).toContain(
      "pi.approval_status = 'approved'",
    );
  });

  it('keeps KPI scores on the 100-point scale of the KPI summary report', () => {
    expect(buildCustomReportQuery('kpi', 'unit').sql).toContain(
      'AVG(ke.weighted_score) * 10',
    );
  });

  it('counts a task once per row even when it has several assignees', () => {
    expect(buildCustomReportQuery('tasks', 'assignee').sql).toContain(
      'COUNT(DISTINCT t.id)',
    );
  });

  it('filters tasks by the Vietnamese business days of creation', () => {
    expect(buildCustomReportQuery('tasks', 'none').sql).toContain(
      "t.created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')",
    );
  });
});
