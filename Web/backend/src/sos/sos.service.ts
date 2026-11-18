// SOS incidents: raising an alert, and a responder moving it through its lifecycle
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import { insertWithRecordCode } from '../common/codes/record-code';
import { queryRows } from '../database/query-rows';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { canMoveIncident } from './incident-values';
import { resolveSosScope, SOS_SCOPE_SQL, type SosActor } from './sos-scope';

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
    private readonly assignments: AssignmentsService,
  ) {}

  // An alert gets a readable code (SOS-YYYYMMDD-XXXXXX) and an empty message when the
  // reporter wrote none: both columns are required (migration 007)
  async create(
    actorId: string,
    unitCode: string | null,
    dto: CreateSosDto,
  ): Promise<Record<string, unknown>> {
    const incident = await insertWithRecordCode('SOS', async (code) => {
      const rows = await this.ds.query<Record<string, unknown>[]>(
        `INSERT INTO incidents (code, reporter_id, incident_type, severity, title, message, lat, lng, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
         ON CONFLICT (tenant_id, code) DO NOTHING
         RETURNING id, code, incident_type AS "incidentType", severity, title, message,
                   lat::float8 AS lat, lng::float8 AS lng, status, created_at AS "createdAt"`,
        [
          code,
          actorId,
          dto.incidentType,
          dto.severity,
          dto.title,
          dto.message ?? '',
          dto.lat ?? null,
          dto.lng ?? null,
        ],
      );
      return rows[0] ?? null;
    });
    this.announce(unitCode, incident);
    return incident;
  }

  // Only an alert inside the responder's scope, locked while its status changes; others
  // answer 404 like missing ones. A resolution keeps who resolved it first and when.
  async updateStatus(
    actor: SosActor,
    id: string,
    dto: UpdateSosStatusDto,
  ): Promise<Record<string, unknown>> {
    const scope = await resolveSosScope(actor, this.assignments);

    const incident = await this.ds.transaction(async (mgr) => {
      const [current] = await mgr.query<{ id: string; status: string }[]>(
        `SELECT i.id, i.status FROM incidents i
         WHERE ${SOS_SCOPE_SQL}
           AND i.id = $3
         FOR UPDATE`,
        [scope.reporterIds, scope.unit, id],
      );
      if (!current) throw new NotFoundException('incident_not_found');
      if (!canMoveIncident(current.status, dto.status)) {
        throw new ConflictException('invalid_status_transition');
      }
      if (dto.assignedTo) await this.assertActiveUser(mgr, dto.assignedTo);

      const rows = await queryRows<Record<string, unknown>>(
        mgr,
        // $1 is used as a column value and in IN lists: one explicit type, or PostgreSQL
        // refuses to deduce it
        `UPDATE incidents
         SET status = $1::text,
             assigned_to = COALESCE($2::uuid, assigned_to),
             resolution_note = COALESCE($3, resolution_note),
             resolved_at = CASE WHEN $1::text IN ('resolved', 'closed') THEN COALESCE(resolved_at, now()) ELSE NULL END,
             resolved_by = CASE WHEN $1::text IN ('resolved', 'closed') THEN COALESCE(resolved_by, $4::uuid) ELSE NULL END,
             updated_at = now()
         WHERE id = $5
         RETURNING id, code, incident_type AS "incidentType", severity, title, status,
                   assigned_to AS "assignedTo", resolved_at AS "resolvedAt"`,
        [
          dto.status,
          dto.assignedTo ?? null,
          dto.resolutionNote ?? null,
          actor.sub,
          id,
        ],
      );
      return rows[0];
    });

    if (dto.status === 'resolved') {
      this.notifications.emitToTenant('sos:resolved', { id: incident['id'] });
    }
    return incident;
  }

  private async assertActiveUser(
    mgr: EntityManager,
    userId: string,
  ): Promise<void> {
    const rows = await mgr.query<unknown[]>(
      `SELECT 1 FROM users WHERE id = $1 AND status = 'active'`,
      [userId],
    );
    if (!rows.length) throw new BadRequestException('assignee_not_found');
  }

  // sos:new to the reporter's unit room, or to everyone of the tenant when the reporter has
  // no unit
  private announce(unitCode: string | null, incident: Record<string, unknown>) {
    const payload = {
      id: incident['id'],
      code: incident['code'],
      incidentType: incident['incidentType'],
      severity: incident['severity'],
      title: incident['title'],
    };
    if (unitCode) {
      this.notifications.emitToUnit(unitCode, 'sos:new', payload);
    } else {
      this.notifications.emitToTenant('sos:new', payload);
    }
  }
}
