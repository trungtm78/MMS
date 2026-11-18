import { createHash, randomUUID } from 'crypto';
import { createWriteStream, promises as fsp, type WriteStream } from 'fs';
import { join } from 'path';
import { Transform, type TransformCallback } from 'stream';
import { pipeline } from 'stream/promises';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { SNIFF_BYTES, resolveUploadType } from './upload-type';

// What the storage engine adds to multer's file object
export interface StoredFileInfo {
  // Server-generated UUID: the storage key, and the file's name on disk
  filename: string;
  path: string;
  size: number;
  // SHA-256 of the content, lowercase hex
  sha256: string;
  // The type the content was verified to be (replaces the client's declaration)
  mimetype: string;
}

/**
 * Passes the upload through while hashing it, counting its bytes and checking its leading
 * bytes against the declared type (upload-type.ts), so content is verified in one pass and
 * refused before more of it is written.
 */
class UploadInspector extends Transform {
  size = 0;
  resolvedType: string | null = null;
  private readonly hash = createHash('sha256');
  private head = Buffer.alloc(0);
  private checked = false;

  constructor(
    private readonly declaredType: string,
    private readonly originalName: string,
  ) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    done: TransformCallback,
  ): void {
    this.size += chunk.length;
    this.hash.update(chunk);
    if (!this.checked) {
      this.head = Buffer.concat([this.head, chunk]);
      if (this.head.length >= SNIFF_BYTES) {
        const refusal = this.check();
        if (refusal) return done(refusal);
      }
    }
    done(null, chunk);
  }

  override _flush(done: TransformCallback): void {
    if (this.size === 0) return done(new BadRequestException('file_empty'));
    if (!this.checked) {
      const refusal = this.check();
      if (refusal) return done(refusal);
    }
    done();
  }

  digest(): string {
    return this.hash.digest('hex');
  }

  private check(): Error | null {
    this.checked = true;
    this.resolvedType = resolveUploadType(
      this.declaredType,
      this.originalName,
      this.head.subarray(0, SNIFF_BYTES),
    );
    this.head = Buffer.alloc(0);
    return this.resolvedType
      ? null
      : new UnsupportedMediaTypeException('file_type_not_allowed');
  }
}

const closed = (stream: WriteStream) =>
  stream.closed
    ? Promise.resolve()
    : new Promise<void>((resolve) => stream.once('close', () => resolve()));

/**
 * Multer storage for POST /files/upload: stores each file under a new UUID in the directory
 * the request names (never under a name the client chose), and refuses empty files and content
 * that is not the allowed type it claims to be, leaving nothing behind.
 */
export class ContentCheckingStorage implements StorageEngine {
  constructor(private readonly directory: (req: Request) => string) {}

  _handleFile(
    req: Request,
    file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void,
  ): void {
    this.store(req, file).then(
      (info) => callback(null, info),
      (error: unknown) => callback(error),
    );
  }

  _removeFile(
    _req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void,
  ): void {
    if (!file.path) return callback(null);
    fsp.rm(file.path, { force: true }).then(
      () => callback(null),
      (error: Error) => callback(error),
    );
  }

  private async store(
    req: Request,
    file: Express.Multer.File,
  ): Promise<StoredFileInfo> {
    const directory = this.directory(req);
    await fsp.mkdir(directory, { recursive: true });
    const filename = randomUUID();
    const path = join(directory, filename);
    const inspector = new UploadInspector(file.mimetype, file.originalname);
    const out = createWriteStream(path, { flags: 'wx' });
    try {
      await pipeline(file.stream, inspector, out);
    } catch (error) {
      // Windows cannot remove a file that is still open
      await closed(out);
      await fsp.rm(path, { force: true });
      throw error;
    }
    return {
      filename,
      path,
      size: inspector.size,
      sha256: inspector.digest(),
      mimetype: inspector.resolvedType as string,
    };
  }
}
