// Unit tests for AuditInterceptor
// Mock DataSource so no real DB connection is needed.
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import type { JwtPayload } from '../../auth/auth.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTOR: JwtPayload = {
  sub: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  username: 'test.user',
  role: 'system_admin',
  unitScope: null,
};

/** Build a minimal ExecutionContext mock. */
function makeContext(
  method: string,
  path: string,
  user?: JwtPayload,
  extraHeaders: Record<string, string> = {},
): ExecutionContext {
  const req = {
    method,
    path,
    url: path,
    user,
    headers: { 'user-agent': 'jest-test', ...extraHeaders },
    socket: { remoteAddress: '127.0.0.1' },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

/** Build a CallHandler that emits a single value. */
function makeHandler(value: unknown = { ok: true }): CallHandler {
  return { handle: () => of(value) };
}

/** Build a CallHandler that errors. */
function makeErrorHandler(err = new Error('handler error')): CallHandler {
  return { handle: () => throwError(() => err) };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let queryMock: jest.Mock;

  beforeEach(async () => {
    queryMock = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        {
          provide: getDataSourceToken(),
          useValue: { query: queryMock },
        },
      ],
    }).compile();

    interceptor = module.get<AuditInterceptor>(AuditInterceptor);
  });

  afterEach(() => jest.clearAllMocks());

  // ── 1. Non-sensitive GET: no audit log ──────────────────────────────────

  it('does NOT log a plain GET /tasks request', (done) => {
    const ctx = makeContext('GET', '/tasks', ACTOR);
    const handler = makeHandler([{ id: '1' }]);

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        // Give the async fire-and-forget a tick to potentially run
        setImmediate(() => {
          expect(queryMock).not.toHaveBeenCalled();
          done();
        });
      },
      error: done,
    });
  });

  it('does NOT log a plain GET /militia (list, no ID)', (done) => {
    const ctx = makeContext('GET', '/militia', ACTOR);
    const handler = makeHandler([]);

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        setImmediate(() => {
          expect(queryMock).not.toHaveBeenCalled();
          done();
        });
      },
      error: done,
    });
  });

  // ── 2. POST: audit log recorded with actor, action, entity_type ─────────

  it('logs a POST /tasks request and records actor, action, entity_type', (done) => {
    const ctx = makeContext('POST', '/tasks', ACTOR);
    const responseBody = { id: 'task-uuid', title: 'New task' };
    const handler = makeHandler(responseBody);

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        setImmediate(async () => {
          // Allow any pending promises inside tap to flush
          await Promise.resolve();
          // queryMock is called for the INSERT; no before-state fetch (no UUID in path)
          const insertCall = queryMock.mock.calls.find((c: unknown[]) =>
            (c[0] as string).includes('INSERT INTO audit_logs'),
          );
          expect(insertCall).toBeDefined();

          const params = insertCall![1] as unknown[];
          expect(params[0]).toBe(ACTOR.sub);   // actor_id
          expect(params[1]).toBe('POST:tasks'); // action
          expect(params[2]).toBe('tasks');       // entity_type
          done();
        });
      },
      error: done,
    });
  });

  it('logs a DELETE /militia/:id and records correct action', (done) => {
    const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const ctx = makeContext('DELETE', `/militia/${id}`, ACTOR);
    const handler = makeHandler(null);

    // Before-state query returns a row; INSERT follows
    queryMock
      .mockResolvedValueOnce([{ data: { id, militiaCode: 'ABC' } }]) // SELECT before-state
      .mockResolvedValueOnce([]);                                       // INSERT

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        setImmediate(async () => {
          await Promise.resolve();
          const insertCall = queryMock.mock.calls.find((c: unknown[]) =>
            (c[0] as string).includes('INSERT INTO audit_logs'),
          );
          expect(insertCall).toBeDefined();
          const params = insertCall![1] as unknown[];
          expect(params[1]).toBe('DELETE:militia');
          expect(params[2]).toBe('militia');
          expect(params[3]).toBe(id); // entity_id
          done();
        });
      },
      error: done,
    });
  });

  // ── 3. Sensitive GET read: /militia/:id ─────────────────────────────────

  it('logs a sensitive GET /militia/:id read', (done) => {
    const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const ctx = makeContext('GET', `/militia/${id}`, ACTOR);
    const handler = makeHandler({ id, fullName: 'Nguyen Van A' });

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        setImmediate(async () => {
          await Promise.resolve();
          const insertCall = queryMock.mock.calls.find((c: unknown[]) =>
            (c[0] as string).includes('INSERT INTO audit_logs'),
          );
          expect(insertCall).toBeDefined();
          const params = insertCall![1] as unknown[];
          expect(params[1]).toBe('READ:militia'); // action
          expect(params[2]).toBe('militia');       // entity_type
          done();
        });
      },
      error: done,
    });
  });

  it('logs a sensitive GET /gps/history read', (done) => {
    const ctx = makeContext('GET', '/gps/history', ACTOR);
    const handler = makeHandler([]);

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        setImmediate(async () => {
          await Promise.resolve();
          const insertCall = queryMock.mock.calls.find((c: unknown[]) =>
            (c[0] as string).includes('INSERT INTO audit_logs'),
          );
          expect(insertCall).toBeDefined();
          const params = insertCall![1] as unknown[];
          expect(params[1]).toBe('READ:gps');
          done();
        });
      },
      error: done,
    });
  });

  // ── 4. Unauthenticated: skip entirely ───────────────────────────────────

  it('skips auditing when req.user is absent', (done) => {
    const ctx = makeContext('POST', '/tasks', undefined); // no user
    const handler = makeHandler({ id: 'x' });

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        setImmediate(() => {
          expect(queryMock).not.toHaveBeenCalled();
          done();
        });
      },
      error: done,
    });
  });

  // ── 5. DB failure: swallowed, handler result still emitted ──────────────

  it('does NOT throw when the DB insert fails', (done) => {
    queryMock.mockRejectedValue(new Error('DB connection refused'));

    const ctx = makeContext('POST', '/tasks', ACTOR);
    const handler = makeHandler({ id: 'new-task' });

    interceptor.intercept(ctx, handler).subscribe({
      next: (val) => {
        // The response body still comes through
        expect(val).toEqual({ id: 'new-task' });
        // Allow flush; verify no unhandled rejection was thrown
        setImmediate(() => {
          done();
        });
      },
      error: (err: unknown) => {
        // Should NOT reach here
        done(new Error(`Observable errored unexpectedly: ${String(err)}`));
      },
    });
  });

  // ── 6. Skipped paths: /auth/* and /health/* ─────────────────────────────

  it('does NOT log POST /auth/login', (done) => {
    const ctx = makeContext('POST', '/auth/login', ACTOR);
    const handler = makeHandler({ accessToken: 'tok' });

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        setImmediate(() => {
          expect(queryMock).not.toHaveBeenCalled();
          done();
        });
      },
      error: done,
    });
  });

  it('does NOT log GET /health/liveness', (done) => {
    const ctx = makeContext('GET', '/health/liveness', ACTOR);
    const handler = makeHandler({ status: 'ok' });

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        setImmediate(() => {
          expect(queryMock).not.toHaveBeenCalled();
          done();
        });
      },
      error: done,
    });
  });

  // ── 7. Handler error path: audit still recorded ─────────────────────────

  it('still inserts an audit row when the handler throws', (done) => {
    const ctx = makeContext('DELETE', '/tasks/f47ac10b-58cc-4372-a567-0e02b2c3d479', ACTOR);
    const handler = makeErrorHandler(new Error('Not found'));

    interceptor.intercept(ctx, handler).subscribe({
      next: () => done(new Error('Should not emit next')),
      error: () => {
        setImmediate(async () => {
          await Promise.resolve();
          const insertCall = queryMock.mock.calls.find((c: unknown[]) =>
            (c[0] as string).includes('INSERT INTO audit_logs'),
          );
          expect(insertCall).toBeDefined();
          done();
        });
      },
    });
  });

  // ── 8. x-forwarded-for header captured as IP ────────────────────────────

  it('captures x-forwarded-for as IP in the audit log', (done) => {
    const ctx = makeContext('POST', '/tasks', ACTOR, {
      'x-forwarded-for': '10.0.0.5, 172.16.0.1',
    });
    const handler = makeHandler({ id: 'task-2' });

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        setImmediate(async () => {
          await Promise.resolve();
          const insertCall = queryMock.mock.calls.find((c: unknown[]) =>
            (c[0] as string).includes('INSERT INTO audit_logs'),
          );
          expect(insertCall).toBeDefined();
          const params = insertCall![1] as unknown[];
          expect(params[6]).toBe('10.0.0.5'); // ip — first entry only
          done();
        });
      },
      error: done,
    });
  });
});
