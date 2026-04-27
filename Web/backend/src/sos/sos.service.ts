import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsGateway } from '../notifications/notifications.gateway';

export interface CreateSosDto {
  incidentType: string;
  severity: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  message?: string;
  lat?: number;
  lng?: number;
}

export interface UpdateSosStatusDto {
  status: string;
  assignedTo?: string;
  resolutionNote?: string;
}

@Injectable()
export class SosService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly notifications: NotificationsGateway,
  ) {}

  async create(
    actorId: string,
    unitCode: string | null,
    dto: CreateSosDto,
  ): Promise<Record<string, unknown>> {
    const rows = await this.ds.query<Record<string, unknown>[]>(
      `INSERT INTO incidents(reporter_id, incident_type, severity, title, message, lat, lng, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW())
       RETURNING id, incident_type AS "incidentType", severity, title, message, lat, lng, status, created_at AS "createdAt"`,
      [actorId, dto.incidentType, dto.severity, dto.title, dto.message ?? null, dto.lat ?? null, dto.lng ?? null],
    );
    const incident = rows[0];
    // Emit sos:new to unit WebSocket room
    if (unitCode) {
      this.notifications.emitToUnit(unitCode, 'sos:new', {
        id: incident['id'],
        incidentType: incident['incidentType'],
        severity: incident['severity'],
        title: incident['title'],
      });
    } else {
      this.notifications.broadcast('sos:new', {
        id: incident['id'],
        incidentType: incident['incidentType'],
        severity: incident['severity'],
        title: incident['title'],
      });
    }
    return incident;
  }

  async list(filters: {
    status?: string;
    severity?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);
    const offset = (page - 1) * limit;
    const params: unknown[] = [];
    let idx = 1;
    const conditions: string[] = [];
    if (filters.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
    if (filters.severity) { conditions.push(`severity = $${idx++}`); params.push(filters.severity); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM incidents ${where}`,
      params,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.ds.query(
      `SELECT id, incident_type AS "incidentType", severity, title, message, lat, lng,
              status, assigned_to AS "assignedTo", reporter_id AS "reporterId",
              created_at AS "createdAt", resolved_at AS "resolvedAt"
       FROM incidents ${where}
       ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );
    return { data, total, page, limit };
  }

  async getById(id: string): Promise<Record<string, unknown>> {
    const rows = await this.ds.query<Record<string, unknown>[]>(
      `SELECT id, incident_type AS "incidentType", severity, title, message, lat, lng,
              status, assigned_to AS "assignedTo", reporter_id AS "reporterId",
              resolution_note AS "resolutionNote",
              created_at AS "createdAt", resolved_at AS "resolvedAt"
       FROM incidents WHERE id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('incident_not_found');
    return rows[0];
  }

  async updateStatus(
    id: string,
    dto: UpdateSosStatusDto,
    actorId: string,
  ): Promise<Record<string, unknown>> {
    const resolvedAt = dto.status === 'resolved' ? 'NOW()' : 'NULL';
    const rows = await this.ds.query<Record<string, unknown>[]>(
      `UPDATE incidents
       SET status = $1,
           assigned_to = COALESCE($2, assigned_to),
           resolution_note = COALESCE($3, resolution_note),
           resolved_at = ${resolvedAt},
           resolved_by = CASE WHEN $1 = 'resolved' THEN $4 ELSE resolved_by END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, incident_type AS "incidentType", severity, title, status,
                 assigned_to AS "assignedTo", resolved_at AS "resolvedAt"`,
      [dto.status, dto.assignedTo ?? null, dto.resolutionNote ?? null, actorId, id],
    );
    if (!rows.length) throw new NotFoundException('incident_not_found');
    const incident = rows[0];

    if (dto.status === 'resolved') {
      this.notifications.broadcast('sos:resolved', { id: incident['id'] });
    }
    return incident;
  }
}
