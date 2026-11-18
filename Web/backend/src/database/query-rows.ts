interface Queryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

/**
 * Rows produced by a SQL statement.
 *
 * TypeORM's postgres driver resolves DataSource.query() and EntityManager.query() with
 * [rows, rowCount] for UPDATE and DELETE, and with the rows themselves for everything
 * else, so `rows.length` on an UPDATE ... RETURNING is always 2. This always returns rows.
 */
export async function queryRows<T>(
  runner: Queryable,
  sql: string,
  parameters?: unknown[],
): Promise<T[]> {
  const result = await runner.query(sql, parameters);
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  return result as T[];
}
