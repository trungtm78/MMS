import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryMany } from '../db/pool';

export type IncidentType = 'sos' | 'security' | 'fire' | 'medical' | 'accident' | 'utility' | 'other';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'urgent';
export type IncidentStatus = 'open' | 'acknowledged' | 'responding' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  code: string;
  reporterId: string;
  reporterName: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  title: string;
  message: string;
  lat: number | null;
  lng: number | null;
  locationName: string | null;
  status: IncidentStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function generateIncidentCode(): Promise<string> {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');

  const result = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM incidents 
     WHERE EXTRACT(YEAR FROM created_at) = $1 
     AND EXTRACT(MONTH FROM created_at) = $2`,
    [year, month]
  );

  const count = parseInt(result?.count || '0') + 1;
  return `BC-${year}${month}-${String(count).padStart(4, '0')}`;
}

// US-008: SOS emergency alerts
// BR-009: Alerts and notifications are event-driven - Trigger high-priority SOS alert
export async function createSOS(
  userId: string,
  data: {
    severity: IncidentSeverity;
    message: string;
    location?: { lat: number; lng: number; name?: string };
  }
): Promise<Incident> {
  const code = await generateIncidentCode();
  const incidentId = uuidv4();

  await queryOne(
    `INSERT INTO incidents (
      id, code, reporter_id, incident_type, severity, title, message,
      lat, lng, location_name, status
    ) VALUES ($1, $2, $3, 'sos', $4, 'SOS - Khẩn cấp', $5, $6, $7, $8, 'open')`,
    [
      incidentId, code, userId, data.severity, data.message,
      data.location?.lat || null, data.location?.lng || null, data.location?.name || null
    ]
  );

  // Create alert for responders
  await queryOne(
    `INSERT INTO alerts (category, severity, title, message, related_entity_type, related_entity_id, status)
     VALUES ('security', $1, 'SOS - Khẩn cấp', $2, 'incident', $3, 'active')`,
    [data.severity, data.message, incidentId]
  );

  return getIncidentById(incidentId) as Promise<Incident>;
}

// US-008: SOS emergency alerts (general incident reporting)
// BR-009: Event-driven alerts for incidents with GPS location
export async function createIncidentReport(
  userId: string,
  data: {
    incidentType: IncidentType;
    severity: IncidentSeverity;
    title: string;
    message: string;
    location?: { lat: number; lng: number; name?: string };
  }
): Promise<Incident> {
  const code = await generateIncidentCode();
  const incidentId = uuidv4();

  await queryOne(
    `INSERT INTO incidents (
      id, code, reporter_id, incident_type, severity, title, message,
      lat, lng, location_name, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open')`,
    [
      incidentId, code, userId, data.incidentType, data.severity, data.title, data.message,
      data.location?.lat || null, data.location?.lng || null, data.location?.name || null
    ]
  );

  // Create alert if high severity
  if (data.severity === 'high' || data.severity === 'urgent') {
    await queryOne(
      `INSERT INTO alerts (category, severity, title, message, related_entity_type, related_entity_id, status)
       VALUES ('security', $1, $2, $3, 'incident', $4, 'active')`,
      [data.severity, data.title, data.message, incidentId]
    );
  }

  return getIncidentById(incidentId) as Promise<Incident>;
}

export async function getIncidentById(incidentId: string): Promise<Incident | null> {
  const incident = await queryOne<{
    id: string;
    code: string;
    reporter_id: string;
    reporter_name: string;
    incident_type: IncidentType;
    severity: IncidentSeverity;
    title: string;
    message: string;
    lat: number | null;
    lng: number | null;
    location_name: string | null;
    status: IncidentStatus;
    assigned_to: string | null;
    assigned_to_name: string | null;
    resolved_at: Date | null;
    resolved_by: string | null;
    resolved_by_name: string | null;
    resolution_note: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT 
      i.*, 
      u1.full_name as reporter_name,
      u2.full_name as assigned_to_name,
      u3.full_name as resolved_by_name
    FROM incidents i
    JOIN users u1 ON i.reporter_id = u1.id
    LEFT JOIN users u2 ON i.assigned_to = u2.id
    LEFT JOIN users u3 ON i.resolved_by = u3.id
    WHERE i.id = $1`,
    [incidentId]
  );

  if (!incident) return null;

  return {
    id: incident.id,
    code: incident.code,
    reporterId: incident.reporter_id,
    reporterName: incident.reporter_name,
    incidentType: incident.incident_type,
    severity: incident.severity,
    title: incident.title,
    message: incident.message,
    lat: incident.lat,
    lng: incident.lng,
    locationName: incident.location_name,
    status: incident.status,
    assignedTo: incident.assigned_to,
    assignedToName: incident.assigned_to_name,
    resolvedAt: incident.resolved_at,
    resolvedBy: incident.resolved_by,
    resolvedByName: incident.resolved_by_name,
    resolutionNote: incident.resolution_note,
    createdAt: incident.created_at,
    updatedAt: incident.updated_at,
  };
}

export async function getIncidents(
  options?: {
    reporterId?: string;
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    type?: IncidentType;
    page?: number;
    limit?: number;
  }
): Promise<{ incidents: Incident[]; total: number }> {
  const { reporterId, status, severity, type, page = 1, limit = 20 } = options || {};
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (reporterId) {
    conditions.push(`i.reporter_id = $${paramCount++}`);
    values.push(reporterId);
  }
  if (status) {
    conditions.push(`i.status = $${paramCount++}`);
    values.push(status);
  }
  if (severity) {
    conditions.push(`i.severity = $${paramCount++}`);
    values.push(severity);
  }
  if (type) {
    conditions.push(`i.incident_type = $${paramCount++}`);
    values.push(type);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM incidents i ${whereClause}`,
    values
  );
  const total = parseInt(countResult?.count || '0');

  const incidents = await queryMany<{ id: string }>(
    `SELECT i.id FROM incidents i ${whereClause}
     ORDER BY 
       CASE i.severity 
         WHEN 'urgent' THEN 1 
         WHEN 'high' THEN 2 
         WHEN 'medium' THEN 3 
         WHEN 'low' THEN 4 
       END,
       i.created_at DESC
     LIMIT $${paramCount++} OFFSET $${paramCount++}`,
    [...values, limit, offset]
  );

  const incidentDetails = await Promise.all(
    incidents.map(i => getIncidentById(i.id))
  );

  return {
    incidents: incidentDetails.filter((i): i is Incident => i !== null),
    total,
  };
}

export async function resolveIncident(
  incidentId: string,
  userId: string,
  resolutionNote: string
): Promise<Incident | null> {
  const incident = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM incidents WHERE id = $1',
    [incidentId]
  );

  if (!incident) return null;

  await queryOne(
    `UPDATE incidents 
     SET status = 'resolved', resolved_at = NOW(), resolved_by = $1, resolution_note = $2, updated_at = NOW()
     WHERE id = $3`,
    [userId, resolutionNote, incidentId]
  );

  // Update related alert
  await queryOne(
    `UPDATE alerts SET status = 'resolved', resolved_at = NOW() 
     WHERE related_entity_type = 'incident' AND related_entity_id = $1`,
    [incidentId]
  );

  return getIncidentById(incidentId);
}
