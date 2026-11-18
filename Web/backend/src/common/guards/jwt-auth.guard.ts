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
import { AuthStateService } from '../../auth/auth-state.service';

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

@Injectable()
export class JwtAuthGuard {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly authState: AuthStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing_token');
    }
    const token = authHeader.slice(7);
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
    // Tokens issued before token types existed, or of any other type, open nothing
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('invalid_token');
    }
    // A signature proves who issued the token, not that the account still allows it
    if (!(await this.authState.isAccessValid(payload))) {
      throw new UnauthorizedException('session_revoked');
    }
    request.user = payload;
    return true;
  }
}
