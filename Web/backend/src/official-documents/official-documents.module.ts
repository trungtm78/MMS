import { Module } from '@nestjs/common';
import { OfficialDocumentsController } from './official-documents.controller';
import { OfficialDocumentsService } from './official-documents.service';

@Module({
  controllers: [OfficialDocumentsController],
  providers: [OfficialDocumentsService],
  exports: [OfficialDocumentsService],
})
export class OfficialDocumentsModule {}
