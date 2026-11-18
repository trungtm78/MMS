import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { throttlerModuleOptions } from './common/throttler/throttler-options';
import { TerminusModule } from '@nestjs/terminus';
import configuration from './config/configuration';
import { User } from './database/entities/user.entity';
import { Session } from './database/entities/refresh-token.entity';
import { AuditLog } from './database/entities/audit-log.entity';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthStateModule } from './auth/auth-state.module';
import { createHmac } from 'crypto';
import { MfaAdminController, MfaController } from './auth/mfa/mfa.controller';
import { MFA_SECRET_KEY, MfaService } from './auth/mfa/mfa.service';
import {
  MFA_CHALLENGE_KEY,
  MfaChallengeService,
} from './auth/mfa/mfa-challenge.service';
import { mfaKeyFromEnv } from './auth/mfa/mfa-secret-crypto';
import {
  LOGIN_ATTEMPT_KEY,
  LoginAttemptsService,
} from './auth/login-attempts.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
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
import { LeaveModule } from './leave/leave.module';
import { TrainingModule } from './training/training.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { PayrollModule } from './payroll/payroll.module';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { GpsModule } from './gps/gps.module';
import { SosModule } from './sos/sos.module';
import { WorkReportsModule } from './work-reports/work-reports.module';
import { OfficialDocumentsModule } from './official-documents/official-documents.module';
import { ChatModule } from './chat/chat.module';
import { DevicesModule } from './devices/devices.module';
import { OrganizationModule } from './organization/organization.module';
import { WeaponsModule } from './weapons/weapons.module';
import { ExemptionModule } from './exemption/exemption.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { RewardsModule } from './rewards/rewards.module';
import { SettingsModule } from './settings/settings.module';
import { CustomReportsModule } from './reports/custom-reports.module';
import { SeederService } from './database/seeder.service';
import {
  buildTypeOrmOptions,
  tenantAwareDataSource,
} from './database/typeorm.options';
import { TenancyModule } from './database/tenancy/tenancy.module';
import { TenantScopeMiddleware } from './database/tenancy/tenant-scope.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: buildTypeOrmOptions,
      dataSourceFactory: tenantAwareDataSource,
      inject: [ConfigService],
    }),
    TenancyModule,

    TypeOrmModule.forFeature([User, Session, AuditLog]),

    // Session checks behind JwtAuthGuard, which many feature modules provide
    AuthStateModule,

    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.secret'),
        signOptions: { expiresIn: config.get('jwt.accessExpiresIn') },
      }),
      inject: [ConfigService],
    }),

    // Counters shared through Redis in production, so replicas enforce one limit; process
    // memory elsewhere. Startup fails when the selected store cannot be used.
    ThrottlerModule.forRootAsync({
      useFactory: () => throttlerModuleOptions(process.env),
    }),

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
    LeaveModule,
    TrainingModule,
    SchedulerModule,
    PayrollModule,
    AuditModule,
    DashboardModule,
    GpsModule,
    SosModule,
    WorkReportsModule,
    OfficialDocumentsModule,
    ChatModule,
    DevicesModule,
    OrganizationModule,
    WeaponsModule,
    ExemptionModule,
    RecruitmentModule,
    RewardsModule,
    SettingsModule,
    CustomReportsModule,
  ],
  controllers: [AuthController, MfaController, MfaAdminController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    AuthService,
    MfaService,
    MfaChallengeService,
    // Fails at startup in production without a valid MFA_ENCRYPTION_KEY
    {
      provide: MFA_SECRET_KEY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        mfaKeyFromEnv(process.env, config.get<string>('jwt.secret') ?? ''),
    },
    // Challenge tokens are hashed with a key derived from, but distinct from, the
    // encryption key
    {
      provide: MFA_CHALLENGE_KEY,
      inject: [MFA_SECRET_KEY],
      useFactory: (key: Buffer) =>
        createHmac('sha256', key).update('mfa-challenge-token').digest(),
    },
    LoginAttemptsService,
    // Sign-in failure counters are keyed by an HMAC of the submitted name, with another key
    // derived from the MFA key
    {
      provide: LOGIN_ATTEMPT_KEY,
      inject: [MFA_SECRET_KEY],
      useFactory: (key: Buffer) =>
        createHmac('sha256', key).update('login-attempt-name').digest(),
    },
    JwtAuthGuard,
    RolesGuard,
    SeederService,
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantScopeMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
