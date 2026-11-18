// SQL CASE expressions that turn stored codes into their labels, for reports and exports
// that must read in Vietnamese. Labels are constants written in code, never request input.

/** A SQL CASE mapping the codes in `columnSql` to labels; unknown codes pass through. */
export function sqlLabelCase(
  columnSql: string,
  labels: Record<string, string>,
): string {
  const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;
  const whens = Object.entries(labels)
    .map(([code, label]) => `WHEN ${literal(code)} THEN ${literal(label)}`)
    .join(' ');
  return `CASE ${columnSql} ${whens} ELSE ${columnSql} END`;
}
