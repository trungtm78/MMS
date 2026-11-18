import { Module } from '@nestjs/common';
import { ExemptionController } from './exemption.controller';
import { ExemptionService } from './exemption.service';

// ExemptionService queries through the DataSource; there is no repository to register
@Module({
  controllers: [ExemptionController],
  providers: [ExemptionService],
  exports: [ExemptionService],
})
export class ExemptionModule {}
