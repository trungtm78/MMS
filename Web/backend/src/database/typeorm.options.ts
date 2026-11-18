import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
// Registers the DATE parser before the first connection
import './pg-types';

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
    logging: process.env.NODE_ENV === 'development',
    extra: { min: 2, max: 20, idleTimeoutMillis: 30000 },
  };
}
