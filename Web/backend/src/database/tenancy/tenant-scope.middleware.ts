import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant-context';

// Registered as Nest module middleware, which runs AFTER body parsing: the body parser
// resumes the request from a stream event, where an earlier AsyncLocalStorage context
// would be lost. Everything after this point (guards, interceptors, handlers) shares the
// store; JwtAuthGuard or the sign-in adopts the tenant into it.
@Injectable()
export class TenantScopeMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    TenantContext.start(() => next());
  }
}
