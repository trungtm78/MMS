import { isTenancyEnforced } from '../database/tenancy/tenancy-mode';

// Socket.IO rooms are namespaced by tenant: unit codes and conversation ids repeat across
// tenants, and a room name shared by two tenants would deliver one tenant's events to the
// other. The legacy single-tenant mode uses one fixed namespace. In enforced mode a missing
// tenant must never fall back to it (a socket of the legacy namespace would hear tenant
// events): it maps to a namespace nobody joins.
const ns = (tid: string | undefined): string =>
  `t:${tid ?? (isTenancyEnforced() ? 'none' : 'legacy')}`;

export const rooms = {
  user: (tid: string | undefined, userId: string) =>
    `${ns(tid)}:user:${userId}`,
  unit: (tid: string | undefined, unitCode: string) =>
    `${ns(tid)}:unit:${unitCode}`,
  gpsWard: (tid: string | undefined) => `${ns(tid)}:gps:ward`,
  gpsUnit: (tid: string | undefined, unitCode: string) =>
    `${ns(tid)}:gps:unit:${unitCode}`,
  conversation: (tid: string | undefined, id: string) =>
    `${ns(tid)}:conv_${id}`,
  tenant: (tid: string | undefined) => ns(tid),
} as const;
