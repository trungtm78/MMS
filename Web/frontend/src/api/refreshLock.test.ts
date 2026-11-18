import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { REFRESH_LEASE_KEY, REFRESH_LOCK_NAME, LEASE_SETTLE_MS, LEASE_POLL_MS } from './refreshLock'

// Every tab of the app loads its own copy of the module (its own tab id) over one shared
// localStorage; vi.resetModules gives this test a fresh copy per simulated tab
async function openTab() {
  vi.resetModules()
  return import('./refreshLock')
}

function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function writeLease(owner: string, until: number) {
  localStorage.setItem(REFRESH_LEASE_KEY, JSON.stringify({ owner, until }))
}

describe('withRefreshLock', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks')
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('with the Web Locks API', () => {
    it('runs the task under the shared lock and leaves localStorage alone', async () => {
      const request = vi.fn(<T>(_name: string, callback: () => Promise<T>) => callback())
      Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
      const tab = await openTab()

      await expect(tab.withRefreshLock(async () => 'done')).resolves.toBe('done')

      expect(request).toHaveBeenCalledTimes(1)
      expect(request.mock.calls[0][0]).toBe(REFRESH_LOCK_NAME)
      expect(localStorage.getItem(REFRESH_LEASE_KEY)).toBeNull()
    })
  })

  // Web Locks exist only in secure contexts: over plain HTTP on a LAN the lease in localStorage
  // is the lock (Fischer's timed mutual exclusion)
  describe('without the Web Locks API', () => {
    it('makes a second tab wait until the first one finishes', async () => {
      vi.useFakeTimers()
      const tabA = await openTab()
      const tabB = await openTab()
      const holdA = deferred()
      const order: string[] = []

      const a = tabA.withRefreshLock(async () => {
        order.push('a:start')
        await holdA.promise
        order.push('a:end')
      })
      const b = tabB.withRefreshLock(async () => {
        order.push('b:start')
      })

      await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS + LEASE_POLL_MS * 4)
      expect(order).toEqual(['a:start'])

      holdA.resolve()
      await a
      await vi.advanceTimersByTimeAsync(LEASE_POLL_MS + LEASE_SETTLE_MS)
      await b

      expect(order).toEqual(['a:start', 'a:end', 'b:start'])
      expect(localStorage.getItem(REFRESH_LEASE_KEY)).toBeNull()
    })

    it('backs off when another tab wrote the lease during the settle delay (last writer wins)', async () => {
      vi.useFakeTimers()
      const tab = await openTab()
      const task = vi.fn(async () => 'mine')

      const result = tab.withRefreshLock(task)
      writeLease('other-tab', Date.now() + 60_000)
      await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS + LEASE_POLL_MS * 4)
      expect(task).not.toHaveBeenCalled()

      localStorage.removeItem(REFRESH_LEASE_KEY)
      await vi.advanceTimersByTimeAsync(LEASE_POLL_MS + LEASE_SETTLE_MS)

      await expect(result).resolves.toBe('mine')
      expect(task).toHaveBeenCalledTimes(1)
    })

    it('stops waiting as soon as the holder releases the lease from another tab (storage event)', async () => {
      vi.useFakeTimers()
      writeLease('other-tab', Date.now() + 60_000)
      const tab = await openTab()
      const task = vi.fn(async () => 'mine')

      const result = tab.withRefreshLock(task)
      await vi.advanceTimersByTimeAsync(1)
      localStorage.removeItem(REFRESH_LEASE_KEY)
      window.dispatchEvent(new StorageEvent('storage', { key: REFRESH_LEASE_KEY }))
      await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS)

      await expect(result).resolves.toBe('mine')
    })

    it('takes over the lease of a tab that closed without releasing it once the lease expires', async () => {
      vi.useFakeTimers()
      writeLease('closed-tab', Date.now() + LEASE_POLL_MS * 2)
      const tab = await openTab()
      const task = vi.fn(async () => 'mine')

      const result = tab.withRefreshLock(task)
      await vi.advanceTimersByTimeAsync(LEASE_POLL_MS)
      expect(task).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(LEASE_POLL_MS * 2 + LEASE_SETTLE_MS)

      await expect(result).resolves.toBe('mine')
    })

    it('treats an unreadable lease as free', async () => {
      vi.useFakeTimers()
      localStorage.setItem(REFRESH_LEASE_KEY, '{not json')
      const tab = await openTab()

      const result = tab.withRefreshLock(async () => 'mine')
      await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS)

      await expect(result).resolves.toBe('mine')
    })

    it('releases the lease when the task fails', async () => {
      vi.useFakeTimers()
      const tab = await openTab()

      const result = tab.withRefreshLock(async () => {
        throw new Error('refresh failed')
      })
      const settled = expect(result).rejects.toThrow('refresh failed')
      await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS)
      await settled

      expect(localStorage.getItem(REFRESH_LEASE_KEY)).toBeNull()
    })

    it('releases the lease when the page is closed mid-task', async () => {
      vi.useFakeTimers()
      const tab = await openTab()
      const hold = deferred()

      const result = tab.withRefreshLock(() => hold.promise)
      await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS)
      expect(localStorage.getItem(REFRESH_LEASE_KEY)).not.toBeNull()

      window.dispatchEvent(new Event('pagehide'))
      expect(localStorage.getItem(REFRESH_LEASE_KEY)).toBeNull()

      hold.resolve()
      await result
    })

    it('leaves a lease another tab took over in place when finishing', async () => {
      vi.useFakeTimers()
      const tab = await openTab()

      const result = tab.withRefreshLock(async () => {
        writeLease('other-tab', Date.now() + 60_000)
      })
      await vi.advanceTimersByTimeAsync(LEASE_SETTLE_MS)
      await result

      expect(JSON.parse(localStorage.getItem(REFRESH_LEASE_KEY) ?? 'null')).toMatchObject({ owner: 'other-tab' })
    })
  })
})
