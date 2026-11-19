import { isTenancyEnforced } from '../database/tenancy/tenancy-mode';

// Socket.IO rooms are namespaced by tenant: unit codes and conversation ids repeat across
// tenants, and a room name shared by two tenants would deliver one tenant's events to the
// other. The legacy single-tenant mode uses one fixed namespace: every socket joins it
// whatever its token claims (see roomTenantOf in the gateway), so a tenant left in the
// scope of an emitter must not name another one. In enforced mode a missing tenant must
// never fall back to it (a socket of the legacy namespace would hear tenant events): it
// maps to a namespace nobody joins.
const ns = (tid: string | undefined): string =>
  isTenancyEnforced() ? `t:${tid ?? 'none'}` : 't:legacy';

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
