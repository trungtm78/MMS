import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssignmentsModule } from '../assignments/assignments.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { UploadInterceptor } from './upload.interceptor';

// Uploads, downloads and attaching uploads to records. Upload limits and content checks live
// in UploadInterceptor; who may read a file in FilesService.
@Module({
  // CA officers read the attachments of the DQTV assigned to them
  imports: [ConfigModule, AssignmentsModule],
  controllers: [FilesController],
  providers: [FilesService, UploadInterceptor],
  exports: [FilesService],
})
export class FilesModule {}
