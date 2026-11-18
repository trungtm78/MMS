// US-W001: Auth state — JWT-based (replaces mock from Refs)
// AC-1: login → redirect by role; AC-3: silent refresh; AC-5: logout
import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { authApi, type LoginResult, type SignedInSession } from '@/api/auth'
import { TOKEN_KEYS, clearTokens, getAccessToken, storeTokens, type SessionEndReason } from '@/api/client'
import { AuthContext, type AuthNotice } from '@/contexts/AuthContext'
import i18n from '@/i18n'
import { errorCodeText } from '@/lib/api-error'
import type { User, LoginRequest } from '@/types'

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const IDLE_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const

// Why the sign-in screen is shown again after the server ended a session (api/client.ts):
// errors.auth.session.<reason>, a plain "session ended" for any other reason
function sessionEndText(reason: unknown): string {
  return (typeof reason === 'string' ? errorCodeText('auth.session', reason) : null) ?? i18n.t('errors.auth.session.session_ended')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notice, setNotice] = useState<AuthNotice | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore session on mount if access token exists
  useEffect(() => {
    const token = getAccessToken()
    if (token) {
      authApi
        .me()
        .then((u) => setUser(u))
        .catch(() => {
          clearTokens()
        })
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [])

  // US-W001 AC-3: the refresh token was refused (api/client.ts): sign out and say why
  useEffect(() => {
    const handleExpired = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: SessionEndReason } | null>).detail?.reason
      setUser(null)
      setNotice({ tone: 'info', message: sessionEndText(reason) })
    }
    window.addEventListener('auth:session-expired', handleExpired)
    return () => window.removeEventListener('auth:session-expired', handleExpired)
  }, [])

  // Persist user for fast re-hydration across tabs
  useEffect(() => {
    if (user) {
      localStorage.setItem(TOKEN_KEYS.user, JSON.stringify(user))
    } else {
      localStorage.removeItem(TOKEN_KEYS.user)
    }
  }, [user])

  const clearNotice = useCallback(() => setNotice(null), [])

  const completeSignIn = useCallback((session: SignedInSession, rememberMe: boolean) => {
    storeTokens(session.tokens.accessToken, session.tokens.refreshToken, rememberMe)
    setNotice(null)
    setUser(session.user)
  }, [])

  const endSession = useCallback((next: AuthNotice) => {
    clearTokens()
    setUser(null)
    setNotice(next)
  }, [])

  // US-W001 AC-1
  const login = useCallback(
    async (payload: LoginRequest): Promise<LoginResult> => {
      const result = await authApi.login(payload)
      if (result.status === 'SUCCESS') completeSignIn(result.session, payload.rememberMe ?? false)
      return result
    },
    [completeSignIn],
  )

  // US-W001 AC-5
  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  // NĐ 85/2016: idle auto-logout — reset timer on any user interaction
  useEffect(() => {
    if (!user) return

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        logout()
      }, DEFAULT_IDLE_TIMEOUT_MS)
    }

    resetTimer()
    IDLE_EVENTS.forEach((e) => window.addEventListener(e, resetTimer))
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      IDLE_EVENTS.forEach((e) => window.removeEventListener(e, resetTimer))
    }
  }, [user, logout])

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, notice, clearNotice, login, completeSignIn, endSession, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}
