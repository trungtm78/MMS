import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { ChatService } from '../chat/chat.service';
import { NotificationsGateway } from './notifications.gateway';
import { rooms } from './rooms';
import { TenantContext } from '../database/tenancy/tenant-context';
import { AuthStateService } from '../auth/auth-state.service';
import {
  AuthRevocationFeed,
  type AuthRevocationSubscriber,
} from '../auth/auth-revocation-feed';

const CONV_ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';
const TID_A = '11111111-1111-4111-8111-111111111111';
const TID_B = '22222222-2222-4222-8222-222222222222';
// An id with letters, so its upper-case form differs from the lower-case one
const TID_C = 'abcdef12-3333-4333-8333-333333333333';

const chatService = {
  isMember: jest.fn(),
  saveMessage: jest.fn(),
  markRead: jest.fn(),
};
const jwtVerify = jest.fn();
const configGet = jest.fn();
const emit = jest.fn();
const authState = { isAccessValid: jest.fn(), validAccess: jest.fn() };
const unsubscribe = jest.fn();
const revocationFeed = { subscribe: jest.fn() };

function socket(sub?: string, tid?: string) {
  return {
    data: { user: sub ? { sub, tid } : undefined },
    join: jest.fn(),
  } as unknown as Socket & { join: jest.Mock };
}

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let to: jest.Mock;

  // Only the tests that name it run under enforced tenancy
  afterEach(() => delete process.env.TENANCY_MODE);

  beforeEach(async () => {
    jest.resetAllMocks();
    configGet.mockReturnValue('jwt-secret');
    authState.isAccessValid.mockResolvedValue(true);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        { provide: JwtService, useValue: { verify: jwtVerify } },
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: ChatService, useValue: chatService },
        { provide: AuthStateService, useValue: authState },
        { provide: AuthRevocationFeed, useValue: revocationFeed },
      ],
    }).compile();
    revocationFeed.subscribe.mockReturnValue(unsubscribe);
    gateway = module.get(NotificationsGateway);
    to = jest.fn(() => ({ emit }));
    gateway.server = { to } as unknown as Server;
  });

  // The token is verified once, in the Socket.IO handshake. A refused client gets a
  // connect_error whose message says why (Flutter agent: sockets were accepted and then
  // dropped without a reason, so clients could not tell a dead session from a network fault)
  describe('handshake authentication', () => {
    type Next = (error?: Error) => void;
    const ACCESS_CLAIMS = {
      sub: 'u1',
      unitScope: 'KV1',
      typ: 'access',
      sid: 'session-1',
      ver: 2,
    };
    const handshaking = (
      auth: Record<string, unknown> = {},
      headers: Record<string, string> = {},
    ) => ({ handshake: { auth, headers }, data: {} }) as unknown as Socket;
    const userOf = (client: Socket) => (client.data as { user?: unknown }).user;

    const authenticate = (client: Socket) => {
      const use = jest.fn();
      gateway.afterInit({ use } as unknown as Server);
      const [[middleware]] = use.mock.calls as [
        [(socket: Socket, next: Next) => void],
      ];
      return new Promise<Error | undefined>((resolve) =>
        middleware(client, resolve),
      );
    };

    it('refuses a handshake without a token', async () => {
      const client = handshaking();

      const error = await authenticate(client);

      expect(error?.message).toBe('missing_token');
      expect(userOf(client)).toBeUndefined();
    });

    it('refuses a token that does not verify', async () => {
      jwtVerify.mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });

      const error = await authenticate(handshaking({ token: 'forged' }));

      expect(error?.message).toBe('invalid_token');
    });

    // Same rule as JwtAuthGuard: refresh tokens and tokens without a type open nothing
    it.each([
      ['without a token type', { sub: 'u1', unitScope: 'KV1' }],
      ['of another type', { sub: 'u1', unitScope: 'KV1', typ: 'refresh' }],
    ])('refuses a token %s', async (_label, claims) => {
      jwtVerify.mockReturnValueOnce(claims);

      const error = await authenticate(
        handshaking({ token: 'not-an-access-token' }),
      );

      expect(error?.message).toBe('invalid_token');
      expect(authState.isAccessValid).not.toHaveBeenCalled();
    });

    // Codex round 3: a suspended, demoted or reset account could still open a socket
    it('refuses a token whose session was revoked or whose account changed', async () => {
      jwtVerify.mockReturnValueOnce(ACCESS_CLAIMS);
      authState.isAccessValid.mockResolvedValueOnce(false);
      const client = handshaking({ token: 'revoked-token' });

      const error = await authenticate(client);

      expect(error?.message).toBe('session_revoked');
      expect(userOf(client)).toBeUndefined();
    });

    it('refuses without revealing internals when the session cannot be checked', async () => {
      jwtVerify.mockReturnValueOnce(ACCESS_CLAIMS);
      authState.isAccessValid.mockRejectedValueOnce(
        new Error('connection terminated'),
      );
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const error = await authenticate(handshaking({ token: 'good-token' }));

      expect(error?.message).toBe('authentication_unavailable');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('connection terminated'),
      );
      warn.mockRestore();
    });

    it('accepts an access token sent in the Authorization header', async () => {
      jwtVerify.mockReturnValueOnce(ACCESS_CLAIMS);
      const client = handshaking({}, { authorization: 'Bearer good-token' });

      await expect(authenticate(client)).resolves.toBeUndefined();

      expect(jwtVerify).toHaveBeenCalledWith('good-token', {
        secret: 'jwt-secret',
      });
      expect(authState.isAccessValid).toHaveBeenCalledWith(ACCESS_CLAIMS);
      expect(userOf(client)).toEqual(ACCESS_CLAIMS);
    });

    it('prefers the token of the auth payload over the Authorization header', async () => {
      jwtVerify.mockReturnValueOnce(ACCESS_CLAIMS);

      await authenticate(
        handshaking(
          { token: 'from-auth' },
          { authorization: 'Bearer from-header' },
        ),
      );

      expect(jwtVerify).toHaveBeenCalledWith('from-auth', {
        secret: 'jwt-secret',
      });
    });

    // users is under Row-Level Security: the session is read under the tenant of the token
    describe('under enforced tenancy', () => {
      beforeEach(() => {
        process.env.TENANCY_MODE = 'enforced';
      });

      it('checks the session under the tenant of the token', async () => {
        const claims = { ...ACCESS_CLAIMS, tid: TID_A };
        jwtVerify.mockReturnValueOnce(claims);
        const scopes: Array<string | undefined> = [];
        authState.isAccessValid.mockImplementationOnce(() => {
          scopes.push(TenantContext.current()?.tenantId);
          return Promise.resolve(true);
        });
        const client = handshaking({ token: 'good-token' });

        await expect(authenticate(client)).resolves.toBeUndefined();

        expect(scopes).toEqual([TID_A]);
        expect(userOf(client)).toEqual(claims);
        // The scope ends with the check: nothing leaks into the connection
        expect(TenantContext.current()).toBeUndefined();
      });

      it.each([
        ['without a tenant', ACCESS_CLAIMS],
        ['with a tenant that is not an id', { ...ACCESS_CLAIMS, tid: 'x' }],
      ])('refuses a token %s', async (_label, claims) => {
        jwtVerify.mockReturnValueOnce(claims);
        const client = handshaking({ token: 'no-tenant' });

        const error = await authenticate(client);

        expect(error?.message).toBe('invalid_token');
        expect(authState.isAccessValid).not.toHaveBeenCalled();
        expect(userOf(client)).toBeUndefined();
      });

      it('still reports a session that cannot be checked as unavailable', async () => {
        jwtVerify.mockReturnValueOnce({ ...ACCESS_CLAIMS, tid: TID_A });
        authState.isAccessValid.mockRejectedValueOnce(new Error('db down'));
        const warn = jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);

        const error = await authenticate(handshaking({ token: 'good-token' }));

        expect(error?.message).toBe('authentication_unavailable');
        warn.mockRestore();
      });
    });
  });

  describe('connection', () => {
    const connected = (user?: Record<string, unknown>) =>
      ({
        id: 'socket-1',
        data: { user },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      }) as unknown as Socket & { join: jest.Mock; disconnect: jest.Mock };

    it('joins the user and unit rooms of the authenticated socket', () => {
      const client = connected({ sub: 'u1', unitScope: 'KV1', typ: 'access' });

      gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith(rooms.user(undefined, 'u1'));
      expect(client.join).toHaveBeenCalledWith(rooms.unit(undefined, 'KV1'));
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    // What used to reach everyone (the system-wide broadcast) still reaches everyone connected
    it('joins every legacy socket to the one tenant room', () => {
      const client = connected({ sub: 'u1', typ: 'access', role: 'dqtv' });

      gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith(rooms.tenant(undefined));
      expect(rooms.tenant(undefined)).toBe('t:legacy');
    });

    // The room namespace of a mode is fixed by the mode, not by a leftover claim
    it('ignores the tenant claim of a token in legacy mode', () => {
      const client = connected({
        sub: 'u1',
        typ: 'access',
        role: 'dqtv',
        tid: TID_A,
      });

      gateway.handleConnection(client);

      expect(client.join.mock.calls.map(([room]) => String(room))).toEqual([
        rooms.tenant(undefined),
        rooms.user(undefined, 'u1'),
      ]);
    });

    it('joins a socket only to the rooms of its own tenant under enforced tenancy', () => {
      process.env.TENANCY_MODE = 'enforced';
      const client = connected({
        sub: 'u1',
        typ: 'access',
        role: 'police_area',
        unitScope: 'KV1',
        tid: TID_A,
      });

      gateway.handleConnection(client);

      expect(client.join.mock.calls.map(([room]) => String(room))).toEqual([
        rooms.tenant(TID_A),
        rooms.user(TID_A, 'u1'),
        rooms.unit(TID_A, 'KV1'),
        rooms.gpsUnit(TID_A, 'KV1'),
      ]);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects a socket whose token names no valid tenant under enforced mode', () => {
      process.env.TENANCY_MODE = 'enforced';
      const client = connected({
        sub: 'u1',
        typ: 'access',
        role: 'dqtv',
        tid: 'not-a-uuid',
      });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects a socket whose token names no tenant at all under enforced mode', () => {
      process.env.TENANCY_MODE = 'enforced';
      const client = connected({ sub: 'u1', typ: 'access', role: 'dqtv' });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    // TenantContext keeps tenant ids in lower case, and every emitter names its rooms from
    // it: a token with the same id in upper case must join the same rooms
    it('joins the lower-case rooms of a token whose tenant id is in upper case', () => {
      process.env.TENANCY_MODE = 'enforced';
      const client = connected({
        sub: 'u1',
        typ: 'access',
        role: 'police_area',
        unitScope: 'KV1',
        tid: TID_C.toUpperCase(),
      });

      gateway.handleConnection(client);

      expect(client.join.mock.calls.map(([room]) => String(room))).toEqual([
        rooms.tenant(TID_C),
        rooms.user(TID_C, 'u1'),
        rooms.unit(TID_C, 'KV1'),
        rooms.gpsUnit(TID_C, 'KV1'),
      ]);
    });

    it('emits nothing, and says so, before the server exists', () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        gateway.server = undefined as unknown as Server;

        expect(() => gateway.emitToTenant('x', {})).not.toThrow();
        expect(() => gateway.emitToGpsAudience('KV1', [], {})).not.toThrow();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('before the socket server'),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('disconnects a socket that reached it without authentication', () => {
      const client = connected();

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    // T31: members share unit:<code> rooms, so positions travel in staff-only GPS rooms
    it.each([
      [
        'unit staff',
        { role: 'police_area', unitScope: 'KV1' },
        rooms.gpsUnit(undefined, 'KV1'),
      ],
      [
        'CA area staff',
        { role: 'ca_area', unitScope: 'KV2' },
        rooms.gpsUnit(undefined, 'KV2'),
      ],
      [
        'ward-wide staff',
        { role: 'police_ward', unitScope: null },
        rooms.gpsWard(undefined),
      ],
      // The unit grant of a ward-level role without a unit scope is the whole ward
      [
        'ward CA staff without a unit',
        { role: 'ca_ward', unitScope: null },
        rooms.gpsWard(undefined),
      ],
      [
        'administrators',
        { role: 'system_admin', unitScope: 'KV1' },
        rooms.gpsWard(undefined),
      ],
      // Every role held counts: a unit role beside ca_officer joins the unit's room, and
      // the positions of the assigned DQTV still reach the user room
      [
        'police_area with ca_officer (primary police_area)',
        {
          role: 'police_area',
          roles: ['police_area', 'ca_officer'],
          unitScope: 'KV1',
        },
        rooms.gpsUnit(undefined, 'KV1'),
      ],
      [
        'police_area with ca_officer (primary ca_officer)',
        {
          role: 'ca_officer',
          roles: ['police_area', 'ca_officer'],
          unitScope: 'KV1',
        },
        rooms.gpsUnit(undefined, 'KV1'),
      ],
    ])('joins %s to the GPS room of their scope', (_label, claims, room) => {
      const client = connected({ sub: 'u1', typ: 'access', ...claims });

      gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith(room);
    });

    it.each([
      ['a member', { role: 'dqtv', unitScope: 'KV1' }],
      // CA officers see only their assigned DQTV: positions reach them in user:<id>
      ['a CA officer', { role: 'ca_officer', unitScope: 'KV1' }],
      // effectiveUnit refuses an area role without a scope instead of giving it the ward
      [
        'an area role without a unit scope',
        { role: 'police_area', unitScope: null },
      ],
    ])('joins %s to no GPS room', (_label, claims) => {
      const client = connected({ sub: 'u1', typ: 'access', ...claims });

      gateway.handleConnection(client);

      const joinedRooms = client.join.mock.calls.map(([room]) => String(room));
      expect(joinedRooms.filter((room) => room.includes(':gps:'))).toEqual([]);
    });
  });

  // A socket stays in user:, unit: and GPS rooms after connecting, receiving what the server
  // pushes without emitting anything: it is closed when its token expires and as soon as its
  // session ends, not only when it next emits an event
  describe('server-side session end', () => {
    const USER = '11111111-1111-4111-8111-111111111111';
    const SID = '5d0c7a3e-9f1b-4c2d-8e6f-1a2b3c4d5e6f';
    const OTHER_SID = '6e1d8b4f-0a2c-4d3e-9f70-2b3c4d5e6f70';
    const NOW_S = Math.floor(Date.UTC(2026, 10, 18, 3, 0, 0) / 1000);

    type FakeSocket = Socket & {
      join: jest.Mock;
      emit: jest.Mock;
      disconnect: jest.Mock;
    };
    let sequence = 0;
    const live = (claims: Record<string, unknown> = {}): FakeSocket =>
      ({
        id: `socket-${++sequence}`,
        data: {
          user: {
            sub: USER,
            role: 'police_area',
            unitScope: 'KV1',
            typ: 'access',
            sid: SID,
            ver: 3,
            exp: NOW_S + 900,
            ...claims,
          },
        },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      }) as unknown as FakeSocket;

    // The sockets this replica holds
    let localSockets: FakeSocket[];
    let subscriber: AuthRevocationSubscriber;

    const notTold = (client: FakeSocket) => {
      expect(client.emit).not.toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    };
    const flush = async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW_S * 1000 });
      localSockets = [];
      gateway.server = {
        to,
        local: { fetchSockets: () => Promise.resolve(localSockets) },
      } as unknown as Server;
      gateway.afterInit({ use: jest.fn() } as unknown as Server);
      [[subscriber]] = revocationFeed.subscribe.mock.calls as [
        [AuthRevocationSubscriber],
      ];
    });

    afterEach(() => {
      gateway.onModuleDestroy();
      jest.useRealTimers();
    });

    it('subscribes to the revocation feed once initialised, and stops on shutdown', () => {
      expect(revocationFeed.subscribe).toHaveBeenCalledTimes(1);

      gateway.onModuleDestroy();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    describe('token expiry', () => {
      it('closes the socket when its access token expires, saying why', async () => {
        const client = live({ exp: NOW_S + 60 });
        gateway.handleConnection(client);

        await jest.advanceTimersByTimeAsync(59_000);
        notTold(client);
        await jest.advanceTimersByTimeAsync(1_000);

        toldBeforeDisconnect(client, 'token_expired');
      });

      it('closes at once a socket whose token expired before it connected', () => {
        const client = live({ exp: NOW_S });

        gateway.handleConnection(client);

        toldBeforeDisconnect(client, 'token_expired');
      });

      it('forgets the timer of a socket that disconnected', async () => {
        const client = live({ exp: NOW_S + 60 });
        gateway.handleConnection(client);

        gateway.handleDisconnect(client);
        await jest.advanceTimersByTimeAsync(120_000);

        notTold(client);
        expect(jest.getTimerCount()).toBe(0);
      });

      // setTimeout cannot wait longer than about 24.8 days
      it('waits out a lifetime longer than one timer can', async () => {
        const days30 = 30 * 86_400;
        const client = live({ exp: NOW_S + days30 });
        gateway.handleConnection(client);

        await jest.advanceTimersByTimeAsync(25 * 86_400_000);
        notTold(client);
        await jest.advanceTimersByTimeAsync(5 * 86_400_000);

        toldBeforeDisconnect(client, 'token_expired');
      });
    });

    describe('revocation', () => {
      // An announcement without a tenant (a trigger older than 039): the user's sockets are
      // found among all the sockets of the replica, whatever tenant they belong to
      it('closes only the sockets of the session that ended, among all the sockets of the replica', async () => {
        const ended = live();
        const sameUserOtherSession = live({ sid: OTHER_SID });
        const otherUser = live({ sub: '22222222-2222-4222-8222-222222222222' });
        localSockets = [ended, sameUserOtherSession, otherUser];

        subscriber.revoked({ kind: 'session', userId: USER, sessionId: SID });
        await flush();

        toldBeforeDisconnect(ended, 'session_revoked');
        notTold(sameUserOtherSession);
        notTold(otherUser);
      });

      // Without a tenant in the announcement, the user's sockets are found whatever tenant
      // they were opened under
      it('closes the sockets of the session that ended under enforced tenancy', async () => {
        process.env.TENANCY_MODE = 'enforced';
        const ended = live({ tid: TID_A });
        const otherTenant = live({
          tid: TID_B,
          sub: '22222222-2222-4222-8222-222222222222',
          sid: OTHER_SID,
        });
        localSockets = [otherTenant, ended];

        subscriber.revoked({ kind: 'session', userId: USER, sessionId: SID });
        await flush();

        toldBeforeDisconnect(ended, 'session_revoked');
        notTold(otherTenant);
      });

      // The announcement names the tenant (migration 039): only that user's room of that
      // tenant is looked at, never every socket of the replica
      describe.each([
        ['legacy', undefined],
        ['enforced', TID_A],
      ])('in %s mode', (mode, roomTenant) => {
        beforeEach(() => {
          if (mode === 'enforced') process.env.TENANCY_MODE = 'enforced';
        });

        it('looks only at the user room of the tenant the announcement names', async () => {
          const inRoom = live({ tid: TID_A });
          const elsewhere = live({ sid: OTHER_SID, tid: TID_A });
          const roomOf = jest.fn(() => ({
            fetchSockets: () => Promise.resolve([inRoom]),
          }));
          gateway.server = {
            to,
            local: {
              fetchSockets: () => Promise.resolve([inRoom, elsewhere]),
              in: roomOf,
            },
          } as unknown as Server;

          subscriber.revoked({
            kind: 'account',
            userId: USER,
            version: 99,
            active: false,
            tenantId: TID_A,
          });
          await flush();

          expect(roomOf).toHaveBeenCalledWith(rooms.user(roomTenant, USER));
          toldBeforeDisconnect(inRoom, 'session_revoked');
          notTold(elsewhere);
        });
      });

      it('names the user room in lower case whatever case the announcement had', async () => {
        process.env.TENANCY_MODE = 'enforced';
        const roomOf = jest.fn(() => ({
          fetchSockets: () => Promise.resolve([]),
        }));
        gateway.server = {
          to,
          local: { fetchSockets: () => Promise.resolve([]), in: roomOf },
        } as unknown as Server;

        subscriber.revoked({
          kind: 'session',
          userId: USER,
          sessionId: SID,
          tenantId: TID_C.toUpperCase(),
        });
        await flush();

        expect(roomOf).toHaveBeenCalledWith(rooms.user(TID_C, USER));
      });

      it('closes the sockets of tokens issued before the account changed', async () => {
        const before = live({ ver: 3 });
        const after = live({ sid: OTHER_SID, ver: 4 });
        localSockets = [before, after];

        subscriber.revoked({
          kind: 'account',
          userId: USER,
          version: 4,
          active: true,
        });
        await flush();

        toldBeforeDisconnect(before, 'session_revoked');
        notTold(after);
      });

      it('closes every socket of an account that is no longer active', async () => {
        const sockets = [live({ ver: 4 }), live({ sid: OTHER_SID, ver: 4 })];
        localSockets = sockets;

        subscriber.revoked({
          kind: 'account',
          userId: USER,
          version: 4,
          active: false,
        });
        await flush();

        sockets.forEach((client) =>
          toldBeforeDisconnect(client, 'session_revoked'),
        );
      });

      // The handshake may have read the session just before the change committed: a socket
      // connecting after the notification arrived is closed as it connects
      it('closes a socket that connects just after its session ended', async () => {
        subscriber.revoked({ kind: 'session', userId: USER, sessionId: SID });
        subscriber.revoked({
          kind: 'account',
          userId: '22222222-2222-4222-8222-222222222222',
          version: 9,
          active: true,
        });
        await flush();
        const late = live();
        const lateOldVersion = live({
          sub: '22222222-2222-4222-8222-222222222222',
          ver: 8,
        });
        const unaffected = live({ sid: OTHER_SID });

        for (const client of [late, lateOldVersion, unaffected]) {
          gateway.handleConnection(client);
        }

        toldBeforeDisconnect(late, 'session_revoked');
        expect(late.join).not.toHaveBeenCalled();
        toldBeforeDisconnect(lateOldVersion, 'session_revoked');
        notTold(unaffected);
        expect(unaffected.join).toHaveBeenCalledWith(
          rooms.user(undefined, USER),
        );
      });

      it('forgets ended sessions after a while', async () => {
        subscriber.revoked({ kind: 'session', userId: USER, sessionId: SID });
        await flush();
        await jest.advanceTimersByTimeAsync(10 * 60_000);
        // Recording another revocation sweeps the expired ones
        subscriber.revoked({
          kind: 'session',
          userId: USER,
          sessionId: OTHER_SID,
        });
        await flush();
        const client = live({ exp: NOW_S + 3_600 });

        gateway.handleConnection(client);

        notTold(client);
      });

      it('logs instead of failing when the sockets cannot be looked up', async () => {
        const warn = jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        gateway.server = {
          local: {
            fetchSockets: () => Promise.reject(new Error('adapter down')),
          },
        } as unknown as Server;

        subscriber.revoked({ kind: 'session', userId: USER, sessionId: SID });
        await flush();

        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('adapter down'),
        );
        warn.mockRestore();
      });
    });

    // Notifications sent while the feed was disconnected are lost: every socket is re-checked
    describe('resync', () => {
      it('re-checks every socket of the replica in one batch and closes those whose session ended', async () => {
        const kept = live();
        const ended = live({ sid: OTHER_SID });
        localSockets = [kept, ended];
        authState.validAccess.mockResolvedValueOnce([true, false]);

        subscriber.resync();
        await flush();

        const claimsOf = (client: FakeSocket) =>
          (client.data as { user: Record<string, unknown> }).user;
        expect(authState.validAccess).toHaveBeenCalledWith([
          claimsOf(kept),
          claimsOf(ended),
        ]);
        notTold(kept);
        toldBeforeDisconnect(ended, 'session_revoked');
      });

      // users is under Row-Level Security: each tenant's sockets are checked under its scope
      describe('under enforced tenancy', () => {
        const claimsOf = (client: FakeSocket) =>
          (client.data as { user: Record<string, unknown> }).user;
        // The sockets of the session OTHER_SID have ended
        const stillValid = (claims: Array<Record<string, unknown>>) =>
          claims.map((claim) => claim['sid'] !== OTHER_SID);

        beforeEach(() => {
          process.env.TENANCY_MODE = 'enforced';
        });

        it('re-checks the sockets once per tenant, each batch under its own tenant', async () => {
          const a1 = live({ tid: TID_A });
          const b2 = live({ tid: TID_B, sid: OTHER_SID });
          const a2 = live({ tid: TID_A, sid: OTHER_SID });
          const b1 = live({ tid: TID_B });
          localSockets = [a1, b2, a2, b1];
          const batches: Array<{ tenant?: string; claims: unknown[] }> = [];
          authState.validAccess.mockImplementation(
            (claims: Array<Record<string, unknown>>) => {
              batches.push({
                tenant: TenantContext.current()?.tenantId,
                claims,
              });
              return Promise.resolve(stillValid(claims));
            },
          );

          subscriber.resync();
          await flush();

          expect(batches).toEqual([
            { tenant: TID_A, claims: [claimsOf(a1), claimsOf(a2)] },
            { tenant: TID_B, claims: [claimsOf(b2), claimsOf(b1)] },
          ]);
          notTold(a1);
          notTold(b1);
          toldBeforeDisconnect(a2, 'session_revoked');
          toldBeforeDisconnect(b2, 'session_revoked');
        });

        // One tenant whose sessions cannot be read must not leave the others unchecked
        it('still checks the other tenants when one cannot be checked, and logs', async () => {
          const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
          const broken = live({ tid: TID_A });
          const ended = live({ tid: TID_B, sid: OTHER_SID });
          localSockets = [broken, ended];
          authState.validAccess.mockImplementation(
            (claims: Array<Record<string, unknown>>) =>
              claims.some((claim) => claim['tid'] === TID_A)
                ? Promise.reject(new Error('tenant a down'))
                : Promise.resolve(stillValid(claims)),
          );

          subscriber.resync();
          await flush();

          notTold(broken);
          toldBeforeDisconnect(ended, 'session_revoked');
          expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('tenant a down'),
          );
          warn.mockRestore();
        });
      });

      it('does not query when the replica holds no socket', async () => {
        subscriber.resync();
        await flush();

        expect(authState.validAccess).not.toHaveBeenCalled();
      });

      it('keeps the sockets and logs when the sessions cannot be checked', async () => {
        const warn = jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const client = live();
        localSockets = [client];
        authState.validAccess.mockRejectedValueOnce(new Error('db down'));

        subscriber.resync();
        await flush();

        notTold(client);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('db down'));
        warn.mockRestore();
      });
    });
  });

  // One emit over several rooms: a socket in more than one of them receives the event once
  describe('emitToRooms', () => {
    it('sends the event once to every socket in any of the rooms', () => {
      const targets = [rooms.gpsWard(undefined), rooms.user(undefined, 'ca-1')];

      gateway.emitToRooms(targets, 'gps:update', { id: 'm1' });

      expect(to).toHaveBeenCalledWith(targets);
      expect(emit).toHaveBeenCalledWith('gps:update', { id: 'm1' });
    });

    it('sends nothing without rooms', () => {
      gateway.emitToRooms([], 'gps:update', { id: 'm1' });

      expect(to).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });
  });

  // Emitters address the tenant of the current scope (the request or job that emits)
  describe('tenant-scoped emitters', () => {
    const inTenant = <T>(tenantId: string, fn: () => T) =>
      TenantContext.runAs({ tenantId }, fn);

    it.each([
      [
        'emitToUnit',
        (tenantId: string) => rooms.unit(tenantId, 'KV1'),
        () => gateway.emitToUnit('KV1', 'probe', { n: 1 }),
      ],
      [
        'emitToUser',
        (tenantId: string) => rooms.user(tenantId, 'u1'),
        () => gateway.emitToUser('u1', 'probe', { n: 1 }),
      ],
      [
        'emitToConversation',
        (tenantId: string) => rooms.conversation(tenantId, CONV_ID),
        () => gateway.emitToConversation(CONV_ID, 'probe', { n: 1 }),
      ],
      [
        'emitToTenant',
        (tenantId: string) => rooms.tenant(tenantId),
        () => gateway.emitToTenant('probe', { n: 1 }),
      ],
    ])(
      '%s emits to the room of the tenant it runs under',
      (_name, roomOf, emitNow) => {
        inTenant(TID_A, emitNow);
        inTenant(TID_B, emitNow);

        expect(to.mock.calls).toEqual([[roomOf(TID_A)], [roomOf(TID_B)]]);
        expect(emit).toHaveBeenCalledTimes(2);
        expect(emit).toHaveBeenCalledWith('probe', { n: 1 });
      },
    );

    it('addresses the legacy namespace outside any tenant scope', () => {
      gateway.emitToUnit('KV1', 'probe', {});
      gateway.emitToTenant('probe', {});

      expect(to.mock.calls).toEqual([
        [rooms.unit(undefined, 'KV1')],
        [rooms.tenant(undefined)],
      ]);
    });

    // Every socket of an enforced deployment is in the rooms of a tenant: an emit that names
    // none reaches nobody, which is worth a line in the log
    it('warns when it is emitted outside any scope under enforced tenancy', () => {
      process.env.TENANCY_MODE = 'enforced';
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      gateway.emitToTenant('probe', {});

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('outside any tenant scope'),
      );
      warn.mockRestore();
    });

    it('does not warn about a missing scope in legacy mode', () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      gateway.emitToTenant('probe', {});

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    // gps:update reaches ward staff, staff of the member's unit and the member's CA
    // officers of the tenant that emits, never the unit room the member's teammates share
    it('emitToGpsAudience names the GPS rooms and CA officers of the tenant it runs under', () => {
      inTenant(TID_A, () =>
        gateway.emitToGpsAudience('KV1', ['ca-1', 'ca-2'], { id: 'm1' }),
      );

      const expected = [
        rooms.gpsWard(TID_A),
        rooms.gpsUnit(TID_A, 'KV1'),
        rooms.user(TID_A, 'ca-1'),
        rooms.user(TID_A, 'ca-2'),
      ];
      expect(to).toHaveBeenCalledWith(expected);
      expect(emit).toHaveBeenCalledWith('gps:update', { id: 'm1' });
      expect(expected).not.toContain(rooms.unit(TID_A, 'KV1'));
    });

    it('emitToGpsAudience addresses the legacy namespace outside any tenant scope', () => {
      gateway.emitToGpsAudience('KV1', ['ca-1'], { id: 'm1' });

      expect(to).toHaveBeenCalledWith([
        rooms.gpsWard(undefined),
        rooms.gpsUnit(undefined, 'KV1'),
        rooms.user(undefined, 'ca-1'),
      ]);
    });

    // The system-wide emit is gone: nothing can reach the sockets of every tenant by name
    it('has no system-wide broadcast', () => {
      expect(
        (gateway as unknown as Record<string, unknown>)['broadcast'],
      ).toBeUndefined();
    });
  });

  describe('chat:join', () => {
    it('joins the conversation room when the caller is a participant', async () => {
      chatService.isMember.mockResolvedValueOnce(true);
      const client = socket('u1');

      await expect(gateway.handleChatJoin(client, CONV_ID)).resolves.toEqual({
        joined: CONV_ID,
      });
      expect(chatService.isMember).toHaveBeenCalledWith('u1', CONV_ID);
      expect(client.join).toHaveBeenCalledWith(
        rooms.conversation(undefined, CONV_ID),
      );
    });

    it('refuses callers who are not participants', async () => {
      chatService.isMember.mockResolvedValueOnce(false);
      const client = socket('u1');

      await expect(gateway.handleChatJoin(client, CONV_ID)).resolves.toEqual({
        error: 'not_a_participant',
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects a malformed conversation id before querying', async () => {
      await expect(
        gateway.handleChatJoin(socket('u1'), 'abc'),
      ).resolves.toEqual({
        error: 'invalid_conversation_id',
      });
      expect(chatService.isMember).not.toHaveBeenCalled();
    });

    // MilitianApp and PoliceApp emit chat:join with an object, the web app with the bare id
    it('accepts the { conversationId } payload the mobile apps send', async () => {
      chatService.isMember.mockResolvedValueOnce(true);
      const client = socket('u1');

      await expect(
        gateway.handleChatJoin(client, { conversationId: CONV_ID }),
      ).resolves.toEqual({ joined: CONV_ID });
      expect(client.join).toHaveBeenCalledWith(
        rooms.conversation(undefined, CONV_ID),
      );
    });

    it('answers unauthenticated sockets with an error instead of no acknowledgement', async () => {
      const client = socket();

      await expect(gateway.handleChatJoin(client, CONV_ID)).resolves.toEqual({
        error: 'unauthenticated',
      });
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  // The emitted reason arrives before the disconnect; an acknowledgement would not, since
  // it is sent only after the handler returns, when the socket is already closed
  const toldBeforeDisconnect = (
    client: { emit: jest.Mock; disconnect: jest.Mock },
    reason: string,
  ) => {
    expect(client.emit).toHaveBeenCalledWith('session_expired', { reason });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit.mock.invocationCallOrder[0]).toBeLessThan(
      client.disconnect.mock.invocationCallOrder[0],
    );
  };

  // The token is verified once at connect; a long-lived socket must not outlive it
  describe('session expiry', () => {
    const expiredSocket = () =>
      ({
        data: { user: { sub: 'u1', exp: Math.floor(Date.now() / 1000) - 1 } },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      }) as unknown as Socket & {
        join: jest.Mock;
        emit: jest.Mock;
        disconnect: jest.Mock;
      };

    it('tells an expired socket why and disconnects it instead of sending for it', async () => {
      const client = expiredSocket();

      await expect(
        gateway.handleChatSend(client, {
          conversationId: CONV_ID,
          content: 'hi',
        }),
      ).resolves.toEqual({ error: 'session_expired' });
      toldBeforeDisconnect(client, 'token_expired');
      expect(chatService.isMember).not.toHaveBeenCalled();
    });

    it('disconnects an expired socket instead of joining a room', async () => {
      const client = expiredSocket();

      await expect(gateway.handleChatJoin(client, CONV_ID)).resolves.toEqual({
        error: 'session_expired',
      });
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  // Codex round 3: a socket opened before the account was suspended, demoted or reset kept
  // acting for it until its token expired. Every event re-checks the session; the client
  // gets the same answer as for an expiry, reconnects, and its refresh is then refused.
  describe('session revocation', () => {
    const revokedSocket = () =>
      ({
        data: {
          user: {
            sub: 'u1',
            sid: 'session-1',
            ver: 1,
            exp: Math.floor(Date.now() / 1000) + 600,
          },
        },
        join: jest.fn(),
        leave: jest.fn(),
        rooms: new Set([rooms.conversation(undefined, CONV_ID)]),
        to: jest.fn(() => ({ emit })),
        emit: jest.fn(),
        disconnect: jest.fn(),
      }) as unknown as Socket & {
        join: jest.Mock;
        to: jest.Mock;
        emit: jest.Mock;
        disconnect: jest.Mock;
      };

    beforeEach(() => authState.isAccessValid.mockResolvedValue(false));

    it('tells the socket its session was revoked and disconnects instead of joining a room', async () => {
      const client = revokedSocket();

      await expect(gateway.handleChatJoin(client, CONV_ID)).resolves.toEqual({
        error: 'session_expired',
      });
      toldBeforeDisconnect(client, 'session_revoked');
      expect(client.join).not.toHaveBeenCalled();
      expect(chatService.isMember).not.toHaveBeenCalled();
    });

    it('disconnects instead of sending', async () => {
      const client = revokedSocket();

      await expect(
        gateway.handleChatSend(client, {
          conversationId: CONV_ID,
          content: 'hi',
        }),
      ).resolves.toEqual({ error: 'session_expired' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(chatService.saveMessage).not.toHaveBeenCalled();
    });

    it('disconnects instead of signalling typing', async () => {
      const client = revokedSocket();

      await expect(
        gateway.handleTyping(client, { conversationId: CONV_ID }, true),
      ).resolves.toEqual({ error: 'session_expired' });
      expect(client.to).not.toHaveBeenCalled();
    });

    it('disconnects instead of marking a conversation read', async () => {
      const client = revokedSocket();

      await expect(
        gateway.handleMarkRead(client, { conversationId: CONV_ID }),
      ).resolves.toEqual({ error: 'session_expired' });
      expect(chatService.markRead).not.toHaveBeenCalled();
    });
  });

  // Events the mobile apps emit besides join and send
  describe('room membership, typing and read receipts', () => {
    const joined = (sub: string, joinedRooms: string[] = []) => {
      const roomEmit = jest.fn();
      const client = {
        data: { user: { sub } },
        rooms: new Set(joinedRooms),
        leave: jest.fn(),
        to: jest.fn(() => ({ emit: roomEmit })),
      } as unknown as Socket & { leave: jest.Mock; to: jest.Mock };
      return { client, roomEmit };
    };

    it.each(['chat:leave', 'leave_conversation'])(
      'leaves the conversation room (%s)',
      async () => {
        const { client } = joined('u1', [
          rooms.conversation(undefined, CONV_ID),
        ]);

        await expect(
          gateway.handleChatLeave(client, { conversationId: CONV_ID }),
        ).resolves.toEqual({ left: CONV_ID });
        expect(client.leave).toHaveBeenCalledWith(
          rooms.conversation(undefined, CONV_ID),
        );
      },
    );

    it('rejects a malformed id when leaving', async () => {
      const { client } = joined('u1');

      await expect(gateway.handleChatLeave(client, 'abc')).resolves.toEqual({
        error: 'invalid_conversation_id',
      });
      expect(client.leave).not.toHaveBeenCalled();
    });

    it('tells the other participants who is typing', async () => {
      const { client, roomEmit } = joined('u1', [
        rooms.conversation(undefined, CONV_ID),
      ]);

      await expect(
        gateway.handleTyping(client, { conversationId: CONV_ID }, true),
      ).resolves.toEqual({
        ok: true,
      });
      expect(client.to).toHaveBeenCalledWith(
        rooms.conversation(undefined, CONV_ID),
      );
      expect(roomEmit).toHaveBeenCalledWith('chat:typing', {
        conversationId: CONV_ID,
        userId: 'u1',
        typing: true,
      });
    });

    // Only sockets that joined (after the participant check) may signal in a room
    it('ignores typing in a room the socket has not joined', async () => {
      const { client, roomEmit } = joined('u1');

      await expect(
        gateway.handleTyping(client, { conversationId: CONV_ID }, false),
      ).resolves.toEqual({ error: 'not_joined' });
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('records a read receipt and broadcasts it to the conversation', async () => {
      const readAt = new Date('2026-10-01T02:00:00Z');
      chatService.markRead.mockResolvedValueOnce({
        conversationId: CONV_ID,
        readAt,
      });
      const { client } = joined('u1');

      await expect(
        gateway.handleMarkRead(client, { conversationId: CONV_ID }),
      ).resolves.toEqual({ read: CONV_ID, readAt });
      expect(chatService.markRead).toHaveBeenCalledWith('u1', CONV_ID);
      expect(to).toHaveBeenCalledWith(rooms.conversation(undefined, CONV_ID));
      expect(emit).toHaveBeenCalledWith('chat:read', {
        conversationId: CONV_ID,
        userId: 'u1',
        readAt,
      });
    });

    it('returns the error code when a non-participant marks a conversation read', async () => {
      chatService.markRead.mockRejectedValueOnce(
        new ForbiddenException('not_a_participant'),
      );
      const { client } = joined('u1');

      await expect(
        gateway.handleMarkRead(client, { conversationId: CONV_ID }),
      ).resolves.toEqual({ error: 'not_a_participant' });
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('chat:send', () => {
    it('persists through ChatService and broadcasts the stored message', async () => {
      const stored = {
        id: 'm1',
        conversationId: CONV_ID,
        senderId: 'u1',
        senderName: 'admin',
        content: 'hi',
        createdAt: new Date(),
      };
      chatService.isMember.mockResolvedValueOnce(true);
      chatService.saveMessage.mockResolvedValueOnce(stored);

      const result = await gateway.handleChatSend(socket('u1'), {
        conversationId: CONV_ID,
        content: 'hi',
      });

      expect(result).toEqual(stored);
      expect(chatService.saveMessage).toHaveBeenCalledWith('u1', CONV_ID, 'hi');
      expect(to).toHaveBeenCalledWith(rooms.conversation(undefined, CONV_ID));
      expect(emit).toHaveBeenCalledWith('chat:message', stored);
    });

    it('does not persist or broadcast for non-participants', async () => {
      chatService.isMember.mockResolvedValueOnce(false);

      await expect(
        gateway.handleChatSend(socket('u1'), {
          conversationId: CONV_ID,
          content: 'hi',
        }),
      ).resolves.toEqual({ error: 'not_a_participant' });
      expect(chatService.saveMessage).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('returns the validation error code instead of throwing', async () => {
      chatService.isMember.mockResolvedValueOnce(true);
      chatService.saveMessage.mockRejectedValueOnce(
        new BadRequestException('message_too_long'),
      );

      await expect(
        gateway.handleChatSend(socket('u1'), {
          conversationId: CONV_ID,
          content: 'x',
        }),
      ).resolves.toEqual({ error: 'message_too_long' });
      expect(emit).not.toHaveBeenCalled();
    });

    it('rethrows unexpected storage errors without broadcasting', async () => {
      chatService.isMember.mockResolvedValueOnce(true);
      chatService.saveMessage.mockRejectedValueOnce(
        new Error('connection lost'),
      );

      await expect(
        gateway.handleChatSend(socket('u1'), {
          conversationId: CONV_ID,
          content: 'hi',
        }),
      ).rejects.toThrow('connection lost');
      expect(emit).not.toHaveBeenCalled();
    });

    it('rejects content that is not text before querying', async () => {
      await expect(
        gateway.handleChatSend(socket('u1'), {
          conversationId: CONV_ID,
          content: 42 as unknown as string,
        }),
      ).resolves.toEqual({ error: 'message_content_required' });
      expect(chatService.isMember).not.toHaveBeenCalled();
    });

    it('rejects a malformed conversation id before querying', async () => {
      await expect(
        gateway.handleChatSend(socket('u1'), {
          conversationId: 'abc',
          content: 'hi',
        }),
      ).resolves.toEqual({ error: 'invalid_conversation_id' });
      expect(chatService.isMember).not.toHaveBeenCalled();
    });

    it('answers unauthenticated sockets with an error instead of no acknowledgement', async () => {
      await expect(
        gateway.handleChatSend(socket(), {
          conversationId: CONV_ID,
          content: 'hi',
        }),
      ).resolves.toEqual({ error: 'unauthenticated' });
      expect(chatService.isMember).not.toHaveBeenCalled();
    });
  });

  // A socket event has no request: its session is checked under the tenant of the socket
  // and its rooms are those of that tenant
  describe('chat events under enforced tenancy', () => {
    beforeEach(() => {
      process.env.TENANCY_MODE = 'enforced';
    });

    const sessionScopes = () => {
      const scopes: Array<string | undefined> = [];
      authState.isAccessValid.mockImplementation(() => {
        scopes.push(TenantContext.current()?.tenantId);
        return Promise.resolve(true);
      });
      return scopes;
    };

    it('checks the session under the tenant of the socket and joins the room of that tenant', async () => {
      const scopes = sessionScopes();
      chatService.isMember.mockResolvedValueOnce(true);
      const client = socket('u1', TID_A);

      await expect(gateway.handleChatJoin(client, CONV_ID)).resolves.toEqual({
        joined: CONV_ID,
      });

      expect(scopes).toEqual([TID_A]);
      expect(client.join).toHaveBeenCalledWith(
        rooms.conversation(TID_A, CONV_ID),
      );
      expect(client.join).toHaveBeenCalledTimes(1);
    });

    it('joins the lower-case room of a socket whose token names its tenant in upper case', async () => {
      sessionScopes();
      chatService.isMember.mockResolvedValueOnce(true);
      const client = socket('u1', TID_C.toUpperCase());

      await gateway.handleChatJoin(client, CONV_ID);

      expect(client.join).toHaveBeenCalledWith(
        rooms.conversation(TID_C, CONV_ID),
      );
    });

    it('leaves the room of its own tenant', async () => {
      sessionScopes();
      const leave = jest.fn();
      const client = {
        ...socket('u1', TID_A),
        leave,
      } as unknown as Socket;

      await gateway.handleChatLeave(client, CONV_ID);

      expect(leave).toHaveBeenCalledWith(rooms.conversation(TID_A, CONV_ID));
    });

    it('sends the message to the conversation room of the tenant of the socket', async () => {
      sessionScopes();
      chatService.isMember.mockResolvedValueOnce(true);
      chatService.saveMessage.mockResolvedValueOnce({ id: 'm1' });

      await gateway.handleChatSend(socket('u1', TID_B), {
        conversationId: CONV_ID,
        content: 'hi',
      });

      expect(to).toHaveBeenCalledWith(rooms.conversation(TID_B, CONV_ID));
      expect(emit).toHaveBeenCalledWith('chat:message', { id: 'm1' });
    });

    it('sends the read receipt to the conversation room of the tenant of the socket', async () => {
      sessionScopes();
      const readAt = new Date('2026-10-01T02:00:00Z');
      chatService.markRead.mockResolvedValueOnce({ readAt });

      await gateway.handleMarkRead(socket('u1', TID_A), {
        conversationId: CONV_ID,
      });

      expect(to).toHaveBeenCalledWith(rooms.conversation(TID_A, CONV_ID));
    });

    it('signals typing only in the room of the tenant the socket joined', async () => {
      sessionScopes();
      const roomEmit = jest.fn();
      const typist = (joinedRooms: string[]) =>
        ({
          data: { user: { sub: 'u1', tid: TID_A } },
          rooms: new Set(joinedRooms),
          to: jest.fn(() => ({ emit: roomEmit })),
        }) as unknown as Socket & { to: jest.Mock };

      // The same conversation id in another tenant is another room
      const stranger = typist([rooms.conversation(TID_B, CONV_ID)]);
      await expect(
        gateway.handleTyping(stranger, { conversationId: CONV_ID }, true),
      ).resolves.toEqual({ error: 'not_joined' });
      expect(roomEmit).not.toHaveBeenCalled();

      const member = typist([rooms.conversation(TID_A, CONV_ID)]);
      await expect(
        gateway.handleTyping(member, { conversationId: CONV_ID }, true),
      ).resolves.toEqual({ ok: true });
      expect(member.to).toHaveBeenCalledWith(
        rooms.conversation(TID_A, CONV_ID),
      );
    });
  });
});
