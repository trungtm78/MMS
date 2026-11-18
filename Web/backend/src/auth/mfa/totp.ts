import { verifySync } from 'otplib';

// RFC 6238 as authenticator apps implement it: SHA-1, 6 digits, 30-second steps
export const TOTP_PERIOD_SECONDS = 30;
// One step either way absorbs ordinary phone clock drift
const DRIFT_STEPS = 1;

export type TotpResult =
  | { valid: true; step: number }
  | { valid: false; reason: 'invalid' | 'replayed' };

/**
 * Verifies a code and reports the time step it belongs to. A code from a step at or
 * before `lastUsedStep` is refused even when it is otherwise correct, so an observed
 * code cannot be replayed within its validity window.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { now?: Date; lastUsedStep: number | null },
): TotpResult {
  if (!/^\d{6}$/.test(code)) return { valid: false, reason: 'invalid' };

  const epoch = Math.floor((options.now ?? new Date()).getTime() / 1000);
  let result: { valid: boolean; delta?: number };
  try {
    result = verifySync({
      secret,
      token: code,
      epoch,
      period: TOTP_PERIOD_SECONDS,
      epochTolerance: DRIFT_STEPS * TOTP_PERIOD_SECONDS,
    }) as { valid: boolean; delta?: number };
  } catch {
    // A malformed stored secret must read as a wrong code, not a server error
    return { valid: false, reason: 'invalid' };
  }
  if (!result.valid) return { valid: false, reason: 'invalid' };

  const step = Math.floor(epoch / TOTP_PERIOD_SECONDS) + (result.delta ?? 0);
  if (options.lastUsedStep !== null && step <= options.lastUsedStep) {
    return { valid: false, reason: 'replayed' };
  }
  return { valid: true, step };
}
