import { Global, Module } from '@nestjs/common';
import { TenantJobRunner } from './tenant-job-runner';

@Global()
@Module({ providers: [TenantJobRunner], exports: [TenantJobRunner] })
export class TenancyModule {}
