// Values of the incidents table (migration 007 CHECK constraints) and the lifecycle of an alert
export const INCIDENT_TYPES = [
  'sos',
  'security',
  'fire',
  'medical',
  'accident',
  'utility',
  'other',
] as const;

export const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'urgent'] as const;

export const INCIDENT_STATUSES = [
  'open',
  'acknowledged',
  'responding',
  'resolved',
  'closed',
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const SOS_ACTIVE_STATUSES: readonly IncidentStatus[] = [
  'open',
  'acknowledged',
  'responding',
];
export const SOS_CLOSED_STATUSES: readonly IncidentStatus[] = [
  'resolved',
  'closed',
];

/**
 * Where a responder may move an alert: forward through acknowledged and responding, resolved
 * or closed from any open state, a resolved alert taken up again or closed, and a closed
 * alert never reopened.
 */
export const SOS_STATUS_TRANSITIONS: Readonly<
  Record<IncidentStatus, readonly IncidentStatus[]>
> = {
  open: ['acknowledged', 'responding', 'resolved', 'closed'],
  acknowledged: ['responding', 'resolved', 'closed'],
  responding: ['resolved', 'closed'],
  resolved: ['responding', 'closed'],
  closed: [],
};

export function canMoveIncident(from: string, to: string): boolean {
  const allowed: readonly string[] =
    SOS_STATUS_TRANSITIONS[from as IncidentStatus] ?? [];
  return allowed.includes(to);
}
