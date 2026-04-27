import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Redis adapter for Socket.IO — optional (falls back to in-memory when Redis unavailable)
  try {
    const pubClient = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await pubClient.connect();
    const subClient = pubClient.duplicate();
    const redisAdapter = createAdapter(pubClient, subClient);

    class RedisIoAdapter extends IoAdapter {
      createIOServer(port: number, options?: Record<string, unknown>) {
        const server = super.createIOServer(port, options);
        server.adapter(redisAdapter);
        return server;
      }
    }
    app.useWebSocketAdapter(new RedisIoAdapter(app));
  } catch {
    // Redis unavailable — Socket.IO uses default in-memory adapter (single-instance OK)
    console.warn('Redis unavailable — Socket.IO using in-memory adapter');
  }

  // Global prefix
  app.setGlobalPrefix(config.get<string>('apiPrefix') ?? 'api/v1/mms_core');

  // CORS — frontend origin
  app.enableCors({
    origin: config.get<string>('cors.origin'),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global error filter
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  console.log(
    `MMS backend running on http://localhost:${port}/api/v1/mms_core`,
  );
}

void bootstrap();
