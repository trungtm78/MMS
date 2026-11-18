// Live positions — Web/backend/src/gps. GET /gps/live answers the latest position of every member
// in the caller's scope; after each POST /gps/record the socket pushes that member's row as
// gps:update (SocketContext onGpsUpdate) to the GPS rooms the gateway joined on connect.
import client from './client'

/** gps.service.ts GpsLiveDto as JSON */
export interface GpsLiveRow {
  /** militia_profiles.id */
  id: string
  /** Alias of id */
  militiaId: string
  /** null when the profile has no account */
  userId: string | null
  name: string
  /** Alias of name */
  fullName: string
  unitCode: string
  lat: number
  lng: number
  accuracy: number | null
  /** ISO timestamp of the latest position */
  lastUpdate: string
  /** Alias of lastUpdate */
  lastSeenAt: string
  /** online while the last position is recent, offline after GPS_OFFLINE_AFTER_MINUTES (derived by the server) */
  status: string
}

export const gpsKeys = {
  live: ['gps-live'] as const,
}

export const gpsApi = {
  // GET /gps/live
  live: async (): Promise<GpsLiveRow[]> => (await client.get<GpsLiveRow[]>('/gps/live')).data,
}

/** The live rows with `row` in place of that member's previous row, or appended for a new member */
export function mergeGpsLiveRow(rows: readonly GpsLiveRow[] | undefined, row: GpsLiveRow): GpsLiveRow[] {
  if (!rows) return [row]
  const index = rows.findIndex((current) => current.id === row.id)
  if (index === -1) return [...rows, row]
  return rows.map((current, i) => (i === index ? row : current))
}
