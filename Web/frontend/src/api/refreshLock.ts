// Cross-tab mutual exclusion for the refresh-token exchange (api/client.ts).
//
// Every tab shares one refresh token (localStorage) and the server rotates it on every refresh;
// presenting a rotated token again is treated as theft and ends every session of the user
// (auth.service.ts refreshTokens: replaced_by → invalidateUser → refresh_token_reused). So at most
// one tab may exchange it at a time, and each tab must read the token only once it holds the lock.
//
// The Web Locks API is the lock where it exists. It is only exposed in secure contexts (HTTPS or
// localhost), and the app is also served over plain HTTP on a LAN (nginx/conf.d/mms.conf listens
// on 80), so without it a lease in localStorage stands in: Fischer's timed mutual exclusion — take
// the lease only when it is free, wait longer than a write takes to reach the other tabs, and go
// ahead only if the lease still names this tab. Two tabs taking a free lease at once both see the
// last writer once the delay has passed, so only one goes ahead. Residual window: a tab whose
// localStorage write takes longer than LEASE_SETTLE_MS to reach another tab (a frozen or heavily
// throttled process) can still overlap; the Web Locks API has no such window.

export const REFRESH_LOCK_NAME = 'mms-auth-refresh'
export const REFRESH_LEASE_KEY = 'mms_refresh_lease'

/** The refresh request gives up after this long, so no tab holds the others back for longer */
export const REFRESH_REQUEST_TIMEOUT_MS = 30_000
/** Longer than any write takes to reach the other tabs of the browser */
export const LEASE_SETTLE_MS = 100
/** How often a waiting tab looks again when no storage event told it the lease was released */
export const LEASE_POLL_MS = 250
/** A tab closed mid-refresh leaves its lease behind; it lapses once the refresh would have timed out */
const LEASE_TTL_MS = REFRESH_REQUEST_TIMEOUT_MS + 10_000

type Lease = { owner: string; until: number }

// Identifies this tab's lease; crypto.randomUUID is secure-context only, getRandomValues is not
const tabId = Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(36)).join('-')

/** Runs task while no other tab of this browser runs one */
export async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  if ('locks' in navigator && navigator.locks) {
    // The lock is held until the promise the callback returns settles, and request resolves with
    // its value (lib.dom types that value as the promise itself, hence the await)
    return await navigator.locks.request(REFRESH_LOCK_NAME, () => task())
  }
  return withStorageLease(task)
}

function readLease(): Lease | null {
  const raw = localStorage.getItem(REFRESH_LEASE_KEY)
  if (raw === null) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    // Unreadable (truncated write, older format): nobody can be holding it
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { owner, until } = value as { owner?: unknown; until?: unknown }
  return typeof owner === 'string' && typeof until === 'number' ? { owner, until } : null
}

function heldByAnotherTab(lease: Lease | null): boolean {
  return lease !== null && lease.owner !== tabId && lease.until > Date.now()
}

function releaseLease(): void {
  if (readLease()?.owner === tabId) localStorage.removeItem(REFRESH_LEASE_KEY)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Resolves when another tab changes the lease (the storage event fires only in the other tabs)
// or after LEASE_POLL_MS, whichever comes first
function leaseChangeOrPoll(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      window.removeEventListener('storage', onStorage)
      resolve()
    }
    const onStorage = (event: StorageEvent) => {
      // key null: the other tab cleared the whole storage
      if (event.key === REFRESH_LEASE_KEY || event.key === null) done()
    }
    const timer = setTimeout(done, LEASE_POLL_MS)
    window.addEventListener('storage', onStorage)
  })
}

async function acquireLease(): Promise<void> {
  for (;;) {
    if (heldByAnotherTab(readLease())) {
      await leaseChangeOrPoll()
      continue
    }
    // Read and write in the same turn: nothing of this tab runs in between
    localStorage.setItem(REFRESH_LEASE_KEY, JSON.stringify({ owner: tabId, until: Date.now() + LEASE_TTL_MS }))
    await delay(LEASE_SETTLE_MS)
    if (readLease()?.owner === tabId) return
  }
}

async function withStorageLease<T>(task: () => Promise<T>): Promise<T> {
  await acquireLease()
  // A tab closed mid-refresh lets the others go at once instead of when the lease lapses
  window.addEventListener('pagehide', releaseLease)
  try {
    return await task()
  } finally {
    window.removeEventListener('pagehide', releaseLease)
    releaseLease()
  }
}
