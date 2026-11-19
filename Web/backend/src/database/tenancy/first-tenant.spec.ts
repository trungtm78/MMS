import * as fs from 'fs';
import * as path from 'path';
import { FIRST_TENANT_CODE, FIRST_TENANT_ID } from './first-tenant';

// SQL cannot import the constant: the migrations repeat it and must keep repeating this one
const migration = (name: string) =>
  fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'migrations', name),
    'utf8',
  );

describe('first tenant', () => {
  it('is the tenant migration 036 creates', () => {
    expect(migration('036_tenants.sql')).toContain(
      `VALUES ('${FIRST_TENANT_ID}', '${FIRST_TENANT_CODE}',`,
    );
  });

  it('is the tenant 037 and 038 give every pre-existing row, and the legacy default', () => {
    const slice = migration('037_tenant_slice_rls.sql');
    expect(slice).toContain(
      `first_tenant constant uuid := '${FIRST_TENANT_ID}'`,
    );
    expect(slice).toContain(`'${FIRST_TENANT_ID}');`);
    expect(
      migration('038_tenant_columns_online.sql').split(
        `DEFAULT '${FIRST_TENANT_ID}'`,
      ),
    ).toHaveLength(58);
  });

  it('is a lower-case uuid', () => {
    expect(FIRST_TENANT_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
