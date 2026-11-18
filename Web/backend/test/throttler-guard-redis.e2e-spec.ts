// ThrottlerGuard wired through AppModule's own ThrottlerModule entry: two app instances
// (replicas) configured for production share one Redis and therefore one counter per
// client, while the previous in-memory storage lets each replica count on its own.
//
// Requires TEST_REDIS_URL, e.g. redis://localhost:6379 (host, port and password
// are used; keys live under a per-run prefix that is deleted afterwards).
import type { Server } from 'http';
import {
  Controller,
  DynamicModule,
  Get,
  INestApplication,
} from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  getStorageToken,
  Throttle,
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp, trustProxySetting } from '../src/app.setup';
import { RedisThrottlerStorage } from '../src/common/throttler/redis-throttler.storage';

jest.setTimeout(30_000);

const redisUrl = process.env.TEST_REDIS_URL;
if (!redisUrl) {
  throw new Error(
    'TEST_REDIS_URL is not set (e.g. redis://localhost:6379); this suite needs a real Redis',
  );
}
const parsed = new URL(redisUrl);
const REDIS_HOST = parsed.hostname;
const REDIS_PORT = parsed.port || '6379';
const REDIS_PASSWORD = decodeURIComponent(parsed.password);
const RUN_PREFIX = `mms:throttle-test:guard-${process.pid}-${Date.now()}:`;

@Controller('probe')
class ProbeController {
  @Get()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  probe() {
    return { ok: true };
  }
}

function appThrottlerImport(): DynamicModule {
  const imports = Reflect.getMetadata(
    MODULE_METADATA.IMPORTS,
    AppModule,
  ) as unknown[];
  const entry = imports.find(
    (i): i is DynamicModule =>
      typeof i === 'object' &&
      i !== null &&
      (i as DynamicModule).module === ThrottlerModule,
  );
  if (!entry) throw new Error('AppModule does not import ThrottlerModule');
  return entry;
}

const ENV_NAMES = [
  'NODE_ENV',
  'THROTTLE_STORAGE',
  'THROTTLE_KEY_PREFIX',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
];
const savedEnv = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
);
function setEnv(vars: Record<string, string>) {
  for (const name of ENV_NAMES) delete process.env[name];
  Object.assign(process.env, vars);
}
function restoreEnv() {
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
}

/** One backend replica: AppModule's throttler configuration behind the same HTTP setup. */
async function bootReplica(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [appThrottlerImport()],
    controllers: [ProbeController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureHttpApp(app, {
    apiPrefix: 'api',
    // supertest connects over loopback, standing in for nginx
    trustProxy: trustProxySetting('loopback', { production: true }),
  });
  await app.init();
  return app;
}

const probe = (app: INestApplication, client: string) =>
  request(app.getHttpServer() as Server)
    .get('/api/probe')
    .set('X-Forwarded-For', client);

describe('ThrottlerGuard across replicas', () => {
  afterAll(restoreEnv);

  describe('production configuration (Redis)', () => {
    let replicaA: INestApplication;
    let replicaB: INestApplication;
    let raw: Redis;

    beforeAll(async () => {
      // THROTTLE_STORAGE is left unset: production selects Redis by default
      setEnv({
        NODE_ENV: 'production',
        REDIS_HOST,
        REDIS_PORT,
        REDIS_PASSWORD,
        THROTTLE_KEY_PREFIX: RUN_PREFIX,
      });
      replicaA = await bootReplica();
      replicaB = await bootReplica();
      raw = new Redis({
        host: REDIS_HOST,
        port: Number(REDIS_PORT),
        password: REDIS_PASSWORD || undefined,
      });
    });

    afterAll(async () => {
      await replicaA?.close();
      await replicaB?.close();
      if (raw) {
        const keys = await raw.keys(`${RUN_PREFIX}*`);
        if (keys.length) await raw.del(...keys);
        await raw.quit();
      }
    });

    it('gives each replica the Redis storage with its own connection', () => {
      const storageA: unknown = replicaA.get(getStorageToken());
      const storageB: unknown = replicaB.get(getStorageToken());

      expect(storageA).toBeInstanceOf(RedisThrottlerStorage);
      expect(storageB).toBeInstanceOf(RedisThrottlerStorage);
      expect(storageA).not.toBe(storageB);
    });

    it('shares one counter per client between replicas', async () => {
      const client = '198.51.100.7';

      await probe(replicaA, client).expect(200);
      await probe(replicaB, client).expect(200);
      await probe(replicaA, client).expect(200);
      const blocked = await probe(replicaB, client).expect(429);
      await probe(replicaA, client).expect(429);

      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('keeps other clients behind the proxy unaffected', async () => {
      await probe(replicaB, '198.51.100.8').expect(200);
    });

    it('stores the counters under the configured key prefix', async () => {
      const keys = await raw.keys(`${RUN_PREFIX}default:*`);

      expect(keys.some((k) => k.endsWith(':block'))).toBe(true);
      expect(keys.some((k) => k.endsWith(':hits'))).toBe(true);
    });
  });

  describe('in-memory storage (the previous configuration)', () => {
    let replicaA: INestApplication;
    let replicaB: INestApplication;

    beforeAll(async () => {
      setEnv({ NODE_ENV: 'test' });
      replicaA = await bootReplica();
      replicaB = await bootReplica();
    });

    afterAll(async () => {
      await replicaA?.close();
      await replicaB?.close();
    });

    it('lets every replica count separately, multiplying the limit', async () => {
      expect(replicaA.get(getStorageToken())).toBeInstanceOf(
        ThrottlerStorageService,
      );
      const client = '198.51.100.9';

      for (let i = 0; i < 3; i++) {
        await probe(replicaA, client).expect(200);
        await probe(replicaB, client).expect(200);
      }
    });
  });
});
