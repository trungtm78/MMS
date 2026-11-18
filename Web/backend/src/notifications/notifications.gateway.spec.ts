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
import { AuthStateService } from '../auth/auth-state.service';
import {
  AuthRevocationFeed,
  type AuthRevocationSubscriber,
} from '../auth/auth-revocation-feed';

const CONV_ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';

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

function socket(sub?: string) {
  return {
    data: { user: sub ? { sub } : undefined },
    join: jest.fn(),
  } as unknown as Socket & { join: jest.Mock };
}

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let to: jest.Mock;

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

      expect(client.join).toHaveBeenCalledWith('user:u1');
      expect(client.join).toHaveBeenCalledWith('unit:KV1');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects a socket that reached it without authentication', () => {
      const client = connected();

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    // T31: members share unit:<code> rooms, so positions travel in staff-only GPS rooms
    it.each([
      ['unit staff', { role: 'police_area', unitScope: 'KV1' }, 'gps:unit:KV1'],
      ['CA area staff', { role: 'ca_area', unitScope: 'KV2' }, 'gps:unit:KV2'],
      ['ward-wide staff', { role: 'police_ward', unitScope: null }, 'gps:ward'],
      // The unit grant of a ward-level role without a unit scope is the whole ward
      [
        'ward CA staff without a unit',
        { role: 'ca_ward', unitScope: null },
        'gps:ward',
      ],
      [
        'administrators',
        { role: 'system_admin', unitScope: 'KV1' },
        'gps:ward',
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
        'gps:unit:KV1',
      ],
      [
        'police_area with ca_officer (primary ca_officer)',
        {
          role: 'ca_officer',
          roles: ['police_area', 'ca_officer'],
          unitScope: 'KV1',
        },
        'gps:unit:KV1',
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

      const rooms = client.join.mock.calls.map(([room]) => String(room));
      expect(rooms.filter((room) => room.startsWith('gps:'))).toEqual([]);
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

    // The sockets this replica holds, all of them or those of a room
    let localSockets: FakeSocket[];
    let roomQueried: string[];
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
      roomQueried = [];
      gateway.server = {
        to,
        local: {
          in: (room: string) => {
            roomQueried.push(room);
            return {
              fetchSockets: () =>
                Promise.resolve(
                  localSockets.filter(
                    (client) =>
                      room ===
                      `user:${(client.data as { user: { sub: string } }).user.sub}`,
                  ),
                ),
            };
          },
          fetchSockets: () => Promise.resolve(localSockets),
        },
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
      it("closes only the sockets of the session that ended, in that user's room", async () => {
        const ended = live();
        const sameUserOtherSession = live({ sid: OTHER_SID });
        const otherUser = live({ sub: '22222222-2222-4222-8222-222222222222' });
        localSockets = [ended, sameUserOtherSession, otherUser];

        subscriber.revoked({ kind: 'session', userId: USER, sessionId: SID });
        await flush();

        expect(roomQueried).toEqual([`user:${USER}`]);
        toldBeforeDisconnect(ended, 'session_revoked');
        notTold(sameUserOtherSession);
        notTold(otherUser);
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
        expect(unaffected.join).toHaveBeenCalledWith(`user:${USER}`);
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
            in: () => ({
              fetchSockets: () => Promise.reject(new Error('adapter down')),
            }),
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
      gateway.emitToRooms(['gps:ward', 'user:ca-1'], 'gps:update', {
        id: 'm1',
      });

      expect(to).toHaveBeenCalledWith(['gps:ward', 'user:ca-1']);
      expect(emit).toHaveBeenCalledWith('gps:update', { id: 'm1' });
    });

    it('sends nothing without rooms', () => {
      gateway.emitToRooms([], 'gps:update', { id: 'm1' });

      expect(to).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
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
      expect(client.join).toHaveBeenCalledWith(`conv_${CONV_ID}`);
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
      expect(client.join).toHaveBeenCalledWith(`conv_${CONV_ID}`);
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
        rooms: new Set([`conv_${CONV_ID}`]),
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
    const joined = (sub: string, rooms: string[] = []) => {
      const roomEmit = jest.fn();
      const client = {
        data: { user: { sub } },
        rooms: new Set(rooms),
        leave: jest.fn(),
        to: jest.fn(() => ({ emit: roomEmit })),
      } as unknown as Socket & { leave: jest.Mock; to: jest.Mock };
      return { client, roomEmit };
    };

    it.each(['chat:leave', 'leave_conversation'])(
      'leaves the conversation room (%s)',
      async () => {
        const { client } = joined('u1', [`conv_${CONV_ID}`]);

        await expect(
          gateway.handleChatLeave(client, { conversationId: CONV_ID }),
        ).resolves.toEqual({ left: CONV_ID });
        expect(client.leave).toHaveBeenCalledWith(`conv_${CONV_ID}`);
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
      const { client, roomEmit } = joined('u1', [`conv_${CONV_ID}`]);

      await expect(
        gateway.handleTyping(client, { conversationId: CONV_ID }, true),
      ).resolves.toEqual({
        ok: true,
      });
      expect(client.to).toHaveBeenCalledWith(`conv_${CONV_ID}`);
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
      expect(to).toHaveBeenCalledWith(`conv_${CONV_ID}`);
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
      expect(to).toHaveBeenCalledWith(`conv_${CONV_ID}`);
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
});
