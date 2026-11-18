import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

// TOTP secrets at rest: AES-256-GCM, stored as `v1:<iv>:<tag>:<ciphertext>` (base64 parts).
// The version prefix lets the format or key change later without guessing what a value is.
const VERSION = 'v1';
const IV_BYTES = 12;

export function encryptSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Decrypts a stored secret. Values without the version prefix were written before
 * encryption existed: they are returned as-is with `legacy: true` so the caller can
 * re-encrypt them. A tampered value or the wrong key throws.
 */
export function decryptSecret(
  stored: string,
  key: Buffer,
): { secret: string; legacy: boolean } {
  if (!stored.startsWith(`${VERSION}:`))
    return { secret: stored, legacy: true };

  const [, iv, tag, ciphertext] = stored.split(':');
  if (!iv || !tag || !ciphertext) throw new Error('malformed_mfa_secret');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const secret = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return { secret, legacy: false };
}

/**
 * The 32-byte encryption key. MFA_ENCRYPTION_KEY (64 hex characters) is required in
 * production and must be valid whenever it is set; development and test derive a stable
 * key from the JWT secret so a local setup works without extra configuration.
 */
export function mfaKeyFromEnv(
  env: NodeJS.ProcessEnv,
  jwtSecret: string,
): Buffer {
  const configured = env.MFA_ENCRYPTION_KEY;
  if (configured) {
    if (/^[0-9a-fA-F]{64}$/.test(configured)) {
      return Buffer.from(configured, 'hex');
    }
    throw new Error('MFA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'MFA_ENCRYPTION_KEY must be set to 64 hex characters (32 bytes) in production',
    );
  }
  return createHash('sha256')
    .update(`mfa-secret-encryption:${jwtSecret}`)
    .digest();
}
