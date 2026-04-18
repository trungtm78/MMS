// US-W001 AC-2: Roles guard — RBAC enforcement
import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '../../database/entities/user.entity';
import type { JwtPayload } from '../../auth/auth.service';

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export const ROLES_KEY = 'roles';

@Injectable()
export class RolesGuard {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user?.role || !requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('insufficient_role');
    }
    return true;
  }
}
