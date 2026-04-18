import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

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
}
