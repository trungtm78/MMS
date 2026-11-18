import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { queryRows } from '../database/query-rows';
import { FilesService, type ViewRow } from '../files/files.service';

export interface CreateOfficialDocDto {
  docNumber?: string;
  docType: string;
  title: string;
  issuedBy?: string;
  issuedDate?: string;
  effectiveDate?: string;
  expiryDate?: string;
  subject?: string;
  fileId?: string;
  relatedMilitiaId?: string;
  relatedUnitId?: string;
}

@Injectable()
export class OfficialDocumentsService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly files: FilesService,
  ) {}

  async list(filters: {
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);
    const offset = (page - 1) * limit;
    const params: unknown[] = [];
    let idx = 1;
    const conditions: string[] = [];
    if (filters.type) {
      conditions.push(`doc_type = $${idx++}`);
      params.push(filters.type);
    }
    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    conditions.push(`status != 'revoked'`);
    const where = `WHERE ${conditions.join(' AND ')}`;

    const countRows = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM official_documents ${where}`,
      params,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.ds.query<Record<string, unknown>[]>(
      `SELECT id, doc_number AS "docNumber", doc_type AS "docType", title,
              issued_by AS "issuedBy", issued_date AS "issuedDate",
              effective_date AS "effectiveDate", expiry_date AS "expiryDate",
              status, subject, created_at AS "createdAt"
       FROM official_documents ${where}
       ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );
    return { data, total, page, limit };
  }

  // fileId: an upload of the creator's, not attached elsewhere, attached to the document in
  // the same transaction (FilesService.attach); a refused file creates no document
  async create(
    userId: string,
    dto: CreateOfficialDocDto,
  ): Promise<Record<string, unknown>> {
    return this.ds.transaction(async (mgr) => {
      const rows = await mgr.query<Record<string, unknown>[]>(
        `INSERT INTO official_documents(
           doc_number, doc_type, title, issued_by, issued_date, effective_date, expiry_date,
           status, subject, file_id, related_militia_id, related_unit_id, created_by, created_at
         ) VALUES ($1,$2,$3,$4,$5::date,$6::date,$7::date,'active',$8,$9::uuid,$10::uuid,$11::uuid,$12,NOW())
         RETURNING id, doc_number AS "docNumber", doc_type AS "docType", title,
                   issued_date AS "issuedDate", status, created_at AS "createdAt"`,
        [
          dto.docNumber ?? null,
          dto.docType,
          dto.title,
          dto.issuedBy ?? null,
          dto.issuedDate ?? null,
          dto.effectiveDate ?? null,
          dto.expiryDate ?? null,
          dto.subject ?? null,
          dto.fileId ?? null,
          dto.relatedMilitiaId ?? null,
          dto.relatedUnitId ?? null,
          userId,
        ],
      );
      const document = rows[0];
      const [file] = dto.fileId
        ? await this.files.attach(mgr, {
            ownerId: userId,
            fileIds: [dto.fileId],
            relatedType: 'official_document',
            relatedId: document['id'] as string,
          })
        : [];
      return { ...document, fileId: file?.id ?? null, file: file ?? null };
    });
  }

  // The document with its file as create answers it: a client downloads it under the file's
  // own name and type
  async getById(id: string): Promise<Record<string, unknown>> {
    const rows = await this.ds.query<
      (Record<string, unknown> & { file: ViewRow | null })[]
    >(
      `SELECT od.id, od.doc_number AS "docNumber", od.doc_type AS "docType", od.title,
              od.issued_by AS "issuedBy", od.issued_date AS "issuedDate",
              od.effective_date AS "effectiveDate", od.expiry_date AS "expiryDate",
              od.status, od.subject, od.file_id AS "fileId",
              od.related_militia_id AS "relatedMilitiaId", od.related_unit_id AS "relatedUnitId",
              od.created_by AS "createdBy", od.created_at AS "createdAt",
              CASE WHEN f.id IS NULL THEN NULL
                   ELSE json_build_object('id', f.id, 'name', f.original_name, 'mimeType', f.mime_type, 'size', f.size)
              END AS file
       FROM official_documents od
       LEFT JOIN files f ON f.id = od.file_id
       WHERE od.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('document_not_found');
    const { file, ...document } = rows[0];
    const [view] = this.files.views(file ? [file] : []);
    return { ...document, file: view ?? null };
  }

  async update(
    id: string,
    dto: Partial<CreateOfficialDocDto>,
  ): Promise<Record<string, unknown>> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (dto.docNumber !== undefined) {
      setClauses.push(`doc_number = $${idx++}`);
      params.push(dto.docNumber);
    }
    if (dto.title !== undefined) {
      setClauses.push(`title = $${idx++}`);
      params.push(dto.title);
    }
    if (dto.issuedBy !== undefined) {
      setClauses.push(`issued_by = $${idx++}`);
      params.push(dto.issuedBy);
    }
    if (dto.subject !== undefined) {
      setClauses.push(`subject = $${idx++}`);
      params.push(dto.subject);
    }
    if (!setClauses.length) return this.getById(id);

    params.push(id);
    const rows = await queryRows<Record<string, unknown>>(
      this.ds,
      `UPDATE official_documents SET ${setClauses.join(', ')} WHERE id = $${idx} AND status != 'revoked'
       RETURNING id, title, status`,
      params,
    );
    if (!rows.length) throw new NotFoundException('document_not_found');
    return rows[0];
  }

  async revoke(id: string): Promise<void> {
    const rows = await queryRows<{ id: string }>(
      this.ds,
      `UPDATE official_documents SET status = 'revoked' WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('document_not_found');
  }
}
