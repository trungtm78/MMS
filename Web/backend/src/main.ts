import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureHttpApp, trustProxyFromEnv } from './app.setup';
import { createSocketIoAdapter } from './common/realtime/socket-io-adapter';

async function bootstrap() {
  // Checked before anything starts: in production a missing or malformed TRUST_PROXY would
  // rate-limit every client as the proxy's address
  const trustProxy = trustProxyFromEnv(process.env);

  // Startup errors (e.g. THROTTLE_STORAGE=redis with Redis unreachable) reach the handler
  // below instead of aborting the process
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const config = app.get(ConfigService);

  // Redis pub/sub in production, so clients of every replica receive every event; process
  // memory elsewhere. Startup fails when the selected adapter cannot be used.
  app.useWebSocketAdapter(await createSocketIoAdapter(app));
  // SIGTERM (docker stop, rolling restarts) closes the app, its sockets and Redis clients
  app.enableShutdownHooks();

  // Prefix, CORS, trusted proxies, validation and error format (shared with the e2e suites)
  configureHttpApp(app, {
    apiPrefix: config.get<string>('apiPrefix') ?? 'api/v1/mms_core',
    corsOrigin: config.get<string[]>('cors.origin'),
    trustProxy,
  });

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  console.log(
    `MMS backend running on http://localhost:${port}/api/v1/mms_core`,
  );
}

bootstrap().catch((error: unknown) => {
  console.error(
    'MMS backend failed to start:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
