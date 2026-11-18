// Only access tokens open protected routes, and only while the session they name is live
// and the account unchanged since they were issued
import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantContext } from '../../database/tenancy/tenant-context';

const SECRET = 'guard-test-secret-0123456789abcdef';
const SID = '5d0c7a3e-9f1b-4c2d-8e6f-1a2b3c4d5e6f';
const jwt = new JwtService({ secret: SECRET });
const config = { get: () => SECRET };
const authState = { isAccessValid: jest.fn() };

function contextFor(authorization?: string) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const accessToken = (claims: Record<string, unknown> = {}) =>
  jwt.sign({
    sub: 'user-1',
    role: 'dqtv',
    typ: 'access',
    sid: SID,
    ver: 3,
    ...claims,
  });

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(jwt, config as never, authState as never);

  beforeEach(() => jest.resetAllMocks());

  it('accepts an access token whose session is live and exposes its claims', async () => {
    authState.isAccessValid.mockResolvedValueOnce(true);
    const { context, request } = contextFor(`Bearer ${accessToken()}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(
      expect.objectContaining({
        sub: 'user-1',
        typ: 'access',
        sid: SID,
        ver: 3,
      }),
    );
    expect(authState.isAccessValid).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', sid: SID, ver: 3 }),
    );
  });

  // Codex round 3: a suspended, demoted or reset account kept working tokens
  it('refuses a token whose session was revoked or whose account changed', async () => {
    authState.isAccessValid.mockResolvedValueOnce(false);
    const { context, request } = contextFor(`Bearer ${accessToken()}`);

    await expect(guard.canActivate(context)).rejects.toThrow('session_revoked');
    expect(request.user).toBeUndefined();
  });

  it.each([
    ['without a token type', { typ: undefined }],
    ['of another type', { typ: 'refresh' }],
  ])(
    'refuses a token %s before looking up its session',
    async (_label, claims) => {
      const { context } = contextFor(`Bearer ${accessToken(claims)}`);

      await expect(guard.canActivate(context)).rejects.toThrow('invalid_token');
      expect(authState.isAccessValid).not.toHaveBeenCalled();
    },
  );

  it('refuses a request without a bearer token', async () => {
    await expect(guard.canActivate(contextFor().context)).rejects.toThrow(
      'missing_token',
    );
  });

  it('refuses a token signed with another secret', async () => {
    const token = new JwtService({ secret: 'other' }).sign({
      sub: 'u',
      typ: 'access',
    });

    await expect(
      guard.canActivate(contextFor(`Bearer ${token}`).context),
    ).rejects.toThrow('invalid_token');
    expect(authState.isAccessValid).not.toHaveBeenCalled();
  });
});

describe('JwtAuthGuard under TENANCY_MODE=enforced', () => {
  const TID = '11111111-1111-4111-8111-111111111111';
  const previous = process.env.TENANCY_MODE;
  const guard = new JwtAuthGuard(jwt, config as never, authState as never);

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.TENANCY_MODE = 'enforced';
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = previous;
  });

  it('adopts the tenant of the token before it checks the session', async () => {
    let scopeDuringCheck: string | undefined;
    authState.isAccessValid.mockImplementationOnce(() => {
      scopeDuringCheck = TenantContext.current()?.tenantId;
      return Promise.resolve(true);
    });
    const { context, request } = contextFor(
      `Bearer ${accessToken({ tid: TID })}`,
    );

    await expect(
      TenantContext.start(() => guard.canActivate(context)),
    ).resolves.toBe(true);
    expect(scopeDuringCheck).toBe(TID);
    expect(request.user).toEqual(expect.objectContaining({ tid: TID }));
  });

  it.each([
    ['without a tenant', { tid: undefined }],
    ['naming something that is not a tenant id', { tid: 'phu-dinh' }],
  ])(
    'refuses a token %s before looking up its session',
    async (_label, claims) => {
      const { context } = contextFor(`Bearer ${accessToken(claims)}`);

      await expect(
        TenantContext.start(() => guard.canActivate(context)),
      ).rejects.toThrow('invalid_token');
      expect(authState.isAccessValid).not.toHaveBeenCalled();
    },
  );
});

describe('JwtAuthGuard under TENANCY_MODE=legacy', () => {
  const previous = process.env.TENANCY_MODE;
  const guard = new JwtAuthGuard(jwt, config as never, authState as never);

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.TENANCY_MODE;
  });
  afterEach(() => {
    if (previous !== undefined) process.env.TENANCY_MODE = previous;
  });

  it.each([
    ['without a tenant', {}],
    ['with a tenant', { tid: '11111111-1111-4111-8111-111111111111' }],
  ])('accepts a token %s and needs no scope store', async (_label, claims) => {
    authState.isAccessValid.mockResolvedValueOnce(true);
    const { context } = contextFor(`Bearer ${accessToken(claims)}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(TenantContext.current()).toBeUndefined();
  });
});
