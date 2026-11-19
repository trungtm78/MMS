import { RecentRevocations, revocationEnds } from './recent-revocations';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SID = '5d0c7a3e-9f1b-4c2d-8e6f-1a2b3c4d5e6f';
const SID2 = '6e1d8b4f-0a2c-4d3e-9f70-2b3c4d5e6f70';

describe('revocationEnds', () => {
  const claims = { sub: USER, sid: SID, ver: 3 };

  it('ends the session named, and no other', () => {
    expect(
      revocationEnds({ kind: 'session', userId: USER, sessionId: SID }, claims),
    ).toBe(true);
    expect(
      revocationEnds(
        { kind: 'session', userId: USER, sessionId: SID2 },
        claims,
      ),
    ).toBe(false);
  });

  it('ends tokens of another account version, and every token of an inactive account', () => {
    const account = (version: number, active: boolean) =>
      ({ kind: 'account', userId: USER, version, active }) as const;

    expect(revocationEnds(account(4, true), claims)).toBe(true);
    expect(revocationEnds(account(3, true), claims)).toBe(false);
    expect(revocationEnds(account(3, false), claims)).toBe(true);
  });

  it('does not end a session of another tenant than the announcement names', () => {
    const T1 = 'a1000000-0000-4000-8000-000000000001';
    const T2 = 'b2000000-0000-4000-8000-000000000002';
    const event = {
      kind: 'account' as const,
      userId: USER,
      version: 9,
      active: false,
      tenantId: T1,
    };

    expect(revocationEnds(event, { sub: USER, ver: 1, tid: T2 })).toBe(false);
    expect(revocationEnds(event, { sub: USER, ver: 1, tid: T1 })).toBe(true);
    expect(
      revocationEnds(event, { sub: USER, ver: 1, tid: T1.toUpperCase() }),
    ).toBe(true);
    expect(revocationEnds(event, { sub: USER, ver: 1 })).toBe(true);
  });

  it("never ends another user's token", () => {
    expect(
      revocationEnds(
        { kind: 'session', userId: OTHER, sessionId: SID },
        claims,
      ),
    ).toBe(false);
    expect(
      revocationEnds(
        { kind: 'account', userId: OTHER, version: 9, active: false },
        claims,
      ),
    ).toBe(false);
  });
});

describe('RecentRevocations', () => {
  let now: number;
  let recent: RecentRevocations;

  beforeEach(() => {
    now = 1_000_000;
    recent = new RecentRevocations(60_000, () => now);
  });

  it('remembers an ended session and the latest change of an account for the TTL', () => {
    recent.record({ kind: 'session', userId: USER, sessionId: SID });
    recent.record({ kind: 'account', userId: OTHER, version: 5, active: true });
    recent.record({ kind: 'account', userId: OTHER, version: 6, active: true });

    expect(recent.ends({ sub: USER, sid: SID, ver: 1 })).toBe(true);
    expect(recent.ends({ sub: USER, sid: SID2, ver: 1 })).toBe(false);
    expect(recent.ends({ sub: OTHER, sid: SID2, ver: 5 })).toBe(true);
    expect(recent.ends({ sub: OTHER, sid: SID2, ver: 6 })).toBe(false);

    now += 60_001;
    expect(recent.ends({ sub: USER, sid: SID, ver: 1 })).toBe(false);
    expect(recent.ends({ sub: OTHER, sid: SID2, ver: 5 })).toBe(false);
  });

  it('drops what has expired when recording', () => {
    recent.record({ kind: 'session', userId: USER, sessionId: SID });
    recent.record({ kind: 'account', userId: OTHER, version: 5, active: true });
    now += 60_001;
    recent.record({ kind: 'session', userId: USER, sessionId: SID2 });

    const internals = recent as unknown as {
      sessions: Map<string, number>;
      accounts: Map<string, unknown>;
    };
    expect([...internals.sessions.keys()]).toEqual([SID2]);
    expect(internals.accounts.size).toBe(0);
  });

  it('ignores a token without a session id for session revocations', () => {
    recent.record({ kind: 'session', userId: USER, sessionId: SID });

    expect(recent.ends({ sub: USER })).toBe(false);
  });
});
