// T20 gaps reported by the mobile clients, on a real, freshly migrated Postgres:
// - GET /users/search scoped by ContactPolicy, and chat conversation creation agreeing with it
// - uploads as records (POST /files/upload, GET /files/:id) with content checks and access rules
// - work report attachments, task report photos (migration 028 tables)
// - GET /leave/types and the reviewer of leave requests
// - GET /kpi/current components, ranks in the unit and history order
//
// Requires MIGRATION_TEST_ADMIN_URL, e.g. postgres://mms:mms_secret@localhost:5440/postgres
import { createHash } from 'crypto';
import * as fs from 'fs';
import type { IncomingMessage, Server } from 'http';
import * as os from 'os';
import * as path from 'path';
import { Client } from 'pg';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { migrateDatabase } from '../src/database/migrations/migrate';
import { configureHttpApp } from '../src/app.setup';
import { FilesService } from '../src/files/files.service';
import { withClient } from './support/db';
import {
  backendTenancyEnv,
  prepareDatabaseForTenancy,
} from './support/e2e-tenancy';

jest.setTimeout(240_000);

const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
if (!adminUrl) {
  throw new Error(
    'MIGRATION_TEST_ADMIN_URL is not set (e.g. postgres://mms:mms_secret@localhost:5440/postgres)',
  );
}

const PREFIX = 'api/v1/mms_core';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const UNIT_A = 'KV-T20-A';
const UNIT_B = 'KV-T20-B';

type Body = Record<string, unknown>;
const bodyOf = <T = Body>(res: request.Response) => res.body as T;
const messageOf = (res: request.Response) =>
  bodyOf<{ message?: string }>(res).message;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('t20 png body '.repeat(40)),
]);
const PDF = Buffer.from('%PDF-1.7\n' + 't20 pdf body '.repeat(40));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Collects a binary response body as a Buffer
const binary = (
  res: IncomingMessage,
  done: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

function databaseUrl(name: string): string {
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  return url.toString();
}

describe('Client gaps T20 (e2e)', () => {
  const dbName = `mms_t20_${Date.now()}`;
  const targetUrl = databaseUrl(dbName);
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-t20-uploads-'));
  let app: INestApplication;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const members: Record<string, string> = {};

  const api = () => request(app.getHttpServer() as Server);
  const db = <T>(fn: (client: Client) => Promise<T>) =>
    withClient(targetUrl, fn);
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const url = (route: string) => `/${PREFIX}${route}`;

  async function login(username: string, password: string): Promise<string> {
    const res = await api()
      .post(url('/auth/login'))
      .send({ username, password })
      .expect(200);
    return bodyOf<{ tokens: { accessToken: string } }>(res).tokens.accessToken;
  }

  async function account(
    username: string,
    fullName: string,
    role: string,
    unitCode?: string,
  ) {
    const created = await api()
      .post(url('/admin/users'))
      .set(auth('admin'))
      .send({ username, fullName, role, ...(unitCode ? { unitCode } : {}) })
      .expect(201);
    const body = bodyOf<{ id: string; temporaryPassword: string }>(created);
    ids[username] = body.id;
    tokens[username] = await login(username, body.temporaryPassword);
  }

  async function insertMember(
    code: string,
    name: string,
    cccd: string,
    unitCode: string,
    userId: string,
  ): Promise<string> {
    return db(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
         SELECT $1, $2, $3, '1998-04-04', u.id, '2022-01-01', $5
         FROM units u WHERE u.code = $4
         RETURNING id`,
        [code, name, cccd, unitCode, userId],
      );
      return rows[0].id;
    });
  }

  const upload = (
    who: string,
    content: Buffer,
    filename: string,
    contentType: string,
    purpose?: string,
  ) => {
    const req = api().post(url('/files/upload')).set(auth(who));
    if (purpose) void req.field('purpose', purpose);
    return req.attach('file', content, { filename, contentType });
  };
  const uploadedId = async (
    who: string,
    content: Buffer,
    filename: string,
    contentType: string,
    purpose?: string,
  ) =>
    bodyOf<{ id: string }>(
      await upload(who, content, filename, contentType, purpose).expect(201),
    ).id;
  // superagent hands the parser the raw IncomingMessage
  const download = (who: string, id: string) =>
    api()
      .get(url(`/files/${id}`))
      .set(auth(who))
      .buffer(true)
      .parse(binary as unknown as Parameters<request.Test['parse']>[0]);

  beforeAll(async () => {
    await withClient(adminUrl, (c) => c.query(`CREATE DATABASE ${dbName}`));
    await migrateDatabase({
      connectionString: targetUrl,
      directory: MIGRATIONS_DIR,
    });
    await prepareDatabaseForTenancy(dbName);

    // Configuration is read when AppModule is loaded, so set it before requiring it
    const target = new URL(targetUrl);
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DB_HOST: target.hostname,
      DB_PORT: target.port || '5432',
      DB_USER: decodeURIComponent(target.username),
      DB_PASSWORD: decodeURIComponent(target.password),
      DB_NAME: dbName,
      API_PREFIX: PREFIX,
      JWT_SECRET: 'e2e-access-secret-0123456789abcdef',
      JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef',
      AES_CCCD_KEY: 'a'.repeat(64),
      THROTTLE_LOGIN_LIMIT: '100000',
      THROTTLE_MFA_LIMIT: '100000',
      UPLOAD_DIR: uploadDir,
      ...backendTenancyEnv(),
    });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: PREFIX });
    await app.init(); // runs SeederService: admin / Admin@123

    tokens.admin = await login('admin', 'Admin@123');
    ids.admin = await db(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM users WHERE username = 'admin'`,
      );
      return rows[0].id;
    });

    await db((c) =>
      c.query(
        `INSERT INTO units (code, name, type)
         VALUES ($1, 'Khu vực T20 A', 'area'), ($2, 'Khu vực T20 B', 'area')
         ON CONFLICT (tenant_id, code) DO NOTHING`,
        [UNIT_A, UNIT_B],
      ),
    );
    await account('t20_ward', 'T20 Trưởng phường', 'police_ward');
    await account('t20_staff_a', 'T20 Văn thư A', 'office_staff', UNIT_A);
    await account('t20_area_a', 'T20 Công an KV A', 'police_area', UNIT_A);
    await account('t20_area_b', 'T20 Công an KV B', 'police_area', UNIT_B);
    await account('t20_ca_b', 'T20 Cán bộ CA B', 'ca_officer', UNIT_B);
    await account('t20_dqtv_a', 'T20 Nguyễn Văn An', 'dqtv', UNIT_A);
    await account('t20_dqtv_a2', 'T20 Trần Văn Bình', 'dqtv', UNIT_A);
    await account('t20_dqtv_a3', 'T20 Lê Văn Cường', 'dqtv', UNIT_A);
    await account('t20_dqtv_b', 'T20 Phạm Văn Dũng', 'dqtv', UNIT_B);
    await account('t20_inactive_a', 'T20 Đã nghỉ A', 'office_staff', UNIT_A);

    members.a = await insertMember(
      'DQ-T20-A1',
      'T20 Nguyễn Văn An',
      '079200920001',
      UNIT_A,
      ids.t20_dqtv_a,
    );
    members.a2 = await insertMember(
      'DQ-T20-A2',
      'T20 Trần Văn Bình',
      '079200920002',
      UNIT_A,
      ids.t20_dqtv_a2,
    );
    members.a3 = await insertMember(
      'DQ-T20-A3',
      'T20 Lê Văn Cường',
      '079200920003',
      UNIT_A,
      ids.t20_dqtv_a3,
    );
    members.b = await insertMember(
      'DQ-T20-B1',
      'T20 Phạm Văn Dũng',
      '079200920004',
      UNIT_B,
      ids.t20_dqtv_b,
    );

    await db(async (c) => {
      await c.query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [
        ids.t20_inactive_a,
      ]);
      // The CA officer of unit B supervises a DQTV member of unit A
      await c.query(
        `INSERT INTO ca_dqtv_assignments (ca_user_id, dqtv_user_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [ids.t20_ca_b, ids.t20_dqtv_a, ids.admin],
      );
    });
  });

  afterAll(async () => {
    await app?.close();
    await withClient(adminUrl, (c) =>
      c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`),
    );
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  // ── Directory search and chat ─────────────────────────────────────────────

  describe('GET /users/search and POST /chat/conversations (ContactPolicy)', () => {
    const everyone = [
      't20_ward',
      't20_staff_a',
      't20_area_a',
      't20_area_b',
      't20_ca_b',
      't20_dqtv_a',
      't20_dqtv_a2',
      't20_dqtv_a3',
      't20_dqtv_b',
      't20_inactive_a',
    ];
    const reachable: Record<string, string[]> = {
      // Ward-wide: every active account
      t20_ward: [
        't20_staff_a',
        't20_area_a',
        't20_area_b',
        't20_ca_b',
        't20_dqtv_a',
        't20_dqtv_a2',
        't20_dqtv_a3',
        't20_dqtv_b',
      ],
      // Unit roles: their unit
      t20_staff_a: ['t20_area_a', 't20_dqtv_a', 't20_dqtv_a2', 't20_dqtv_a3'],
      t20_area_b: ['t20_ca_b', 't20_dqtv_b'],
      // CA officer: unit colleagues and the DQTV assigned to them
      t20_ca_b: ['t20_area_b', 't20_dqtv_b', 't20_dqtv_a'],
      // DQTV: their unit and the CA officers they are assigned to
      t20_dqtv_a: [
        't20_staff_a',
        't20_area_a',
        't20_dqtv_a2',
        't20_dqtv_a3',
        't20_ca_b',
      ],
      t20_dqtv_b: ['t20_area_b', 't20_ca_b'],
    };
    const usernameOf = (id: string) =>
      Object.keys(ids).find((name) => ids[name] === id) ?? id;

    const search = async (who: string, q = 't20') => {
      const res = await api()
        .get(url('/users/search'))
        .query({ q, limit: 50 })
        .set(auth(who))
        .expect(200);
      return bodyOf<Body[]>(res);
    };

    it.each(Object.keys(reachable))(
      'lists for %s exactly the active people they may reach, never themselves',
      async (who) => {
        const rows = await search(who);
        const found = rows.map((r) => usernameOf(r.id as string));

        expect([...found].sort()).toEqual([...reachable[who]].sort());
        // One row per person
        expect(new Set(found).size).toBe(found.length);
      },
    );

    it('returns id, username, full name, primary role, roles and status only', async () => {
      const rows = await search('t20_staff_a', 'Nguyễn Văn An');

      expect(rows).toEqual([
        {
          id: ids.t20_dqtv_a,
          username: 't20_dqtv_a',
          fullName: 'T20 Nguyễn Văn An',
          role: 'dqtv',
          roles: ['dqtv'],
          status: 'active',
        },
      ]);
    });

    it('matches names without diacritics and treats % and _ literally', async () => {
      expect(
        (await search('t20_ward', 'nguyen van an')).map((r) => r.username),
      ).toEqual(['t20_dqtv_a']);
      expect(await search('t20_ward', 't20%')).toEqual([]);
      expect(await search('t20_ward', 't20_ward_')).toEqual([]);
    });

    it('answers 400 for a query under two characters or more than 50 rows', async () => {
      await api()
        .get(url('/users/search'))
        .query({ q: ' a ' })
        .set(auth('t20_ward'))
        .expect(400);
      await api().get(url('/users/search')).set(auth('t20_ward')).expect(400);
      await api()
        .get(url('/users/search'))
        .query({ q: 't20', limit: 51 })
        .set(auth('t20_ward'))
        .expect(400);
    });

    // A person the picker offers can be messaged; anyone else is refused like an unknown id.
    // A pair has one direct conversation (migration 031): opening it again, from either side,
    // answers 200 with the existing one instead of 201.
    const pairHasConversation = (a: string, b: string) =>
      db(async (c) => {
        const { rows } = await c.query(
          `SELECT 1 FROM conversations WHERE direct_key = $1`,
          [[ids[a], ids[b]].sort().join(':')],
        );
        return rows.length > 0;
      });

    it.each(Object.keys(reachable))(
      'lets %s open a conversation with exactly the people search lists',
      async (who) => {
        for (const other of everyone.filter((name) => name !== who)) {
          const existed = await pairHasConversation(who, other);
          const res = await api()
            .post(url('/chat/conversations'))
            .set(auth(who))
            .send({ conversationType: 'direct', participantIds: [ids[other]] });
          const expected = reachable[who].includes(other)
            ? existed
              ? 200
              : 201
            : 400;
          expect({ other, status: res.status }).toEqual({
            other,
            status: expected,
          });
          if (expected === 400) {
            expect(messageOf(res)).toBe('participant_not_found');
          }
        }
      },
    );

    it('refuses a group when any participant is out of reach, creating nothing', async () => {
      const before = await db(async (c) =>
        Number(
          (
            await c.query<{ count: string }>(
              `SELECT COUNT(*) FROM conversations`,
            )
          ).rows[0].count,
        ),
      );
      const res = await api()
        .post(url('/chat/conversations'))
        .set(auth('t20_staff_a'))
        .send({
          conversationType: 'group',
          participantIds: [ids.t20_dqtv_a, ids.t20_dqtv_b],
        })
        .expect(400);
      expect(messageOf(res)).toBe('participant_not_found');
      const after = await db(async (c) =>
        Number(
          (
            await c.query<{ count: string }>(
              `SELECT COUNT(*) FROM conversations`,
            )
          ).rows[0].count,
        ),
      );
      expect(after).toBe(before);
    });
  });

  // ── Files ─────────────────────────────────────────────────────────────────

  describe('POST /files/upload and GET /files/:id', () => {
    const storedFiles = () => fs.readdirSync(uploadDir).length;

    it('records an upload and answers {id, url, name, mimeType, size} with the API prefix', async () => {
      const res = await upload(
        't20_dqtv_a',
        PNG,
        'ảnh hiện trường.png',
        // Dio's default for a file part: the content decides the type
        'application/octet-stream',
      ).expect(201);

      const body = bodyOf<{ id: string }>(res);
      expect(body).toEqual({
        id: expect.stringMatching(UUID) as unknown,
        url: `/${PREFIX}/files/${body.id}`,
        name: 'ảnh hiện trường.png',
        mimeType: 'image/png',
        size: PNG.length,
      });
      const row = await db(async (c) => {
        const { rows } = await c.query<Body>(
          `SELECT uploaded_by, storage_key, checksum, category, related_id, size
           FROM files WHERE id = $1`,
          [body.id],
        );
        return rows[0];
      });
      expect(row).toEqual({
        uploaded_by: ids.t20_dqtv_a,
        storage_key: expect.stringMatching(UUID) as unknown,
        checksum: createHash('sha256').update(PNG).digest('hex'),
        category: 'general',
        related_id: null,
        size: String(PNG.length),
      });
      expect(
        fs
          .readFileSync(path.join(uploadDir, row.storage_key as string))
          .equals(PNG),
      ).toBe(true);
    });

    it('serves the owner the exact content with protective headers', async () => {
      const id = await uploadedId('t20_dqtv_a', PNG, 'a.png', 'image/png');

      const res = await download('t20_dqtv_a', id).expect(200);

      expect((res.body as Buffer).equals(PNG)).toBe(true);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['content-length']).toBe(String(PNG.length));
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toBe(
        `inline; filename="a.png"; filename*=UTF-8''a.png`,
      );
    });

    it('keeps an unattached upload private to its owner (and ward-wide roles)', async () => {
      const id = await uploadedId('t20_dqtv_a', PNG, 'a.png', 'image/png');

      await download('t20_area_a', id).expect(404);
      await download('t20_dqtv_a2', id).expect(404);
      await download('t20_ward', id).expect(200);
    });

    it('answers 400 for a malformed id and 404 for an unknown one', async () => {
      await api()
        .get(url('/files/1712345678-123.png'))
        .set(auth('t20_dqtv_a'))
        .expect(400);
      const res = await download(
        't20_dqtv_a',
        '00000000-0000-4000-8000-000000000000',
      ).expect(404);
      const error = JSON.parse((res.body as Buffer).toString()) as {
        message?: string;
      };
      expect(error.message).toBe('file_not_found');
    });

    it.each([
      [
        'content contradicting its declared type',
        Buffer.from('<html><script>alert(1)</script>'),
        'image/png',
      ],
      ['a type that is never allowed', Buffer.from('<svg/>'), 'image/svg+xml'],
    ])(
      'refuses %s with 415 and stores nothing',
      async (_label, content, type) => {
        const before = storedFiles();
        const res = await upload('t20_dqtv_a', content, 'x.png', type).expect(
          415,
        );
        expect(messageOf(res)).toBe('file_type_not_allowed');
        expect(storedFiles()).toBe(before);
      },
    );

    it('refuses a file over 10 MB with 413 and stores nothing', async () => {
      const before = storedFiles();
      const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
      const res = await upload(
        't20_dqtv_a',
        big,
        'big.png',
        'image/png',
      ).expect(413);
      expect(messageOf(res)).toBe('file_too_large');
      expect(storedFiles()).toBe(before);
    });

    it('answers 400 without a file, and removes the file of a request refused afterwards', async () => {
      const missing = await api()
        .post(url('/files/upload'))
        .set(auth('t20_dqtv_a'))
        .field('purpose', 'work_report')
        .expect(400);
      expect(messageOf(missing)).toBe('file_required');

      const before = storedFiles();
      await upload('t20_dqtv_a', PNG, 'a.png', 'image/png', 'avatar').expect(
        400,
      );
      expect(storedFiles()).toBe(before);
    });

    // FilesService.purgeAbandonedUploads, run hourly by the scheduler
    it('purges day-old unattached uploads and their content, keeping recent, referenced and locked ones', async () => {
      const upOf = (name: string) =>
        uploadedId('t20_dqtv_a', PNG, name, 'image/png');
      const abandoned = await upOf('abandoned.png');
      const recent = await upOf('recent.png');
      const referenced = await upOf('referenced.png');
      const locked = await upOf('locked.png');
      const rowsOf = (fileIds: string[]) =>
        db(async (c) => {
          const { rows } = await c.query<{ id: string; storage_key: string }>(
            `SELECT id, storage_key FROM files WHERE id = ANY($1::uuid[])`,
            [fileIds],
          );
          return rows;
        });
      const [abandonedRow] = await rowsOf([abandoned]);
      await db(async (c) => {
        await c.query(
          `UPDATE files SET created_at = now() - make_interval(hours => 25)
           WHERE id = ANY($1::uuid[])`,
          [[abandoned, referenced, locked]],
        );
        await c.query(
          `UPDATE files SET created_at = now() - make_interval(hours => 23) WHERE id = $1`,
          [recent],
        );
        // A document recorded before files carried related_id still names its file
        await c.query(
          `INSERT INTO official_documents (doc_type, title, file_id, created_by)
           VALUES ('cong_van', 'T20 legacy document', $1, $2)`,
          [referenced, ids.admin],
        );
      });

      const purged = await db(async (holder) => {
        await holder.query('BEGIN');
        try {
          // An attach in progress holds the row it is claiming
          await holder.query(`SELECT id FROM files WHERE id = $1 FOR UPDATE`, [
            locked,
          ]);
          return await app.get(FilesService).purgeAbandonedUploads();
        } finally {
          await holder.query('ROLLBACK');
        }
      });

      expect(purged).toBe(1);
      const left = await rowsOf([abandoned, recent, referenced, locked]);
      expect(left.map((row) => row.id).sort()).toEqual(
        [recent, referenced, locked].sort(),
      );
      expect(
        fs.existsSync(path.join(uploadDir, abandonedRow.storage_key)),
      ).toBe(false);
      for (const row of left) {
        expect(fs.existsSync(path.join(uploadDir, row.storage_key))).toBe(true);
      }
    });
  });

  // ── Official document and militia profile files (T29) ─────────────────────

  describe('files of official documents and militia profiles', () => {
    it('answers an official document with its file as create did', async () => {
      const fileId = await uploadedId(
        't20_staff_a',
        PDF,
        'QĐ 12.pdf',
        'application/pdf',
        'official_document',
      );
      const created = bodyOf<{ id: string; file: Body }>(
        await api()
          .post(url('/official-documents'))
          .set(auth('t20_staff_a'))
          .send({ docType: 'quyet_dinh', title: 'QĐ 12', fileId })
          .expect(201),
      );

      const detail = bodyOf<Body>(
        await api()
          .get(url(`/official-documents/${created.id}`))
          .set(auth('t20_area_a'))
          .expect(200),
      );

      expect(detail.file).toEqual(created.file);
      expect(detail.file).toEqual({
        id: fileId,
        url: `/${PREFIX}/files/${fileId}`,
        name: 'QĐ 12.pdf',
        mimeType: 'application/pdf',
        size: PDF.length,
      });
    });

    it('lets staff attach documents to a profile of their unit, readable by whoever reads the profile', async () => {
      const fileId = await uploadedId(
        't20_staff_a',
        PDF,
        'Giấy chứng nhận.pdf',
        'application/pdf',
        'militia_profile',
      );
      const attached = await api()
        .post(url(`/militia/${members.a}/documents`))
        .set(auth('t20_staff_a'))
        .send({ fileIds: [fileId] })
        .expect(201);
      const view = {
        id: fileId,
        url: `/${PREFIX}/files/${fileId}`,
        name: 'Giấy chứng nhận.pdf',
        mimeType: 'application/pdf',
        size: PDF.length,
      };
      expect(bodyOf(attached)).toEqual([view]);

      // The member reads their own profile's documents; the listing no longer fails
      const listed = await api()
        .get(url(`/militia/${members.a}/documents`))
        .set(auth('t20_dqtv_a'))
        .expect(200);
      expect(bodyOf(listed)).toEqual([view]);

      // The member, the CA officer the member is assigned to, staff of the unit
      for (const reader of ['t20_dqtv_a', 't20_ca_b', 't20_area_a']) {
        const res = await download(reader, fileId).expect(200);
        expect((res.body as Buffer).equals(PDF)).toBe(true);
      }
      // Another member, and staff of another unit
      for (const outsider of ['t20_dqtv_a2', 't20_area_b']) {
        await download(outsider, fileId).expect(404);
      }
    });

    it('refuses members attaching documents and staff attaching outside their unit', async () => {
      const own = await uploadedId(
        't20_dqtv_a',
        PDF,
        'tự nộp.pdf',
        'application/pdf',
        'militia_profile',
      );
      await api()
        .post(url(`/militia/${members.a}/documents`))
        .set(auth('t20_dqtv_a'))
        .send({ fileIds: [own] })
        .expect(403);

      const fileId = await uploadedId(
        't20_staff_a',
        PDF,
        'khác đơn vị.pdf',
        'application/pdf',
        'militia_profile',
      );
      const refused = await api()
        .post(url(`/militia/${members.b}/documents`))
        .set(auth('t20_staff_a'))
        .send({ fileIds: [fileId] })
        .expect(403);
      expect(messageOf(refused)).toBe('unit_scope_violation');
      const row = await db(async (c) => {
        const { rows } = await c.query<{ related_id: string | null }>(
          `SELECT related_id FROM files WHERE id = $1`,
          [fileId],
        );
        return rows[0];
      });
      expect(row.related_id).toBeNull();
    });
  });

  // ── Task attachments (T29) ────────────────────────────────────────────────

  describe('task attachments', () => {
    it('attaches the creator uploads to a new task, readable by whoever reads the task', async () => {
      const fileId = await uploadedId(
        't20_staff_a',
        PDF,
        'Sơ đồ tuyến.pdf',
        'application/pdf',
        'task',
      );
      const view = {
        id: fileId,
        url: `/${PREFIX}/files/${fileId}`,
        name: 'Sơ đồ tuyến.pdf',
        mimeType: 'application/pdf',
        size: PDF.length,
      };

      const created = bodyOf<{ id: string; attachments: Body[] }>(
        await api()
          .post(url('/tasks'))
          .set(auth('t20_staff_a'))
          .send({
            title: 'T29 tuần tra theo sơ đồ',
            assigneeMilitiaId: members.a,
            attachmentIds: [fileId],
          })
          .expect(201),
      );
      expect(created.attachments).toEqual([view]);

      const detail = bodyOf<{ attachments: Body[] }>(
        await api()
          .get(url(`/tasks/${created.id}`))
          .set(auth('t20_dqtv_a'))
          .expect(200),
      );
      expect(detail.attachments).toEqual([view]);

      // The assignee, and the CA officer the assignee is assigned to
      for (const reader of ['t20_dqtv_a', 't20_ca_b']) {
        const res = await download(reader, fileId).expect(200);
        expect((res.body as Buffer).equals(PDF)).toBe(true);
      }
      // Another member, and a role that reads no tasks
      for (const outsider of ['t20_dqtv_a2', 't20_area_b']) {
        await download(outsider, fileId).expect(404);
      }
    });

    it('creates no task when an attachment is refused', async () => {
      const foreign = await uploadedId(
        't20_dqtv_a2',
        PDF,
        'của người khác.pdf',
        'application/pdf',
        'task',
      );
      const title = 'T29 nhiệm vụ với tệp của người khác';

      const refused = await api()
        .post(url('/tasks'))
        .set(auth('t20_staff_a'))
        .send({ title, assigneeMilitiaId: members.a, attachmentIds: [foreign] })
        .expect(400);

      expect(messageOf(refused)).toBe('file_not_found');
      const count = await db(async (c) => {
        const { rows } = await c.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM tasks WHERE title = $1`,
          [title],
        );
        return Number(rows[0].count);
      });
      expect(count).toBe(0);
    });
  });

  // ── Work report attachments ───────────────────────────────────────────────

  describe('work report attachments', () => {
    let reportId: string;
    let pdfId: string;
    let pngId: string;

    const createReport = (who: string, attachmentIds: unknown) =>
      api().post(url('/work-reports')).set(auth(who)).send({
        reportType: 'incident',
        title: 'T20 Sự vụ KP3',
        content: 'Va chạm giao thông',
        attachmentIds,
      });

    beforeAll(async () => {
      pdfId = await uploadedId(
        't20_dqtv_a',
        PDF,
        'Biên bản.pdf',
        'application/pdf',
        'work_report',
      );
      pngId = await uploadedId('t20_dqtv_a', PNG, 'ảnh.png', 'image/png');
    });

    it('attaches the author uploads in the order given and returns them', async () => {
      const res = await createReport('t20_dqtv_a', [pdfId, pngId]).expect(201);
      reportId = bodyOf<{ id: string }>(res).id;

      expect(bodyOf(res).attachments).toEqual([
        {
          id: pdfId,
          url: `/${PREFIX}/files/${pdfId}`,
          name: 'Biên bản.pdf',
          mimeType: 'application/pdf',
          size: PDF.length,
        },
        {
          id: pngId,
          url: `/${PREFIX}/files/${pngId}`,
          name: 'ảnh.png',
          mimeType: 'image/png',
          size: PNG.length,
        },
      ]);
      const links = await db(
        async (c) =>
          (
            await c.query<{ file_id: string; position: number }>(
              `SELECT file_id, position FROM work_report_attachments
             WHERE work_report_id = $1 ORDER BY position`,
              [reportId],
            )
          ).rows,
      );
      expect(links).toEqual([
        { file_id: pdfId, position: 0 },
        { file_id: pngId, position: 1 },
      ]);
    });

    it('returns the attachments in the detail and the list of those who may see the report', async () => {
      const detail = await api()
        .get(url(`/work-reports/${reportId}`))
        .set(auth('t20_dqtv_a'))
        .expect(200);
      expect(
        bodyOf<{ attachments: { id: string }[] }>(detail).attachments.map(
          (a) => a.id,
        ),
      ).toEqual([pdfId, pngId]);

      const listed = await api()
        .get(url('/work-reports'))
        .set(auth('t20_area_a'))
        .expect(200);
      const report = bodyOf<{
        data: { id: string; attachments: { id: string }[] }[];
      }>(listed).data.find((r) => r.id === reportId);
      expect(report?.attachments.map((a) => a.id)).toEqual([pdfId, pngId]);

      await api()
        .get(url(`/work-reports/${reportId}`))
        .set(auth('t20_area_b'))
        .expect(404);
      await api()
        .get(url(`/work-reports/${reportId}`))
        .set(auth('t20_dqtv_a2'))
        .expect(404);
    });

    it('lets readers of the report download its attachments, and nobody else', async () => {
      await download('t20_area_a', pdfId).expect(200);
      await download('t20_staff_a', pdfId).expect(200);
      // Assigned CA officer from another unit
      await download('t20_ca_b', pngId).expect(200);
      await download('t20_area_b', pdfId).expect(404);
      await download('t20_dqtv_a2', pdfId).expect(404);
    });

    it('refuses a file already attached, someone else file and too many files, creating no report', async () => {
      const count = () =>
        db(async (c) =>
          Number(
            (
              await c.query<{ count: string }>(
                `SELECT COUNT(*) FROM work_reports`,
              )
            ).rows[0].count,
          ),
        );
      const before = await count();

      const reused = await createReport('t20_dqtv_a', [pngId]).expect(409);
      expect(messageOf(reused)).toBe('file_already_attached');

      const foreignFile = await uploadedId(
        't20_dqtv_a2',
        PNG,
        'b.png',
        'image/png',
      );
      const foreign = await createReport('t20_dqtv_a', [foreignFile]).expect(
        400,
      );
      expect(messageOf(foreign)).toBe('file_not_found');

      const taskPhoto = await uploadedId(
        't20_dqtv_a',
        PNG,
        'c.png',
        'image/png',
        'task_report',
      );
      const mismatch = await createReport('t20_dqtv_a', [taskPhoto]).expect(
        400,
      );
      expect(messageOf(mismatch)).toBe('file_purpose_mismatch');

      await createReport(
        't20_dqtv_a',
        Array.from(
          { length: 11 },
          (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        ),
      ).expect(400);

      expect(await count()).toBe(before);
    });
  });

  // ── Task report photos ────────────────────────────────────────────────────

  describe('task report photos', () => {
    it('attaches the assignee photos, refuses non-images, and completes the task once', async () => {
      const task = await api()
        .post(url('/tasks'))
        .set(auth('admin'))
        .send({ title: 'T20 Tuần tra chợ', assigneeMilitiaId: members.a })
        .expect(201);
      const taskId = bodyOf<{ id: string }>(task).id;
      const pdf = await uploadedId(
        't20_dqtv_a',
        PDF,
        'x.pdf',
        'application/pdf',
      );
      const photo = await uploadedId(
        't20_dqtv_a',
        PNG,
        'hien-truong.png',
        'image/png',
        'task_report',
      );

      const refused = await api()
        .post(url(`/tasks/${taskId}/report`))
        .set(auth('t20_dqtv_a'))
        .send({ description: 'Đã tuần tra', photoIds: [pdf] })
        .expect(400);
      expect(messageOf(refused)).toBe('file_type_not_allowed');
      const statusOf = () =>
        db(
          async (c) =>
            (
              await c.query<{ status: string }>(
                `SELECT status FROM tasks WHERE id = $1`,
                [taskId],
              )
            ).rows[0].status,
        );
      expect(await statusOf()).not.toBe('completed');

      const res = await api()
        .post(url(`/tasks/${taskId}/report`))
        .set(auth('t20_dqtv_a'))
        .send({ description: 'Đã tuần tra', photoIds: [photo] })
        .expect(201);
      expect(bodyOf(res)).toEqual(
        expect.objectContaining({
          taskId,
          photos: [
            {
              id: photo,
              url: `/${PREFIX}/files/${photo}`,
              name: 'hien-truong.png',
              mimeType: 'image/png',
              size: PNG.length,
            },
          ],
        }),
      );
      expect(await statusOf()).toBe('completed');

      await download('t20_staff_a', photo).expect(200);
      await download('t20_area_b', photo).expect(404);
    });
  });

  // ── Leave types and reviewer ──────────────────────────────────────────────

  describe('GET /leave/types and the reviewer of a request', () => {
    let annualId: string;
    let retiredId: string;

    beforeAll(async () => {
      [annualId, retiredId] = await db(async (c) => {
        const annual = await c.query<{ id: string }>(
          `INSERT INTO leave_types (code, name, max_days_per_year) VALUES ('t20_annual', 'T20 Nghỉ phép năm', 12) RETURNING id`,
        );
        const retired = await c.query<{ id: string }>(
          `INSERT INTO leave_types (code, name, is_active) VALUES ('t20_retired', 'T20 Loại cũ', false) RETURNING id`,
        );
        await c.query(
          `INSERT INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, remaining_days)
           VALUES ($1, $2, 2027, 12, 0, 12), ($1, $3, 2027, 12, 0, 12)`,
          [ids.t20_dqtv_a, annual.rows[0].id, retired.rows[0].id],
        );
        return [annual.rows[0].id, retired.rows[0].id];
      });
    });

    it('lists the active leave types to any signed-in user', async () => {
      const res = await api()
        .get(url('/leave/types'))
        .set(auth('t20_dqtv_a'))
        .expect(200);
      const types = bodyOf<Body[]>(res);

      expect(types).toContainEqual({
        id: annualId,
        code: 't20_annual',
        name: 'T20 Nghỉ phép năm',
        description: null,
        maxDaysPerYear: 12,
        requiresDocument: false,
        isPaid: true,
      });
      expect(types.map((t) => t.id)).not.toContain(retiredId);
    });

    it('refuses a new request of a retired type', async () => {
      const res = await api()
        .post(url('/leave'))
        .set(auth('t20_dqtv_a'))
        .send({
          leaveTypeId: retiredId,
          fromDate: '2027-03-01',
          toDate: '2027-03-01',
          reason: 'Việc riêng',
        })
        .expect(400);
      expect(messageOf(res)).toBe('leave_type_inactive');
    });

    it('names who decided a request and when, in the detail and the list', async () => {
      const created = await api()
        .post(url('/leave'))
        .set(auth('t20_dqtv_a'))
        .send({
          leaveTypeId: annualId,
          fromDate: '2027-03-01',
          toDate: '2027-03-02',
          reason: 'Việc gia đình',
        })
        .expect(201);
      const id = bodyOf<{ id: string }>(created).id;
      expect(bodyOf(created)).toEqual(
        expect.objectContaining({ reviewedBy: null, reviewedAt: null }),
      );

      await api()
        .patch(url(`/leave/${id}/review`))
        .set(auth('t20_area_a'))
        .send({ action: 'approve', reason: 'Đồng ý' })
        .expect(204);

      const detail = bodyOf(
        await api()
          .get(url(`/leave/${id}`))
          .set(auth('t20_dqtv_a'))
          .expect(200),
      );
      expect(detail).toEqual(
        expect.objectContaining({
          status: 'approved',
          reviewedBy: { id: ids.t20_area_a, fullName: 'T20 Công an KV A' },
          reviewedAt: expect.any(String) as unknown,
          reviewNote: 'Đồng ý',
          leaveTypeName: 'T20 Nghỉ phép năm',
        }),
      );
      const listed = bodyOf<{ data: Body[] }>(
        await api()
          .get(url('/leave'))
          .query({ mine: 'true' })
          .set(auth('t20_dqtv_a'))
          .expect(200),
      ).data.find((r) => r.id === id);
      expect(listed).toEqual(
        expect.objectContaining({
          reviewedBy: { id: ids.t20_area_a, fullName: 'T20 Công an KV A' },
          reviewedAt: detail.reviewedAt,
        }),
      );
    });

    // Migration 033 types on a fresh install; nobody allocates balances by hand
    it('files leave on the default types: a yearly type provisions its balance, an unlimited one needs none', async () => {
      const types = bodyOf<{ id: string; code: string }[]>(
        await api()
          .get(url('/leave/types'))
          .set(auth('t20_dqtv_a2'))
          .expect(200),
      );
      const idOf = (code: string) =>
        types.find((type) => type.code === code)?.id;
      const file = (code: string, fromDate: string, toDate: string) =>
        api()
          .post(url('/leave'))
          .set(auth('t20_dqtv_a2'))
          .send({
            leaveTypeId: idOf(code),
            fromDate,
            toDate,
            reason: 'Việc gia đình',
          });
      const approve = async (res: request.Response) =>
        api()
          .patch(url(`/leave/${bodyOf<{ id: string }>(res).id}/review`))
          .set(auth('t20_area_a'))
          .send({ action: 'approve' })
          .expect(204);
      const balances = async () =>
        bodyOf<Body[]>(
          await api()
            .get(url('/leave-balances'))
            .set(auth('t20_dqtv_a2'))
            .expect(200),
        ).map((balance) => ({
          leaveTypeId: balance.leaveTypeId,
          year: balance.year,
          totalDays: Number(balance.totalDays),
          usedDays: Number(balance.usedDays),
          remainingDays: Number(balance.remainingDays),
        }));

      // Monday 5 to Tuesday 6 April 2027, then Wednesday 7 to Friday 9
      await approve(
        await file('annual', '2027-04-05', '2027-04-06').expect(201),
      );
      await approve(
        await file('unpaid', '2027-04-07', '2027-04-09').expect(201),
      );

      expect(await balances()).toEqual([
        {
          leaveTypeId: idOf('annual'),
          year: 2027,
          totalDays: 12,
          usedDays: 2,
          remainingDays: 10,
        },
      ]);
      // 11 weekdays from Monday 12 to Monday 26 April exceed the 10 days left
      const refused = await file('annual', '2027-04-12', '2027-04-26').expect(
        409,
      );
      expect(messageOf(refused)).toBe('insufficient_leave_balance');
    });
  });

  // ── KPI ───────────────────────────────────────────────────────────────────

  describe('GET /kpi/current and /kpi/history', () => {
    const policeAppCriteria = [
      'Kỹ năng chuyên môn',
      'Tinh thần trách nhiệm',
      'Hiệu quả công tác',
      'Chấm công',
      'Thái độ tác phong',
    ];

    beforeAll(() =>
      db(async (c) => {
        const evaluate = (
          evaluator: string,
          target: string,
          year: number,
          month: number,
          weighted: number,
          criteria: string[] = policeAppCriteria,
          scores: number[] = [8, 8, 8, 8, 8],
        ) =>
          c.query(
            `INSERT INTO kpi_evaluations (evaluator_id, target_user_id, criteria, scores, weighted_score, recommendation, year, month)
             VALUES ($1, $2, $3, $4, $5, 'maintain', $6, $7)`,
            [
              evaluator,
              target,
              JSON.stringify(criteria),
              JSON.stringify(scores),
              weighted,
              year,
              month,
            ],
          );
        // March 2026: two evaluators score t20_dqtv_a 8.00 on average, with components
        await evaluate(
          ids.admin,
          ids.t20_dqtv_a,
          2026,
          3,
          8.0,
          policeAppCriteria,
          [8, 7, 9, 8, 9],
        );
        await evaluate(
          ids.t20_area_a,
          ids.t20_dqtv_a,
          2026,
          3,
          8.0,
          ['Kỷ luật', 'Chuyên cần', 'Huấn luyện', 'Nhiệm vụ', 'Tinh thần'],
          [8, 6, 9, 7, 7],
        );
        await evaluate(ids.admin, ids.t20_dqtv_a2, 2026, 3, 8.0, [
          'A',
          'B',
          'C',
          'D',
          'E',
        ]);
        await evaluate(ids.admin, ids.t20_dqtv_a3, 2026, 3, 9.0);
        await evaluate(ids.admin, ids.t20_dqtv_b, 2026, 3, 9.5);
        // Earlier months of t20_dqtv_a
        await evaluate(ids.admin, ids.t20_dqtv_a, 2026, 2, 7.5);
        await evaluate(ids.admin, ids.t20_dqtv_a, 2025, 12, 6.0);
      }),
    );

    const current = (who: string, query: Record<string, string | number>) =>
      api().get(url('/kpi/current')).query(query).set(auth(who));

    it('reports the monthly average, change, components and standard competition ranks', async () => {
      const res = await current('t20_dqtv_a', { month: 3, year: 2026 }).expect(
        200,
      );

      expect(bodyOf(res)).toEqual({
        score: 8,
        totalScore: 8,
        change: 0.5,
        // Ward: 9.5 and 9.0 score higher; 8.00 is shared with t20_dqtv_a2
        rank: 3,
        // Unit A: t20_dqtv_a3 (9.0) is higher; three members of unit A were scored
        rankInUnit: 2,
        unitSize: 3,
        month: 3,
        year: 2026,
        // Chấm công 8 and Chuyên cần 6; Hiệu quả công tác 9 and Nhiệm vụ 7
        attendanceScore: 7,
        taskScore: 8,
        maxScore: 10,
      });
    });

    // Each form lists its criteria in its own order: GET /kpi/summary-report reads them by name
    it('reports the components of GET /kpi/summary-report by criterion name, with ranks in the ward and the unit', async () => {
      const periodId = await db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO payroll_periods (year, month) VALUES (2026, 3)
           ON CONFLICT (tenant_id, year, month) DO UPDATE SET updated_at = now()
           RETURNING id`,
        );
        return rows[0].id;
      });
      const report = async (query: Record<string, string>) =>
        bodyOf<Body[]>(
          await api()
            .get(url('/kpi/summary-report'))
            .query(query)
            .set(auth('admin'))
            .expect(200),
        );

      const ward = new Map(
        (await report({ periodId })).map((item) => [item.militiaId, item]),
      );

      expect(ward.get(members.a)).toEqual({
        militiaId: members.a,
        name: 'T20 Nguyễn Văn An',
        code: 'DQ-T20-A1',
        unit: 'Khu vực T20 A',
        // Chấm công 8 and Chuyên cần 6; Hiệu quả công tác 9 and Nhiệm vụ 7
        attendanceScore: 7,
        taskScore: 8,
        // Kỷ luật 8, named by the second form only
        disciplineScore: 8,
        // Thái độ tác phong 9 and Tinh thần 7
        attitudeScore: 8,
        supervisorScore: 8,
        total: 80,
        // 9.5 and 9.0 score higher in the ward, 9.0 in unit A
        rank: 3,
        rankInUnit: 2,
        xepLoai: 'Tốt',
      });
      expect(
        [members.a2, members.a3, members.b].map((id) => [
          ward.get(id)?.rank,
          ward.get(id)?.rankInUnit,
          ward.get(id)?.attendanceScore,
        ]),
      ).toEqual([
        [3, 2, null],
        [2, 1, 8],
        [1, 1, 8],
      ]);

      const unitA = await report({ periodId, unitCode: UNIT_A });
      expect(unitA.map((item) => item.militiaId).sort()).toEqual(
        [members.a, members.a2, members.a3].sort(),
      );
    });

    it('gives tied members the same rank and leaves unnamed components null', async () => {
      // An area officer reads a member of their unit
      const res = await current('t20_area_a', {
        month: 3,
        year: 2026,
        userId: ids.t20_dqtv_a2,
      }).expect(200);

      expect(bodyOf(res)).toEqual(
        expect.objectContaining({
          score: 8,
          rank: 3,
          rankInUnit: 2,
          unitSize: 3,
          change: null,
          attendanceScore: null,
          taskScore: null,
        }),
      );
    });

    it('reports a month without evaluations as unscored, with the unit size of that month', async () => {
      const res = await current('t20_dqtv_a', { month: 4, year: 2026 }).expect(
        200,
      );

      expect(bodyOf(res)).toEqual(
        expect.objectContaining({
          score: null,
          rank: null,
          rankInUnit: null,
          unitSize: 0,
          attendanceScore: null,
          taskScore: null,
        }),
      );
      await current('t20_dqtv_a', { month: 13, year: 2026 }).expect(400);
    });

    it('lists history newest year and month first', async () => {
      const res = await api()
        .get(url('/kpi/history'))
        .set(auth('t20_dqtv_a'))
        .expect(200);

      expect(
        bodyOf<{ year: number; month: number; score: number }[]>(res).map(
          (h) => [h.year, h.month, h.score],
        ),
      ).toEqual([
        [2026, 3, 8],
        [2026, 2, 7.5],
        [2025, 12, 6],
      ]);
    });
  });
});
