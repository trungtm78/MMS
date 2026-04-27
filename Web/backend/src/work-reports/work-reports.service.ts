import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CreateWorkReportDto {
  reportType: string;
  title: string;
  content: string;
  period?: string;
}

export interface ReviewWorkReportDto {
  reviewStatus: 'approved' | 'rejected';
  reviewNote?: string;
}

@Injectable()
export class WorkReportsService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  async list(filters: {
    type?: string;
    userId?: string;
    page?: number;
    limit?: number;
    requesterRole?: string;
    requesterSub?: string;
  }): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);
    const offset = (page - 1) * limit;
    const params: unknown[] = [];
    let idx = 1;
    const conditions: string[] = [];

    // dqtv_member can only see own reports
    const isDqtv = filters.requesterRole === 'dqtv_member' || filters.requesterRole === 'dqtv';
    if (isDqtv) {
      conditions.push(`wr.created_by = $${idx++}`);
      params.push(filters.requesterSub);
    } else if (filters.userId) {
      conditions.push(`wr.created_by = $${idx++}`);
      params.push(filters.userId);
    }
    if (filters.type) { conditions.push(`wr.report_type = $${idx++}`); params.push(filters.type); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM work_reports wr ${where}`,
      params,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.ds.query(
      `SELECT wr.id, wr.report_type AS "reportType", wr.title, wr.period,
              wr.review_status AS "reviewStatus", wr.review_note AS "reviewNote",
              wr.created_by AS "createdBy", wr.created_at AS "createdAt",
              wr.reviewed_at AS "reviewedAt", wr.reviewed_by AS "reviewedBy"
       FROM work_reports wr ${where}
       ORDER BY wr.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );
    return { data, total, page, limit };
  }

  async create(
    userId: string,
    dto: CreateWorkReportDto,
  ): Promise<Record<string, unknown>> {
    const rows = await this.ds.query<Record<string, unknown>[]>(
      `INSERT INTO work_reports(created_by, report_type, title, content, period, review_status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       RETURNING id, report_type AS "reportType", title, period, review_status AS "reviewStatus", created_at AS "createdAt"`,
      [userId, dto.reportType, dto.title, dto.content, dto.period ?? null],
    );
    return rows[0];
  }

  async review(
    id: string,
    dto: ReviewWorkReportDto,
    reviewerId: string,
    reviewerRole: string,
  ): Promise<Record<string, unknown>> {
    const caRoles = new Set(['ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'system_admin']);
    if (!caRoles.has(reviewerRole)) throw new ForbiddenException('only_ca_can_review');

    const rows = await this.ds.query<Record<string, unknown>[]>(
      `UPDATE work_reports
       SET review_status = $1, review_note = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4
       RETURNING id, report_type AS "reportType", title, review_status AS "reviewStatus",
                 review_note AS "reviewNote", reviewed_at AS "reviewedAt"`,
      [dto.reviewStatus, dto.reviewNote ?? null, reviewerId, id],
    );
    if (!rows.length) throw new NotFoundException('work_report_not_found');
    return rows[0];
  }
}
