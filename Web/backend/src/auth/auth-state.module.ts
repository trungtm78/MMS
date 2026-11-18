import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { AuthStateService } from './auth-state.service';
import {
  AuthRevocationFeed,
  LISTENER_CONNECTION_FACTORY,
  type ListenerConnectionFactory,
} from './auth-revocation-feed';

/** A dedicated connection to the application database, for LISTEN. */
export function pgListenerConnectionFactory(
  config: ConfigService,
): ListenerConnectionFactory {
  return () =>
    new Client({
      host: config.get<string>('database.host'),
      port: config.get<number>('database.port'),
      user: config.get<string>('database.username'),
      password: config.get<string>('database.password'),
      database: config.get<string>('database.database'),
      application_name: 'mms-auth-revocations',
      keepAlive: true,
    });
}

// JwtAuthGuard is provided by many feature modules; the session check it depends on is
// global so every one of them can resolve it. The revocation feed lets the realtime
// gateway close the sockets of sessions that end.
@Global()
@Module({
  providers: [
    AuthStateService,
    AuthRevocationFeed,
    {
      provide: LISTENER_CONNECTION_FACTORY,
      inject: [ConfigService],
      useFactory: pgListenerConnectionFactory,
    },
  ],
  exports: [AuthStateService, AuthRevocationFeed],
})
export class AuthStateModule {}
