// Recovery codes are read off paper and typed on phones: they must be unambiguous and
// forgiving about formatting, while each code is still worth 50 bits
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  normalizeRecoveryCode,
} from './recovery-codes';

const FORMAT = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;

describe('generateRecoveryCodes', () => {
  it('issues ten distinct codes in the XXXXX-XXXXX Crockford base32 format', () => {
    const codes = generateRecoveryCodes();

    expect(RECOVERY_CODE_COUNT).toBe(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(FORMAT);
  });

  // Crockford base32 leaves out I, L, O and U, which are easily misread
  it('never uses easily confused letters', () => {
    const letters = generateRecoveryCodes(200).join('');

    expect(letters).not.toMatch(/[ILOU]/);
  });
});

describe('normalizeRecoveryCode', () => {
  it('accepts lower case, spaces and a missing hyphen', () => {
    expect(normalizeRecoveryCode(' ab3de fg7hk ')).toBe('AB3DE-FG7HK');
    expect(normalizeRecoveryCode('ab3defg7hk')).toBe('AB3DE-FG7HK');
  });

  it('reads O as zero and I or L as one', () => {
    expect(normalizeRecoveryCode('oo1il-lloio')).toBe('00111-11010');
  });

  it('returns null for anything that cannot be a recovery code', () => {
    expect(normalizeRecoveryCode('123456')).toBeNull();
    expect(normalizeRecoveryCode('AB3DE-FG7HK-X')).toBeNull();
    expect(normalizeRecoveryCode('AB3DE-FG7H!')).toBeNull();
    expect(normalizeRecoveryCode('AB3DE-FG7HU')).toBeNull();
  });
});
