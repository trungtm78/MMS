// Rate limits follow the client address Express derives from the trusted proxies, so
// clients behind nginx are throttled individually and cannot pick their own address.
import type { Server } from 'http';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { configureHttpApp, trustProxySetting } from '../../app.setup';
import { throttlerModuleOptions } from './throttler-options';

@Controller('probe')
class ProbeController {
  @Get()
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  probe() {
    return { ok: true };
  }
}

async function createApp(trustProxy: string | undefined) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRootAsync({
        useFactory: () => throttlerModuleOptions({ NODE_ENV: 'test' }),
      }),
    ],
    controllers: [ProbeController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureHttpApp(app, {
    apiPrefix: 'api',
    trustProxy: trustProxySetting(trustProxy),
  });
  await app.init();
  return app;
}

describe('client address used for throttling', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const probe = (forwardedFor: string) =>
    request(app!.getHttpServer() as Server)
      .get('/api/probe')
      .set('X-Forwarded-For', forwardedFor);

  // supertest connects over loopback, standing in for nginx on the compose network
  it('throttles clients behind a trusted proxy separately', async () => {
    app = await createApp('loopback');

    await probe('203.0.113.1').expect(200);
    await probe('203.0.113.1').expect(200);
    await probe('203.0.113.1').expect(429);

    await probe('203.0.113.2').expect(200);
  });

  it('ignores X-Forwarded-For from a peer that is not a trusted proxy', async () => {
    app = await createApp(undefined);

    await probe('203.0.113.1').expect(200);
    await probe('203.0.113.2').expect(200);
    // A forged header does not buy a fresh limit
    await probe('203.0.113.3').expect(429);
  });
});
