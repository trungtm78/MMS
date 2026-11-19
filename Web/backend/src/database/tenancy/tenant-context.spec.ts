import { randomUUID } from 'crypto';
import { TenantContext, TenantScopeError, scopeKey } from './tenant-context';
import { thrownBy } from '../../../test/support/thrown-by';

const A = randomUUID();
const B = randomUUID();

describe('TenantContext', () => {
  it('has no scope outside a store', () => {
    expect(TenantContext.current()).toBeUndefined();
    expect(scopeKey(undefined)).toBe('none');
  });

  it('runAs scopes everything reached from the callback, across awaits', async () => {
    const seen = await TenantContext.runAs({ tenantId: A }, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return TenantContext.current();
    });
    expect(seen).toEqual({ tenantId: A });
    expect(TenantContext.current()).toBeUndefined();
  });

  it('keeps interleaved scopes apart', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        TenantContext.runAs({ tenantId: i % 2 ? A : B }, async () => {
          await new Promise((resolve) => setImmediate(resolve));
          return TenantContext.requireTenantId();
        }),
      ),
    );
    results.forEach((id, i) => expect(id).toBe(i % 2 ? A : B));
  });

  it('adopt sets the scope of the store for code running after it', async () => {
    await TenantContext.start(async () => {
      expect(TenantContext.current()).toBeUndefined();
      TenantContext.adopt({ tenantId: A });
      await new Promise((resolve) => setImmediate(resolve));
      expect(TenantContext.requireTenantId()).toBe(A);
    });
  });

  it('adopt is idempotent for the same tenant and refuses another one', () => {
    TenantContext.start(() => {
      TenantContext.adopt({ tenantId: A });
      expect(() => TenantContext.adopt({ tenantId: A })).not.toThrow();
      expect(
        thrownBy(() => TenantContext.adopt({ tenantId: B })),
      ).toMatchObject({
        code: 'scope_already_set',
      });
    });
  });

  it('adopt needs a store', () => {
    expect(thrownBy(() => TenantContext.adopt({ tenantId: A }))).toMatchObject({
      code: 'no_scope_store',
    });
  });

  it('refuses a tenant id that is not a UUID', () => {
    expect(
      thrownBy(() => TenantContext.runAs({ tenantId: "x'; --" }, () => 1)),
    ).toBeInstanceOf(TenantScopeError);
  });

  it('requireTenantId throws without a scope', () => {
    TenantContext.start(() => {
      expect(thrownBy(() => TenantContext.requireTenantId())).toMatchObject({
        code: 'no_tenant_scope',
      });
    });
  });

  it('scopeKey distinguishes tenants', () => {
    expect(scopeKey({ tenantId: A })).toBe(`tenant:${A}`);
    expect(scopeKey({ tenantId: A })).not.toBe(scopeKey({ tenantId: B }));
  });
});

describe('TenantContext ids', () => {
  it('keeps tenant ids lower-cased, so another case of the same id is the same scope', () => {
    const upper = A.toUpperCase();
    expect(
      TenantContext.runAs({ tenantId: upper }, () =>
        TenantContext.requireTenantId(),
      ),
    ).toBe(A);
    TenantContext.start(() => {
      TenantContext.adopt({ tenantId: upper });
      expect(
        thrownBy(() => TenantContext.adopt({ tenantId: A })),
      ).toBeUndefined();
      expect(scopeKey(TenantContext.current())).toBe(`tenant:${A}`);
    });
    expect(scopeKey({ tenantId: upper })).toBe(`tenant:${A}`);
  });

  it('leaves the scope as it was when adopt is refused', () => {
    TenantContext.start(() => {
      TenantContext.adopt({ tenantId: A });
      expect(
        thrownBy(() => TenantContext.adopt({ tenantId: B })),
      ).toMatchObject({
        code: 'scope_already_set',
      });
      expect(TenantContext.current()).toEqual({ tenantId: A });
    });
  });

  it('names a tenant id that is not a uuid by its code', () => {
    expect(
      thrownBy(() => TenantContext.runAs({ tenantId: 'x' }, () => 1)),
    ).toMatchObject({
      name: 'TenantScopeError',
      code: 'invalid_tenant_id',
    });
  });
});
