import type { AccessClaims } from '../auth/auth-state.service';
import type { AuthRevocation } from '../auth/auth-revocation-feed';

/** True when `event` ends the session the token's claims name. */
export function revocationEnds(
  event: AuthRevocation,
  claims: AccessClaims & { tid?: string },
): boolean {
  if (claims.sub !== event.userId) return false;
  // A user id belongs to one tenant; a claim naming another tenant is not this session
  if (
    event.tenantId !== undefined &&
    claims.tid !== undefined &&
    claims.tid.toLowerCase() !== event.tenantId
  ) {
    return false;
  }
  if (event.kind === 'session') return claims.sid === event.sessionId;
  return !event.active || claims.ver !== event.version;
}

// How long a revocation is remembered. A handshake that read the session just before the
// change committed completes within moments of the notification; a minute is ample.
export const RECENT_REVOCATION_TTL_MS = 60_000;

/**
 * Revocations received in the last RECENT_REVOCATION_TTL_MS, so a socket whose handshake
 * checked its session just before the change committed is still closed when it connects
 * after the notification was handled. Per account, the latest account change is kept.
 */
export class RecentRevocations {
  private readonly sessions = new Map<string, number>();
  private readonly accounts = new Map<
    string,
    { event: AuthRevocation & { kind: 'account' }; at: number }
  >();

  constructor(
    private readonly ttlMs = RECENT_REVOCATION_TTL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  record(event: AuthRevocation): void {
    const at = this.now();
    this.forgetBefore(at - this.ttlMs);
    if (event.kind === 'session') this.sessions.set(event.sessionId, at);
    else this.accounts.set(event.userId, { event, at });
  }

  /** True when a remembered revocation ends the session the claims name. */
  ends(claims: AccessClaims & { tid?: string }): boolean {
    const since = this.now() - this.ttlMs;
    const sessionEnded = claims.sid ? this.sessions.get(claims.sid) : undefined;
    if (sessionEnded !== undefined && sessionEnded >= since) return true;
    const account = this.accounts.get(claims.sub);
    return (
      account !== undefined &&
      account.at >= since &&
      revocationEnds(account.event, claims)
    );
  }

  private forgetBefore(cutoff: number): void {
    for (const [sid, at] of this.sessions) {
      if (at < cutoff) this.sessions.delete(sid);
    }
    for (const [userId, { at }] of this.accounts) {
      if (at < cutoff) this.accounts.delete(userId);
    }
  }
}
