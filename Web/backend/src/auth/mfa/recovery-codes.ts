import { randomInt } from 'crypto';

export const RECOVERY_CODE_COUNT = 10;

// Crockford base32: digits and letters without I, L, O and U, which are easily misread.
// Ten characters give 50 bits per code.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUP = 5;
const CANONICAL = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/** Distinct one-time codes formatted XXXXX-XXXXX. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const chars = Array.from(
      { length: GROUP * 2 },
      () => ALPHABET[randomInt(ALPHABET.length)],
    ).join('');
    codes.add(`${chars.slice(0, GROUP)}-${chars.slice(GROUP)}`);
  }
  return [...codes];
}

/**
 * The canonical XXXXX-XXXXX form of typed input: case, spaces and the hyphen are
 * ignored, O reads as zero and I or L as one. Returns null when the input cannot be a
 * recovery code, so it never reaches a hash comparison.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const compact = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (!CANONICAL.test(compact)) return null;
  return `${compact.slice(0, GROUP)}-${compact.slice(GROUP)}`;
}
