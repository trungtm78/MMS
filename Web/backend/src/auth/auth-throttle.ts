// Per-client rate limits for the password and second-factor routes, on top of the
// per-account lockouts in AuthService and MfaService. Read on every request so the
// environment (THROTTLE_*) can change them without a rebuild.

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : fallback;
}

const fromEnv = (name: string, fallback: number) => (): number =>
  positiveIntFromEnv(name, fallback);

// US-W001 BR: five password attempts per client every five minutes
export const LOGIN_THROTTLE = {
  default: {
    limit: fromEnv('THROTTLE_LOGIN_LIMIT', 5),
    ttl: fromEnv('THROTTLE_LOGIN_TTL_MS', 300_000),
  },
};

// Six-digit codes: ten tries per client per minute, and each challenge closes after five
export const MFA_THROTTLE = {
  default: {
    limit: fromEnv('THROTTLE_MFA_LIMIT', 10),
    ttl: fromEnv('THROTTLE_MFA_TTL_MS', 60_000),
  },
};
