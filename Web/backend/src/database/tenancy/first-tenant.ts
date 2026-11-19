// The tenant migration 036 creates for every row that existed before multi-tenancy. The
// migrations repeat the literal (SQL cannot import it); first-tenant.spec.ts keeps them equal.
export const FIRST_TENANT_ID = 'a1000000-0000-4000-8000-000000000001';
export const FIRST_TENANT_CODE = 'phu-dinh';
