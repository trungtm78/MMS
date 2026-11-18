import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
// Registers the DATE parser before the first connection
import './pg-types';
import { bindTenantToConnections } from './tenancy/bind-tenant';
import { assertNoLegacyTenantDefault } from './tenancy/legacy-default-guard';
import { isTenancyEnforced } from './tenancy/tenancy-mode';

// Root TypeORM connection. The schema is owned by the SQL migrations, never synchronized.
// Entities are registered by the feature modules that use them (TypeOrmModule.forFeature),
// so a new module cannot silently miss the root entity list again.
export function buildTypeOrmOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get('database.host'),
    port: config.get('database.port'),
    username: config.get('database.username'),
    password: config.get('database.password'),
    database: config.get('database.database'),
    autoLoadEntities: true,
    synchronize: false,
    // Extensions come with the migrations; the runtime role is not allowed to create them
    installExtensions: false,
    logging: process.env.NODE_ENV === 'development',
    extra: { min: 2, max: 20, idleTimeoutMillis: 30000 },
  };
}

// In enforced mode every connection is bound to the tenant of the code using it, and the
// database must not carry the legacy single-tenant default (a request without a scope would
// then see the first tenant instead of nothing). isTenancyEnforced() is also the boot-time
// call that makes a bad TENANCY_MODE value fail startup.
export async function tenantAwareDataSource(
  options?: DataSourceOptions,
): Promise<DataSource> {
  const dataSource = new DataSource(options as DataSourceOptions);
  const enforced = isTenancyEnforced();
  if (enforced) bindTenantToConnections(dataSource);
  await dataSource.initialize();
  if (enforced) {
    try {
      await assertNoLegacyTenantDefault(dataSource);
    } catch (error) {
      await dataSource.destroy();
      throw error;
    }
  }
  return dataSource;
}
