import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import axios, { AxiosError, AxiosHeaders } from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import client, { TOKEN_KEYS, refreshAccessToken } from './client'

// Answers every request from a function instead of the network
type Answer = { status: number; data: unknown }

function respondWith(handler: (config: InternalAxiosRequestConfig) => Answer | Promise<Answer>) {
  client.defaults.adapter = async (config) => {
    const { status, data } = await handler(config)
    const response = { status, data, statusText: '', headers: new AxiosHeaders(), config }
    if (status >= 400) {
      throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, response)
    }
    return response
  }
}

// HttpExceptionFilter body of a 401
const unauthorized = (message: string, extra: Record<string, unknown> = {}) => ({
  status: 401,
  data: { code: 'E004', message, statusCode: 401, ...extra },
})

const FRESH_TOKENS = { accessToken: 'fresh-access', refreshToken: 'fresh-refresh', expiresIn: 900 }

// POST /auth/refresh refusing the refresh token (auth.service.ts refreshTokens)
function refusal(status: number, message: string) {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, {
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
    data: { code: 'E004', message, statusCode: status },
  })
}

function send(method: 'get' | 'post', url: string) {
  return method === 'get' ? client.get(url) : client.post(url, {})
}

describe('api client 401 handling', () => {
  const sessionExpired = vi.fn()

  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    localStorage.setItem(TOKEN_KEYS.refresh, 'remembered-refresh-token')
    window.addEventListener('auth:session-expired', sessionExpired)
  })

  afterEach(() => {
    window.removeEventListener('auth:session-expired', sessionExpired)
    vi.restoreAllMocks()
    sessionExpired.mockClear()
  })

  function expectSessionUntouched(refresh: MockInstance<typeof axios.post>) {
    expect(refresh).not.toHaveBeenCalled()
    expect(sessionExpired).not.toHaveBeenCalled()
    expect(localStorage.getItem(TOKEN_KEYS.refresh)).toBe('remembered-refresh-token')
  }

  // Public routes carry a password or an mfaToken, never a bearer token: a 401 is always the
  // caller's to explain, whatever its message
  describe('public sign-in routes never refresh', () => {
    it.each([
      ['/auth/login', 'invalid_credentials'],
      ['/auth/refresh', 'invalid_refresh_token'],
      ['/auth/mfa/login', 'invalid_code'],
      ['/auth/mfa/verify', 'invalid_code'],
      ['/auth/mfa/verify', 'mfa_token_invalid'],
      ['/auth/mfa/verify', 'invalid_token'],
      ['/auth/mfa/enroll', 'mfa_token_invalid'],
      ['/auth/mfa/enroll/confirm', 'invalid_code'],
      ['/auth/mfa/enroll/confirm', 'invalid_token'],
    ])('passes a 401 from %s (%s) to the caller without touching the session', async (url, message) => {
      const refresh = vi.spyOn(axios, 'post')
      respondWith(() => unauthorized(message))

      await expect(client.post(url, {})).rejects.toMatchObject({ response: { status: 401, data: { message } } })

      expectSessionUntouched(refresh)
    })
  })

  // Bearer routes of the security settings (mfa.controller.ts, JwtAuthGuard)
  describe('signed-in second-factor routes', () => {
    const BEARER_ROUTES: ['get' | 'post', string][] = [
      ['get', '/auth/mfa/status'],
      ['post', '/auth/mfa/setup'],
      ['post', '/auth/mfa/confirm'],
      ['post', '/auth/mfa/recovery-codes/regenerate'],
      ['post', '/auth/mfa/disable'],
    ]

    // JwtAuthGuard answers invalid_token for an expired token and missing_token without one
    it.each(BEARER_ROUTES.flatMap(([method, url]) => [
      [method, url, 'invalid_token'],
      [method, url, 'missing_token'],
    ]))('%s %s refreshes the access token and retries after 401 %s', async (method, url, message) => {
      const refresh = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: FRESH_TOKENS })
      respondWith((config) =>
        config.headers.Authorization === 'Bearer fresh-access' ? { status: 200, data: { ok: true } } : unauthorized(message),
      )

      const response = await send(method as 'get' | 'post', url)

      expect(response.data).toEqual({ ok: true })
      expect(refresh).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        { refreshToken: 'remembered-refresh-token' },
        expect.anything(),
      )
      expect(sessionStorage.getItem(TOKEN_KEYS.access)).toBe('fresh-access')
      expect(sessionExpired).not.toHaveBeenCalled()
    })

    // A wrong code or an expired set-up challenge is not an expired session
    it.each([
      ['post', '/auth/mfa/disable', 'invalid_code'],
      ['post', '/auth/mfa/recovery-codes/regenerate', 'invalid_code'],
      ['post', '/auth/mfa/confirm', 'invalid_code'],
      ['post', '/auth/mfa/confirm', 'mfa_token_invalid'],
    ])('%s %s passes 401 %s to the caller without refreshing', async (method, url, message) => {
      const refresh = vi.spyOn(axios, 'post')
      respondWith(() => unauthorized(message, { details: { attemptsRemaining: 4 } }))

      await expect(send(method as 'get' | 'post', url)).rejects.toMatchObject({
        response: { status: 401, data: { message, details: { attemptsRemaining: 4 } } },
      })

      expectSessionUntouched(refresh)
    })

    it('passes a wrong code to the caller after a refresh without refreshing again', async () => {
      const refresh = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: FRESH_TOKENS })
      respondWith((config) =>
        config.headers.Authorization === 'Bearer fresh-access' ? unauthorized('invalid_code') : unauthorized('invalid_token'),
      )

      await expect(client.post('/auth/mfa/disable', { method: 'totp', code: '000000' })).rejects.toMatchObject({
        response: { status: 401, data: { message: 'invalid_code' } },
      })

      expect(refresh).toHaveBeenCalledTimes(1)
      expect(sessionExpired).not.toHaveBeenCalled()
    })
  })

  // Used by callers outside axios, e.g. the chat socket after the gateway closes an expired session
  describe('refreshAccessToken', () => {
    it('stores the new tokens and shares one refresh between concurrent callers', async () => {
      const refresh = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: FRESH_TOKENS })

      const tokens = await Promise.all([refreshAccessToken(), refreshAccessToken()])

      expect(tokens).toEqual(['fresh-access', 'fresh-access'])
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(refresh).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        { refreshToken: 'remembered-refresh-token' },
        expect.anything(),
      )
      expect(sessionStorage.getItem(TOKEN_KEYS.access)).toBe('fresh-access')
      expect(sessionExpired).not.toHaveBeenCalled()
    })

    it('ends the session when the refresh token is refused', async () => {
      vi.spyOn(axios, 'post').mockRejectedValueOnce(refusal(401, 'refresh_token_revoked'))

      await expect(refreshAccessToken()).rejects.toBeTruthy()

      expect(sessionExpired).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem(TOKEN_KEYS.refresh)).toBeNull()
    })

    it('shares the refresh an expired request already started', async () => {
      let answer: (value: unknown) => void = () => undefined
      const refresh = vi.spyOn(axios, 'post').mockReturnValueOnce(new Promise((resolve) => { answer = resolve }))
      respondWith((config) =>
        config.headers.Authorization === 'Bearer fresh-access' ? { status: 200, data: ['task'] } : unauthorized('invalid_token'),
      )

      const request = client.get('/tasks')
      await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
      const socketRefresh = refreshAccessToken()
      answer({ data: FRESH_TOKENS })

      await expect(socketRefresh).resolves.toBe('fresh-access')
      await expect(request).resolves.toMatchObject({ data: ['task'] })
      expect(refresh).toHaveBeenCalledTimes(1)
    })
  })

  // Access tokens can be revoked before they expire (jwt-auth.guard.ts:46 session_revoked);
  // refresh tokens rotate, and presenting a rotated one again ends every session
  describe('revoked sessions', () => {
    beforeEach(() => {
      sessionStorage.setItem(TOKEN_KEYS.access, 'old-access')
    })

    it.each(['invalid_token', 'session_revoked'])('refreshes once and retries a request refused with 401 %s', async (message) => {
      const refresh = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: FRESH_TOKENS })
      respondWith((config) =>
        config.headers.Authorization === 'Bearer fresh-access' ? { status: 200, data: ['task'] } : unauthorized(message),
      )

      await expect(client.get('/tasks')).resolves.toMatchObject({ data: ['task'] })

      expect(refresh).toHaveBeenCalledTimes(1)
      expect(sessionExpired).not.toHaveBeenCalled()
    })

    it('shares one refresh between requests refused at the same time', async () => {
      let answer: (value: unknown) => void = () => undefined
      const refresh = vi.spyOn(axios, 'post').mockReturnValueOnce(new Promise((resolve) => { answer = resolve }))
      let refused = 0
      respondWith((config) => {
        if (config.headers.Authorization === 'Bearer fresh-access') return { status: 200, data: config.url }
        refused += 1
        return unauthorized('session_revoked')
      })

      const requests = ['/a', '/b', '/c'].map((url) => client.get(url))
      await vi.waitFor(() => expect(refused).toBe(3))
      await new Promise((resolve) => setTimeout(resolve, 0))
      answer({ data: FRESH_TOKENS })

      await expect(Promise.all(requests)).resolves.toMatchObject([{ data: '/a' }, { data: '/b' }, { data: '/c' }])
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    // A second refresh with the same, already rotated, token would be refresh_token_reused
    it('retries a refusal that arrives after the refresh with the new token instead of refreshing again', async () => {
      const refresh = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: FRESH_TOKENS })
      let releaseLateAnswer: () => void = () => undefined
      const lateAnswer = new Promise<void>((resolve) => { releaseLateAnswer = resolve })
      respondWith(async (config) => {
        if (config.headers.Authorization === 'Bearer fresh-access') return { status: 200, data: config.url }
        if (config.url === '/late') await lateAnswer
        return unauthorized('session_revoked')
      })

      const early = client.get('/early')
      const late = client.get('/late')
      await expect(early).resolves.toMatchObject({ data: '/early' })
      releaseLateAnswer()

      await expect(late).resolves.toMatchObject({ data: '/late' })
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(sessionExpired).not.toHaveBeenCalled()
    })

    it.each([
      [401, 'refresh_token_reused', 'session_ended'],
      [401, 'refresh_token_revoked', 'session_ended'],
      [401, 'invalid_refresh_token', 'session_ended'],
      [401, 'mfa_reauthentication_required', 'mfa_reauthentication_required'],
      [403, 'account_disabled', 'session_ended'],
      [403, 'no_role_assigned', 'session_ended'],
    ])('signs out without retrying when the refresh is refused with %i %s', async (status, message, reason) => {
      const refresh = vi.spyOn(axios, 'post').mockRejectedValueOnce(refusal(status, message))
      respondWith(() => unauthorized('session_revoked'))

      await expect(client.get('/tasks')).rejects.toMatchObject({ response: { status: 401 } })

      expect(refresh).toHaveBeenCalledTimes(1)
      expect(sessionExpired).toHaveBeenCalledTimes(1)
      expect((sessionExpired.mock.calls[0][0] as CustomEvent).detail).toEqual({ reason })
      expect(sessionStorage.getItem(TOKEN_KEYS.access)).toBeNull()
      expect(localStorage.getItem(TOKEN_KEYS.refresh)).toBeNull()
    })

    it('keeps the session when the refresh cannot reach the server', async () => {
      vi.spyOn(axios, 'post').mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
      respondWith(() => unauthorized('invalid_token'))

      await expect(client.get('/tasks')).rejects.toMatchObject({ response: { status: 401 } })

      expect(sessionExpired).not.toHaveBeenCalled()
      expect(localStorage.getItem(TOKEN_KEYS.refresh)).toBe('remembered-refresh-token')
    })
  })

  it('still refreshes the access token and retries other requests after a 401', async () => {
    const refresh = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: FRESH_TOKENS })
    respondWith((config) =>
      config.headers.Authorization === 'Bearer fresh-access'
        ? { status: 200, data: ['task'] }
        : { status: 401, data: { message: 'Unauthorized' } },
    )

    const response = await client.get('/tasks')

    expect(response.data).toEqual(['task'])
    expect(refresh).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), { refreshToken: 'remembered-refresh-token' }, expect.anything())
    expect(sessionExpired).not.toHaveBeenCalled()
  })
})
