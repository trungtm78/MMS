// RFC 6238 TOTP as authenticator apps implement it (SHA-1, 6 digits, 30 s), tolerating one
// step of clock drift, and never accepting the same code twice
import { generateSync } from 'otplib';
import { TOTP_PERIOD_SECONDS, verifyTotp } from './totp';

const SECRET = 'YL3AOTAN4S72X3JSHIPP5ADNUEUCT7AJ';
const NOW = new Date('2026-10-01T02:00:15Z');
const epoch = Math.floor(NOW.getTime() / 1000);
const step = Math.floor(epoch / TOTP_PERIOD_SECONDS);
const codeAt = (offsetSteps: number) =>
  generateSync({
    secret: SECRET,
    epoch: epoch + offsetSteps * TOTP_PERIOD_SECONDS,
  });

describe('verifyTotp', () => {
  it('accepts the current code and reports its time step', () => {
    expect(
      verifyTotp(SECRET, codeAt(0), { now: NOW, lastUsedStep: null }),
    ).toEqual({
      valid: true,
      step,
    });
  });

  it('tolerates one step of clock drift either way', () => {
    expect(
      verifyTotp(SECRET, codeAt(-1), { now: NOW, lastUsedStep: null }),
    ).toEqual({
      valid: true,
      step: step - 1,
    });
    expect(
      verifyTotp(SECRET, codeAt(1), { now: NOW, lastUsedStep: null }),
    ).toEqual({
      valid: true,
      step: step + 1,
    });
  });

  it('rejects codes two steps away', () => {
    expect(
      verifyTotp(SECRET, codeAt(-2), { now: NOW, lastUsedStep: null }),
    ).toEqual({
      valid: false,
      reason: 'invalid',
    });
  });

  // A code seen once (e.g. shoulder-surfed or phished) cannot be used again
  it('rejects a code from a step already used', () => {
    expect(
      verifyTotp(SECRET, codeAt(0), { now: NOW, lastUsedStep: step }),
    ).toEqual({
      valid: false,
      reason: 'replayed',
    });
    expect(
      verifyTotp(SECRET, codeAt(-1), { now: NOW, lastUsedStep: step }),
    ).toEqual({
      valid: false,
      reason: 'replayed',
    });
  });

  it('rejects input that is not six digits without throwing', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', ' 12345']) {
      expect(
        verifyTotp(SECRET, code, { now: NOW, lastUsedStep: null }),
      ).toEqual({
        valid: false,
        reason: 'invalid',
      });
    }
  });
});
