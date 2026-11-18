// Unit tests for AuditInterceptor
// Mock DataSource so no real DB connection is needed.
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { lastValueFrom, of, throwError } from 'rxjs';
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

/**
 * The audit write is fire-and-forget, so it lands after the response is emitted.
 * Wait a macrotask, then drain the microtasks queued by the insert chain.
 */
async function flushAuditWrite(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

type QueryMock = jest.Mock<Promise<unknown>, [sql: string, params: unknown[]]>;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let queryMock: QueryMock;

  /** The audit_logs INSERT issued so far, if any. */
  const findAuditInsert = () =>
    queryMock.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO audit_logs'),
    );

  beforeEach(async () => {
    queryMock = jest
      .fn<Promise<unknown>, [sql: string, params: unknown[]]>()
      .mockResolvedValue([]);

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

  it('does NOT log a plain GET /tasks request', async () => {
    const ctx = makeContext('GET', '/tasks', ACTOR);
    const handler = makeHandler([{ id: '1' }]);

    await lastValueFrom(interceptor.intercept(ctx, handler));
    // Give the async fire-and-forget a tick to potentially run
    await flushAuditWrite();

    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does NOT log a plain GET /militia (list, no ID)', async () => {
    const ctx = makeContext('GET', '/militia', ACTOR);
    const handler = makeHandler([]);

    await lastValueFrom(interceptor.intercept(ctx, handler));
    await flushAuditWrite();

    expect(queryMock).not.toHaveBeenCalled();
  });

  // ── 2. POST: audit log recorded with actor, action, entity_type ─────────

  it('logs a POST /tasks request and records actor, action, entity_type', async () => {
    const ctx = makeContext('POST', '/tasks', ACTOR);
    const responseBody = { id: 'task-uuid', title: 'New task' };
    const handler = makeHandler(responseBody);

    await lastValueFrom(interceptor.intercept(ctx, handler));
    await flushAuditWrite();

    // queryMock is called for the INSERT; no before-state fetch (no UUID in path)
    const insertCall = findAuditInsert();
    expect(insertCall).toBeDefined();

    const params = insertCall![1];
    expect(params[0]).toBe(ACTOR.sub); // actor_id
    expect(params[1]).toBe('POST:tasks'); // action
    expect(params[2]).toBe('tasks'); // entity_type
  });

  it('logs a DELETE /militia/:id and records correct action', async () => {
    const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const ctx = makeContext('DELETE', `/militia/${id}`, ACTOR);
    const handler = makeHandler(null);

    // Before-state query returns a row; INSERT follows
    queryMock
      .mockResolvedValueOnce([{ data: { id, militiaCode: 'ABC' } }]) // SELECT before-state
      .mockResolvedValueOnce([]); // INSERT

    await lastValueFrom(interceptor.intercept(ctx, handler));
    await flushAuditWrite();

    const insertCall = findAuditInsert();
    expect(insertCall).toBeDefined();
    const params = insertCall![1];
    expect(params[1]).toBe('DELETE:militia');
    expect(params[2]).toBe('militia');
    expect(params[3]).toBe(id); // entity_id
  });

  // ── 3. Sensitive GET read: /militia/:id ─────────────────────────────────

  it('logs a sensitive GET /militia/:id read', async () => {
    const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const ctx = makeContext('GET', `/militia/${id}`, ACTOR);
    const handler = makeHandler({ id, fullName: 'Nguyen Van A' });

    await lastValueFrom(interceptor.intercept(ctx, handler));
    await flushAuditWrite();

    const insertCall = findAuditInsert();
    expect(insertCall).toBeDefined();
    const params = insertCall![1];
    expect(params[1]).toBe('READ:militia'); // action
    expect(params[2]).toBe('militia'); // entity_type
  });

  it('logs a sensitive GET /gps/history read', async () => {
    const ctx = makeContext('GET', '/gps/history', ACTOR);
    const handler = makeHandler([]);

    await lastValueFrom(interceptor.intercept(ctx, handler));
    await flushAuditWrite();

    const insertCall = findAuditInsert();
    expect(insertCall).toBeDefined();
    const params = insertCall![1];
    expect(params[1]).toBe('READ:gps');
  });

  // ── 4. Unauthenticated: skip entirely ───────────────────────────────────

  it('skips auditing when req.user is absent', async () => {
    const ctx = makeContext('POST', '/tasks', undefined); // no user
    const handler = makeHandler({ id: 'x' });

    await lastValueFrom(interceptor.intercept(ctx, handler));
    await flushAuditWrite();

    expect(queryMock).not.toHaveBeenCalled();
  });

  // ── 5. DB failure: swallowed, handler result still emitted ──────────────

  it('does NOT throw when the DB insert fails', async () => {
    queryMock.mockRejectedValue(new Error('DB connection refused'));

    const ctx = makeContext('POST', '/tasks', ACTOR);
    const handler = makeHandler({ id: 'new-task' });

    // Rejects, failing the test, if the Observable errors
    const val = await lastValueFrom(interceptor.intercept(ctx, handler));

    // The response body still comes through
    expect(val).toEqual({ id: 'new-task' });
    // Let the failed insert settle; an unhandled rejection would fail the test
    await flushAuditWrite();
  });

  // ── 6. Skipped paths: /auth/* and /health/* ─────────────────────────────

  it('does NOT log POST /auth/login', async () => {
    const ctx = makeContext('POST', '/auth/login', ACTOR);
    const handler = makeHandler({ accessToken: 'tok' });

    await lastValueFrom(interceptor.intercept(ctx, handler));
    await flushAuditWrite();

    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does NOT log GET /health/liveness', async () => {
    const ctx = makeContext('GET', '/health/liveness', ACTOR);
    const handler = makeHandler({ status: 'ok' });

    await lastValueFrom(interceptor.intercept(ctx, handler));
    await flushAuditWrite();

    expect(queryMock).not.toHaveBeenCalled();
  });

  // ── 7. Handler error path: audit still recorded ─────────────────────────

  it('still inserts an audit row when the handler throws', async () => {
    const ctx = makeContext(
      'DELETE',
      '/tasks/f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ACTOR,
    );
    const handler = makeErrorHandler(new Error('Not found'));

    // The handler error propagates and no value is emitted
    await expect(
      lastValueFrom(interceptor.intercept(ctx, handler)),
    ).rejects.toThrow('Not found');
    await flushAuditWrite();

    const insertCall = findAuditInsert();
    expect(insertCall).toBeDefined();
  });

  // ── 8. x-forwarded-for header captured as IP ────────────────────────────

  it('captures x-forwarded-for as IP in the audit log', async () => {
    const ctx = makeContext('POST', '/tasks', ACTOR, {
      'x-forwarded-for': '10.0.0.5, 172.16.0.1',
    });
    const handler = makeHandler({ id: 'task-2' });

    await lastValueFrom(interceptor.intercept(ctx, handler));
    await flushAuditWrite();

    const insertCall = findAuditInsert();
    expect(insertCall).toBeDefined();
    const params = insertCall![1];
    expect(params[6]).toBe('10.0.0.5'); // ip — first entry only
  });
});
