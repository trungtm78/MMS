// Explicit audit rows for decisions a request records (discipline decisions, appeals,
// inventory results). The AuditInterceptor logs every mutating request after the fact;
// these rows are written in the transaction that records the decision, so a decision and
// its audit entry are committed or rolled back together.

export interface AuditQueryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

export interface AuditOrigin {
  ip: string | null;
  userAgent: string | null;
}

export interface OriginRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

// Where a request came from. req.ip is the client address once Express "trust proxy"
// covers the reverse proxy in front of the API.
export function auditOriginOf(req: OriginRequest): AuditOrigin {
  const agent = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: (Array.isArray(agent) ? agent[0] : agent) ?? null,
  };
}

export interface AuditEntry {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
}

export async function writeAuditLog(
  runner: AuditQueryable,
  entry: AuditEntry,
  origin?: AuditOrigin,
): Promise<void> {
  await runner.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_json, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      entry.actorId,
      entry.action,
      entry.entityType,
      entry.entityId,
      JSON.stringify(entry.details),
      origin?.ip ?? null,
      origin?.userAgent ?? null,
    ],
  );
}
