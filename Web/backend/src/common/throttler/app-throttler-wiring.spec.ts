// Boot-checks the ThrottlerModule entry exactly as AppModule declares it, without a
// database: the storage it selects per environment, and that production refuses to start
// on per-replica counters when Redis is missing.
import { createServer, type AddressInfo } from 'net';
import type { DynamicModule } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerModule,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { AppModule } from '../../app.module';

function appThrottlerImport(): DynamicModule {
  const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as
    | unknown[]
    | undefined;
  const matches = (imports ?? []).filter(
    (entry): entry is DynamicModule =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as DynamicModule).module === ThrottlerModule,
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

const THROTTLE_ENV = [
  'NODE_ENV',
  'THROTTLE_STORAGE',
  'THROTTLE_KEY_PREFIX',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
] as const;

async function withEnv<T>(
  vars: Partial<Record<(typeof THROTTLE_ENV)[number], string>>,
  fn: () => Promise<T>,
): Promise<T> {
  const saved = Object.fromEntries(
    THROTTLE_ENV.map((name) => [name, process.env[name]]),
  );
  for (const name of THROTTLE_ENV) delete process.env[name];
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const name of THROTTLE_ENV) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
}

/** A local port nothing listens on. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe('AppModule throttler wiring', () => {
  it('builds its options asynchronously so the storage can be chosen at startup', () => {
    const providers = appThrottlerImport().providers ?? [];

    // forRoot would provide the options as a fixed value, chosen before startup
    const optionsProvider = providers.find(
      (provider) =>
        typeof provider === 'object' && provider.provide === getOptionsToken(),
    );
    expect(optionsProvider).toBeDefined();
    expect(
      typeof optionsProvider === 'object' &&
        'useFactory' in optionsProvider &&
        typeof optionsProvider.useFactory === 'function',
    ).toBe(true);
  });

  // test/api-contract.e2e-spec.ts boots AppModule with NODE_ENV=test and no Redis
  it('keeps counters in memory under NODE_ENV=test', async () => {
    await withEnv({ NODE_ENV: 'test' }, async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [appThrottlerImport()],
      }).compile();

      expect(moduleRef.get(getStorageToken())).toBeInstanceOf(
        ThrottlerStorageService,
      );
      await moduleRef.close();
    });
  });

  it('refuses to start in production when Redis is unreachable', async () => {
    const port = await closedPort();

    await withEnv(
      {
        NODE_ENV: 'production',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: `${port}`,
      },
      async () => {
        await expect(
          Test.createTestingModule({
            imports: [appThrottlerImport()],
          }).compile(),
        ).rejects.toThrow(new RegExp(`127\\.0\\.0\\.1:${port}.*unreachable`));
      },
    );
  }, 20_000);
});
