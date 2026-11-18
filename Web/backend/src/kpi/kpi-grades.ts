// Xếp loại bands of a KPI score on the 100-point scale, best first. GET /kpi/dashboard and
// the xếp loại of GET /kpi/summary-report and /kpi/export, code and SQL alike, read them
// from here so a dashboard and a report never grade a score differently.
export const KPI_GRADES = [
  { grade: 'excellent', label: 'Xuất sắc', minScore: 90 },
  { grade: 'good', label: 'Tốt', minScore: 75 },
  { grade: 'fair', label: 'Khá', minScore: 60 },
  { grade: 'needs_improvement', label: 'Cần cải thiện', minScore: 0 },
] as const;

export type KpiGrade = (typeof KPI_GRADES)[number];

const LOWEST = KPI_GRADES[KPI_GRADES.length - 1];

export function gradeOf(score: number): KpiGrade {
  return KPI_GRADES.find((band) => score >= band.minScore) ?? LOWEST;
}

/** A SQL CASE grading the score expression `scoreSql` (an expression written in code). */
export function gradeCaseSql(scoreSql: string): string {
  const bands = KPI_GRADES.slice(0, -1)
    .map((band) => `WHEN ${scoreSql} >= ${band.minScore} THEN '${band.grade}'`)
    .join(' ');
  return `CASE ${bands} ELSE '${LOWEST.grade}' END`;
}
