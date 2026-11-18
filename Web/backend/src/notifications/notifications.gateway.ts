import { HttpException, Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
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
import { gpsRoomOf } from '../gps/gps-rooms';

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

// Access tokens carry the roles and unit scope of JwtPayload
type SocketUser = AccessClaims & {
  role: string;
  roles?: string[];
  unitScope?: string | null;
  typ?: string;
  exp?: number;
};

const userOf = (client: Socket): SocketUser | undefined =>
  (client.data as { user?: SocketUser }).user;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: false,
  },
  path: '/socket.io/',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly authState: AuthStateService,
  ) {}

  // Every handshake is authenticated before a connection exists, so a refused client
  // learns why through connect_error instead of being accepted and dropped. The Redis
  // adapter is attached in main.ts.
  afterInit(server: Server) {
    server.use((client, next) => {
      void this.authenticate(client).then((refusal) =>
        next(refusal ? new Error(refusal) : undefined),
      );
    });
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

    try {
      if (!(await this.authState.isAccessValid(claims))) {
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
    void client.join(`user:${user.sub}`);
    if (user.unitScope) void client.join(`unit:${user.unitScope}`);
    // Live positions travel in staff-only rooms: members share the unit room
    const gpsRoom = gpsRoomOf({
      role: user.role,
      roles: user.roles,
      unitScope: user.unitScope ?? null,
    });
    if (gpsRoom) void client.join(gpsRoom);
  }

  // One emit over several rooms: a socket in more than one of them receives it once
  emitToRooms(rooms: string[], event: string, data: unknown) {
    if (rooms.length === 0) return;
    this.server.to(rooms).emit(event, data);
  }

  // Broadcast to all clients in a unit
  emitToUnit(unitCode: string, event: string, data: unknown) {
    this.server.to(`unit:${unitCode}`).emit(event, data);
  }

  // Send to specific user
  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // Broadcast system-wide
  broadcast(event: string, data: unknown) {
    this.server.emit(event, data);
  }

  // Broadcast to everyone who joined a conversation room
  emitToConversation(conversationId: string, event: string, data: unknown) {
    this.server.to(`conv_${conversationId}`).emit(event, data);
  }

  // ── Chat handlers (P2-11) ────────────────────────────────────────────────
  // Persistence and validation live in ChatService so the socket and REST paths agree.

  // The claims verified at connect, as long as the token has not expired and its session
  // has not been revoked since (account suspended, roles, password or MFA changed). Such a
  // socket is told why and closed: the client reconnects with a refreshed token, and for a
  // revoked session the refresh is refused too.
  private async sessionOf(
    client: Socket,
  ): Promise<{ sub: string } | 'expired' | null> {
    const user = userOf(client);
    if (!user?.sub) return null;
    if (typeof user.exp === 'number' && user.exp * 1000 <= Date.now()) {
      this.endSession(client, 'token_expired');
      return 'expired';
    }
    if (!(await this.authState.isAccessValid(user))) {
      this.endSession(client, 'session_revoked');
      return 'expired';
    }
    return { sub: user.sub };
  }

  // The event is written before the disconnect packet, so it reaches the client; an
  // acknowledgement would not, since it is sent after the handler returns
  private endSession(client: Socket, reason: SessionEnd) {
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

    await client.join(`conv_${conversationId}`);
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

    await client.leave(`conv_${conversationId}`);
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
    const room = `conv_${conversationId}`;
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
      this.emitToConversation(conversationId, 'chat:read', {
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
      this.emitToConversation(conversationId, 'chat:message', message);
      return message;
    } catch (error) {
      if (error instanceof HttpException) return { error: error.message };
      throw error;
    }
  }
}
