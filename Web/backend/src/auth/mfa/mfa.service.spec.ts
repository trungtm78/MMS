// Second factor for sign-in: which accounts are challenged, how codes are checked, how
// enrolment hands out recovery codes, and how the factor is removed again
import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { generateSync } from 'otplib';
import { decryptSecret, encryptSecret } from './mfa-secret-crypto';
import { TOTP_PERIOD_SECONDS } from './totp';
import {
  MfaService,
  USER_MFA_FAILURE_LIMIT,
  type MfaMethod,
  type RequestContext,
} from './mfa.service';

const KEY = Buffer.from('e'.repeat(64), 'hex');
const SECRET = 'YL3AOTAN4S72X3JSHIPP5ADNUEUCT7AJ';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-01T02:00:15Z');
const STEP = Math.floor(NOW.getTime() / 1000 / TOTP_PERIOD_SECONDS);
const EXPIRES = new Date(NOW.getTime() + 300_000);
const CTX: RequestContext = { ip: '10.0.0.7', userAgent: 'jest' };
const RECOVERY_CODE = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;

const codeAt = (offsetSteps = 0) =>
  generateSync({
    secret: SECRET,
    epoch: Math.floor(NOW.getTime() / 1000) + offsetSteps * TOTP_PERIOD_SECONDS,
  });

// ─── In-memory stand-ins ────────────────────────────────────────────────────

interface FakeUser {
  id: string;
  username: string;
  mfa_enabled: boolean;
  mfa_setup_at: Date | null;
  totp_secret: string | null;
  totp_last_used_step: string | null;
  mfa_failed_count: number;
  mfa_locked_until: Date | null;
}
interface FakeCode {
  id: string;
  code_hash: string;
  used_at: Date | null;
}

let user: FakeUser | null;
let roleRequiresMfa: boolean;
let recoveryCodes: FakeCode[];
let audits: {
  actorId: unknown;
  action: unknown;
  entityId: unknown;
  details: unknown;
}[];
let rolledBack: boolean;
let stealRecoveryCode: boolean;
let executed: string[];

function route(sql: string, params: unknown[] = []): unknown {
  executed.push(sql);
  if (/FROM users\s+WHERE id = \$1/.test(sql)) return user ? [{ ...user }] : [];
  if (/bool_or\(r\.mfa_required\)/.test(sql))
    return [{ required: roleRequiresMfa }];
  if (/UPDATE users SET totp_last_used_step = \$2/.test(sql)) {
    user!.totp_last_used_step = String(params[1]);
    if (params[2] != null) user!.totp_secret = params[2] as string;
    return [[], 1];
  }
  if (
    /UPDATE users SET mfa_failed_count = \$2, mfa_locked_until = \$3/.test(sql)
  ) {
    user!.mfa_failed_count = params[1] as number;
    user!.mfa_locked_until = params[2] as Date | null;
    return [[], 1];
  }
  if (
    /UPDATE users SET mfa_failed_count = 0, mfa_locked_until = NULL/.test(sql)
  ) {
    user!.mfa_failed_count = 0;
    user!.mfa_locked_until = null;
    return [[], 1];
  }
  if (/UPDATE users SET totp_secret = \$2, mfa_enabled = true/.test(sql)) {
    Object.assign(user!, {
      totp_secret: params[1],
      mfa_enabled: true,
      mfa_setup_at: NOW,
      totp_last_used_step: String(params[2]),
    });
    return [[], 1];
  }
  if (/UPDATE users SET totp_secret = NULL, mfa_enabled = false/.test(sql)) {
    Object.assign(user!, {
      totp_secret: null,
      mfa_enabled: false,
      mfa_setup_at: null,
      totp_last_used_step: null,
    });
    return [[], 1];
  }
  if (/SELECT id, code_hash FROM mfa_recovery_codes/.test(sql)) {
    return recoveryCodes
      .filter((c) => !c.used_at)
      .map(({ id, code_hash }) => ({ id, code_hash }));
  }
  if (/UPDATE mfa_recovery_codes SET used_at = now\(\)/.test(sql)) {
    const code = recoveryCodes.find((c) => c.id === params[0] && !c.used_at);
    if (!code || stealRecoveryCode) return [[], 0];
    code.used_at = NOW;
    return [[{ id: code.id }], 1];
  }
  if (/count\(\*\)[\s\S]*FROM mfa_recovery_codes/.test(sql)) {
    return [{ remaining: recoveryCodes.filter((c) => !c.used_at).length }];
  }
  if (/DELETE FROM mfa_recovery_codes WHERE user_id = \$1/.test(sql)) {
    recoveryCodes = [];
    return [[], 0];
  }
  if (/INSERT INTO mfa_recovery_codes/.test(sql)) {
    recoveryCodes = (params[1] as string[]).map((hash, i) => ({
      id: `rc-${i}`,
      code_hash: hash,
      used_at: null,
    }));
    return [];
  }
  if (/INSERT INTO audit_logs/.test(sql)) {
    audits.push({
      actorId: params[0],
      action: params[1],
      entityId: params[2],
      details: JSON.parse(params[3] as string),
    });
    return [];
  }
  throw new Error(`unexpected SQL: ${sql}`);
}

const mgr = { query: jest.fn(route) };
const dataSource = {
  query: jest.fn(route),
  transaction: jest.fn(async (work: (m: typeof mgr) => Promise<unknown>) => {
    try {
      return await work(mgr);
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  }),
};

const challenges = {
  enterTenantOf: jest.fn(),
  issue: jest.fn(),
  load: jest.fn(),
  recordFailure: jest.fn(),
  consume: jest.fn(),
  setPendingSecret: jest.fn(),
  revokeOpen: jest.fn(),
};

const signedIn = {
  user: { id: USER_ID, username: 'ca_ward_01' },
  tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 900 },
};
const authService = { signInUser: jest.fn() };
const authState = { invalidateUser: jest.fn() };

const enrolledUser = (overrides: Partial<FakeUser> = {}): FakeUser => ({
  id: USER_ID,
  username: 'ca_ward_01',
  mfa_enabled: true,
  mfa_setup_at: new Date('2026-09-01T00:00:00Z'),
  totp_secret: encryptSecret(SECRET, KEY),
  totp_last_used_step: null,
  mfa_failed_count: 0,
  mfa_locked_until: null,
  ...overrides,
});

const openChallenge = (overrides: Record<string, unknown> = {}) => ({
  id: 'ch-1',
  userId: USER_ID,
  pendingSecret: null,
  attempts: 0,
  expiresAt: EXPIRES,
  ...overrides,
});

async function expectHttp(
  promise: Promise<unknown>,
  status: number,
  message: string,
  details?: Record<string, unknown>,
) {
  await expect(promise).rejects.toMatchObject({
    status,
    message,
    ...(details
      ? { response: expect.objectContaining({ details }) as unknown }
      : {}),
  });
}

describe('MfaService', () => {
  let service: MfaService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'queueMicrotask',
      ],
    });
    user = enrolledUser();
    roleRequiresMfa = false;
    recoveryCodes = [];
    audits = [];
    rolledBack = false;
    stealRecoveryCode = false;
    executed = [];
    challenges.issue.mockResolvedValue({
      token: 'ch-1.opaque',
      expiresAt: EXPIRES,
    });
    challenges.load.mockResolvedValue(openChallenge());
    challenges.recordFailure.mockResolvedValue(4);
    challenges.consume.mockResolvedValue(undefined);
    authService.signInUser.mockResolvedValue(signedIn);
    authState.invalidateUser.mockResolvedValue(1);
    service = new MfaService(
      dataSource as never,
      challenges as never,
      authService as never,
      KEY,
      authState as never,
    );
  });
  afterEach(() => jest.useRealTimers());

  it.each([
    [
      'verify',
      (s: MfaService) =>
        s.verify({ mfaToken: 'ch-1.opaque', method: 'totp', code: '123456' }),
    ],
    ['startEnrollment', (s: MfaService) => s.startEnrollment('ch-1.opaque')],
    [
      'confirmEnrollment',
      (s: MfaService) =>
        s.confirmEnrollment({ mfaToken: 'ch-1.opaque', code: '123456' }, {}),
    ],
  ])(
    '%s enters the tenant of the token before it opens its transaction',
    async (_name, call) => {
      challenges.enterTenantOf.mockImplementationOnce(() => {
        throw new UnauthorizedException('mfa_token_invalid');
      });

      await expect(call(service)).rejects.toMatchObject({
        message: 'mfa_token_invalid',
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(challenges.enterTenantOf).toHaveBeenCalledWith('ch-1.opaque');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    },
  );

  describe('beginLogin', () => {
    const account = { id: USER_ID, username: 'ca_ward_01' };

    it('signs in with the password alone when neither the account nor its roles require MFA', async () => {
      await expect(
        service.beginLogin({ ...account, mfaEnabled: false }, CTX),
      ).resolves.toEqual({ status: 'SUCCESS', ...signedIn });
      expect(authService.signInUser).toHaveBeenCalledWith(
        USER_ID,
        ['pwd'],
        CTX,
      );
      expect(challenges.issue).not.toHaveBeenCalled();
    });

    it('challenges an enrolled account, keeping the fields older clients read', async () => {
      await expect(
        service.beginLogin({ ...account, mfaEnabled: true }, CTX),
      ).resolves.toEqual({
        status: 'MFA_REQUIRED',
        mfaToken: 'ch-1.opaque',
        expiresAt: EXPIRES.toISOString(),
        methods: ['totp', 'recovery_code'],
        mfa_required: true,
        requiresMfa: true,
        tempToken: 'ch-1.opaque',
      });
      expect(challenges.issue).toHaveBeenCalledWith(USER_ID, 'verify');
      expect(authService.signInUser).not.toHaveBeenCalled();
    });

    it('sends an unenrolled holder of an MFA-required role to enrolment instead of issuing tokens', async () => {
      roleRequiresMfa = true;
      user = enrolledUser({
        mfa_enabled: false,
        totp_secret: null,
        mfa_setup_at: null,
      });

      await expect(
        service.beginLogin({ ...account, mfaEnabled: false }, CTX),
      ).resolves.toEqual({
        status: 'MFA_SETUP_REQUIRED',
        mfaToken: 'ch-1.opaque',
        expiresAt: EXPIRES.toISOString(),
        requiresMfaSetup: true,
        tempToken: 'ch-1.opaque',
      });
      expect(challenges.issue).toHaveBeenCalledWith(USER_ID, 'setup');
      expect(authService.signInUser).not.toHaveBeenCalled();
    });

    it('opens no challenge while the account is locked by wrong codes', async () => {
      user = enrolledUser({
        mfa_failed_count: USER_MFA_FAILURE_LIMIT,
        mfa_locked_until: new Date(NOW.getTime() + 60_000),
      });

      await expectHttp(
        service.beginLogin({ ...account, mfaEnabled: true }, CTX),
        HttpStatus.TOO_MANY_REQUESTS,
        'mfa_locked',
      );
      expect(challenges.issue).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('issues tokens for a current authenticator code and remembers its time step', async () => {
      await expect(
        service.verify(
          { mfaToken: 'ch-1.opaque', method: 'totp', code: codeAt() },
          CTX,
        ),
      ).resolves.toEqual({ status: 'SUCCESS', ...signedIn });

      expect(challenges.load).toHaveBeenCalledWith(
        mgr,
        'ch-1.opaque',
        'verify',
      );
      expect(challenges.consume).toHaveBeenCalledWith(mgr, 'ch-1');
      expect(user!.totp_last_used_step).toBe(String(STEP));
      expect(authService.signInUser).toHaveBeenCalledWith(
        USER_ID,
        ['pwd', 'otp', 'mfa'],
        CTX,
      );
      expect(audits).toEqual([
        expect.objectContaining({
          action: 'mfa.verify_succeeded',
          entityId: USER_ID,
        }),
      ]);
    });

    it('clears the failure count once the right code arrives', async () => {
      user = enrolledUser({ mfa_failed_count: 3 });

      await service.verify(
        { mfaToken: 'ch-1.opaque', method: 'totp', code: codeAt() },
        CTX,
      );

      expect(user.mfa_failed_count).toBe(0);
      expect(user.mfa_locked_until).toBeNull();
    });

    it('re-encrypts a secret stored before encryption existed', async () => {
      user = enrolledUser({ totp_secret: SECRET });

      await service.verify(
        { mfaToken: 'ch-1.opaque', method: 'totp', code: codeAt() },
        CTX,
      );

      expect(user.totp_secret).toMatch(/^v1:/);
      expect(decryptSecret(user.totp_secret!, KEY)).toEqual({
        secret: SECRET,
        legacy: false,
      });
    });

    it('counts a wrong code on the challenge and the account without undoing either', async () => {
      await expectHttp(
        service.verify(
          { mfaToken: 'ch-1.opaque', method: 'totp', code: '000000' },
          CTX,
        ),
        HttpStatus.UNAUTHORIZED,
        'invalid_code',
        { attemptsRemaining: 4 },
      );
      expect(challenges.recordFailure).toHaveBeenCalledWith(mgr, 'ch-1');
      expect(user!.mfa_failed_count).toBe(1);
      expect(rolledBack).toBe(false);
      expect(challenges.consume).not.toHaveBeenCalled();
      expect(authService.signInUser).not.toHaveBeenCalled();
      expect(audits).toEqual([
        expect.objectContaining({ action: 'mfa.verify_failed' }),
      ]);
    });

    // Codex round 3: the account count lived in a cache read before the user row lock,
    // so concurrent attempts could all pass the check and lose increments. It is now
    // read and written under the row lock, after locking.
    it('reads and writes the account failure count only while holding the user row lock', async () => {
      await expectHttp(
        service.verify(
          { mfaToken: 'ch-1.opaque', method: 'totp', code: '000000' },
          CTX,
        ),
        HttpStatus.UNAUTHORIZED,
        'invalid_code',
      );

      const lock = executed.findIndex((sql) =>
        /FROM users\s+WHERE id = \$1\s+FOR UPDATE/.test(sql),
      );
      const write = executed.findIndex((sql) =>
        /UPDATE users SET mfa_failed_count = \$2/.test(sql),
      );
      expect(lock).toBeGreaterThanOrEqual(0);
      expect(write).toBeGreaterThan(lock);
      expect(
        (mgr.query.mock.calls as unknown[][]).some(([sql]) =>
          /UPDATE users SET mfa_failed_count = \$2/.test(String(sql)),
        ),
      ).toBe(true);
    });

    it('refuses a code that was already used, exactly like a wrong one', async () => {
      user = enrolledUser({ totp_last_used_step: String(STEP) });

      await expectHttp(
        service.verify(
          { mfaToken: 'ch-1.opaque', method: 'totp', code: codeAt() },
          CTX,
        ),
        HttpStatus.UNAUTHORIZED,
        'invalid_code',
      );
      expect(user.totp_last_used_step).toBe(String(STEP));
    });

    it('closes the challenge when its last attempt is wrong', async () => {
      challenges.recordFailure.mockResolvedValueOnce(0);

      await expectHttp(
        service.verify(
          { mfaToken: 'ch-1.opaque', method: 'totp', code: '000000' },
          CTX,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
        'mfa_attempts_exceeded',
      );
    });

    it('locks the account after too many wrong codes across challenges', async () => {
      user = enrolledUser({ mfa_failed_count: USER_MFA_FAILURE_LIMIT - 1 });

      await expectHttp(
        service.verify(
          { mfaToken: 'ch-1.opaque', method: 'totp', code: '000000' },
          CTX,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
        'mfa_locked',
      );
      expect(user.mfa_failed_count).toBe(USER_MFA_FAILURE_LIMIT);
      expect(user.mfa_locked_until).toEqual(
        new Date(NOW.getTime() + 15 * 60 * 1000),
      );
      expect(audits.map((a) => a.action)).toEqual([
        'mfa.verify_failed',
        'mfa.locked',
      ]);
      expect(rolledBack).toBe(false);

      // Even the right code is refused until the lock expires, on any challenge
      await expectHttp(
        service.verify(
          { mfaToken: 'ch-1.opaque', method: 'totp', code: codeAt() },
          CTX,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
        'mfa_locked',
      );
      expect(authService.signInUser).not.toHaveBeenCalled();
    });

    it('starts a fresh count once a lock has run out', async () => {
      user = enrolledUser({
        mfa_failed_count: USER_MFA_FAILURE_LIMIT,
        mfa_locked_until: new Date(NOW.getTime() - 1000),
      });

      await expectHttp(
        service.verify(
          { mfaToken: 'ch-1.opaque', method: 'totp', code: '000000' },
          CTX,
        ),
        HttpStatus.UNAUTHORIZED,
        'invalid_code',
      );
      expect(user.mfa_failed_count).toBe(1);
      expect(user.mfa_locked_until).toBeNull();
    });

    describe('with a recovery code', () => {
      const seedCodes = async (...codes: string[]) => {
        recoveryCodes = await Promise.all(
          codes.map(async (code, i) => ({
            id: `rc-${i}`,
            code_hash: await bcrypt.hash(code, 4),
            used_at: null,
          })),
        );
      };

      it('accepts a code however it is typed, uses it up and reports how many remain', async () => {
        await seedCodes('ABCDE-FGHJK', 'MNPQR-STVWX');

        await expect(
          service.verify(
            {
              mfaToken: 'ch-1.opaque',
              method: 'recovery_code',
              code: ' abcde fghjk ',
            },
            CTX,
          ),
        ).resolves.toEqual({
          status: 'SUCCESS',
          ...signedIn,
          recoveryCodesRemaining: 1,
        });

        expect(recoveryCodes[0].used_at).toEqual(NOW);
        expect(challenges.consume).toHaveBeenCalledWith(mgr, 'ch-1');
        expect(authService.signInUser).toHaveBeenCalledWith(
          USER_ID,
          ['pwd', 'recovery_code', 'mfa'],
          CTX,
        );
        expect(audits).toEqual([
          expect.objectContaining({
            action: 'mfa.verify_succeeded',
            details: expect.objectContaining({
              method: 'recovery_code',
            }) as unknown,
          }),
        ]);
      });

      it('refuses a code another request used first', async () => {
        await seedCodes('ABCDE-FGHJK');
        stealRecoveryCode = true;

        await expectHttp(
          service.verify(
            {
              mfaToken: 'ch-1.opaque',
              method: 'recovery_code',
              code: 'ABCDE-FGHJK',
            },
            CTX,
          ),
          HttpStatus.UNAUTHORIZED,
          'invalid_code',
        );
        expect(authService.signInUser).not.toHaveBeenCalled();
      });

      it('never compares input that cannot be a recovery code', async () => {
        await seedCodes('ABCDE-FGHJK');

        await expectHttp(
          service.verify(
            {
              mfaToken: 'ch-1.opaque',
              method: 'recovery_code',
              code: 'not a code!',
            },
            CTX,
          ),
          HttpStatus.UNAUTHORIZED,
          'invalid_code',
        );
        expect(
          executed.some((sql) => /FROM mfa_recovery_codes/.test(sql)),
        ).toBe(false);
      });
    });

    it('invalidates a challenge whose account no longer has MFA', async () => {
      user = enrolledUser({ mfa_enabled: false, totp_secret: null });

      await expectHttp(
        service.verify(
          { mfaToken: 'ch-1.opaque', method: 'totp', code: codeAt() },
          CTX,
        ),
        HttpStatus.UNAUTHORIZED,
        'mfa_token_invalid',
      );
      expect(challenges.consume).toHaveBeenCalledWith(mgr, 'ch-1');
      expect(rolledBack).toBe(false);
      expect(authService.signInUser).not.toHaveBeenCalled();
    });
  });

  describe('enrolment during sign-in', () => {
    beforeEach(() => {
      user = enrolledUser({
        mfa_enabled: false,
        totp_secret: null,
        mfa_setup_at: null,
      });
    });

    it('generates a secret, keeps it encrypted on the challenge and returns the QR payload', async () => {
      challenges.load.mockResolvedValueOnce(openChallenge());

      const started = await service.startEnrollment('ch-1.opaque');

      expect(challenges.load).toHaveBeenCalledWith(mgr, 'ch-1.opaque', 'setup');
      const [, id, stored] = challenges.setPendingSecret.mock.calls[0] as [
        unknown,
        string,
        string,
      ];
      expect(id).toBe('ch-1');
      expect(decryptSecret(stored, KEY).secret).toBe(started.secret);
      expect(started).toEqual({
        mfaToken: 'ch-1.opaque',
        secret: expect.stringMatching(/^[A-Z2-7]{16,}$/) as unknown,
        otpauthUri: expect.stringMatching(
          /^otpauth:\/\/totp\/MMS:ca_ward_01\?/,
        ) as unknown,
        qrUri: started.otpauthUri,
        expiresAt: EXPIRES.toISOString(),
      });
      expect(started.otpauthUri).toContain(`secret=${started.secret}`);
      expect(user!.totp_secret).toBeNull();
    });

    it('refuses to enrol an account that already has MFA', async () => {
      user = enrolledUser();

      await expectHttp(
        service.startEnrollment('ch-1.opaque'),
        HttpStatus.CONFLICT,
        'mfa_already_enabled',
      );
      expect(challenges.setPendingSecret).not.toHaveBeenCalled();
    });

    it('enables MFA on the first valid code, hands out recovery codes and signs in', async () => {
      challenges.load.mockResolvedValueOnce(
        openChallenge({ pendingSecret: encryptSecret(SECRET, KEY) }),
      );

      const result = await service.confirmEnrollment(
        { mfaToken: 'ch-1.opaque', code: codeAt() },
        {},
        CTX,
      );

      expect(result).toEqual({
        status: 'SUCCESS',
        ...signedIn,
        recoveryCodes: expect.any(Array) as unknown,
      });
      const codes = (result as { recoveryCodes: string[] }).recoveryCodes;
      expect(codes).toHaveLength(10);
      codes.forEach((c) => expect(c).toMatch(RECOVERY_CODE));
      expect(recoveryCodes).toHaveLength(10);
      await expect(
        bcrypt.compare(codes[0], recoveryCodes[0].code_hash),
      ).resolves.toBe(true);

      expect(user).toEqual(
        expect.objectContaining({
          mfa_enabled: true,
          totp_last_used_step: String(STEP),
        }),
      );
      expect(decryptSecret(user!.totp_secret!, KEY).secret).toBe(SECRET);
      expect(challenges.consume).toHaveBeenCalledWith(mgr, 'ch-1');
      expect(authService.signInUser).toHaveBeenCalledWith(
        USER_ID,
        ['pwd', 'otp', 'mfa'],
        CTX,
      );
      expect(audits).toEqual([
        expect.objectContaining({ action: 'mfa.enrolled' }),
      ]);
    });

    // Codex round 3: password-only sessions outlived enrolment
    it('ends every earlier session of the account before signing in with MFA', async () => {
      challenges.load.mockResolvedValueOnce(
        openChallenge({ pendingSecret: encryptSecret(SECRET, KEY) }),
      );

      await service.confirmEnrollment(
        { mfaToken: 'ch-1.opaque', code: codeAt() },
        {},
        CTX,
      );

      expect(authState.invalidateUser).toHaveBeenCalledWith(mgr, USER_ID);
      expect(authState.invalidateUser.mock.invocationCallOrder[0]).toBeLessThan(
        authService.signInUser.mock.invocationCallOrder[0],
      );
    });

    it('asks for the QR code step before a code can be confirmed', async () => {
      challenges.load.mockResolvedValueOnce(openChallenge());

      await expectHttp(
        service.confirmEnrollment(
          { mfaToken: 'ch-1.opaque', code: codeAt() },
          {},
          CTX,
        ),
        HttpStatus.CONFLICT,
        'mfa_setup_not_started',
      );
    });

    it('counts a wrong enrolment code and leaves the account unchanged', async () => {
      challenges.load.mockResolvedValueOnce(
        openChallenge({ pendingSecret: encryptSecret(SECRET, KEY) }),
      );

      await expectHttp(
        service.confirmEnrollment(
          { mfaToken: 'ch-1.opaque', code: '000000' },
          {},
          CTX,
        ),
        HttpStatus.UNAUTHORIZED,
        'invalid_code',
        { attemptsRemaining: 4 },
      );
      expect(rolledBack).toBe(false);
      expect(user!.mfa_enabled).toBe(false);
      expect(user!.mfa_failed_count).toBe(1);
      expect(recoveryCodes).toHaveLength(0);
      expect(authState.invalidateUser).not.toHaveBeenCalled();
    });
  });

  describe('enrolment from a signed-in session', () => {
    beforeEach(() => {
      user = enrolledUser({
        mfa_enabled: false,
        totp_secret: null,
        mfa_setup_at: null,
      });
    });

    it('opens a setup challenge carrying the new secret', async () => {
      const started = await service.setup(USER_ID);

      const [userId, purpose, options] = challenges.issue.mock.calls[0] as [
        string,
        string,
        { pendingSecret: string },
      ];
      expect([userId, purpose]).toEqual([USER_ID, 'setup']);
      expect(decryptSecret(options.pendingSecret, KEY).secret).toBe(
        started.secret,
      );
      expect(started).toEqual(
        expect.objectContaining({
          mfaToken: 'ch-1.opaque',
          expiresAt: EXPIRES.toISOString(),
        }),
      );
    });

    it('never lets an access token replace the secret of an enrolled account', async () => {
      user = enrolledUser();

      await expectHttp(
        service.setup(USER_ID),
        HttpStatus.CONFLICT,
        'mfa_already_enabled',
      );
      expect(challenges.issue).not.toHaveBeenCalled();
    });

    // The caller's own session was opened without MFA and ends with the others, so it
    // receives a fresh MFA session along with the recovery codes
    it('replaces every session, the caller included, with a fresh MFA session', async () => {
      challenges.load.mockResolvedValueOnce(
        openChallenge({ pendingSecret: encryptSecret(SECRET, KEY) }),
      );

      const result = await service.confirmEnrollment(
        { mfaToken: 'ch-1.opaque', code: codeAt() },
        { userId: USER_ID },
        CTX,
      );

      expect(result).toEqual({
        recoveryCodes: expect.any(Array) as unknown,
        ...signedIn,
      });
      expect(result).not.toHaveProperty('status');
      expect(authState.invalidateUser).toHaveBeenCalledWith(mgr, USER_ID);
      expect(authService.signInUser).toHaveBeenCalledWith(
        USER_ID,
        ['pwd', 'otp', 'mfa'],
        CTX,
      );
    });

    it("refuses another user's setup challenge", async () => {
      challenges.load.mockResolvedValueOnce(
        openChallenge({
          userId: ADMIN_ID,
          pendingSecret: encryptSecret(SECRET, KEY),
        }),
      );

      await expectHttp(
        service.confirmEnrollment(
          { mfaToken: 'ch-1.opaque', code: codeAt() },
          { userId: USER_ID },
          CTX,
        ),
        HttpStatus.UNAUTHORIZED,
        'mfa_token_invalid',
      );
    });
  });

  describe('status', () => {
    it('reports enrolment, the role requirement and the recovery codes left', async () => {
      roleRequiresMfa = true;
      recoveryCodes = [
        { id: 'a', code_hash: 'x', used_at: null },
        { id: 'b', code_hash: 'y', used_at: NOW },
      ];

      await expect(service.status(USER_ID)).resolves.toEqual({
        enabled: true,
        enrolledAt: '2026-09-01T00:00:00.000Z',
        required: true,
        recoveryCodesRemaining: 1,
      });
    });
  });

  describe('regenerateRecoveryCodes', () => {
    it('replaces every recovery code after a valid authenticator code', async () => {
      recoveryCodes = [{ id: 'old', code_hash: 'old', used_at: null }];

      const { recoveryCodes: codes } = await service.regenerateRecoveryCodes(
        USER_ID,
        codeAt(),
        CTX,
      );

      expect(codes).toHaveLength(10);
      expect(recoveryCodes.map((c) => c.id)).not.toContain('old');
      expect(user!.totp_last_used_step).toBe(String(STEP));
      expect(audits).toEqual([
        expect.objectContaining({ action: 'mfa.recovery_codes_regenerated' }),
      ]);
    });

    it('keeps the old codes when the authenticator code is wrong, and counts the failure', async () => {
      recoveryCodes = [{ id: 'old', code_hash: 'old', used_at: null }];

      await expectHttp(
        service.regenerateRecoveryCodes(USER_ID, '000000', CTX),
        HttpStatus.UNAUTHORIZED,
        'invalid_code',
      );
      expect(recoveryCodes.map((c) => c.id)).toEqual(['old']);
      expect(user!.mfa_failed_count).toBe(1);
      expect(rolledBack).toBe(false);
    });

    it('is refused while the account is locked', async () => {
      user = enrolledUser({
        mfa_locked_until: new Date(NOW.getTime() + 60_000),
      });

      await expectHttp(
        service.regenerateRecoveryCodes(USER_ID, codeAt(), CTX),
        HttpStatus.TOO_MANY_REQUESTS,
        'mfa_locked',
      );
    });

    it('needs MFA to be enabled first', async () => {
      user = enrolledUser({ mfa_enabled: false, totp_secret: null });

      await expectHttp(
        service.regenerateRecoveryCodes(USER_ID, codeAt(), CTX),
        HttpStatus.CONFLICT,
        'mfa_not_enabled',
      );
    });
  });

  describe('disable', () => {
    it('removes the factor, its recovery codes and any open challenge', async () => {
      recoveryCodes = [{ id: 'a', code_hash: 'x', used_at: null }];

      await service.disable(USER_ID, { method: 'totp', code: codeAt() }, CTX);

      expect(user).toEqual(
        expect.objectContaining({ mfa_enabled: false, totp_secret: null }),
      );
      expect(recoveryCodes).toHaveLength(0);
      expect(challenges.revokeOpen).toHaveBeenCalledWith(mgr, USER_ID);
      expect(audits).toEqual([
        expect.objectContaining({ action: 'mfa.disabled' }),
      ]);
    });

    // As for enrolment: sessions, tokens and challenges opened while the account had MFA
    // end with the factor, and the caller continues in a new session
    const disabledWith: [MfaMethod, () => string, string[]][] = [
      ['totp', () => codeAt(), ['pwd', 'otp', 'mfa']],
      ['recovery_code', () => 'ABCDE-FGHJK', ['pwd', 'recovery_code', 'mfa']],
    ];
    it.each(disabledWith)(
      'ends every session of the account and answers a new one for the caller (%s)',
      async (method, code, amr) => {
        recoveryCodes = [
          {
            id: 'a',
            code_hash: await bcrypt.hash('ABCDE-FGHJK', 4),
            used_at: null,
          },
        ];

        await expect(
          service.disable(USER_ID, { method, code: code() }, CTX),
        ).resolves.toBe(signedIn);

        expect(authState.invalidateUser).toHaveBeenCalledWith(mgr, USER_ID);
        expect(authService.signInUser).toHaveBeenCalledWith(USER_ID, amr, CTX);
        // The new session is opened once the old ones are committed as ended
        expect(
          authService.signInUser.mock.invocationCallOrder[0],
        ).toBeGreaterThan(authState.invalidateUser.mock.invocationCallOrder[0]);
      },
    );

    it('keeps every session when the code is refused', async () => {
      await expectHttp(
        service.disable(USER_ID, { method: 'totp', code: '000000' }, CTX),
        HttpStatus.UNAUTHORIZED,
        'invalid_code',
      );
      expect(authState.invalidateUser).not.toHaveBeenCalled();
      expect(authService.signInUser).not.toHaveBeenCalled();
    });

    it('is refused while a role of the account requires MFA', async () => {
      roleRequiresMfa = true;

      await expectHttp(
        service.disable(USER_ID, { method: 'totp', code: codeAt() }, CTX),
        HttpStatus.FORBIDDEN,
        'mfa_required_by_role',
      );
      expect(user!.mfa_enabled).toBe(true);
    });

    it('is refused without a valid code, which counts as a failure', async () => {
      await expectHttp(
        service.disable(USER_ID, { method: 'totp', code: '000000' }, CTX),
        HttpStatus.UNAUTHORIZED,
        'invalid_code',
      );
      expect(user!.mfa_enabled).toBe(true);
      expect(user!.mfa_failed_count).toBe(1);
    });
  });

  describe('adminReset', () => {
    it('clears the factor and ends every session, token and challenge of the account', async () => {
      recoveryCodes = [{ id: 'a', code_hash: 'x', used_at: null }];

      await service.adminReset(ADMIN_ID, USER_ID, CTX);

      expect(user).toEqual(
        expect.objectContaining({ mfa_enabled: false, totp_secret: null }),
      );
      expect(recoveryCodes).toHaveLength(0);
      expect(authState.invalidateUser).toHaveBeenCalledWith(mgr, USER_ID);
      expect(audits).toEqual([
        expect.objectContaining({
          actorId: ADMIN_ID,
          action: 'mfa.reset',
          entityId: USER_ID,
        }),
      ]);
    });

    it('clears a lock left by wrong codes', async () => {
      user = enrolledUser({
        mfa_failed_count: USER_MFA_FAILURE_LIMIT,
        mfa_locked_until: new Date(NOW.getTime() + 60_000),
      });

      await service.adminReset(ADMIN_ID, USER_ID, CTX);

      expect(user.mfa_failed_count).toBe(0);
      expect(user.mfa_locked_until).toBeNull();
    });

    it('answers 404 for an unknown account', async () => {
      user = null;

      await expectHttp(
        service.adminReset(ADMIN_ID, USER_ID, CTX),
        HttpStatus.NOT_FOUND,
        'user_not_found',
      );
    });

    it('does not let an administrator reset their own second factor', async () => {
      await expectHttp(
        service.adminReset(USER_ID, USER_ID, CTX),
        HttpStatus.FORBIDDEN,
        'cannot_reset_own_mfa',
      );
      expect(user!.mfa_enabled).toBe(true);
    });
  });
});
