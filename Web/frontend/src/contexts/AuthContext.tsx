// US-W001: Auth context — JWT-based (replaces mock from Refs)
// AC-1: login → redirect by role; AC-3: silent refresh; AC-5: logout
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { authApi } from '@/api/auth'
import { TOKEN_KEYS, clearTokens, getAccessToken } from '@/api/client'
import type { User, LoginRequest } from '@/types'

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const IDLE_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (payload: LoginRequest) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
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

  // US-W001 AC-3: listen for session-expired event (from axios interceptor)
  useEffect(() => {
    const handleExpired = () => {
      setUser(null)
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

  // US-W001 AC-1
  const login = useCallback(async (payload: LoginRequest) => {
    const { user: loggedInUser } = await authApi.login(payload)
    setUser(loggedInUser)
  }, [])

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
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
