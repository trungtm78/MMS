import { queryOne, queryMany } from '../db/pool';

export interface AlertItem {
  id: string;
  category: string;
  severity: string;
  title: string;
  message: string;
  targetUserId: string | null;
  targetUserName: string | null;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolveNote: string | null;
}

export interface AlertListResult {
  data: AlertItem[];
  total: number;
  unreadCount: number;
}

export async function getAlerts(params: {
  status?: string;
  category?: string;
  severity?: string;
  page: number;
  limit: number;
}): Promise<AlertListResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.status && params.status !== 'all') {
    conditions.push(`a.status = $${idx++}`);
    values.push(params.status);
  }
  if (params.category) {
    conditions.push(`a.category = $${idx++}`);
    values.push(params.category);
  }
  if (params.severity) {
    conditions.push(`a.severity = $${idx++}`);
    values.push(params.severity);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (params.page - 1) * params.limit;

  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM alerts a ${where}`,
    values
  );
  const total = parseInt(countRow?.count ?? '0');

  const unreadRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM alerts WHERE status = 'active'`,
    []
  );
  const unreadCount = parseInt(unreadRow?.count ?? '0');

  const rows = await queryMany<{
    id: string;
    category: string;
    severity: string;
    title: string;
    message: string;
    target_user_id: string | null;
    target_user_name: string | null;
    status: string;
    created_at: Date;
    resolved_at: Date | null;
    resolve_note: string | null;
  }>(
    `SELECT
       a.id, a.category, a.severity, a.title, a.message,
       a.related_entity_id as target_user_id,
       u.full_name as target_user_name,
       a.status, a.created_at, a.resolved_at,
       NULL::text as resolve_note
     FROM alerts a
     LEFT JOIN users u ON u.id = a.related_entity_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, params.limit, offset]
  );

  const data: AlertItem[] = rows.map(r => ({
    id: r.id,
    category: r.category,
    severity: r.severity,
    title: r.title,
    message: r.message,
    targetUserId: r.target_user_id,
    targetUserName: r.target_user_name,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    resolveNote: r.resolve_note,
  }));

  return { data, total, unreadCount };
}

export async function resolveAlert(alertId: string, resolvedBy: string, note?: string): Promise<AlertItem | null> {
  const alert = await queryOne<{ id: string }>(
    `SELECT id FROM alerts WHERE id = $1`,
    [alertId]
  );

  if (!alert) return null;

  // alerts table doesn't have resolved_by/resolve_note columns in migration 007
  // We update status and resolved_at only
  const updated = await queryOne<{
    id: string;
    category: string;
    severity: string;
    title: string;
    message: string;
    related_entity_id: string | null;
    status: string;
    created_at: Date;
    resolved_at: Date | null;
  }>(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = NOW()
     WHERE id = $1
     RETURNING id, category, severity, title, message, related_entity_id, status, created_at, resolved_at`,
    [alertId]
  );

  if (!updated) return null;

  let targetUserName: string | null = null;
  if (updated.related_entity_id) {
    const u = await queryOne<{ full_name: string }>(
      'SELECT full_name FROM users WHERE id = $1',
      [updated.related_entity_id]
    );
    targetUserName = u?.full_name ?? null;
  }

  return {
    id: updated.id,
    category: updated.category,
    severity: updated.severity,
    title: updated.title,
    message: updated.message,
    targetUserId: updated.related_entity_id,
    targetUserName,
    status: updated.status,
    createdAt: updated.created_at,
    resolvedAt: updated.resolved_at,
    resolveNote: note ?? null,
  };
}
