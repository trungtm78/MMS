import {
  Controller,
  Get,
  Delete,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.service';

interface SessionRow {
  id: string;
  userId: string;
  deviceId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  @Get()
  async listSessions(@Request() req: { user: JwtPayload }) {
    const rows = await this.ds.query<SessionRow[]>(
      `SELECT id, user_id AS "userId", device_id AS "deviceId",
              ip, user_agent AS "userAgent",
              created_at AS "createdAt", expires_at AS "expiresAt",
              revoked_at AS "revokedAt"
       FROM sessions
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.sub],
    );
    return rows;
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: JwtPayload },
  ) {
    await this.ds.query(
      `UPDATE sessions SET revoked_at = NOW()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [sessionId, req.user.sub],
    );
  }
}
