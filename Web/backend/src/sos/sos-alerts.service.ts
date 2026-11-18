// GET /sos/alerts, GET /sos and GET /sos/:id: SOS incidents limited to the reporters each
// caller responds to (sos-scope.ts)
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AssignmentsService } from '../assignments/assignments.service';
import {
  INCIDENT_SEVERITIES,
  SOS_ACTIVE_STATUSES,
  SOS_CLOSED_STATUSES,
} from './incident-values';
import { resolveSosScope, SOS_SCOPE_SQL, type SosActor } from './sos-scope';

export type { SosActor };

// ?status= values: a group, or one incident status (migration 007). "resolved" is the
// group of handled alerts (resolved and closed), as the SOS page reads it.
const STATUS_FILTERS: Readonly<Record<string, readonly string[] | null>> = {
  all: null,
  active: SOS_ACTIVE_STATUSES,
  resolved: SOS_CLOSED_STATUSES,
  open: ['open'],
  acknowledged: ['acknowledged'],
  responding: ['responding'],
  closed: ['closed'],
};

export interface SosAlertFilters {
  status?: string;
  severity?: string;
  unitCode?: string;
  page?: number;
  limit?: number;
}

export interface SosAlertPage {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  /** Across the caller's whole scope, whatever the filters */
  counts: { active: number; resolved: number };
}

// $3 statuses (text[]), $4 severity
const FILTER_SQL = `($3::text[] IS NULL OR i.status = ANY($3::text[]))
    AND ($4::text IS NULL OR i.severity = $4)`;

const inList = (values: readonly string[]) =>
  values.map((v) => `'${v}'`).join(', ');

// One alert as the list and the alert page show it, on incidents i
const ALERT_SELECT = `SELECT i.id, i.code, i.incident_type AS "incidentType", i.severity, i.title,
              i.message, i.lat::float8 AS lat, i.lng::float8 AS lng,
              i.location_name AS "locationName", i.status,
              CASE WHEN i.status IN (${inList(SOS_CLOSED_STATUSES)}) THEN 'resolved' ELSE 'active' END
                AS "statusGroup",
              i.reporter_id AS "reporterId", ru.full_name AS "reporterName",
              COALESCE(
                (SELECT pu.code FROM militia_profiles pmp JOIN units pu ON pu.id = pmp.unit_id
                 WHERE pmp.user_id = i.reporter_id ORDER BY pmp.created_at, pmp.id LIMIT 1),
                (SELECT su.code FROM user_unit_scopes ss JOIN units su ON su.id = ss.unit_id
                 WHERE ss.user_id = i.reporter_id ORDER BY su.code LIMIT 1)
              ) AS "reporterUnitCode",
              i.assigned_to AS "assignedTo", au.full_name AS "assignedToName",
              i.resolution_note AS "resolutionNote",
              i.created_at AS "createdAt", i.updated_at AS "updatedAt",
              i.resolved_at AS "resolvedAt"
       FROM incidents i
       JOIN users ru ON ru.id = i.reporter_id
       LEFT JOIN users au ON au.id = i.assigned_to`;

@Injectable()
export class SosAlertsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly assignments: AssignmentsService,
  ) {}

  async list(actor: SosActor, filters: SosAlertFilters): Promise<SosAlertPage> {
    const statusKey = filters.status || 'all';
    if (!Object.prototype.hasOwnProperty.call(STATUS_FILTERS, statusKey)) {
      throw new BadRequestException('invalid_status');
    }
    const severity = filters.severity || null;
    const severities: readonly string[] = INCIDENT_SEVERITIES;
    if (severity !== null && !severities.includes(severity)) {
      throw new BadRequestException('invalid_severity');
    }
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);

    const { reporterIds, unit } = await resolveSosScope(
      actor,
      this.assignments,
      filters.unitCode,
    );
    const statuses = STATUS_FILTERS[statusKey];
    const params = [
      reporterIds,
      unit,
      statuses ? [...statuses] : null,
      severity,
    ];

    const [counts] = await this.dataSource.query<
      { total: number; active: number; resolved: number }[]
    >(
      `SELECT COUNT(*) FILTER (WHERE ${FILTER_SQL})::int AS total,
              COUNT(*) FILTER (WHERE i.status IN (${inList(SOS_ACTIVE_STATUSES)}))::int AS active,
              COUNT(*) FILTER (WHERE i.status IN (${inList(SOS_CLOSED_STATUSES)}))::int AS resolved
       FROM incidents i
       WHERE ${SOS_SCOPE_SQL}`,
      params,
    );

    // Active alerts first, the most severe and then the newest, as a dispatch queue reads
    const data = await this.dataSource.query<Record<string, unknown>[]>(
      `${ALERT_SELECT}
       WHERE ${SOS_SCOPE_SQL}
         AND ${FILTER_SQL}
       ORDER BY (i.status IN (${inList(SOS_ACTIVE_STATUSES)})) DESC,
                CASE i.severity WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                i.created_at DESC, i.id DESC
       LIMIT $5 OFFSET $6`,
      [...params, limit, (page - 1) * limit],
    );

    return {
      data,
      total: Number(counts?.total ?? 0),
      page,
      limit,
      counts: {
        active: Number(counts?.active ?? 0),
        resolved: Number(counts?.resolved ?? 0),
      },
    };
  }

  /** One alert of the caller's scope; any other answers 404 incident_not_found. */
  async findOne(actor: SosActor, id: string): Promise<Record<string, unknown>> {
    const { reporterIds, unit } = await resolveSosScope(
      actor,
      this.assignments,
    );
    const [alert] = await this.dataSource.query<Record<string, unknown>[]>(
      `${ALERT_SELECT}
       WHERE ${SOS_SCOPE_SQL}
         AND i.id = $3`,
      [reporterIds, unit, id],
    );
    if (!alert) throw new NotFoundException('incident_not_found');
    return alert;
  }
}
