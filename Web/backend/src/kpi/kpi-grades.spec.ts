import { KPI_GRADES, gradeCaseSql, gradeOf } from './kpi-grades';

describe('KPI grades', () => {
  it('declares the xếp loại bands of the KPI summary report, best first', () => {
    expect(KPI_GRADES).toEqual([
      { grade: 'excellent', label: 'Xuất sắc', minScore: 90 },
      { grade: 'good', label: 'Tốt', minScore: 75 },
      { grade: 'fair', label: 'Khá', minScore: 60 },
      { grade: 'needs_improvement', label: 'Cần cải thiện', minScore: 0 },
    ]);
  });

  it.each([
    [100, 'excellent'],
    [90, 'excellent'],
    [89.9, 'good'],
    [75, 'good'],
    [74.9, 'fair'],
    [60, 'fair'],
    [59.9, 'needs_improvement'],
    [0, 'needs_improvement'],
  ])('grades %p as %p', (score, grade) => {
    expect(gradeOf(score).grade).toBe(grade);
  });

  it('writes the same bands as SQL, best first', () => {
    expect(gradeCaseSql('s.score')).toBe(
      "CASE WHEN s.score >= 90 THEN 'excellent' WHEN s.score >= 75 THEN 'good' WHEN s.score >= 60 THEN 'fair' ELSE 'needs_improvement' END",
    );
  });
});
