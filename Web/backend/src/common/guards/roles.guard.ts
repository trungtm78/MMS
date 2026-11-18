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
    // Route permissions are not hierarchical: any assigned role that the route
    // requires authorizes the call, not only the primary one
    const claimedRoles: unknown = user?.roles;
    const held = new Set<string>([
      ...(typeof user?.role === 'string' ? [user.role] : []),
      ...(Array.isArray(claimedRoles)
        ? claimedRoles.filter((r): r is string => typeof r === 'string')
        : []),
    ]);
    if (!requiredRoles.some((role) => held.has(role))) {
      throw new ForbiddenException('insufficient_role');
    }
    return true;
  }
}
