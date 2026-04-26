import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { TerminusModule } from '@nestjs/terminus';
import { redisStore } from 'cache-manager-ioredis-yet';
import configuration from './config/configuration';
import { User } from './database/entities/user.entity';
import { Session } from './database/entities/refresh-token.entity';
import { AuditLog } from './database/entities/audit-log.entity';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MilitiaModule } from './militia/militia.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FilesModule } from './files/files.module';
import { KpiModule } from './kpi/kpi.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { MilitiaProfile } from './militia/militia.entity';
import { Task } from './tasks/task.entity';
import { TaskAssignment } from './tasks/task-assignment.entity';
import { AttendanceRecord } from './attendance/attendance.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: '.env',
    }),

    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // Fall back to in-memory store when Redis is unavailable (dev without Docker)
        const redisHost = configService.get('REDIS_HOST', 'localhost');
        const redisPort = configService.get<number>('REDIS_PORT', 6379);
        try {
          const store = await redisStore({
            host: redisHost,
            port: redisPort,
            password: configService.get('REDIS_PASSWORD') || undefined,
            connectTimeout: 2000,
            maxRetriesPerRequest: 1,
          });
          return { store, ttl: 300_000 };
        } catch {
          return { ttl: 300_000 }; // in-memory fallback
        }
      },
      inject: [ConfigService],
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.database'),
        entities: [User, Session, AuditLog, MilitiaProfile, Task, TaskAssignment, AttendanceRecord],
        synchronize: false,
        logging: process.env.NODE_ENV === 'development',
        extra: { min: 2, max: 20, idleTimeoutMillis: 30000 },
      }),
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([User, Session, AuditLog]),

    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.secret'),
        signOptions: { expiresIn: config.get('jwt.accessExpiresIn') },
      }),
      inject: [ConfigService],
    }),

    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    TerminusModule,
    HealthModule,
    MilitiaModule,
    UsersModule,
    TasksModule,
    AttendanceModule,
    AdminModule,
    NotificationsModule,
    FilesModule,
    KpiModule,
    AssignmentsModule,
  ],
  controllers: [AuthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    AuthService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AppModule {}
