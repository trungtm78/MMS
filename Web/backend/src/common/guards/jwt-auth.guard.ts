// US-W001: JWT auth guard
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/auth.service';

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

@Injectable()
export class JwtAuthGuard {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing_token');
    }
    const token = authHeader.slice(7);
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
  }
}
