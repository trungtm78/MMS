import { promises as fsp } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import { holdsAnyRole, type ScopedActor } from '../common/access/unit-scope';
import { REVIEWER_ROLES, WIDE_SCOPE_ROLES } from '../common/constants/roles';
import {
  memberReachParams,
  reachIncludes,
  resolveMemberReach,
  type MemberReach,
} from '../common/access/member-scope';
import { userInUnit } from '../common/sql/user-access.sql';
import { queryRows } from '../database/query-rows';
import {
  TenantContext,
  TenantScopeError,
} from '../database/tenancy/tenant-context';
import { isTenancyEnforced } from '../database/tenancy/tenancy-mode';
import { TenantJobRunner } from '../database/tenancy/tenant-job-runner';
import { MILITIA_STAFF_ROLE_SET } from '../militia/militia-roles';
import { TASK_STAFF_ROLES } from '../tasks/task-roles';
import { TASK_UNIT_JOIN, taskScopeSql } from '../tasks/task-sql';

// Kinds of record a file attaches to (files.related_type CHECK, migrations 028 and 034)
export const FILE_RELATED_TYPES = [
  'task_report',
  'work_report',
  'official_document',
  'task',
  'militia_profile',
] as const;
export type FileRelatedType = (typeof FILE_RELATED_TYPES)[number];

// Purposes an upload may declare (files.category CHECK, migration 028)
export const FILE_PURPOSES = ['general', ...FILE_RELATED_TYPES] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

// Roles that manage militia records: they read the reports, and so the report attachments,
// of the authors in their audience. The work reports routes minus DQTV members.
export const RECORD_MANAGER_ROLES: ReadonlySet<string> = new Set([
  ...REVIEWER_ROLES,
  'office_staff',
]);

// Roles of the official documents routes, whose list is not limited by unit
export const OFFICIAL_DOCUMENT_READER_ROLES: ReadonlySet<string> = new Set([
  'system_admin',
  'police_ward',
  'police_area',
  'office_staff',
  'ca_officer',
]);

/** A stored file as every endpoint returns it. */
export interface FileView {
  id: string;
  // Path to GET the content, global API prefix included
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

/** A verified upload about to be recorded. */
export interface UploadRecord {
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
}

export interface FileActor extends ScopedActor {
  sub: string;
}

/** A DataSource or transaction EntityManager. */
export interface SqlRunner {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

export interface AttachFiles {
  // Only files this user uploaded may be attached
  ownerId: string;
  fileIds: string[];
  relatedType: FileRelatedType;
  relatedId: string;
  // Photos: refuse anything that is not an image
  imagesOnly?: boolean;
}

/** A file as queries select it for views(): id, original name, type and size. */
export interface ViewRow {
  id: string;
  name: string;
  mimeType: string;
  size: string | number;
}

interface DownloadRow extends ViewRow {
  storageKey: string;
  uploadedBy: string;
  relatedType: FileRelatedType | null;
  relatedId: string | null;
  createdTask: boolean | null;
}

interface ClaimRow extends ViewRow {
  uploadedBy: string;
  relatedId: string | null;
  category: string | null;
}

const STORAGE_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// An upload still unattached this many hours after it arrived was abandoned by its client
export const ABANDONED_UPLOAD_HOURS = 24;
// Rows removed per statement, so one run never holds many row locks at once
export const ABANDONED_UPLOAD_BATCH = 500;

// Oldest abandoned uploads first. Rows locked by an attach in progress are skipped, and
// rows another table references are kept whether or not related_id was ever set.
const PURGE_ABANDONED_UPLOADS_SQL = `
  WITH abandoned AS (
    SELECT f.id
    FROM files f
    WHERE f.related_id IS NULL
      AND f.created_at < now() - make_interval(hours => $1)
      AND NOT EXISTS (SELECT 1 FROM official_documents od WHERE od.file_id = f.id)
      AND NOT EXISTS (SELECT 1 FROM task_evidences te WHERE te.file_id = f.id)
      AND NOT EXISTS (SELECT 1 FROM task_report_photos trp WHERE trp.file_id = f.id)
      AND NOT EXISTS (SELECT 1 FROM work_report_attachments wra WHERE wra.file_id = f.id)
    ORDER BY f.created_at
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM files f
  USING abandoned a
  WHERE f.id = a.id
  RETURNING f.storage_key AS "storageKey"`;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly assignments: AssignmentsService,
    private readonly config: ConfigService,
    private readonly tenantJobs: TenantJobRunner,
  ) {}

  /** Where uploads are stored: UPLOAD_DIR, else ./uploads. */
  uploadDir(): string {
    return (
      this.config.get<string>('UPLOAD_DIR') || join(process.cwd(), 'uploads')
    );
  }

  /** Directory new uploads go to: one per tenant in enforced mode, so no path is shared. */
  tenantUploadDir(): string {
    return isTenancyEnforced()
      ? join(this.uploadDir(), TenantContext.requireTenantId())
      : this.uploadDir();
  }

  /**
   * Where the content of a stored file lives; the tenant defaults to the current scope.
   * Both parts of the path are checked here, so no caller can turn a value that is not a
   * server-made storage key or a tenant UUID into a path outside the upload directory.
   */
  contentPath(storageKey: string, tenantId?: string): string {
    if (!STORAGE_KEY.test(storageKey)) {
      throw new Error('invalid_storage_key');
    }
    if (tenantId !== undefined && !isUUID(tenantId)) {
      throw new TenantScopeError(
        'invalid_tenant_id',
        'A content path needs a UUID tenant id',
      );
    }
    return isTenancyEnforced()
      ? join(
          this.uploadDir(),
          tenantId ?? TenantContext.requireTenantId(),
          storageKey,
        )
      : join(this.uploadDir(), storageKey);
  }

  /** The path a client GETs a file's content from, under the global API prefix. */
  urlOf(id: string): string {
    const prefix = (
      this.config.get<string>('apiPrefix') ?? 'api/v1/mms_core'
    ).replace(/^\/+|\/+$/g, '');
    return `/${prefix}/files/${id}`;
  }

  private view(row: ViewRow): FileView {
    return {
      id: row.id,
      url: this.urlOf(row.id),
      name: row.name,
      mimeType: row.mimeType,
      size: Number(row.size),
    };
  }

  /** Records a verified upload owned by `ownerId`; the file is unattached until linked. */
  async record(
    ownerId: string,
    upload: UploadRecord,
    purpose: FilePurpose = 'general',
  ): Promise<FileView> {
    const rows = await this.ds.query<ViewRow[]>(
      `INSERT INTO files (storage_key, original_name, mime_type, size, checksum, category, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, original_name AS name, mime_type AS "mimeType", size`,
      [
        upload.storageKey,
        upload.originalName,
        upload.mimeType,
        upload.size,
        upload.sha256,
        purpose,
        ownerId,
      ],
    );
    return this.view(rows[0]);
  }

  /**
   * A file the actor may read, with the path of its content. Unknown, unreadable and missing
   * files all answer 404 file_not_found, so ids cannot be probed.
   */
  async openForDownload(
    actor: FileActor,
    id: string,
  ): Promise<{ file: FileView; path: string }> {
    const notFound = new NotFoundException('file_not_found');
    const rows = await this.ds.query<DownloadRow[]>(
      `SELECT f.id, f.storage_key AS "storageKey", f.original_name AS name,
              f.mime_type AS "mimeType", f.size, f.uploaded_by AS "uploadedBy",
              f.related_type AS "relatedType", f.related_id AS "relatedId",
              (f.related_type = 'task_report' AND EXISTS (
                 SELECT 1 FROM task_reports tr JOIN tasks t ON t.id = tr.task_id
                 WHERE tr.id = f.related_id AND t.created_by = $2)) AS "createdTask"
       FROM files f
       WHERE f.id = $1`,
      [id, actor.sub],
    );
    const row = rows[0];
    if (!row || !(await this.canRead(actor, row))) throw notFound;
    if (!STORAGE_KEY.test(row.storageKey)) throw notFound;

    const path = this.contentPath(row.storageKey);
    const stat = await fsp.stat(path).catch(() => null);
    if (!stat?.isFile()) throw notFound;
    return { file: this.view(row), path };
  }

  /**
   * Who may download a file:
   * 1. its owner (the uploader);
   * 2. ward-wide roles (WIDE_SCOPE_ROLES);
   * 3. nobody else while it is not attached to a record;
   * 4. attached to an official document: the roles that read official documents;
   * 5. attached to a task report: the creator of the task;
   * 6. attached to a task or work report: record managers (RECORD_MANAGER_ROLES) whose
   *    audience holds the author, as for the reports themselves: CA officers the DQTV
   *    assigned to them, others the members of their effective unit (ward-level roles
   *    without a unit scope: everyone). The author is the owner: only the uploader can
   *    attach a file (attach), and only to their own report.
   * Rules 6 to 8 take every role the actor holds (resolveMemberReach): a user holding a
   * unit role and ca_officer reaches the union of both, whichever is the primary role.
   * 7. attached to a task: whoever the task routes let read the task (taskScopeSql): its
   *    assignees, the CA officer who created it or whose DQTV it is assigned to, and the
   *    unit staff of the task's unit.
   * 8. attached to a militia profile: whoever reads the profile (MilitiaService): the member
   *    it belongs to, CA officers the DQTV assigned to them, other staff within their unit.
   */
  private async canRead(actor: FileActor, row: DownloadRow): Promise<boolean> {
    if (row.uploadedBy === actor.sub) return true;
    if (holdsAnyRole(actor, WIDE_SCOPE_ROLES)) return true;
    switch (row.relatedType) {
      case 'official_document':
        return holdsAnyRole(actor, OFFICIAL_DOCUMENT_READER_ROLES);
      case 'task_report':
        if (row.createdTask) return true;
        return this.managesAuthor(actor, row.uploadedBy);
      case 'work_report':
        return this.managesAuthor(actor, row.uploadedBy);
      case 'task':
        return this.readsTask(actor, row.relatedId);
      case 'militia_profile':
        return this.readsProfile(actor, row.relatedId);
      default:
        return false;
    }
  }

  private async readsTask(
    actor: FileActor,
    taskId: string | null,
  ): Promise<boolean> {
    const reach = await this.reachOf(actor, TASK_STAFF_ROLES);
    if (!reach) return false;
    const rows = await this.ds.query<{ readable: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM tasks t
         ${TASK_UNIT_JOIN}
         WHERE t.id = $1
           AND ${taskScopeSql({ everyone: '$2', unit: '$3', userIds: '$4', caller: '$5' })}
       ) AS readable`,
      [taskId, ...memberReachParams(reach), actor.sub],
    );
    return rows[0]?.readable === true;
  }

  // What the actor's roles reach of members' records; null when they grant nothing (a role
  // outside `staffRoles`, or an area role without a unit scope), concealed as 404
  private async reachOf(
    actor: FileActor,
    staffRoles: ReadonlySet<string>,
  ): Promise<MemberReach | null> {
    try {
      return await resolveMemberReach(actor, {
        staffRoles,
        assignments: this.assignments,
      });
    } catch (error) {
      if (error instanceof ForbiddenException) return null;
      throw error;
    }
  }

  private async readsProfile(
    actor: FileActor,
    profileId: string | null,
  ): Promise<boolean> {
    const [profile] = await this.ds.query<
      { userId: string | null; unitCode: string }[]
    >(
      `SELECT mp.user_id AS "userId", u.code AS "unitCode"
       FROM militia_profiles mp
       JOIN units u ON u.id = mp.unit_id
       WHERE mp.id = $1`,
      [profileId],
    );
    if (!profile) return false;
    // A member reads their own profile
    if (profile.userId !== null && profile.userId === actor.sub) return true;
    if (!holdsAnyRole(actor, MILITIA_STAFF_ROLE_SET)) return false;
    const reach = await this.reachOf(actor, MILITIA_STAFF_ROLE_SET);
    return (
      reach !== null &&
      reachIncludes(reach, {
        unitCode: profile.unitCode,
        ownerId: profile.userId,
      })
    );
  }

  private async managesAuthor(
    actor: FileActor,
    authorId: string,
  ): Promise<boolean> {
    if (!holdsAnyRole(actor, RECORD_MANAGER_ROLES)) return false;
    const reach = await this.reachOf(actor, RECORD_MANAGER_ROLES);
    if (!reach) return false;
    // Every member, or one of the members listed: no query needed
    if (reach.everyone || reach.userIds?.includes(authorId)) return true;
    if (reach.unit === null) return false;
    const rows = await this.ds.query<{ inUnit: boolean }[]>(
      `SELECT ${userInUnit('$1::uuid', '$2')} AS "inUnit"`,
      [authorId, reach.unit],
    );
    return rows[0]?.inUnit === true;
  }

  /**
   * Attaches uploaded files to a record inside the caller's transaction, and returns them in
   * the order given. Each file must exist, belong to `ownerId` (others answer like unknown
   * ids), be unattached, have been uploaded for this kind of record or for no particular
   * one, and be an image where only images belong. The rows are locked, and the claim only
   * takes files still unattached, so concurrent requests cannot attach one file twice.
   */
  async attach(runner: SqlRunner, input: AttachFiles): Promise<FileView[]> {
    const ids = input.fileIds;
    if (ids.length === 0) return [];
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('duplicate_file_ids');
    }

    const rows = (await runner.query(
      `SELECT f.id, f.uploaded_by AS "uploadedBy", f.related_id AS "relatedId", f.category,
              f.original_name AS name, f.mime_type AS "mimeType", f.size
       FROM files f
       WHERE f.id = ANY($1::uuid[])
       FOR UPDATE`,
      [ids],
    )) as ClaimRow[];
    const byId = new Map(rows.map((row) => [row.id, row]));

    const ordered = ids.map((id) => {
      const row = byId.get(id);
      if (!row || row.uploadedBy !== input.ownerId) {
        throw new BadRequestException('file_not_found');
      }
      if (row.relatedId !== null) {
        throw new ConflictException('file_already_attached');
      }
      if (
        row.category !== null &&
        row.category !== 'general' &&
        row.category !== input.relatedType
      ) {
        throw new BadRequestException('file_purpose_mismatch');
      }
      if (input.imagesOnly && !row.mimeType.startsWith('image/')) {
        throw new BadRequestException('file_type_not_allowed');
      }
      return row;
    });

    const claimed = await queryRows<{ id: string }>(
      runner,
      `UPDATE files SET related_type = $1, related_id = $2
       WHERE id = ANY($3::uuid[]) AND related_id IS NULL
       RETURNING id`,
      [input.relatedType, input.relatedId, ids],
    );
    if (claimed.length !== ids.length) {
      throw new ConflictException('file_already_attached');
    }
    return ordered.map((row) => this.view(row));
  }

  /** Files attached to records, as FileViews: rows from a json_agg of {id, name, mimeType, size}. */
  views(rows: ViewRow[] | null | undefined): FileView[] {
    return (rows ?? []).map((row) => this.view(row));
  }

  /**
   * Deletes uploads left unattached for ABANDONED_UPLOAD_HOURS, then their stored content, and
   * answers how many rows went. The row goes first: content without a row is never served,
   * while a row without content would answer 404 to a record that still names it.
   */
  async purgeAbandonedUploads(): Promise<number> {
    let purged = 0;
    for (;;) {
      const rows = await queryRows<{ storageKey: string }>(
        this.ds,
        PURGE_ABANDONED_UPLOADS_SQL,
        [ABANDONED_UPLOAD_HOURS, ABANDONED_UPLOAD_BATCH],
      );
      // A batch is bounded, so its files are removed together; removeContent never rejects
      await Promise.all(rows.map((row) => this.removeContent(row.storageKey)));
      purged += rows.length;
      if (rows.length < ABANDONED_UPLOAD_BATCH) return purged;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeAbandonedUploadsOnSchedule(): Promise<void> {
    let purged = 0;
    // Per tenant under enforced mode: RLS limits the rows and contentPath names the
    // tenant's directory; once in legacy mode
    const outcomes = await this.tenantJobs.run(async () => {
      purged += await this.purgeAbandonedUploads();
    });
    const failed = outcomes.filter((outcome) => !outcome.ok);
    if (purged > 0 || failed.length > 0) {
      this.logger.log(
        `Purged ${purged} abandoned uploads${failed.length > 0 ? `; not purged for ${failed.map((f) => f.tenantId ?? 'legacy').join(', ')} (see the errors above)` : ''}`,
      );
    }
  }

  private async removeContent(storageKey: string): Promise<void> {
    if (!STORAGE_KEY.test(storageKey)) {
      this.logger.warn(
        `Kept the content of "${storageKey}": not a server-made storage key`,
      );
      return;
    }
    try {
      await fsp.unlink(this.contentPath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.logger.warn(
        `Could not remove the content of ${storageKey}: ${errorMessage(error)}`,
      );
    }
  }
}
