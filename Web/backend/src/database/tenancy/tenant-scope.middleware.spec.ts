import { TenantScopeMiddleware } from './tenant-scope.middleware';
import { TenantContext } from './tenant-context';

describe('TenantScopeMiddleware', () => {
  it('starts a store so a later guard can adopt a tenant', async () => {
    const middleware = new TenantScopeMiddleware();
    await new Promise<void>((resolve, reject) =>
      middleware.use({} as never, {} as never, () => {
        try {
          expect(TenantContext.current()).toBeUndefined();
          TenantContext.adopt({
            tenantId: '11111111-1111-4111-8111-111111111111',
          });
          resolve();
        } catch (error) {
          reject(error as Error);
        }
      }),
    );
  });

  it('gives each request its own store', async () => {
    const middleware = new TenantScopeMiddleware();
    const adopt = (tenantId: string) =>
      new Promise<void>((resolve, reject) =>
        middleware.use({} as never, {} as never, () => {
          try {
            TenantContext.adopt({ tenantId });
            resolve();
          } catch (error) {
            reject(error as Error);
          }
        }),
      );
    await adopt('11111111-1111-4111-8111-111111111111');
    await expect(
      adopt('22222222-2222-4222-8222-222222222222'),
    ).resolves.toBeUndefined();
  });
});
