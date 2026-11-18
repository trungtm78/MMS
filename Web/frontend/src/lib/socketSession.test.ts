import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HANDSHAKE_RETRY_DELAYS, keepSocketSession, type SessionSocket } from './socketSession'

const auth = vi.hoisted(() => ({
  token: 'access-1' as string | null,
  refreshAccessToken: vi.fn(),
  signOutSession: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  getAccessToken: () => auth.token,
  refreshAccessToken: auth.refreshAccessToken,
  signOutSession: auth.signOutSession,
}))

type Handler = (...args: unknown[]) => void

// socket.io-client stand-in: listeners, connection flags and connect()
class FakeSocket {
  connected = false
  active = false
  auth: unknown = undefined
  private handlers = new Map<string, Set<Handler>>()
  connect = vi.fn(() => this)
  on(event: string, handler: Handler) {
    const set = this.handlers.get(event) ?? new Set<Handler>()
    set.add(handler)
    this.handlers.set(event, set)
    return this
  }
  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler)
    return this
  }
  fire(event: string, ...args: unknown[]) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args)
  }
  listenerCount(event: string) {
    return this.handlers.get(event)?.size ?? 0
  }
  // The server refused the handshake: socket.io-client leaves such a socket inactive
  refuse(message: string) {
    this.connected = false
    this.active = false
    this.fire('connect_error', new Error(message))
  }
  opened() {
    this.connected = true
    this.active = true
    this.fire('connect')
  }
  closedByServer() {
    this.connected = false
    this.active = false
    this.fire('disconnect', 'io server disconnect')
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function keep(socket: FakeSocket, onSignedOut = vi.fn()) {
  const stop = keepSocketSession(socket as unknown as SessionSocket, { onSignedOut })
  return { stop, onSignedOut }
}

describe('keepSocketSession', () => {
  beforeEach(() => {
    auth.token = 'access-1'
    auth.refreshAccessToken.mockReset()
    auth.signOutSession.mockReset()
    auth.refreshAccessToken.mockImplementation(async () => {
      auth.token = 'access-2'
      return 'access-2'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the current access token on every handshake', () => {
    const socket = new FakeSocket()
    keep(socket)

    const handshake = socket.auth as (cb: (data: object) => void) => void
    const sent: object[] = []
    handshake((data) => sent.push(data))
    auth.token = 'access-9'
    handshake((data) => sent.push(data))
    expect(sent).toEqual([{ token: 'access-1' }, { token: 'access-9' }])
  })

  it.each(['invalid_token', 'session_revoked'])('refreshes once and reconnects after a %s handshake refusal', async (message) => {
    const socket = new FakeSocket()
    keep(socket)

    socket.refuse(message)
    await flush()

    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(socket.connect).toHaveBeenCalledTimes(1)
    expect(auth.signOutSession).not.toHaveBeenCalled()
  })

  it('signs out when the handshake is refused again with the refreshed token', async () => {
    const socket = new FakeSocket()
    const { onSignedOut } = keep(socket)

    socket.refuse('invalid_token')
    await flush()
    socket.refuse('session_revoked')
    await flush()

    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(auth.signOutSession).toHaveBeenCalledWith('session_ended')
    expect(onSignedOut).toHaveBeenCalledTimes(1)
  })

  it('refreshes again for a later refusal once a connection has succeeded', async () => {
    const socket = new FakeSocket()
    keep(socket)

    socket.refuse('invalid_token')
    await flush()
    socket.opened()
    socket.refuse('invalid_token')
    await flush()

    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(2)
    expect(auth.signOutSession).not.toHaveBeenCalled()
  })

  it('stops when the refresh is refused: the client has already ended the session', async () => {
    auth.refreshAccessToken.mockImplementation(async () => {
      // api/client.ts clears the tokens and dispatches auth:session-expired on a refused refresh
      auth.token = null
      throw { response: { status: 401, data: { message: 'refresh_token_reused' } } }
    })
    const socket = new FakeSocket()
    const { onSignedOut } = keep(socket)

    socket.refuse('invalid_token')
    await flush()

    expect(socket.connect).not.toHaveBeenCalled()
    expect(auth.signOutSession).not.toHaveBeenCalled()
    expect(onSignedOut).toHaveBeenCalledTimes(1)
  })

  it('tries the refresh again later when it failed for another reason, keeping the session', async () => {
    vi.useFakeTimers()
    auth.refreshAccessToken
      .mockRejectedValueOnce({ request: {}, code: 'ERR_NETWORK' })
      .mockImplementationOnce(async () => {
        auth.token = 'access-2'
        return 'access-2'
      })
    const socket = new FakeSocket()
    const { onSignedOut } = keep(socket)

    socket.refuse('invalid_token')
    await vi.advanceTimersByTimeAsync(0)
    expect(socket.connect).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(HANDSHAKE_RETRY_DELAYS[0])
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(2)
    expect(socket.connect).toHaveBeenCalledTimes(1)
    expect(onSignedOut).not.toHaveBeenCalled()
  })

  it('signs out at once when the handshake carried no token', async () => {
    const socket = new FakeSocket()
    const { onSignedOut } = keep(socket)

    socket.refuse('missing_token')
    await flush()

    expect(auth.signOutSession).toHaveBeenCalledWith('session_ended')
    expect(onSignedOut).toHaveBeenCalledTimes(1)
    expect(auth.refreshAccessToken).not.toHaveBeenCalled()
    expect(socket.connect).not.toHaveBeenCalled()
  })

  it('retries with growing delays while the server cannot authenticate, without signing out', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket()
    keep(socket)

    socket.refuse('authentication_unavailable')
    await vi.advanceTimersByTimeAsync(HANDSHAKE_RETRY_DELAYS[0] - 1)
    expect(socket.connect).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(socket.connect).toHaveBeenCalledTimes(1)

    socket.refuse('authentication_unavailable')
    await vi.advanceTimersByTimeAsync(HANDSHAKE_RETRY_DELAYS[1] - 1)
    expect(socket.connect).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(socket.connect).toHaveBeenCalledTimes(2)

    // A successful connection starts the delays over
    socket.opened()
    socket.refuse('authentication_unavailable')
    await vi.advanceTimersByTimeAsync(HANDSHAKE_RETRY_DELAYS[0])
    expect(socket.connect).toHaveBeenCalledTimes(3)
    expect(auth.refreshAccessToken).not.toHaveBeenCalled()
    expect(auth.signOutSession).not.toHaveBeenCalled()
  })

  it('keeps the longest delay once the delays run out', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket()
    keep(socket)
    const longest = HANDSHAKE_RETRY_DELAYS[HANDSHAKE_RETRY_DELAYS.length - 1]

    for (let attempt = 0; attempt < HANDSHAKE_RETRY_DELAYS.length; attempt++) {
      socket.refuse('authentication_unavailable')
      await vi.advanceTimersByTimeAsync(HANDSHAKE_RETRY_DELAYS[attempt])
    }
    expect(socket.connect).toHaveBeenCalledTimes(HANDSHAKE_RETRY_DELAYS.length)

    socket.refuse('authentication_unavailable')
    await vi.advanceTimersByTimeAsync(longest - 1)
    expect(socket.connect).toHaveBeenCalledTimes(HANDSHAKE_RETRY_DELAYS.length)
    await vi.advanceTimersByTimeAsync(1)
    expect(socket.connect).toHaveBeenCalledTimes(HANDSHAKE_RETRY_DELAYS.length + 1)
  })

  it('treats an unknown refusal like an authentication outage', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket()
    keep(socket)

    socket.refuse('something_new')
    await vi.advanceTimersByTimeAsync(HANDSHAKE_RETRY_DELAYS[0])
    expect(socket.connect).toHaveBeenCalledTimes(1)
    expect(auth.signOutSession).not.toHaveBeenCalled()
  })

  it('leaves transport errors to the socket.io-client reconnection', async () => {
    const socket = new FakeSocket()
    keep(socket)

    socket.active = true
    socket.fire('connect_error', new Error('xhr poll error'))
    socket.fire('disconnect', 'transport close')
    await flush()

    expect(auth.refreshAccessToken).not.toHaveBeenCalled()
    expect(socket.connect).not.toHaveBeenCalled()
  })

  describe('a session that ends while connected', () => {
    it('refreshes on session_expired and reconnects once the server has closed the socket', async () => {
      const socket = new FakeSocket()
      keep(socket)
      socket.opened()

      socket.fire('session_expired', { reason: 'token_expired' })
      await flush()
      // Still connected: the new token waits for the server's disconnect
      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
      expect(socket.connect).not.toHaveBeenCalled()

      socket.closedByServer()
      expect(socket.connect).toHaveBeenCalledTimes(1)
      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
    })

    it('shares one refresh when the disconnect arrives while it is still running', async () => {
      const refresh = deferred<string>()
      auth.refreshAccessToken.mockReturnValue(refresh.promise)
      const socket = new FakeSocket()
      keep(socket)
      socket.opened()

      socket.fire('session_expired', { reason: 'session_revoked' })
      socket.closedByServer()
      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
      expect(socket.connect).not.toHaveBeenCalled()

      auth.token = 'access-2'
      refresh.resolve('access-2')
      await flush()
      expect(socket.connect).toHaveBeenCalledTimes(1)
    })

    it('falls back to the server disconnect when no session_expired event came', async () => {
      const socket = new FakeSocket()
      keep(socket)
      socket.opened()

      socket.closedByServer()
      await flush()

      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
      expect(socket.connect).toHaveBeenCalledTimes(1)
    })
  })

  it('stops handling the socket once disposed', async () => {
    vi.useFakeTimers()
    const refresh = deferred<string>()
    auth.refreshAccessToken.mockReturnValue(refresh.promise)
    const socket = new FakeSocket()
    const { stop } = keep(socket)

    socket.refuse('authentication_unavailable')
    socket.opened()
    socket.fire('session_expired', { reason: 'token_expired' })
    stop()

    refresh.resolve('access-2')
    await vi.advanceTimersByTimeAsync(HANDSHAKE_RETRY_DELAYS[0])
    socket.closedByServer()
    socket.refuse('missing_token')

    expect(socket.connect).not.toHaveBeenCalled()
    expect(auth.signOutSession).not.toHaveBeenCalled()
    for (const event of ['connect', 'connect_error', 'disconnect', 'session_expired']) {
      expect(socket.listenerCount(event)).toBe(0)
    }
  })

  it('ignores a refresh failure that settles after disposal', async () => {
    const refresh = deferred<string>()
    auth.refreshAccessToken.mockReturnValue(refresh.promise)
    const socket = new FakeSocket()
    const { stop, onSignedOut } = keep(socket)

    socket.refuse('invalid_token')
    stop()
    auth.token = null
    refresh.reject(new Error('refused'))
    await flush()

    expect(onSignedOut).not.toHaveBeenCalled()
    expect(socket.connect).not.toHaveBeenCalled()
  })
})
