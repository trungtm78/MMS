import {
  HttpException,
  Logger,
  UseInterceptors,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { ChatService } from '../chat/chat.service';
import {
  AuthStateService,
  type AccessClaims,
} from '../auth/auth-state.service';
import {
  AuthRevocationFeed,
  type AuthRevocation,
} from '../auth/auth-revocation-feed';
import { TenantContext } from '../database/tenancy/tenant-context';
import { isTenancyEnforced } from '../database/tenancy/tenancy-mode';
import {
  GPS_UPDATE_EVENT,
  gpsRoomOf,
  gpsUnitRoom,
  gpsWardRoom,
} from '../gps/gps-rooms';
import { RecentRevocations, revocationEnds } from './recent-revocations';
import { rooms } from './rooms';
import { WsTenantScopeInterceptor } from './ws-tenant-scope.interceptor';

// Web clients send the bare conversation id, the mobile apps { conversationId }
function conversationIdOf(
  body: string | { conversationId?: unknown } | undefined,
): string | null {
  const id = typeof body === 'string' ? body : body?.conversationId;
  return typeof id === 'string' && isUUID(id) ? id : null;
}

/** Why a handshake is refused; the client receives it as the connect_error message. */
type HandshakeRefusal =
  | 'missing_token'
  | 'invalid_token'
  | 'session_revoked'
  | 'authentication_unavailable';

/** Why an open socket is closed; sent in the session_expired event before disconnecting. */
type SessionEnd = 'token_expired' | 'session_revoked';

// Access tokens carry the roles and unit scope of JwtPayload, and the tenant under
// TENANCY_MODE=enforced
type SocketUser = AccessClaims & {
  role: string;
  roles?: string[];
  unitScope?: string | null;
  tid?: string;
  typ?: string;
  exp?: number;
};

const userOf = (client: { data: unknown }): SocketUser | undefined =>
  (client.data as { user?: SocketUser } | undefined)?.user;

// The tenant whose rooms a socket lives in. The legacy mode has one fixed namespace
// whatever a token claims, so emitters (which have no claim to read) and sockets agree.
// TenantContext keeps tenant ids in lower case and the emitters name rooms from it: a
// claim in upper case is the same tenant and must land in the same rooms.
const roomTenantOf = (user: { tid?: string }): string | undefined =>
  isTenancyEnforced() ? user.tid?.toLowerCase() : undefined;

/** A local socket, or one another replica holds (fetchSockets): what closing it needs. */
interface ClosableSocket {
  data: unknown;
  emit(event: 'session_expired', payload: { reason: SessionEnd }): unknown;
  disconnect(close?: boolean): unknown;
}

// The longest delay setTimeout accepts (about 24.8 days); a longer wait is re-armed
const MAX_TIMER_DELAY_MS = 2_147_483_647;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Every socket event runs under the tenant of its socket (WsTenantScopeInterceptor)
@UseInterceptors(WsTenantScopeInterceptor)
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: false,
  },
  path: '/socket.io/',
})
export class NotificationsGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  // Access-token expiry of each socket this replica holds, by socket id
  private readonly expiryTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly recentRevocations = new RecentRevocations();
  private unsubscribeRevocations: (() => void) | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly authState: AuthStateService,
    private readonly revocations: AuthRevocationFeed,
  ) {}

  // Every handshake is authenticated before a connection exists, so a refused client
  // learns why through connect_error instead of being accepted and dropped. The Redis
  // adapter is attached in main.ts.
  //
  // A connected socket sits in the tenant, user, unit and GPS rooms of its tenant and
  // receives what the server pushes there without emitting anything, so its session is
  // also ended from the server side: at its access token's expiry (a timer), and as soon
  // as Postgres announces that its session ended or its account changed
  // (AuthRevocationFeed). Each replica closes the sockets it holds; every replica
  // receives every announcement.
  afterInit(server: Server) {
    server.use((client, next) => {
      void this.authenticate(client).then((refusal) =>
        next(refusal ? new Error(refusal) : undefined),
      );
    });
    this.unsubscribeRevocations?.();
    this.unsubscribeRevocations = this.revocations.subscribe({
      revoked: (event) => {
        this.closeRevoked(event).catch((error: unknown) =>
          this.logger.warn(
            `Could not close the sockets of a revoked session (${errorMessage(error)})`,
          ),
        );
      },
      resync: () => {
        this.closeInvalid().catch((error: unknown) =>
          this.logger.warn(
            `Could not re-check the sessions of open sockets (${errorMessage(error)})`,
          ),
        );
      },
    });
  }

  onModuleDestroy() {
    this.unsubscribeRevocations?.();
    this.unsubscribeRevocations = null;
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
  }

  // Enforced mode checks a session under its own tenant; legacy mode has none
  private inTenant<T>(
    tid: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    return isTenancyEnforced()
      ? TenantContext.runAs({ tenantId: tid ?? '' }, fn)
      : fn();
  }

  // The tenant of whoever emits (the request, job or socket event that is running)
  private currentTid(): string | undefined {
    return TenantContext.current()?.tenantId;
  }

  // Same rules as JwtAuthGuard: only access tokens, and only while their session is live
  // and the account unchanged since they were issued
  private async authenticate(client: Socket): Promise<HandshakeRefusal | null> {
    const token =
      (client.handshake.auth?.token as string | undefined) ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return 'missing_token';

    let claims: SocketUser;
    try {
      claims = this.jwtService.verify<SocketUser>(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });
    } catch {
      return 'invalid_token';
    }
    if (claims.typ !== 'access') return 'invalid_token';
    // The session below is read in a tenant's rows: a token without one has no tenant to
    // read them under
    if (isTenancyEnforced() && !isUUID(claims.tid)) return 'invalid_token';

    try {
      if (
        !(await this.inTenant(claims.tid, () =>
          this.authState.isAccessValid(claims),
        ))
      ) {
        return 'session_revoked';
      }
    } catch (error) {
      this.logger.warn(
        `Socket handshake refused: the session could not be checked (${errorMessage(error)})`,
      );
      return 'authentication_unavailable';
    }
    (client.data as { user?: SocketUser }).user = claims;
    return null;
  }

  // Sockets reach this only through the handshake middleware, which set the user
  handleConnection(client: Socket) {
    const user = userOf(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    // The handshake refuses such a token already; a socket must never sit in the shared
    // t:none (or t:legacy) namespace by way of a token naming no valid tenant
    if (isTenancyEnforced() && !isUUID(user.tid)) {
      client.disconnect(true);
      return;
    }
    // Its handshake may have read the session just before a revocation committed
    if (this.recentRevocations.ends(user)) {
      this.endSession(client, 'session_revoked');
      return;
    }
    if (!this.scheduleExpiry(client, user)) return;
    const tid = roomTenantOf(user);
    // The tenant room reaches every socket of the tenant (it replaces the system-wide emit)
    void client.join(rooms.tenant(tid));
    void client.join(rooms.user(tid, user.sub));
    if (user.unitScope) void client.join(rooms.unit(tid, user.unitScope));
    // Live positions travel in staff-only rooms: members share the unit room
    const gpsRoom = gpsRoomOf(
      {
        role: user.role,
        roles: user.roles,
        unitScope: user.unitScope ?? null,
      },
      tid,
    );
    if (gpsRoom) void client.join(gpsRoom);
  }

  handleDisconnect(client: Socket) {
    const timer = this.expiryTimers.get(client.id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(client.id);
  }

  // Closes the socket when its access token expires; false when it already has
  private scheduleExpiry(client: Socket, user: SocketUser): boolean {
    if (typeof user.exp !== 'number') return true;
    const remaining = user.exp * 1000 - Date.now();
    if (remaining <= 0) {
      this.expiryTimers.delete(client.id);
      this.endSession(client, 'token_expired');
      return false;
    }
    const timer = setTimeout(
      () => {
        this.expiryTimers.delete(client.id);
        this.scheduleExpiry(client, user);
      },
      Math.min(remaining, MAX_TIMER_DELAY_MS),
    );
    timer.unref?.();
    this.expiryTimers.set(client.id, timer);
    return true;
  }

  // The sockets of this replica whose session the announced change ended. The announcement
  // names the tenant (migration 039), so only that user's room of that tenant is looked at;
  // one without a tenant (a trigger older than 039) is matched against every local socket.
  private async closeRevoked(event: AuthRevocation): Promise<void> {
    this.recentRevocations.record(event);
    const candidates =
      event.tenantId === undefined
        ? await this.server.local.fetchSockets()
        : await this.server.local
            .in(rooms.user(roomTenantOf({ tid: event.tenantId }), event.userId))
            .fetchSockets();
    for (const client of candidates) {
      const user = userOf(client);
      if (user && revocationEnds(event, user)) {
        this.endSession(client, 'session_revoked');
      }
    }
  }

  // Announcements may have been missed: every socket of this replica is checked again,
  // the sockets of each tenant in one batch under that tenant's scope. A tenant that cannot
  // be checked does not leave the others unchecked.
  private async closeInvalid(): Promise<void> {
    const held = (await this.server.local.fetchSockets()).flatMap((client) => {
      const user = userOf(client);
      return user ? [{ client, user }] : [];
    });
    const byTenant = new Map<string | undefined, typeof held>();
    for (const entry of held) {
      const tid = roomTenantOf(entry.user);
      const group = byTenant.get(tid) ?? [];
      group.push(entry);
      byTenant.set(tid, group);
    }
    const failures: string[] = [];
    for (const [tid, group] of byTenant) {
      try {
        const valid = await this.inTenant(tid, () =>
          this.authState.validAccess(group.map(({ user }) => user)),
        );
        group.forEach(({ client }, index) => {
          if (!valid[index]) this.endSession(client, 'session_revoked');
        });
      } catch (error) {
        failures.push(errorMessage(error));
      }
    }
    if (failures.length > 0) throw new Error(failures.join('; '));
  }

  // Jobs and requests can emit before the gateway is initialised (tests, start-up): nothing
  // is delivered then, and the log says so instead of an error on undefined. Every emitter
  // goes through here, so nothing is ever sent server-wide. The rooms are named from `tid`
  // here, after the check: under enforced tenancy an emit that names no tenant is dropped
  // (it would only address a namespace nobody joins), and the log says so. One emit may
  // address several rooms: a socket in more than one of them receives it once.
  private deliverTo(
    tid: string | undefined,
    targetsOf: (tid: string | undefined) => string | string[],
    event: string,
    data: unknown,
  ): void {
    if (!this.server) {
      this.logger.warn(
        `Event ${event} emitted before the socket server started; not delivered`,
      );
      return;
    }
    if (tid === undefined && isTenancyEnforced()) {
      this.logger.warn(
        `Event ${event} emitted outside any tenant scope; not delivered`,
      );
      return;
    }
    const targets = targetsOf(tid);
    if (Array.isArray(targets) && targets.length === 0) return;
    this.server.to(targets).emit(event, data);
  }

  // The emitters below address the tenant of the scope they run in (the request or job
  // that emits): a room is never named without one

  // Broadcast to all clients in a unit
  emitToUnit(unitCode: string, event: string, data: unknown) {
    this.deliverTo(
      this.currentTid(),
      (tid) => rooms.unit(tid, unitCode),
      event,
      data,
    );
  }

  // Send to specific user
  emitToUser(userId: string, event: string, data: unknown) {
    this.deliverTo(
      this.currentTid(),
      (tid) => rooms.user(tid, userId),
      event,
      data,
    );
  }

  // To every socket of the current tenant (replaces the old system-wide broadcast)
  emitToTenant(event: string, data: unknown) {
    this.deliverTo(this.currentTid(), rooms.tenant, event, data);
  }

  // gps:update reaches ward-wide staff, staff of the member's unit and the CA officers the
  // member is assigned to, in the tenant that emits it (never the unit room, which the
  // member's teammates share)
  emitToGpsAudience(
    unitCode: string,
    caOfficerIds: string[],
    data: unknown,
  ): void {
    this.deliverTo(
      this.currentTid(),
      (tid) => [
        gpsWardRoom(tid),
        gpsUnitRoom(tid, unitCode),
        ...caOfficerIds.map((id) => rooms.user(tid, id)),
      ],
      GPS_UPDATE_EVENT,
      data,
    );
  }

  // Broadcast to everyone who joined a conversation room
  emitToConversation(conversationId: string, event: string, data: unknown) {
    this.emitToConversationOf(this.currentTid(), conversationId, event, data);
  }

  // A socket event names the tenant of its socket, whatever scope it runs in
  private emitToConversationOf(
    tid: string | undefined,
    conversationId: string,
    event: string,
    data: unknown,
  ) {
    this.deliverTo(
      tid,
      (scoped) => rooms.conversation(scoped, conversationId),
      event,
      data,
    );
  }

  // ── Chat handlers (P2-11) ────────────────────────────────────────────────
  // Persistence and validation live in ChatService so the socket and REST paths agree.

  // The claims verified at connect, as long as the token has not expired and its session
  // has not been revoked since (account suspended, roles, password or MFA changed). Such a
  // socket is told why and closed: the client reconnects with a refreshed token, and for a
  // revoked session the refresh is refused too. The tenant is the one of the socket's rooms.
  private async sessionOf(
    client: Socket,
  ): Promise<{ sub: string; tid: string | undefined } | 'expired' | null> {
    const user = userOf(client);
    if (!user?.sub) return null;
    if (typeof user.exp === 'number' && user.exp * 1000 <= Date.now()) {
      this.endSession(client, 'token_expired');
      return 'expired';
    }
    if (
      !(await this.inTenant(user.tid, () => this.authState.isAccessValid(user)))
    ) {
      this.endSession(client, 'session_revoked');
      return 'expired';
    }
    return { sub: user.sub, tid: roomTenantOf(user) };
  }

  // The event is written before the disconnect packet, so it reaches the client; an
  // acknowledgement would not, since it is sent after the handler returns
  private endSession(client: ClosableSocket, reason: SessionEnd) {
    client.emit('session_expired', { reason });
    client.disconnect(true);
  }

  // Web clients emit the bare id; the Flutter apps emit { conversationId }
  @SubscribeMessage('chat:join')
  async handleChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: string | { conversationId?: unknown },
  ) {
    const session = await this.sessionOf(client);
    // Always acknowledge, so clients do not wait for a timeout
    if (session === null) return { error: 'unauthenticated' };
    if (session === 'expired') return { error: 'session_expired' };

    const conversationId =
      typeof body === 'string' ? body : body?.conversationId;
    if (typeof conversationId !== 'string' || !isUUID(conversationId)) {
      return { error: 'invalid_conversation_id' };
    }

    // S1 IDOR fix: verify caller is a participant before joining room
    if (!(await this.chatService.isMember(session.sub, conversationId))) {
      return { error: 'not_a_participant' };
    }

    await client.join(rooms.conversation(session.tid, conversationId));
    return { joined: conversationId };
  }

  // The web app emits chat:leave, MilitianApp leave_conversation
  @SubscribeMessage('chat:leave')
  async handleChatLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: string | { conversationId?: unknown },
  ) {
    const session = await this.sessionOf(client);
    // Always acknowledge, so clients do not wait for a timeout
    if (session === null) return { error: 'unauthenticated' };
    if (session === 'expired') return { error: 'session_expired' };
    const conversationId = conversationIdOf(body);
    if (!conversationId) return { error: 'invalid_conversation_id' };

    await client.leave(rooms.conversation(session.tid, conversationId));
    return { left: conversationId };
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: string | { conversationId?: unknown },
  ) {
    return this.handleChatLeave(client, body);
  }

  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: string | { conversationId?: unknown },
  ) {
    return this.handleTyping(client, body, true);
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: string | { conversationId?: unknown },
  ) {
    return this.handleTyping(client, body, false);
  }

  // Typing is signalled without a database query per keystroke: only sockets that joined
  // the room, after the participant check in chat:join, may signal in it
  async handleTyping(
    client: Socket,
    body: string | { conversationId?: unknown },
    typing: boolean,
  ) {
    const session = await this.sessionOf(client);
    // Always acknowledge, so clients do not wait for a timeout
    if (session === null) return { error: 'unauthenticated' };
    if (session === 'expired') return { error: 'session_expired' };
    const conversationId = conversationIdOf(body);
    if (!conversationId) return { error: 'invalid_conversation_id' };
    const room = rooms.conversation(session.tid, conversationId);
    if (!client.rooms.has(room)) return { error: 'not_joined' };

    client
      .to(room)
      .emit('chat:typing', { conversationId, userId: session.sub, typing });
    return { ok: true };
  }

  // Moves the caller's read marker and tells the other participants
  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: string | { conversationId?: unknown },
  ) {
    const session = await this.sessionOf(client);
    // Always acknowledge, so clients do not wait for a timeout
    if (session === null) return { error: 'unauthenticated' };
    if (session === 'expired') return { error: 'session_expired' };
    const conversationId = conversationIdOf(body);
    if (!conversationId) return { error: 'invalid_conversation_id' };

    try {
      const { readAt } = await this.chatService.markRead(
        session.sub,
        conversationId,
      );
      this.emitToConversationOf(session.tid, conversationId, 'chat:read', {
        conversationId,
        userId: session.sub,
        readAt,
      });
      return { read: conversationId, readAt };
    } catch (error) {
      if (error instanceof HttpException) return { error: error.message };
      throw error;
    }
  }

  @SubscribeMessage('chat:send')
  async handleChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string; content: string },
  ) {
    const session = await this.sessionOf(client);
    // Always acknowledge, so clients do not wait for a timeout
    if (session === null) return { error: 'unauthenticated' };
    if (session === 'expired') return { error: 'session_expired' };
    const userId = session.sub;
    const conversationId = payload?.conversationId;
    if (typeof conversationId !== 'string' || !isUUID(conversationId)) {
      return { error: 'invalid_conversation_id' };
    }
    if (typeof payload.content !== 'string') {
      return { error: 'message_content_required' };
    }

    if (!(await this.chatService.isMember(userId, conversationId))) {
      return { error: 'not_a_participant' };
    }

    try {
      const message = await this.chatService.saveMessage(
        userId,
        conversationId,
        payload.content,
      );
      this.emitToConversationOf(
        session.tid,
        conversationId,
        'chat:message',
        message,
      );
      return message;
    } catch (error) {
      if (error instanceof HttpException) return { error: error.message };
      throw error;
    }
  }
}
