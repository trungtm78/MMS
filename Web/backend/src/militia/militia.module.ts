// US-SS-01: MilitiaModule
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MilitiaProfile } from './militia.entity';
import { MilitiaService } from './militia.service';
import { MilitiaController } from './militia.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [TypeOrmModule.forFeature([MilitiaProfile]), AssignmentsModule],
  controllers: [MilitiaController],
  providers: [MilitiaService, JwtAuthGuard],
  exports: [MilitiaService],
})
export class MilitiaModule {}
