// Human-readable record codes, e.g. SOS-20261001-7KQ2XM: a prefix naming the kind of record,
// the Vietnamese business day it was created and six random Crockford base32 characters
// (about a billion per prefix and day). The database's UNIQUE constraint stays the
// authority: an insert that finds its code taken draws another.
import { InternalServerErrorException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { businessDate } from '../time/business-date';

/** Crockford base32: no I, L, O or U, so a code read aloud or retyped stays unambiguous. */
export const RECORD_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const SUFFIX_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const PREFIX = /^[A-Z]{2,6}$/;

export function generateRecordCode(
  prefix: string,
  random: (size: number) => Buffer = randomBytes,
): string {
  if (!PREFIX.test(prefix)) {
    throw new Error(
      `Record code prefix must be 2 to 6 capital letters, got "${prefix}"`,
    );
  }
  const day = businessDate().isoDate.replace(/-/g, '');
  // 256 is a multiple of 32, so every character is equally likely
  const suffix = Array.from(
    random(SUFFIX_LENGTH),
    (byte) => RECORD_CODE_ALPHABET[byte % RECORD_CODE_ALPHABET.length],
  ).join('');
  return `${prefix}-${day}-${suffix}`;
}

/**
 * Runs `insert` with fresh codes until one is not taken. `insert` answers null when the code
 * already exists, as INSERT ... ON CONFLICT (code) DO NOTHING RETURNING does.
 */
export async function insertWithRecordCode<T>(
  prefix: string,
  insert: (code: string) => Promise<T | null>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await insert(generateRecordCode(prefix));
    if (row !== null) return row;
  }
  throw new InternalServerErrorException('record_code_exhausted');
}
