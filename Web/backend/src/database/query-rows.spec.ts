import { queryRows } from './query-rows';

// TypeORM's postgres driver returns [rows, rowCount] from DataSource.query() for UPDATE
// and DELETE statements, and plain rows for everything else.
describe('queryRows', () => {
  const runner = (result: unknown) => ({
    query: jest.fn().mockResolvedValue(result),
  });

  it('unwraps the [rows, rowCount] tuple returned for UPDATE ... RETURNING', async () => {
    const rows = [{ id: 'mp-1' }];

    await expect(
      queryRows(runner([rows, 1]), 'UPDATE x SET y = 1 RETURNING id'),
    ).resolves.toEqual(rows);
  });

  it('returns an empty list when an UPDATE matched nothing', async () => {
    await expect(
      queryRows(runner([[], 0]), 'UPDATE x SET y = 1 RETURNING id'),
    ).resolves.toEqual([]);
  });

  it('passes plain SELECT rows through unchanged, including two-row results', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];

    await expect(queryRows(runner(rows), 'SELECT id FROM x')).resolves.toEqual(
      rows,
    );
  });

  it('forwards the SQL and parameters', async () => {
    const r = runner([]);

    await queryRows(r, 'SELECT $1::int', [7]);

    expect(r.query).toHaveBeenCalledWith('SELECT $1::int', [7]);
  });
});
