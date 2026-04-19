import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { lookup } from 'mime-types';
import type { ReadStream } from 'fs';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

@Injectable()
export class FilesService {
  getFilePath(filename: string): string {
    const fullPath = join(UPLOAD_DIR, filename);
    if (!existsSync(fullPath)) throw new NotFoundException('File not found');
    // Prevent path traversal: ensure the resolved path stays within UPLOAD_DIR
    if (!fullPath.startsWith(UPLOAD_DIR)) throw new NotFoundException('File not found');
    return fullPath;
  }

  getMimeType(filename: string): string {
    return (lookup(filename) || 'application/octet-stream') as string;
  }

  createReadStream(filename: string): ReadStream {
    return createReadStream(this.getFilePath(filename));
  }
}
