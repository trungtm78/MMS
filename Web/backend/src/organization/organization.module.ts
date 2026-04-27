import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OrganizationController } from './organization.controller'
import { OrganizationService } from './organization.service'
import { OrganizationUnit } from './entities/organization-unit.entity'

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationUnit])],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
