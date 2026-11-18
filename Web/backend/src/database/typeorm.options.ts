import type { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
// Registers the DATE parser before the first connection
import './pg-types';
import { bindTenantToConnections } from './tenancy/bind-tenant';
import {
  assertNoLegacyTenantDefault,
  assertRuntimeRoleEnforcesRls,
} from './tenancy/boot-guards';
import { TenancyConfigError, isTenancyEnforced } from './tenancy/tenancy-mode';

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
    // The module retries the data source factory 9 times, 3 s apart, on any error. A tenancy
    // configuration error will not go away by itself: stop at the first.
    toRetry: (error: unknown) => !(error instanceof TenancyConfigError),
  };
}

const logger = new Logger('TenantAwareDataSource');

// In enforced mode every connection is bound to the tenant of the code using it, and the
// database must be one where that binding is the only thing deciding what a session sees:
// no legacy single-tenant default (a request without a scope would then see the first tenant
// instead of nothing) and a runtime role that Row-Level Security applies to.
// isTenancyEnforced() is also the boot-time call that makes a bad TENANCY_MODE value fail
// startup.
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
      await assertRuntimeRoleEnforcesRls(dataSource);
    } catch (error) {
      // Whatever closing the pool says must not hide why the application refuses to start
      await dataSource.destroy().catch((destroyError: unknown) => {
        logger.warn(
          `Could not close the data source after a refused start: ${String(destroyError)}`,
        );
      });
      throw error;
    }
  }
  return dataSource;
}
