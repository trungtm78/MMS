// TOTP secrets are the second factor itself: a database dump must not hand them over
import {
  decryptSecret,
  encryptSecret,
  mfaKeyFromEnv,
} from './mfa-secret-crypto';

const KEY = Buffer.from('a'.repeat(64), 'hex');
const SECRET = 'YL3AOTAN4S72X3JSHIPP5ADNUEUCT7AJ';

describe('mfa secret encryption', () => {
  it('round-trips a secret through AES-256-GCM with a versioned format', () => {
    const stored = encryptSecret(SECRET, KEY);

    expect(stored).toMatch(
      /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/,
    );
    expect(stored).not.toContain(SECRET);
    expect(decryptSecret(stored, KEY)).toEqual({
      secret: SECRET,
      legacy: false,
    });
  });

  it('never produces the same ciphertext twice', () => {
    expect(encryptSecret(SECRET, KEY)).not.toBe(encryptSecret(SECRET, KEY));
  });

  // Tampering with the stored value must not yield a usable secret
  it('rejects a modified ciphertext', () => {
    const [version, iv, tag, ciphertext] = encryptSecret(SECRET, KEY).split(
      ':',
    );
    const flipped = Buffer.from(ciphertext, 'base64');
    flipped[0] ^= 0xff;

    expect(() =>
      decryptSecret(
        [version, iv, tag, flipped.toString('base64')].join(':'),
        KEY,
      ),
    ).toThrow();
  });

  it('rejects a value encrypted with another key', () => {
    const otherKey = Buffer.from('b'.repeat(64), 'hex');

    expect(() => decryptSecret(encryptSecret(SECRET, KEY), otherKey)).toThrow();
  });

  // Secrets written before encryption existed stay usable until re-encrypted
  it('reads a legacy plaintext secret and flags it for re-encryption', () => {
    expect(decryptSecret(SECRET, KEY)).toEqual({
      secret: SECRET,
      legacy: true,
    });
  });
});

describe('mfaKeyFromEnv', () => {
  it('uses MFA_ENCRYPTION_KEY when it is 64 hex characters', () => {
    expect(
      mfaKeyFromEnv(
        { MFA_ENCRYPTION_KEY: 'c'.repeat(64), NODE_ENV: 'production' },
        'jwt',
      ),
    ).toEqual(Buffer.from('c'.repeat(64), 'hex'));
  });

  it('refuses to start in production without a valid key', () => {
    expect(() => mfaKeyFromEnv({ NODE_ENV: 'production' }, 'jwt')).toThrow(
      /MFA_ENCRYPTION_KEY/,
    );
    expect(() =>
      mfaKeyFromEnv(
        { NODE_ENV: 'production', MFA_ENCRYPTION_KEY: 'short' },
        'jwt',
      ),
    ).toThrow(/MFA_ENCRYPTION_KEY/);
  });

  it('derives a stable 32-byte key from the JWT secret outside production', () => {
    const first = mfaKeyFromEnv({ NODE_ENV: 'development' }, 'jwt-secret');
    const second = mfaKeyFromEnv({ NODE_ENV: 'test' }, 'jwt-secret');

    expect(first).toHaveLength(32);
    expect(second).toEqual(first);
    expect(mfaKeyFromEnv({ NODE_ENV: 'test' }, 'other-secret')).not.toEqual(
      first,
    );
  });
});
