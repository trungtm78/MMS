import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import {
  AUTH_REVOCATION_CHANNEL,
  AuthRevocationFeed,
  type AuthRevocation,
  type ListenerConnection,
} from './auth-revocation-feed';

const USER = '11111111-1111-4111-8111-111111111111';
const SID = '5d0c7a3e-9f1b-4c2d-8e6f-1a2b3c4d5e6f';

// A pg.Client reduced to what the feed uses; `fail` makes the next connect reject
class FakeConnection extends EventEmitter implements ListenerConnection {
  static failNext = 0;
  readonly queries: string[] = [];
  ended = false;

  connect(): Promise<void> {
    if (FakeConnection.failNext > 0) {
      FakeConnection.failNext -= 1;
      return Promise.reject(new Error('connection refused'));
    }
    return Promise.resolve();
  }

  query(sql: string): Promise<unknown> {
    this.queries.push(sql);
    return Promise.resolve([]);
  }

  end(): Promise<void> {
    this.ended = true;
    return Promise.resolve();
  }

  notify(payload: string, channel = AUTH_REVOCATION_CHANNEL) {
    this.emit('notification', { channel, payload });
  }
}

// Lets the promise chains of connecting and listening settle
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('AuthRevocationFeed', () => {
  let connections: FakeConnection[];
  let feed: AuthRevocationFeed;
  let revoked: AuthRevocation[];
  let resyncs: number;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    FakeConnection.failNext = 0;
    connections = [];
    revoked = [];
    resyncs = 0;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    feed = new AuthRevocationFeed(() => {
      const connection = new FakeConnection();
      connections.push(connection);
      return connection;
    });
    feed.subscribe({
      revoked: (event) => revoked.push(event),
      resync: () => {
        resyncs += 1;
      },
    });
  });

  afterEach(async () => {
    await feed.onApplicationShutdown();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('listens on the revocation channel once the application starts', async () => {
    await feed.onApplicationBootstrap();

    expect(connections).toHaveLength(1);
    expect(connections[0].queries).toEqual([
      `LISTEN ${AUTH_REVOCATION_CHANNEL}`,
    ]);
  });

  it('hands ended sessions and changed accounts to every subscriber', async () => {
    const other: AuthRevocation[] = [];
    feed.subscribe({ revoked: (event) => other.push(event), resync: () => {} });
    await feed.onApplicationBootstrap();

    connections[0].notify(
      JSON.stringify({ kind: 'session', userId: USER, sessionId: SID }),
    );
    connections[0].notify(
      JSON.stringify({
        kind: 'account',
        userId: USER,
        version: '7',
        active: false,
      }),
    );

    const expected = [
      { kind: 'session', userId: USER, sessionId: SID },
      { kind: 'account', userId: USER, version: 7, active: false },
    ];
    expect(revoked).toEqual(expected);
    expect(other).toEqual(expected);
  });

  it.each([
    ['not JSON', 'nope'],
    ['an unknown kind', JSON.stringify({ kind: 'x', userId: USER })],
    [
      'a session without an id',
      JSON.stringify({ kind: 'session', userId: USER }),
    ],
    [
      'a user id that is not a UUID',
      JSON.stringify({ kind: 'session', userId: 'u', sessionId: SID }),
    ],
    [
      'an account without a version',
      JSON.stringify({ kind: 'account', userId: USER, active: true }),
    ],
  ])('ignores a payload that is %s, saying so', async (_label, payload) => {
    await feed.onApplicationBootstrap();

    connections[0].notify(payload);

    expect(revoked).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignored an auth revocation notification'),
    );
  });

  it('ignores notifications of other channels', async () => {
    await feed.onApplicationBootstrap();

    connections[0].notify(
      JSON.stringify({ kind: 'session', userId: USER, sessionId: SID }),
      'other_channel',
    );

    expect(revoked).toEqual([]);
  });

  it('a subscriber that throws does not keep the event from the others', async () => {
    const other: AuthRevocation[] = [];
    feed.subscribe({
      revoked: () => {
        throw new Error('boom');
      },
      resync: () => {},
    });
    feed.subscribe({ revoked: (event) => other.push(event), resync: () => {} });
    await feed.onApplicationBootstrap();

    connections[0].notify(
      JSON.stringify({ kind: 'session', userId: USER, sessionId: SID }),
    );

    expect(other).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  // Notifications sent while the connection was down are lost: subscribers re-check
  // everything they hold once it is back
  it('reconnects after losing the connection, listens again and asks for a resync', async () => {
    await feed.onApplicationBootstrap();
    const before = resyncs;

    connections[0].emit('error', new Error('terminating connection'));
    connections[0].emit('end');
    await settle();
    expect(connections).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('terminating connection'),
    );

    await jest.advanceTimersByTimeAsync(1_000);
    await settle();

    expect(connections).toHaveLength(2);
    expect(connections[0].ended).toBe(true);
    expect(connections[1].queries).toEqual([
      `LISTEN ${AUTH_REVOCATION_CHANNEL}`,
    ]);
    expect(resyncs).toBe(before + 1);
    connections[1].notify(
      JSON.stringify({ kind: 'session', userId: USER, sessionId: SID }),
    );
    expect(revoked).toHaveLength(1);
  });

  it('keeps the application starting when the database is unreachable, retrying with backoff', async () => {
    FakeConnection.failNext = 2;

    await expect(feed.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(connections).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(connections).toHaveLength(2);
    // The second failure waits longer
    await jest.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(connections).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(connections).toHaveLength(3);
    expect(connections[2].queries).toEqual([
      `LISTEN ${AUTH_REVOCATION_CHANNEL}`,
    ]);
  });

  it('stops listening at shutdown and does not reconnect', async () => {
    await feed.onApplicationBootstrap();

    await feed.onApplicationShutdown();
    connections[0].emit('end');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(connections).toHaveLength(1);
    expect(connections[0].ended).toBe(true);
  });

  it('stops delivering to a subscriber that unsubscribed', async () => {
    const other: AuthRevocation[] = [];
    const unsubscribe = feed.subscribe({
      revoked: (event) => other.push(event),
      resync: () => {},
    });
    await feed.onApplicationBootstrap();

    unsubscribe();
    connections[0].notify(
      JSON.stringify({ kind: 'session', userId: USER, sessionId: SID }),
    );

    expect(other).toEqual([]);
    expect(revoked).toHaveLength(1);
  });
});
