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
      // Single CTE: INSERT + JOIN in one round-trip — avoids partial-failure
      // where INSERT succeeds but the follow-up SELECT fails.
      const rows = await this.dataSource.query<AssignmentRow[]>(
        `WITH ins AS (
           INSERT INTO ca_dqtv_assignments (ca_user_id, dqtv_user_id, assigned_by)
           VALUES ($1::uuid, $2::uuid, $3::uuid)
           RETURNING id, ca_user_id, dqtv_user_id, assigned_by, assigned_at
         )
         SELECT ins.id,
                ins.ca_user_id AS "caUserId",
                ins.dqtv_user_id AS "dqtvUserId",
                u.full_name AS "dqtvFullName",
                COALESCE(mp.unit_id::text, '') AS "dqtvUnitCode",
                ins.assigned_by AS "assignedBy",
                ins.assigned_at AS "assignedAt"
         FROM ins
         JOIN users u ON u.id = ins.dqtv_user_id
         LEFT JOIN militia_profiles mp ON mp.user_id = ins.dqtv_user_id`,
        [dto.caUserId, dto.dqtvUserId, assignedBy],
      );
      return rows[0];
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('assignment_already_exists');
      }
      throw err;
    }
  }

  // requester is system_admin (enforced by controller @Roles guard);
  // any admin can delete any assignment — no ownership restriction by design.
  async removeAssignment(id: string, _requester: RequesterInfo): Promise<void> {
    // Single DELETE RETURNING avoids TOCTOU race between SELECT-exists + DELETE.
    const rows = await this.dataSource.query<{ id: string }[]>(
      `DELETE FROM ca_dqtv_assignments WHERE id = $1::uuid RETURNING id`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('assignment_not_found');
  }

  async listByCa(
    caUserId: string | undefined,
    requester: RequesterInfo,
  ): Promise<AssignmentRow[]> {
    // ca_officer can only see own assignments
    let targetCaId: string;
    const normalizedCaUserId = caUserId?.trim() || undefined;
    if (requester.role === 'ca_officer') {
      if (normalizedCaUserId && normalizedCaUserId !== requester.sub) {
        throw new ForbiddenException('forbidden');
      }
      targetCaId = requester.sub;
    } else {
      // system_admin: caUserId required
      if (!normalizedCaUserId) throw new ForbiddenException('forbidden');
      targetCaId = normalizedCaUserId;
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
