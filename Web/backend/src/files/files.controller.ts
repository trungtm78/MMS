import { createReadStream } from 'fs';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.service';
import { contentDispositionOf } from './content-disposition';
import type { StoredFileInfo } from './content-checking-storage';
import {
  FILE_PURPOSES,
  FilesService,
  type FilePurpose,
  type FileView,
} from './files.service';
import { UploadInterceptor } from './upload.interceptor';

// The text fields of POST /files/upload besides the "file" part
export class UploadFileDto {
  // What the file is for; attaching it to another kind of record is refused
  @IsOptional()
  @IsIn(FILE_PURPOSES)
  purpose?: FilePurpose;
}

type StoredUpload = Express.Multer.File & StoredFileInfo;

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // POST /files/upload (multipart: file, purpose?) → 201 {id, url, name, mimeType, size}.
  // The id is what task reports (photoIds), work reports (attachmentIds) and official
  // documents (fileId) accept.
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(UploadInterceptor)
  async upload(
    @Request() req: { user: JwtPayload },
    @UploadedFile() file: StoredUpload | undefined,
    @Body() body: UploadFileDto,
  ): Promise<FileView> {
    if (!file) throw new BadRequestException('file_required');
    return this.filesService.record(
      req.user.sub,
      {
        storageKey: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        sha256: file.sha256,
      },
      body.purpose,
    );
  }

  // GET /files/:id — the content, for the owner and those who may read the record it is
  // attached to (FilesService.canRead); 404 for anyone else
  @Get(':id')
  async download(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, path } = await this.filesService.openForDownload(
      req.user,
      id,
    );
    res.set({
      'X-Content-Type-Options': 'nosniff',
      // Content from users never runs as a page of the API's origin
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(createReadStream(path), {
      type: file.mimeType,
      length: file.size,
      disposition: contentDispositionOf(file.name, file.mimeType),
    });
  }
}
