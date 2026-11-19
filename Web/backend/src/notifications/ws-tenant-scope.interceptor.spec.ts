import { defer, lastValueFrom, of } from 'rxjs';
import { WsTenantScopeInterceptor } from './ws-tenant-scope.interceptor';
import { TenantContext } from '../database/tenancy/tenant-context';

const TID = '11111111-1111-4111-8111-111111111111';
const contextOf = (user: unknown) =>
  ({
    switchToWs: () => ({ getClient: () => ({ data: { user } }) }),
  }) as never;

describe('WsTenantScopeInterceptor', () => {
  afterEach(() => delete process.env.TENANCY_MODE);

  it('runs the handler under the tenant of the socket in enforced mode', async () => {
    process.env.TENANCY_MODE = 'enforced';
    const seen = await lastValueFrom(
      new WsTenantScopeInterceptor().intercept(contextOf({ tid: TID }), {
        handle: () => of(TenantContext.current()?.tenantId),
      }),
    );
    expect(seen).toBe(TID);
  });

  // The handler's work starts on subscription, which Nest may do outside intercept()
  it('runs a handler that starts on subscription under the socket tenant, wherever it is subscribed', async () => {
    process.env.TENANCY_MODE = 'enforced';
    const result = new WsTenantScopeInterceptor().intercept(
      contextOf({ tid: TID }),
      { handle: () => defer(() => of(TenantContext.current()?.tenantId)) },
    );

    // Subscribed later, from code that runs under no scope
    await expect(lastValueFrom(result)).resolves.toBe(TID);
  });

  it('refuses a socket without a tenant in enforced mode, without reaching the handler', async () => {
    process.env.TENANCY_MODE = 'enforced';
    const handle = jest.fn(() => of(1));

    const result = new WsTenantScopeInterceptor().intercept(contextOf({}), {
      handle,
    });

    await expect(lastValueFrom(result)).rejects.toMatchObject({
      code: 'invalid_tenant_id',
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it('leaves the handler alone in legacy mode', async () => {
    const seen = await lastValueFrom(
      new WsTenantScopeInterceptor().intercept(contextOf({}), {
        handle: () => of(TenantContext.current()),
      }),
    );
    expect(seen).toBeUndefined();
  });
});
