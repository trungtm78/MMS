// US-W001: API client with JWT access token + silent refresh
// BR-AUTH-01: access token 15m, refresh token 7d
import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { REFRESH_REQUEST_TIMEOUT_MS, withRefreshLock } from './refreshLock'

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1/mms_core'

export const TOKEN_KEYS = {
  access: 'mms_access_token',
  refresh: 'mms_refresh_token',
  user: 'mms_user',
  // The access token issued with the current refresh token, left by the tab that refreshed for
  // the other tabs (see exchangeRefreshToken). No more exposed than the refresh token beside it.
  handoff: 'mms_refresh_handoff',
} as const

export function getAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEYS.access)
}

export function getRefreshToken(): string | null {
  // Refresh token stored in localStorage (body-based strategy; not httpOnly cookie)
  return localStorage.getItem(TOKEN_KEYS.refresh)
}

export function storeTokens(access: string, refresh: string, rememberMe = false): void {
  sessionStorage.setItem(TOKEN_KEYS.access, access)
  if (rememberMe) {
    localStorage.setItem(TOKEN_KEYS.refresh, refresh)
  }
}

export function clearTokens(): void {
  sessionStorage.removeItem(TOKEN_KEYS.access)
  localStorage.removeItem(TOKEN_KEYS.refresh)
  localStorage.removeItem(TOKEN_KEYS.handoff)
  localStorage.removeItem(TOKEN_KEYS.user)
}

/** Why the session ended, carried by the auth:session-expired event (AuthContext explains it on the sign-in screen) */
export type SessionEndReason = 'session_ended' | 'mfa_reauthentication_required'

class MissingRefreshTokenError extends Error {}

// The refresh token was refused (refresh_token_reused/revoked, invalid_refresh_token,
// mfa_reauthentication_required, account_disabled, no_role_assigned — auth.service.ts
// refreshTokens): the session is over. A network failure, a server error or throttling says
// nothing about the session, so the tokens are kept for the next request to try again.
function refreshWasRefused(err: unknown): boolean {
  if (err instanceof MissingRefreshTokenError) return true
  const status = (err as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 429
}

/**
 * Ends the session in this browser: clears the tokens and tells AuthContext why through the
 * auth:session-expired event, which signs out with the matching notice. Used for a refused
 * refresh, a socket handshake without a token and a revoked current device session.
 */
export function signOutSession(reason: SessionEndReason = 'session_ended'): void {
  clearTokens()
  window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { reason } }))
}

function endSession(err: unknown): void {
  const code = (err as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message
  signOutSession(code === 'mfa_reauthentication_required' ? 'mfa_reauthentication_required' : 'session_ended')
}

// One refresh revokes the session of the token it presents (auth.service.ts refreshTokens), and
// every tab shares that session, so the access token the tab that refreshed obtained is the only
// valid one: the other tabs adopt it instead of rotating the token again.
type Handoff = { refreshToken: string; accessToken: string; expiresAt: number }

// An access token with less life left than this is not worth handing over
const HANDOFF_MIN_LIFETIME_MS = 30_000

function readHandoff(): Handoff | null {
  const raw = localStorage.getItem(TOKEN_KEYS.handoff)
  if (raw === null) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    // Unreadable: refresh as if no tab had left anything
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { refreshToken, accessToken, expiresAt } = value as Record<string, unknown>
  return typeof refreshToken === 'string' && typeof accessToken === 'string' && typeof expiresAt === 'number'
    ? { refreshToken, accessToken, expiresAt }
    : null
}

// Runs while this tab holds the cross-tab refresh lock (api/refreshLock.ts)
async function exchangeRefreshToken(refusedAccessToken: string | null): Promise<string> {
  // Read only now: another tab may have rotated the token while this one waited for the lock,
  // and the token read before that has already been presented
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new MissingRefreshTokenError('No refresh token')

  const handoff = readHandoff()
  if (
    handoff &&
    handoff.refreshToken === refreshToken &&
    handoff.accessToken !== refusedAccessToken &&
    handoff.expiresAt - HANDOFF_MIN_LIFETIME_MS > Date.now()
  ) {
    sessionStorage.setItem(TOKEN_KEYS.access, handoff.accessToken)
    return handoff.accessToken
  }

  const response = await axios.post(
    `${BASE_URL}/auth/refresh`,
    { refreshToken },
    { withCredentials: false, timeout: REFRESH_REQUEST_TIMEOUT_MS },
  )
  const { accessToken, refreshToken: newRefresh, expiresIn } = response.data as {
    accessToken: string
    refreshToken: string
    expiresIn?: unknown
  }
  // Keep the new refresh token only while one is still kept: another tab may have signed out
  // during the request
  const remembered = localStorage.getItem(TOKEN_KEYS.refresh) !== null
  storeTokens(accessToken, newRefresh, remembered)
  if (remembered && typeof expiresIn === 'number') {
    const handoffValue: Handoff = { refreshToken: newRefresh, accessToken, expiresAt: Date.now() + expiresIn * 1000 }
    localStorage.setItem(TOKEN_KEYS.handoff, JSON.stringify(handoffValue))
  }
  return accessToken
}

// Single-flight within this tab; withRefreshLock serialises the tabs
let refreshInFlight: Promise<string> | null = null

async function requestNewAccessToken(): Promise<string> {
  // The access token this tab holds now is the one that was refused (or none)
  const refusedAccessToken = getAccessToken()
  return withRefreshLock(async () => {
    try {
      return await exchangeRefreshToken(refusedAccessToken)
    } catch (err) {
      // No retry: a refused refresh token will not be accepted a second time. Cleared before
      // the lock is released, so no waiting tab presents it again.
      if (refreshWasRefused(err)) endSession(err)
      throw err
    }
  })
}

/**
 * Exchanges the refresh token for a new access token. Every caller that needs one at the same
 * time — expired API requests, the chat socket closed by the gateway — shares a single request,
 * and the tabs of the browser take turns, so no refresh token is ever presented twice.
 * A refused refresh clears the tokens and ends the session.
 */
export function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = requestNewAccessToken().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

// Request interceptor: attach access token
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Public routes: they carry a password, a refresh token or an mfaToken — never a bearer token —
// so a 401 is wrong credentials or a closed challenge and always belongs to the caller
const PUBLIC_AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/mfa/login',
  '/auth/mfa/verify',
  '/auth/mfa/enroll',
  '/auth/mfa/enroll/confirm',
]

// Signed-in second-factor routes (/auth/mfa/status, setup, confirm, recovery-codes/regenerate,
// disable) refresh like any bearer route, except when the 401 is about the code itself: a wrong
// code or an expired set-up challenge. An expired session answers invalid_token / missing_token.
const MFA_ROUTE_PREFIX = '/auth/mfa/'
const MFA_CODE_REJECTIONS: ReadonlySet<string> = new Set(['invalid_code', 'mfa_token_invalid'])

function pathOf(url: string): string {
  return url.split('?')[0]
}

function shouldRefreshOn401(url: string | undefined, body: unknown): boolean {
  if (!url) return true
  const path = pathOf(url)
  if (PUBLIC_AUTH_ENDPOINTS.some((endpoint) => path === endpoint || path.endsWith(endpoint))) return false
  if (path.includes(MFA_ROUTE_PREFIX)) {
    const message = typeof body === 'object' && body !== null ? (body as { message?: unknown }).message : undefined
    if (typeof message === 'string' && MFA_CODE_REJECTIONS.has(message)) return false
  }
  return true
}

// Response interceptor: silent refresh on 401
// US-W001 AC-3: token hết hạn → silent refresh → thao tác tiếp tục
client.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      shouldRefreshOn401(originalRequest.url, error.response?.data)
    ) {
      originalRequest._retry = true

      // Refused with an access token that a refresh (in this tab or another) has replaced since
      // the request left: retry with the current one. Refreshing again would present the rotated
      // refresh token a second time, which the server treats as theft (refresh_token_reused).
      const currentToken = getAccessToken()
      const sentAuthorization = originalRequest.headers?.Authorization
      if (currentToken && sentAuthorization !== `Bearer ${currentToken}`) {
        originalRequest.headers.Authorization = `Bearer ${currentToken}`
        return client(originalRequest)
      }

      let accessToken: string
      try {
        accessToken = await refreshAccessToken()
      } catch {
        return Promise.reject(error)
      }
      originalRequest.headers.Authorization = `Bearer ${accessToken}`
      return client(originalRequest)
    }

    return Promise.reject(error)
  },
)

export default client
