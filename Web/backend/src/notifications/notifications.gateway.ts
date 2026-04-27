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
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'], credentials: false },
  path: '/socket.io/',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  afterInit() {
    // Redis adapter is attached in main.ts after app init
  }

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify<{
        sub: string;
        unitScope?: string | null;
      }>(token, { secret: this.configService.get<string>('jwt.secret') });
      client.data.user = payload;
      client.join(`user:${payload.sub}`);
      if (payload.unitScope) client.join(`unit:${payload.unitScope}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {}

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

  // ── Chat handlers (P2-11) ────────────────────────────────────────────────

  @SubscribeMessage('chat:join')
  async handleChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    const userId = (client.data.user as { sub: string })?.sub;
    if (!userId) return;

    // S1 IDOR fix: verify caller is a participant before joining room
    const rows = await this.ds.query(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
    if (!rows.length) return { error: 'not_a_participant' };

    client.join(`conv_${conversationId}`);
    return { joined: conversationId };
  }

  @SubscribeMessage('chat:send')
  async handleChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string; content: string },
  ) {
    const userId = (client.data.user as { sub: string })?.sub;
    if (!userId || !payload.conversationId || !payload.content?.trim()) return;

    // Verify participant before persisting
    const participant = await this.ds.query(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
      [payload.conversationId, userId],
    );
    if (!participant.length) return { error: 'not_a_participant' };

    // Persist message (C10 fix: was not calling saveMessage before)
    const rows = await this.ds.query<Record<string, unknown>[]>(
      `INSERT INTO messages(conversation_id, sender_id, content, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, conversation_id AS "conversationId", sender_id AS "senderId",
                 content, created_at AS "createdAt"`,
      [payload.conversationId, userId, payload.content.trim()],
    );
    const msg = rows[0];

    // Enrich with senderName for broadcast
    const userRows = await this.ds.query<{ username: string }[]>(
      `SELECT username FROM users WHERE id = $1`,
      [userId],
    );
    const enriched = { ...msg, senderName: userRows[0]?.username };

    this.server.to(`conv_${payload.conversationId}`).emit('chat:message', enriched);
    return enriched;
  }
}
