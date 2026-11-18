// Guards against schema drift between entity classes and the database: every column
// must map to the snake_case names the SQL migrations create. Whether each entity is
// registered with the running connection, and whether its columns exist in the migrated
// schema, is checked against a real database in test/api-contract.e2e-spec.ts.
import * as path from 'path';
import { getMetadataArgsStorage } from 'typeorm';
import type { ConfigService } from '@nestjs/config';
import { loadAllEntities } from '../../test/support/load-all-entities';
import { buildTypeOrmOptions } from './typeorm.options';

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

const entityName = (target: unknown) => (target as { name: string }).name;

describe('entity registration', () => {
  const config = {
    get: (key: string) =>
      ({
        'database.host': 'db',
        'database.port': 5432,
        'database.username': 'user',
        'database.password': 'secret',
        'database.database': 'mms',
      })[key],
  } as unknown as ConfigService;

  beforeAll(() => loadAllEntities(path.join(__dirname, '..')));

  // Entities come from TypeOrmModule.forFeature in the modules that use them
  it('loads entities from the feature modules', () => {
    expect(buildTypeOrmOptions(config)).toMatchObject({
      autoLoadEntities: true,
    });
  });

  it('never lets TypeORM alter the schema (SQL migrations own it)', () => {
    expect(buildTypeOrmOptions(config)).toMatchObject({ synchronize: false });
  });

  it('maps every column to a snake_case database name', () => {
    const offenders = getMetadataArgsStorage()
      .columns.map((c) => ({
        where: `${entityName(c.target)}.${c.propertyName}`,
        name: c.options.name ?? c.propertyName,
      }))
      .filter((c) => !SNAKE_CASE.test(c.name))
      .map((c) => `${c.where} -> ${c.name}`);

    expect(offenders).toEqual([]);
  });

  // Without an explicit type TypeORM copies emitted design:type metadata (a
  // constructor such as String or Object) into options.type. That is Object for
  // nullable unions under isolated transpilers (ts-jest, SWC), and date columns
  // backed by TIMESTAMPTZ default to a timezone-less timestamp.
  it('declares an explicit database type name on every column', () => {
    const offenders = getMetadataArgsStorage()
      .columns.filter(
        (c) =>
          c.mode !== 'virtual' &&
          c.mode !== 'virtual-property' &&
          typeof c.options.type !== 'string',
      )
      .map((c) => `${entityName(c.target)}.${c.propertyName} (${c.mode})`);

    expect(offenders).toEqual([]);
  });

  it('maps every join column to a snake_case database name', () => {
    const offenders = getMetadataArgsStorage()
      .joinColumns.filter((j) => !j.name || !SNAKE_CASE.test(j.name))
      .map(
        (j) =>
          `${entityName(j.target)}.${j.propertyName} -> ${j.name ?? '(default)'}`,
      );

    expect(offenders).toEqual([]);
  });
});
