import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { OfficialDocumentsController } from './official-documents.controller';
import { OfficialDocumentsService } from './official-documents.service';

@Module({
  // A document's file is an upload attached to it
  imports: [FilesModule],
  controllers: [OfficialDocumentsController],
  providers: [OfficialDocumentsService],
  exports: [OfficialDocumentsService],
})
export class OfficialDocumentsModule {}
