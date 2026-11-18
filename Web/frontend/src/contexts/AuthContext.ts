// US-W001: Auth context — JWT-based. The state is provided by AuthProvider (contexts/AuthProvider.tsx);
// screens read it with useAuth.
import { createContext, useContext } from 'react'
import type { LoginResult, SignedInSession } from '@/api/auth'
import type { User, LoginRequest } from '@/types'

/** A message for the sign-in screen */
export interface AuthNotice {
  tone: 'info' | 'success'
  message: string
}

export interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  /** Shown on the sign-in screen: why the previous session ended */
  notice: AuthNotice | null
  clearNotice: () => void
  /** Signs in on SUCCESS; otherwise returns the second-factor challenge to complete */
  login: (payload: LoginRequest) => Promise<LoginResult>
  /** Stores the tokens of a finished sign-in (after the second factor) and signs the user in */
  completeSignIn: (session: SignedInSession, rememberMe: boolean) => void
  /**
   * Forgets a session the server has already ended (e.g. after a password change) without
   * calling POST /auth/logout, and leaves a notice for the sign-in screen
   */
  endSession: (notice: AuthNotice) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
