// US-W001: API client with JWT access token + silent refresh
// BR-AUTH-01: access token 15m, refresh token 7d
import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1/mms_core'

export const TOKEN_KEYS = {
  access: 'mms_access_token',
  refresh: 'mms_refresh_token',
  user: 'mms_user',
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
  localStorage.removeItem(TOKEN_KEYS.user)
}

let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
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

// Response interceptor: silent refresh on 401
// US-W001 AC-3: token hết hạn → silent refresh → thao tác tiếp tục
client.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue request until refresh completes
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(client(originalRequest))
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshToken = getRefreshToken()
        if (!refreshToken) throw new Error('No refresh token')

        const response = await axios.post(
          `${BASE_URL}/auth/refresh`,
          { refreshToken },
          { withCredentials: false },
        )

        const { accessToken, refreshToken: newRefresh } = response.data
        storeTokens(accessToken, newRefresh, !!newRefresh)
        onRefreshed(accessToken)
        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return client(originalRequest)
      } catch {
        // F9: clear queued subscribers so they don't hang after a failed refresh
        refreshSubscribers = []
        clearTokens()
        // Dispatch event so AuthContext can redirect to login
        window.dispatchEvent(new CustomEvent('auth:session-expired'))
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

export default client
