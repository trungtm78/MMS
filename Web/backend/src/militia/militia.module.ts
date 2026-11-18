// US-SS-01: MilitiaModule
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MilitiaProfile } from './militia.entity';
import { MilitiaService } from './militia.service';
import { MilitiaController } from './militia.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AssignmentsModule } from '../assignments/assignments.module';
import { ExcelExportService } from '../common/services/excel-export.service';
import { FilesModule } from '../files/files.module';

@Module({
  // Documents of a profile are uploaded files
  imports: [
    TypeOrmModule.forFeature([MilitiaProfile]),
    AssignmentsModule,
    FilesModule,
  ],
  controllers: [MilitiaController],
  providers: [MilitiaService, JwtAuthGuard, ExcelExportService],
  exports: [MilitiaService],
})
export class MilitiaModule {}
