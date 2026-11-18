// Keeps a Socket.IO connection signed in (Web/backend/src/notifications/notifications.gateway.ts).
// The gateway authenticates every handshake and refuses it through connect_error with
// missing_token, invalid_token, session_revoked or authentication_unavailable. A socket whose
// session ends while connected receives session_expired {reason} and is then closed by the
// server ('io server disconnect'). Expired or revoked tokens are refreshed once through the
// shared single-flight refresh and the socket reconnects with the new token; a refused refresh
// or a handshake without a token signs out; an authentication outage is retried with backoff.
import type { Socket } from 'socket.io-client'
import { getAccessToken, refreshAccessToken, signOutSession } from '@/api/client'

/** A socket.io-client socket whose session signals are handled */
export type SessionSocket = Socket

export interface SocketSessionOptions {
  /** The session could not be kept and the user is signed out */
  onSignedOut?: () => void
  /** Delays before retrying a handshake the server could not authenticate, in ms; the last one repeats */
  retryDelays?: readonly number[]
}

export const HANDSHAKE_RETRY_DELAYS: readonly number[] = [1_000, 2_000, 5_000, 10_000, 30_000]

const SERVER_DISCONNECT = 'io server disconnect'
// Refusals a refreshed access token can cure
const TOKEN_REFUSALS: ReadonlySet<string> = new Set(['invalid_token', 'session_revoked'])

/** Starts handling the session signals of `socket`; returns the function that stops it. */
export function keepSocketSession(
  socket: SessionSocket,
  { onSignedOut, retryDelays = HANDSHAKE_RETRY_DELAYS }: SocketSessionOptions = {},
): () => void {
  let disposed = false
  let refreshing: Promise<void> | null = null
  // A token refreshed while the socket was still open waits for the server to close it
  let freshTokenWaiting = false
  // The next handshake uses a token refreshed after a refusal: refusing it again ends the session
  let refreshedForRefusal = false
  let retryAttempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  // Read the token on every handshake, so a reconnect presents the refreshed one
  socket.auth = (cb) => cb({ token: getAccessToken() })

  const connectNow = () => {
    if (!disposed && !socket.connected) socket.connect()
  }

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  }

  const scheduleRetry = (action: () => void) => {
    if (retryTimer) return
    const delay = retryDelays[Math.min(retryAttempt, retryDelays.length - 1)]
    retryAttempt += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (!disposed) action()
    }, delay)
  }

  const signOut = () => {
    signOutSession('session_ended')
    onSignedOut?.()
  }

  const refreshThenReconnect = (): Promise<void> => {
    if (refreshing) return refreshing
    refreshing = refreshAccessToken()
      .then(
        () => {
          if (disposed) return
          refreshedForRefusal = true
          if (socket.connected) freshTokenWaiting = true
          else socket.connect()
        },
        () => {
          if (disposed) return
          // A refused refresh has already cleared the tokens and ended the session
          if (getAccessToken() === null) {
            onSignedOut?.()
            return
          }
          // Offline, a server error or throttling: the session may still be live
          scheduleRetry(() => void refreshThenReconnect())
        },
      )
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }

  const onConnect = () => {
    retryAttempt = 0
    refreshedForRefusal = false
    freshTokenWaiting = false
    clearRetry()
  }

  const onConnectError = (err: Error) => {
    // An active socket failed at the transport: socket.io-client reconnects by itself
    if (socket.active) return
    if (err.message === 'missing_token') {
      signOut()
      return
    }
    if (TOKEN_REFUSALS.has(err.message)) {
      if (refreshedForRefusal) signOut()
      else void refreshThenReconnect()
      return
    }
    // authentication_unavailable, or a refusal this client does not know: try again later
    scheduleRetry(connectNow)
  }

  const onSessionExpired = () => {
    void refreshThenReconnect()
  }

  const onDisconnect = (reason: string) => {
    if (reason !== SERVER_DISCONNECT) return
    if (freshTokenWaiting) {
      freshTokenWaiting = false
      connectNow()
      return
    }
    // A server close without session_expired (older gateway, or the event was lost)
    void refreshThenReconnect()
  }

  socket.on('connect', onConnect)
  socket.on('connect_error', onConnectError)
  socket.on('session_expired', onSessionExpired)
  socket.on('disconnect', onDisconnect)

  return () => {
    disposed = true
    clearRetry()
    socket.off('connect', onConnect)
    socket.off('connect_error', onConnectError)
    socket.off('session_expired', onSessionExpired)
    socket.off('disconnect', onDisconnect)
  }
}
