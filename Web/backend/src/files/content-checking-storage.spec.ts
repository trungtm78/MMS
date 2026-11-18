import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import type { Request } from 'express';
import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  ContentCheckingStorage,
  type StoredFileInfo,
} from './content-checking-storage';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest of a png image'.repeat(50)),
]);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type UploadPart = Parameters<ContentCheckingStorage['_handleFile']>[1];

const part = (
  chunks: Buffer[],
  mimetype: string,
  originalname = 'photo.png',
): UploadPart =>
  ({
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    stream: Readable.from(chunks),
  }) as unknown as UploadPart;

describe('ContentCheckingStorage', () => {
  let dir: string;
  let storage: ContentCheckingStorage;

  const handle = (file: UploadPart) =>
    new Promise<StoredFileInfo>((resolve, reject) =>
      storage._handleFile({} as Request, file, (error, info) =>
        error ? reject(error as Error) : resolve(info as StoredFileInfo),
      ),
    );

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-storage-spec-'));
    // A directory created on first use
    storage = new ContentCheckingStorage(() => path.join(dir, 'uploads'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('stores the content under a new UUID with its size, SHA-256 and verified type', async () => {
    const info = await handle(part([PNG], 'application/octet-stream'));

    expect(info.filename).toMatch(UUID);
    expect(info.path).toBe(path.join(dir, 'uploads', info.filename));
    expect(info.size).toBe(PNG.length);
    expect(info.sha256).toBe(createHash('sha256').update(PNG).digest('hex'));
    expect(info.mimetype).toBe('image/png');
    expect(fs.readFileSync(info.path).equals(PNG)).toBe(true);
  });

  it('stores the upload under the directory the request names', async () => {
    const perRequest = new ContentCheckingStorage(
      (req) => (req as unknown as { dir: string }).dir,
    );
    const target = path.join(dir, 'tenants', 'one');

    const info = await new Promise<StoredFileInfo>((resolve, reject) =>
      perRequest._handleFile(
        { dir: target } as unknown as Request,
        part([PNG], 'image/png'),
        (error, stored) =>
          error ? reject(error as Error) : resolve(stored as StoredFileInfo),
      ),
    );

    expect(path.dirname(info.path)).toBe(target);
    expect(fs.readFileSync(info.path).equals(PNG)).toBe(true);
  });

  it('recognises a signature split across chunks', async () => {
    const info = await handle(
      part(
        [PNG.subarray(0, 3), PNG.subarray(3, 5), PNG.subarray(5)],
        'image/png',
      ),
    );

    expect(info.mimetype).toBe('image/png');
    expect(fs.readFileSync(info.path).equals(PNG)).toBe(true);
  });

  // The client's file name never becomes part of the stored path
  it('ignores the client file name when naming the stored file', async () => {
    const info = await handle(
      part([PNG], 'image/png', '../../../etc/cron.d/evil.png'),
    );

    expect(path.dirname(info.path)).toBe(path.join(dir, 'uploads'));
  });

  it.each([
    ['content contradicting the declared type', [PNG], 'image/jpeg'],
    [
      'content of no allowed type',
      [Buffer.from('<html><script>')],
      'application/octet-stream',
    ],
    ['content shorter than any signature', [Buffer.from('ab')], 'image/png'],
  ])(
    'refuses %s with 415 and keeps nothing',
    async (_label, chunks, declared) => {
      await expect(handle(part(chunks, declared))).rejects.toThrow(
        new UnsupportedMediaTypeException('file_type_not_allowed'),
      );
      expect(fs.readdirSync(path.join(dir, 'uploads'))).toEqual([]);
    },
  );

  it('refuses an empty file with 400 and keeps nothing', async () => {
    await expect(handle(part([], 'image/png'))).rejects.toThrow(
      new BadRequestException('file_empty'),
    );
    expect(fs.readdirSync(path.join(dir, 'uploads'))).toEqual([]);
  });

  it('removes a stored file, and accepts one already gone', async () => {
    const info = await handle(part([PNG], 'image/png'));
    const remove = () =>
      new Promise<void>((resolve, reject) =>
        storage._removeFile(
          {} as Request,
          info as unknown as Express.Multer.File,
          (error) => (error ? reject(error) : resolve()),
        ),
      );

    await remove();
    expect(fs.existsSync(info.path)).toBe(false);
    await expect(remove()).resolves.toBeUndefined();
  });
});
