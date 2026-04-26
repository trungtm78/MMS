import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

export interface AssignmentRow {
  id: string;
  caUserId: string;
  dqtvUserId: string;
  dqtvFullName: string;
  dqtvUnitCode: string;
  assignedBy: string;
  assignedAt: Date;
}

export interface RequesterInfo {
  sub: string;
  role: string;
}

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async createAssignment(
    dto: CreateAssignmentDto,
    assignedBy: string,
  ): Promise<AssignmentRow> {
    try {
      const rows = await this.dataSource.query<{ id: string; assigned_at: Date }[]>(
        `INSERT INTO ca_dqtv_assignments (ca_user_id, dqtv_user_id, assigned_by)
         VALUES ($1::uuid, $2::uuid, $3::uuid)
         RETURNING id, assigned_at`,
        [dto.caUserId, dto.dqtvUserId, assignedBy],
      );
      const row = rows[0];

      // Read back with names for response
      const detail = await this.dataSource.query<AssignmentRow[]>(
        `SELECT a.id,
                a.ca_user_id AS "caUserId",
                a.dqtv_user_id AS "dqtvUserId",
                u.full_name AS "dqtvFullName",
                COALESCE(mp.unit_id::text, '') AS "dqtvUnitCode",
                a.assigned_by AS "assignedBy",
                a.assigned_at AS "assignedAt"
         FROM ca_dqtv_assignments a
         JOIN users u ON u.id = a.dqtv_user_id
         LEFT JOIN militia_profiles mp ON mp.user_id = a.dqtv_user_id
         WHERE a.id = $1::uuid`,
        [row.id],
      );
      return detail[0];
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('assignment_already_exists');
      }
      throw err;
    }
  }

  async removeAssignment(id: string, requester: RequesterInfo): Promise<void> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM ca_dqtv_assignments WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('assignment_not_found');

    await this.dataSource.query(
      `DELETE FROM ca_dqtv_assignments WHERE id = $1::uuid`,
      [id],
    );
  }

  async listByCa(
    caUserId: string | undefined,
    requester: RequesterInfo,
  ): Promise<AssignmentRow[]> {
    // ca_officer can only see own assignments
    let targetCaId: string;
    if (requester.role === 'ca_officer') {
      if (caUserId && caUserId !== requester.sub) {
        throw new ForbiddenException('ca_officer_can_only_view_own_assignments');
      }
      targetCaId = requester.sub;
    } else {
      // system_admin: caUserId required
      if (!caUserId) throw new ForbiddenException('caUserId_required_for_admin');
      targetCaId = caUserId;
    }

    return this.dataSource.query<AssignmentRow[]>(
      `SELECT a.id,
              a.ca_user_id AS "caUserId",
              a.dqtv_user_id AS "dqtvUserId",
              u.full_name AS "dqtvFullName",
              COALESCE(un.code, '') AS "dqtvUnitCode",
              a.assigned_by AS "assignedBy",
              a.assigned_at AS "assignedAt"
       FROM ca_dqtv_assignments a
       JOIN users u ON u.id = a.dqtv_user_id
       LEFT JOIN militia_profiles mp ON mp.user_id = a.dqtv_user_id
       LEFT JOIN units un ON un.id = mp.unit_id
       WHERE a.ca_user_id = $1::uuid
       ORDER BY a.assigned_at DESC`,
      [targetCaId],
    );
  }

  async getAssignedDqtvIds(caUserId: string): Promise<string[]> {
    const rows = await this.dataSource.query<{ dqtv_user_id: string }[]>(
      `SELECT dqtv_user_id FROM ca_dqtv_assignments WHERE ca_user_id = $1::uuid`,
      [caUserId],
    );
    return rows.map((r) => r.dqtv_user_id);
  }
}
