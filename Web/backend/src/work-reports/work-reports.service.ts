import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import { effectiveUnit, type ScopedActor } from '../common/access/unit-scope';
import { DQTV_ROLES, REVIEWER_ROLES } from '../common/constants/roles';
import { queryRows } from '../database/query-rows';
import { userInUnit } from '../common/sql/user-access.sql';
import {
  businessDayEndSql,
  businessDayStartSql,
  isIsoDate,
} from '../common/time/business-date';
import { FilesService, type FileView } from '../files/files.service';

export interface CreateWorkReportDto {
  reportType: string;
  title: string;
  content: string;
  period?: string;
  location?: string;
  // Ids from POST /files/upload, in display order
  attachmentIds?: string[];
}

// What a report reads as, list and detail alike. attachments: its files in the author's
// order, as {id, name, mimeType, size} (the service adds each download url).
const REPORT_COLUMNS = `wr.id, wr.report_type AS "reportType", wr.title, wr.content, wr.location, wr.period,
              wr.review_status AS "reviewStatus", wr.review_note AS "reviewNote",
              wr.created_by AS "createdBy", wr.created_at AS "createdAt",
              wr.reviewed_at AS "reviewedAt", wr.reviewed_by AS "reviewedBy",
              author.full_name AS "authorName",
              COALESCE((
                SELECT json_agg(json_build_object('id', f.id, 'name', f.original_name, 'mimeType', f.mime_type, 'size', f.size)
                                ORDER BY wra.position)
                FROM work_report_attachments wra
                JOIN files f ON f.id = wra.file_id
                WHERE wra.work_report_id = wr.id
              ), '[]'::json) AS attachments`;

// The units a report's author belongs to: militia profiles and account scopes
const AUTHOR_UNITS = `ARRAY(
                  SELECT u.code FROM militia_profiles mp JOIN units u ON u.id = mp.unit_id
                  WHERE mp.user_id = wr.created_by
                  UNION
                  SELECT su.code FROM user_unit_scopes s JOIN units su ON su.id = s.unit_id
                  WHERE s.user_id = wr.created_by
                )`;

type AttachmentRow = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
};

export interface ReviewWorkReportDto {
  reviewStatus: 'approved' | 'rejected';
  reviewNote?: string;
}

export interface WorkReportActor extends ScopedActor {
  sub: string;
}

// Whose reports an actor may see
type Audience =
  | { kind: 'own' }
  | { kind: 'assigned'; ids: string[] }
  | { kind: 'unit'; code: string }
  | { kind: 'ward' };

@Injectable()
export class WorkReportsService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly assignments: AssignmentsService,
    private readonly files: FilesService,
  ) {}

  // DQTV members see their own reports, CA officers those of the DQTV assigned to
  // them, and every other role the reports of authors in its effective unit
  private async audienceOf(actor: WorkReportActor): Promise<Audience> {
    if (DQTV_ROLES.has(actor.role)) return { kind: 'own' };
    if (actor.role === 'ca_officer') {
      return {
        kind: 'assigned',
        ids: await this.assignments.getAssignedDqtvIds(actor.sub),
      };
    }
    const unit = effectiveUnit(actor);
    return unit === null ? { kind: 'ward' } : { kind: 'unit', code: unit };
  }

  private canSee(
    audience: Audience,
    actor: WorkReportActor,
    report: { createdBy: string; authorUnits: string[] },
  ): boolean {
    switch (audience.kind) {
      case 'own':
        return report.createdBy === actor.sub;
      case 'assigned':
        return audience.ids.includes(report.createdBy);
      case 'unit':
        return report.authorUnits.includes(audience.code);
      case 'ward':
        return true;
    }
  }

  async list(filters: {
    type?: string;
    userId?: string;
    reviewStatus?: string;
    // Vietnamese calendar days, both inclusive
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    actor: WorkReportActor;
  }): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    for (const date of [filters.from, filters.to]) {
      if (date !== undefined && !isIsoDate(date)) {
        throw new BadRequestException('invalid_date');
      }
    }
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);
    const offset = (page - 1) * limit;

    const audience = await this.audienceOf(filters.actor);
    if (audience.kind === 'assigned' && audience.ids.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const params: unknown[] = [];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const conditions: string[] = [];

    if (audience.kind === 'own') {
      conditions.push(`wr.created_by = ${bind(filters.actor.sub)}`);
    } else {
      if (filters.userId)
        conditions.push(`wr.created_by = ${bind(filters.userId)}`);
      if (audience.kind === 'assigned') {
        conditions.push(`wr.created_by = ANY(${bind(audience.ids)}::uuid[])`);
      }
      // A report author belongs to a unit through their militia profile or account scope
      if (audience.kind === 'unit') {
        conditions.push(userInUnit('wr.created_by', bind(audience.code)));
      }
    }
    if (filters.type) conditions.push(`wr.report_type = ${bind(filters.type)}`);
    if (filters.reviewStatus) {
      conditions.push(`wr.review_status = ${bind(filters.reviewStatus)}`);
    }
    if (filters.from) {
      conditions.push(
        `wr.created_at >= ${businessDayStartSql(bind(filters.from))}`,
      );
    }
    if (filters.to) {
      conditions.push(`wr.created_at < ${businessDayEndSql(bind(filters.to))}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM work_reports wr ${where}`,
      [...params],
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const rows = await this.ds.query<
      (Record<string, unknown> & { attachments: AttachmentRow[] | null })[]
    >(
      `SELECT ${REPORT_COLUMNS}
       FROM work_reports wr
       LEFT JOIN users author ON author.id = wr.created_by
       ${where}
       ORDER BY wr.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const data = rows.map((row) => ({
      ...row,
      attachments: this.files.views(row.attachments),
    }));
    return { data, total, page, limit };
  }

  // GET /work-reports/:id — one report with its attachments, for the audience that lists
  // it; any other report answers 404 like an unknown id
  async findOne(
    id: string,
    actor: WorkReportActor,
  ): Promise<Record<string, unknown>> {
    const audience = await this.audienceOf(actor);
    const rows = await this.ds.query<
      (Record<string, unknown> & {
        createdBy: string;
        authorUnits: string[];
        attachments: AttachmentRow[] | null;
      })[]
    >(
      `SELECT ${REPORT_COLUMNS},
              ${AUTHOR_UNITS} AS "authorUnits"
       FROM work_reports wr
       LEFT JOIN users author ON author.id = wr.created_by
       WHERE wr.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row || !this.canSee(audience, actor, row)) {
      throw new NotFoundException('work_report_not_found');
    }
    const report: Record<string, unknown> = {
      ...row,
      attachments: this.files.views(row.attachments),
    };
    delete report.authorUnits;
    return report;
  }

  // The report and its attachments are written in one transaction: an attachment that is
  // unknown, someone else's, already attached or uploaded for another purpose refuses the
  // whole report (FilesService.attach)
  async create(
    userId: string,
    dto: CreateWorkReportDto,
  ): Promise<Record<string, unknown>> {
    return this.ds.transaction(async (mgr) => {
      const rows = await mgr.query<Record<string, unknown>[]>(
        `INSERT INTO work_reports (created_by, report_type, title, content, period, location, review_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id, report_type AS "reportType", title, content, location, period,
                   review_status AS "reviewStatus", created_at AS "createdAt"`,
        [
          userId,
          dto.reportType,
          dto.title,
          dto.content,
          dto.period ?? null,
          dto.location ?? null,
        ],
      );
      const report = rows[0];
      const attachments: FileView[] = dto.attachmentIds?.length
        ? await this.files.attach(mgr, {
            ownerId: userId,
            fileIds: dto.attachmentIds,
            relatedType: 'work_report',
            relatedId: report['id'] as string,
          })
        : [];
      if (attachments.length > 0) {
        await mgr.query(
          `INSERT INTO work_report_attachments (work_report_id, file_id, position)
           SELECT $1, a.file_id, a.ord - 1
           FROM unnest($2::uuid[]) WITH ORDINALITY AS a(file_id, ord)`,
          [report['id'], attachments.map((file) => file.id)],
        );
      }
      return { ...report, attachments };
    });
  }

  async review(
    id: string,
    dto: ReviewWorkReportDto,
    actor: WorkReportActor,
  ): Promise<Record<string, unknown>> {
    const isReviewer = [actor.role, ...(actor.roles ?? [])].some((role) =>
      REVIEWER_ROLES.has(role),
    );
    if (!isReviewer) throw new ForbiddenException('only_ca_can_review');
    const audience = await this.audienceOf(actor);

    return this.ds.transaction(async (mgr) => {
      const rows = await mgr.query<
        {
          id: string;
          reviewStatus: string;
          createdBy: string;
          authorUnits: string[];
        }[]
      >(
        `SELECT wr.id, wr.review_status AS "reviewStatus", wr.created_by AS "createdBy",
                ${AUTHOR_UNITS} AS "authorUnits"
         FROM work_reports wr
         WHERE wr.id = $1
         FOR UPDATE OF wr`,
        [id],
      );
      const report = rows[0];
      // Out-of-scope reports answer like unknown ones so ids cannot be probed
      if (!report || !this.canSee(audience, actor, report)) {
        throw new NotFoundException('work_report_not_found');
      }
      if (report.createdBy === actor.sub) {
        throw new ForbiddenException('cannot_review_own_report');
      }
      if (report.reviewStatus !== 'pending') {
        throw new ConflictException('work_report_already_reviewed');
      }

      const updated = await queryRows<Record<string, unknown>>(
        mgr,
        `UPDATE work_reports
         SET review_status = $1, review_note = $2, reviewed_by = $3,
             reviewed_at = now(), updated_at = now()
         WHERE id = $4 AND review_status = 'pending'
         RETURNING id, report_type AS "reportType", title, review_status AS "reviewStatus",
                   review_note AS "reviewNote", reviewed_by AS "reviewedBy",
                   reviewed_at AS "reviewedAt"`,
        [dto.reviewStatus, dto.reviewNote ?? null, actor.sub, id],
      );
      if (!updated.length) {
        throw new ConflictException('work_report_already_reviewed');
      }
      return updated[0];
    });
  }
}
