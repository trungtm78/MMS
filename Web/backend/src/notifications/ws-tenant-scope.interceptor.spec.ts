import { lastValueFrom, of } from 'rxjs';
import { WsTenantScopeInterceptor } from './ws-tenant-scope.interceptor';
import { TenantContext } from '../database/tenancy/tenant-context';
import { thrownBy } from '../../test/support/thrown-by';

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

  it('refuses a socket without a tenant in enforced mode', () => {
    process.env.TENANCY_MODE = 'enforced';
    expect(
      thrownBy(() =>
        new WsTenantScopeInterceptor().intercept(contextOf({}), {
          handle: () => of(1),
        }),
      ),
    ).toMatchObject({ code: 'invalid_tenant_id' });
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
