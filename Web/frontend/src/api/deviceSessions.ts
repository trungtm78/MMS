// Devices signed in to the caller's account — Web/backend/src/devices/device-sessions.controller.ts
// and device-sessions.service.ts. Every signed-in user manages their own sessions; access tokens
// name their session, so a revoked session is signed out at once.
import client from './client'

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown'

/** One live session (DeviceSessionView); timestamps arrive as ISO strings */
export interface DeviceSession {
  id: string
  userId: string
  userName: string
  ip: string | null
  userAgent: string | null
  deviceType: DeviceType
  /** Readable client name from the User-Agent, e.g. "Chrome – Windows" */
  deviceName: string
  browser: string | null
  os: string | null
  /** RFC 8176 methods the session was signed in with */
  amr: string[]
  mfa: boolean
  createdAt: string
  /** The latest token refresh, which replaces the session row */
  lastActiveAt: string
  expiresAt: string
  /** The session of the token making the request */
  current: boolean
}

/** GET /devices/sessions (DeviceSessionPage), the current session first */
export interface DeviceSessionPage {
  data: DeviceSession[]
  total: number
  page: number
  limit: number
}

export const DEVICE_SESSIONS_PAGE_SIZE = 20

export const deviceSessionKeys = {
  all: ['device-sessions'] as const,
  page: (page: number) => ['device-sessions', page] as const,
}

export const deviceSessionsApi = {
  list: async (page: number): Promise<DeviceSessionPage> => {
    const response = await client.get<DeviceSessionPage>('/devices/sessions', {
      params: { page, limit: DEVICE_SESSIONS_PAGE_SIZE },
    })
    return response.data
  },

  // 204; 404 session_not_found when the session is gone or belongs to another account
  revoke: async (id: string): Promise<void> => {
    await client.delete(`/devices/sessions/${id}`)
  },

  // Signs out every other device, keeping the session making the request
  revokeOthers: async (): Promise<{ revoked: number }> => {
    const response = await client.post<{ revoked: number }>('/devices/sessions/revoke-others')
    return response.data
  },
}
