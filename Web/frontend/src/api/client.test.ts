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

  // The refresh token lives in localStorage, shared by every tab; access tokens live in each tab's
  // sessionStorage. Every refresh rotates the token and revokes the session the old one belonged
  // to, and presenting a rotated token again ends every session of the user (refresh_token_reused).
  describe('across browser tabs', () => {
    // Each tab loads its own copy of the module: its own single-flight, its own lease owner
    async function openTab() {
      vi.resetModules()
      return import('./client')
    }

    // FIFO exclusive lock shared by the simulated tabs, as navigator.locks is in a browser
    function installWebLocks() {
      let tail: Promise<unknown> = Promise.resolve()
      const request = vi.fn(<T>(_name: string, callback: () => Promise<T>): Promise<T> => {
        const run = tail.then(() => callback())
        // The next holder waits for this one to finish, whatever the outcome
        tail = run.then(
          () => undefined,
          () => undefined,
        )
        return run
      })
      Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
      return request
    }

    function deferred<T>() {
      let resolve: (value: T) => void = () => undefined
      const promise = new Promise<T>((res) => {
        resolve = res
      })
      return { promise, resolve }
    }

    beforeEach(() => {
      sessionStorage.setItem(TOKEN_KEYS.access, 'old-access')
    })

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'locks')
    })

    describe.each([
      ['with the Web Locks API', true],
      ['without the Web Locks API (plain HTTP)', false],
    ])('%s', (_label, withLocks) => {
      beforeEach(() => {
        if (withLocks) installWebLocks()
      })

      it('sends the refresh token once when two tabs refresh at the same time', async () => {
        const answer = deferred<unknown>()
        const refresh = vi.spyOn(axios, 'post').mockReturnValueOnce(answer.promise)
        const tabA = await openTab()
        const tabB = await openTab()

        const a = tabA.refreshAccessToken()
        const b = tabB.refreshAccessToken()
        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
        answer.resolve({ data: FRESH_TOKENS })

        await expect(Promise.all([a, b])).resolves.toEqual(['fresh-access', 'fresh-access'])
        expect(refresh).toHaveBeenCalledTimes(1)
        expect(refresh).toHaveBeenCalledWith(
          expect.stringContaining('/auth/refresh'),
          { refreshToken: 'remembered-refresh-token' },
          expect.anything(),
        )
        expect(localStorage.getItem(TOKEN_KEYS.refresh)).toBe('fresh-refresh')
        expect(sessionExpired).not.toHaveBeenCalled()
      })

      it('uses the access token another tab already obtained instead of refreshing again', async () => {
        const refresh = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: FRESH_TOKENS })
        const tabA = await openTab()
        const tabB = await openTab()
        await tabA.refreshAccessToken()
        // Tab B still holds the access token of the session tab A's refresh just revoked
        sessionStorage.setItem(TOKEN_KEYS.access, 'old-access')

        await expect(tabB.refreshAccessToken()).resolves.toBe('fresh-access')

        expect(refresh).toHaveBeenCalledTimes(1)
        expect(sessionStorage.getItem(TOKEN_KEYS.access)).toBe('fresh-access')
      })

      it('presents the current refresh token when another tab rotated it while this one waited', async () => {
        const answer = deferred<unknown>()
        const refresh = vi
          .spyOn(axios, 'post')
          .mockReturnValueOnce(answer.promise)
          .mockResolvedValueOnce({ data: { ...FRESH_TOKENS, accessToken: 'newest-access', refreshToken: 'newest-refresh' } })
        const tabA = await openTab()
        const tabB = await openTab()

        const a = tabA.refreshAccessToken()
        const b = tabB.refreshAccessToken()
        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
        // Tab A's answer carries no lifetime, so tab B cannot reuse its access token
        answer.resolve({ data: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' } })

        await expect(a).resolves.toBe('fresh-access')
        await expect(b).resolves.toBe('newest-access')
        expect(refresh).toHaveBeenCalledTimes(2)
        expect(refresh.mock.calls.map((call) => call[1])).toEqual([
          { refreshToken: 'remembered-refresh-token' },
          { refreshToken: 'fresh-refresh' },
        ])
        expect(sessionExpired).not.toHaveBeenCalled()
      })

      it('does not present a refused refresh token again from a waiting tab', async () => {
        const answer = deferred<unknown>()
        const refresh = vi.spyOn(axios, 'post').mockReturnValueOnce(answer.promise)
        const tabA = await openTab()
        const tabB = await openTab()

        const a = tabA.refreshAccessToken()
        const b = tabB.refreshAccessToken()
        const settled = Promise.allSettled([a, b])
        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
        answer.resolve(Promise.reject(refusal(401, 'refresh_token_revoked')))

        const [resultA, resultB] = await settled
        expect(resultA.status).toBe('rejected')
        expect(resultB.status).toBe('rejected')
        expect(refresh).toHaveBeenCalledTimes(1)
        expect(sessionExpired).toHaveBeenCalled()
        expect(localStorage.getItem(TOKEN_KEYS.refresh)).toBeNull()
      })
    })

    it('waits for the refresh another tab holds the lock for and then reads the token again', async () => {
      const locks = installWebLocks()
      const refresh = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: FRESH_TOKENS })
      const otherTab = deferred<void>()
      void locks('mms-auth-refresh', () => otherTab.promise)
      const tab = await openTab()

      const result = tab.refreshAccessToken()
      // The other tab rotates the token (without leaving its access token) and lets go
      localStorage.setItem(TOKEN_KEYS.refresh, 'rotated-by-other-tab')
      otherTab.resolve()

      await expect(result).resolves.toBe('fresh-access')
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(refresh).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        { refreshToken: 'rotated-by-other-tab' },
        expect.anything(),
      )
    })

    it('refreshes when the access token another tab left is the one that was just refused', async () => {
      const refresh = vi
        .spyOn(axios, 'post')
        .mockResolvedValueOnce({ data: FRESH_TOKENS })
        .mockResolvedValueOnce({ data: { ...FRESH_TOKENS, accessToken: 'newest-access', refreshToken: 'newest-refresh' } })
      const tab = await openTab()
      await tab.refreshAccessToken()

      await expect(tab.refreshAccessToken()).resolves.toBe('newest-access')

      expect(refresh).toHaveBeenCalledTimes(2)
      expect(refresh.mock.calls[1][1]).toEqual({ refreshToken: 'fresh-refresh' })
    })

    it('refreshes when the access token another tab left has expired', async () => {
      const refresh = vi
        .spyOn(axios, 'post')
        .mockResolvedValueOnce({ data: { ...FRESH_TOKENS, expiresIn: 0 } })
        .mockResolvedValueOnce({ data: { ...FRESH_TOKENS, accessToken: 'newest-access', refreshToken: 'newest-refresh' } })
      const tabA = await openTab()
      const tabB = await openTab()
      await tabA.refreshAccessToken()
      sessionStorage.setItem(TOKEN_KEYS.access, 'old-access')

      await expect(tabB.refreshAccessToken()).resolves.toBe('newest-access')

      expect(refresh.mock.calls[1][1]).toEqual({ refreshToken: 'fresh-refresh' })
    })

    it('bounds the refresh request so a hung one cannot hold the other tabs back', async () => {
      const refresh = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: FRESH_TOKENS })
      const tab = await openTab()

      await tab.refreshAccessToken()

      expect(refresh).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.anything(),
        expect.objectContaining({ timeout: 30_000 }),
      )
    })

    it('signing out forgets the access token left for the other tabs', async () => {
      vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: FRESH_TOKENS })
      const tab = await openTab()
      await tab.refreshAccessToken()
      expect(localStorage.getItem(TOKEN_KEYS.handoff)).not.toBeNull()

      tab.clearTokens()

      expect(localStorage.getItem(TOKEN_KEYS.handoff)).toBeNull()
      expect(localStorage.getItem(TOKEN_KEYS.refresh)).toBeNull()
    })

    it('neither keeps nor shares new tokens when another tab signed out during the refresh', async () => {
      const answer = deferred<unknown>()
      const refresh = vi.spyOn(axios, 'post').mockReturnValueOnce(answer.promise)
      const tab = await openTab()

      const result = tab.refreshAccessToken()
      await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
      tab.clearTokens()
      answer.resolve({ data: FRESH_TOKENS })

      await expect(result).resolves.toBe('fresh-access')
      expect(localStorage.getItem(TOKEN_KEYS.refresh)).toBeNull()
      expect(localStorage.getItem(TOKEN_KEYS.handoff)).toBeNull()
    })

    // "Remember me" off: no refresh token is kept, so the session ends with its access token
    it('ends the session without a request when no refresh token was kept', async () => {
      localStorage.removeItem(TOKEN_KEYS.refresh)
      const refresh = vi.spyOn(axios, 'post')
      const tab = await openTab()

      await expect(tab.refreshAccessToken()).rejects.toThrow()

      expect(refresh).not.toHaveBeenCalled()
      expect(sessionExpired).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem(TOKEN_KEYS.handoff)).toBeNull()
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
