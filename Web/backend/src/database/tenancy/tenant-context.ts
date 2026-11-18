import { AsyncLocalStorage } from 'async_hooks';
import { isUUID } from 'class-validator';

export interface TenantScope {
  readonly tenantId: string;
}

type ScopeErrorCode =
  | 'no_scope_store'
  | 'scope_already_set'
  | 'no_tenant_scope'
  | 'invalid_tenant_id'
  | 'tenant_scope_mismatch';

export class TenantScopeError extends Error {
  constructor(
    readonly code: ScopeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

interface Store {
  scope?: TenantScope;
}

const storage = new AsyncLocalStorage<Store>();

const assertScope = (scope: TenantScope): void => {
  if (!isUUID(scope.tenantId)) {
    throw new TenantScopeError(
      'invalid_tenant_id',
      'A tenant scope needs a UUID tenant id',
    );
  }
};

/** Comparable identity of a scope; `none` is the absence of one. */
export const scopeKey = (scope: TenantScope | undefined): string =>
  scope ? `tenant:${scope.tenantId}` : 'none';

export const TenantContext = {
  /** Starts a store with no scope yet (one per HTTP request); `adopt` fills it in. */
  start<T>(fn: () => T): T {
    return storage.run({}, fn);
  },

  /** Runs `fn` under `scope`: a socket event, a background job, a sign-in. */
  runAs<T>(scope: TenantScope, fn: () => T): T {
    assertScope(scope);
    return storage.run({ scope }, fn);
  },

  /**
   * Sets the scope of the current store, once. Everything that runs after it in the same
   * request (later guards, interceptors, handlers) sees it, because the store is shared.
   */
  adopt(scope: TenantScope): void {
    assertScope(scope);
    const store = storage.getStore();
    if (!store) {
      throw new TenantScopeError(
        'no_scope_store',
        'No tenant scope store: the request did not pass TenantScopeMiddleware',
      );
    }
    if (store.scope && store.scope.tenantId !== scope.tenantId) {
      throw new TenantScopeError(
        'scope_already_set',
        'The request already runs under another tenant',
      );
    }
    store.scope = scope;
  },

  current(): TenantScope | undefined {
    return storage.getStore()?.scope;
  },

  requireTenantId(): string {
    const scope = storage.getStore()?.scope;
    if (!scope) {
      throw new TenantScopeError('no_tenant_scope', 'No tenant scope');
    }
    return scope.tenantId;
  },
};
