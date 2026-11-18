import { auditOriginOf, writeAuditLog } from './audit-log';

describe('auditOriginOf', () => {
  it('takes the client address Express resolved and the user agent', () => {
    expect(
      auditOriginOf({ ip: '10.0.0.1', headers: { 'user-agent': 'jest' } }),
    ).toEqual({ ip: '10.0.0.1', userAgent: 'jest' });
  });

  it('uses the first user agent header and null for anything missing', () => {
    expect(auditOriginOf({ headers: { 'user-agent': ['a', 'b'] } })).toEqual({
      ip: null,
      userAgent: 'a',
    });
    expect(auditOriginOf({ headers: {} })).toEqual({
      ip: null,
      userAgent: null,
    });
  });
});

describe('writeAuditLog', () => {
  const runner = { query: jest.fn() };

  beforeEach(() => {
    runner.query.mockReset();
    runner.query.mockResolvedValue([]);
  });

  it('inserts one audit row with the details as JSON and the request origin', async () => {
    await writeAuditLog(
      runner,
      {
        actorId: 'user-1',
        action: 'discipline.issued',
        entityType: 'discipline_decisions',
        entityId: 'dd-1',
        details: { form: 'canh_cao', militiaId: 'mp-1' },
      },
      { ip: '10.0.0.1', userAgent: 'jest' },
    );

    expect(runner.query).toHaveBeenCalledTimes(1);
    const [sql, params] = runner.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(
      /INSERT INTO audit_logs \(actor_id, action, entity_type, entity_id, after_json, ip, user_agent\)/,
    );
    expect(sql).toMatch(/\$5::jsonb/);
    expect(params).toEqual([
      'user-1',
      'discipline.issued',
      'discipline_decisions',
      'dd-1',
      JSON.stringify({ form: 'canh_cao', militiaId: 'mp-1' }),
      '10.0.0.1',
      'jest',
    ]);
  });

  it('records no origin when the caller has none', async () => {
    await writeAuditLog(runner, {
      actorId: 'user-1',
      action: 'weapons.inventory_recorded',
      entityType: 'weapon_inventory_checks',
      entityId: 'ic-1',
      details: {},
    });

    const params = (runner.query.mock.calls as unknown[][])[0][1] as unknown[];
    expect(params.slice(5)).toEqual([null, null]);
  });

  it('propagates a failed insert so the decision it records is rolled back too', async () => {
    runner.query.mockRejectedValueOnce(new Error('audit table missing'));

    await expect(
      writeAuditLog(runner, {
        actorId: 'user-1',
        action: 'reward.issued',
        entityType: 'reward_decisions',
        entityId: 'rd-1',
        details: {},
      }),
    ).rejects.toThrow('audit table missing');
  });
});
