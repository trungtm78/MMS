import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Socket } from 'socket.io';
import { TenantContext } from '../database/tenancy/tenant-context';
import { isTenancyEnforced } from '../database/tenancy/tenancy-mode';

// A socket event has no HTTP request: run its handler under the tenant the handshake
// authenticated, so every query it makes is answered by Row-Level Security for that tenant.
@Injectable()
export class WsTenantScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!isTenancyEnforced()) return next.handle();
    const client = context.switchToWs().getClient<Socket>();
    const tenantId =
      (client.data as { user?: { tid?: string } }).user?.tid ?? '';
    // runAs validates the id, so a socket without a tenant never reaches the handler
    return TenantContext.runAs({ tenantId }, () => next.handle());
  }
}
