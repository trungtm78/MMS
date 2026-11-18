import { promises as fsp } from 'fs';
import { from, mergeMap, catchError, throwError, type Observable } from 'rxjs';
import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Options as MulterConfig } from 'multer';
import { ContentCheckingStorage } from './content-checking-storage';
import { FilesService } from './files.service';
import { MAX_UPLOAD_BYTES, isDeclaredTypeAcceptable } from './upload-type';

// Messages of multer's limit errors other than the file size (multer/lib/multer-error.js)
const FIELD_LIMIT_MESSAGES = [
  'Too many',
  'Field name',
  'Field value',
  'Unexpected field',
];

// The request as this interceptor and the storage engine see it
interface UploadRequest {
  // Chosen on entry, while the request still runs under its tenant (see intercept)
  uploadDirectory?: string;
  file?: { path?: string };
}

/** Multer and busboy errors as the snake_case codes every other endpoint answers with. */
export function uploadError(error: Error): Error {
  if (error instanceof PayloadTooLargeException) {
    return new PayloadTooLargeException('file_too_large');
  }
  if (error instanceof BadRequestException) {
    if (error.message.startsWith('Multipart:')) {
      return new BadRequestException('multipart_malformed');
    }
    if (FIELD_LIMIT_MESSAGES.some((m) => error.message.startsWith(m))) {
      return new BadRequestException('file_field_invalid');
    }
  }
  return error;
}

/**
 * Removes the file multer stored when the request then fails (body validation, the database),
 * before the error goes on, so a refused upload leaves no content on disk.
 */
export function withStoredFileCleanup(
  request: { file?: { path?: string } },
  next: CallHandler,
): CallHandler {
  return {
    handle: () =>
      next.handle().pipe(
        catchError((error: unknown) => {
          const stored = request.file?.path;
          const removal = stored
            ? fsp.rm(stored, { force: true }).catch(() => undefined)
            : Promise.resolve();
          return from(removal).pipe(mergeMap(() => throwError(() => error)));
        }),
      ),
  };
}

/**
 * multipart/form-data with one "file" part (and an optional "purpose" field): at most
 * MAX_UPLOAD_BYTES, of an allowed type its content confirms (ContentCheckingStorage).
 */
@Injectable()
export class UploadInterceptor implements NestInterceptor {
  private readonly multer: NestInterceptor;

  constructor(private readonly files: FilesService) {
    // multer's own Options: Nest's MulterOptions type omits defParamCharset, which multer
    // passes on to busboy
    const options: MulterConfig = {
      // The directory was fixed in intercept(): multer's stream callbacks do not reliably
      // keep the request's tenant context. Without it the upload is refused, never stored
      // in a default directory.
      storage: new ContentCheckingStorage(
        (req) => (req as unknown as UploadRequest).uploadDirectory,
      ),
      // Browsers and Dio send the part's filename as raw UTF-8 (RFC 7578); busboy would
      // read it as latin1 and turn "ảnh.png" into "áº£nh.png"
      defParamCharset: 'utf8',
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 5,
        fieldSize: 1024,
        parts: 6,
      },
      // A declared type that can never be allowed is refused before anything is stored
      fileFilter: (_req, file, accept) => {
        if (isDeclaredTypeAcceptable(file.mimetype)) {
          accept(null, true);
        } else {
          accept(new UnsupportedMediaTypeException('file_type_not_allowed'));
        }
      },
    };
    const Multer = FileInterceptor('file', options);
    this.multer = new Multer();
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<UploadRequest>();
    request.uploadDirectory = this.files.tenantUploadDir();
    try {
      return (await this.multer.intercept(
        context,
        withStoredFileCleanup(request, next),
      )) as Observable<unknown>;
    } catch (error) {
      throw uploadError(error as Error);
    }
  }
}
