// Per-client rate limits for password and second-factor routes. Limits are read on every
// request so a deployment (or the e2e suite, which signs in many times from one address)
// can change them through the environment.
import { LOGIN_THROTTLE, MFA_THROTTLE } from './auth-throttle';

const resolve = (value: unknown) =>
  typeof value === 'function' ? (value as (ctx: unknown) => number)({}) : value;

describe('auth throttling', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('allows five password attempts per client every five minutes by default', () => {
    delete process.env.THROTTLE_LOGIN_LIMIT;
    delete process.env.THROTTLE_LOGIN_TTL_MS;

    expect(resolve(LOGIN_THROTTLE.default.limit)).toBe(5);
    expect(resolve(LOGIN_THROTTLE.default.ttl)).toBe(300_000);
  });

  it('allows ten second-factor attempts per client each minute by default', () => {
    delete process.env.THROTTLE_MFA_LIMIT;
    delete process.env.THROTTLE_MFA_TTL_MS;

    expect(resolve(MFA_THROTTLE.default.limit)).toBe(10);
    expect(resolve(MFA_THROTTLE.default.ttl)).toBe(60_000);
  });

  it('takes limits from the environment at request time', () => {
    process.env.THROTTLE_LOGIN_LIMIT = '500';
    process.env.THROTTLE_MFA_TTL_MS = '1000';

    expect(resolve(LOGIN_THROTTLE.default.limit)).toBe(500);
    expect(resolve(MFA_THROTTLE.default.ttl)).toBe(1000);
  });

  it.each(['', 'abc', '0', '-3', '2.5', '10junk'])(
    'ignores the unusable value %p',
    (value) => {
      process.env.THROTTLE_LOGIN_LIMIT = value;

      expect(resolve(LOGIN_THROTTLE.default.limit)).toBe(5);
    },
  );
});
