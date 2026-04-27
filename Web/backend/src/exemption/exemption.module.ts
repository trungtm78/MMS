import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExemptionController } from './exemption.controller'
import { ExemptionService } from './exemption.service'
import { Exemption } from './entities/exemption.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Exemption])],
  controllers: [ExemptionController],
  providers: [ExemptionService],
  exports: [ExemptionService],
})
export class ExemptionModule {}
