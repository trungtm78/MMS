// US-W001: Authentication API
import client, { storeTokens, clearTokens } from './client'
import type { LoginRequest, LoginResponse, User } from '@/types'

export const authApi = {
  // US-W001 AC-1: Login with username/password
  login: async (payload: LoginRequest): Promise<LoginResponse> => {
    const response = await client.post<LoginResponse>('/auth/login', payload)
    const { tokens } = response.data
    storeTokens(tokens.accessToken, tokens.refreshToken, payload.rememberMe)
    return response.data
  },

  // US-W001 AC-6: Logout — invalidate token server-side
  logout: async (): Promise<void> => {
    try {
      await client.post('/auth/logout')
    } finally {
      clearTokens()
    }
  },

  // Get current authenticated user profile
  me: async (): Promise<User> => {
    const response = await client.get<User>('/auth/me')
    return response.data
  },
}
