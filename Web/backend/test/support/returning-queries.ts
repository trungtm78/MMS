// UPDATE/DELETE ... RETURNING statements whose rows are read straight from query().
// TypeORM's postgres driver resolves those with [rows, rowCount], so they must go through
// queryRows() or run as a SELECT over a CTE.
const DIRECT_RETURNING =
  /\.query(?:<[^(`]*?>)?\(\s*`\s*(?:UPDATE|DELETE\s+FROM)\b[^`]*\bRETURNING\b/gi;

/** 1-based line numbers of every offending statement in a source file. */
export function directReturningQueryLines(source: string): number[] {
  return [...source.matchAll(DIRECT_RETURNING)].map(
    (match) => source.slice(0, match.index).split('\n').length,
  );
}
