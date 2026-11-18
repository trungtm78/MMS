// HTTP surface of the second factor: which routes are public (driven by an mfaToken from
// the login response), which need a signed-in session, and what input they accept
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../../common/guards/roles.guard';
import { MFA_THROTTLE } from '../auth-throttle';
import {
  MfaAdminController,
  MfaCodeDto,
  MfaConfirmDto,
  MfaController,
  MfaDisableDto,
  MfaLoginDto,
  MfaTokenDto,
  MfaVerifyDto,
} from './mfa.controller';

const mfa = {
  verify: jest.fn(),
  startEnrollment: jest.fn(),
  confirmEnrollment: jest.fn(),
  setup: jest.fn(),
  status: jest.fn(),
  regenerateRecoveryCodes: jest.fn(),
  disable: jest.fn(),
  adminReset: jest.fn(),
};

const CTX = { ip: '10.0.0.7', userAgent: 'jest' };
const anonymous = { ip: '10.0.0.7', headers: { 'user-agent': 'jest' } };
const signedIn = {
  ...anonymous,
  user: { sub: 'user-1', username: 'u', role: 'dqtv', unitScope: null },
};
const TARGET = '33333333-3333-4333-8333-333333333333';

type Handler = (...args: unknown[]) => unknown;
const handlerOf = (proto: object, name: string) =>
  (proto as Record<string, Handler>)[name];

async function errorsOf<T extends object>(
  dto: new () => T,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property);
}

describe('MfaController', () => {
  const controller = new MfaController(mfa as never);

  beforeEach(() => {
    jest.resetAllMocks();
    Object.values(mfa).forEach((fn) => fn.mockResolvedValue({ ok: true }));
  });

  it('verifies a code against the challenge from the login response', async () => {
    const dto = { mfaToken: 't', method: 'totp' as const, code: '123456' };

    await expect(controller.verify(dto, anonymous)).resolves.toEqual({
      ok: true,
    });
    expect(mfa.verify).toHaveBeenCalledWith(dto, CTX);
  });

  it('keeps the old /auth/mfa/login body working as an authenticator-code verification', async () => {
    await controller.legacyLogin({ tempToken: 't', otp: '123456' }, anonymous);

    expect(mfa.verify).toHaveBeenCalledWith(
      { mfaToken: 't', method: 'totp', code: '123456' },
      CTX,
    );
  });

  it('starts and confirms enrolment during sign-in', async () => {
    await controller.enroll({ mfaToken: 't' });
    await controller.confirmEnrollment(
      { mfaToken: 't', code: '123456' },
      anonymous,
    );

    expect(mfa.startEnrollment).toHaveBeenCalledWith('t');
    expect(mfa.confirmEnrollment).toHaveBeenCalledWith(
      { mfaToken: 't', code: '123456' },
      {},
      CTX,
    );
  });

  it('enrols the signed-in user', async () => {
    await controller.setup(signedIn);
    await controller.confirm({ mfaToken: 't', code: '123456' }, signedIn);

    expect(mfa.setup).toHaveBeenCalledWith('user-1');
    expect(mfa.confirmEnrollment).toHaveBeenCalledWith(
      { mfaToken: 't', code: '123456' },
      { userId: 'user-1' },
      CTX,
    );
  });

  it('manages the factor of the signed-in user only', async () => {
    await controller.status(signedIn);
    await controller.regenerateRecoveryCodes({ code: '123456' }, signedIn);
    await expect(
      controller.disable(
        { method: 'recovery_code', code: 'ABCDE-FGHJK' },
        signedIn,
      ),
    ).resolves.toBeUndefined();

    expect(mfa.status).toHaveBeenCalledWith('user-1');
    expect(mfa.regenerateRecoveryCodes).toHaveBeenCalledWith(
      'user-1',
      '123456',
      CTX,
    );
    expect(mfa.disable).toHaveBeenCalledWith(
      'user-1',
      { method: 'recovery_code', code: 'ABCDE-FGHJK' },
      CTX,
    );
  });

  describe('routes', () => {
    it('lives under /auth/mfa', () => {
      expect(Reflect.getMetadata(PATH_METADATA, MfaController)).toBe(
        'auth/mfa',
      );
    });

    it.each([
      ['verify', RequestMethod.POST, 'verify', false, 200],
      ['legacyLogin', RequestMethod.POST, 'login', false, 200],
      ['enroll', RequestMethod.POST, 'enroll', false, 200],
      ['confirmEnrollment', RequestMethod.POST, 'enroll/confirm', false, 200],
      ['setup', RequestMethod.POST, 'setup', true, 200],
      ['confirm', RequestMethod.POST, 'confirm', true, 200],
      ['status', RequestMethod.GET, 'status', true, undefined],
      [
        'regenerateRecoveryCodes',
        RequestMethod.POST,
        'recovery-codes/regenerate',
        true,
        200,
      ],
      ['disable', RequestMethod.POST, 'disable', true, 204],
    ] as const)('%s: %s %s', (name, method, path, signedInOnly, httpCode) => {
      const handler = handlerOf(MfaController.prototype, name);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(httpCode);
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ??
        []) as unknown[];
      expect(guards.includes(JwtAuthGuard)).toBe(signedInOnly);
    });

    // Codes are six digits: without a tight per-client limit they could be enumerated
    it.each([
      'verify',
      'legacyLogin',
      'enroll',
      'confirmEnrollment',
      'confirm',
      'regenerateRecoveryCodes',
      'disable',
    ])('%s is rate limited as an MFA route', (name) => {
      const handler = handlerOf(MfaController.prototype, name);
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(
        MFA_THROTTLE.default.limit,
      );
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(
        MFA_THROTTLE.default.ttl,
      );
    });
  });

  describe('input', () => {
    it('accepts a well-formed verification', async () => {
      await expect(
        errorsOf(MfaVerifyDto, {
          mfaToken: 't.s',
          method: 'recovery_code',
          code: 'ABCDE-FGHJK',
        }),
      ).resolves.toEqual([]);
    });

    it.each([
      [
        'an unknown method',
        { mfaToken: 't', method: 'sms', code: '123456' },
        ['method'],
      ],
      ['an empty code', { mfaToken: 't', method: 'totp', code: '' }, ['code']],
      [
        'an oversized code',
        { mfaToken: 't', method: 'totp', code: '1'.repeat(65) },
        ['code'],
      ],
      ['a missing token', { method: 'totp', code: '123456' }, ['mfaToken']],
      [
        'an oversized token',
        { mfaToken: 'x'.repeat(129), method: 'totp', code: '1' },
        ['mfaToken'],
      ],
    ])('rejects %s', async (_label, body, properties) => {
      await expect(errorsOf(MfaVerifyDto, body)).resolves.toEqual(properties);
    });

    it('validates the other bodies', async () => {
      await expect(errorsOf(MfaLoginDto, { tempToken: 't' })).resolves.toEqual([
        'otp',
      ]);
      await expect(errorsOf(MfaTokenDto, {})).resolves.toEqual(['mfaToken']);
      await expect(errorsOf(MfaConfirmDto, { mfaToken: 't' })).resolves.toEqual(
        ['code'],
      );
      await expect(errorsOf(MfaCodeDto, { code: 5 })).resolves.toEqual([
        'code',
      ]);
      await expect(
        errorsOf(MfaDisableDto, { code: '123456' }),
      ).resolves.toEqual(['method']);
    });
  });
});

describe('MfaAdminController', () => {
  const controller = new MfaAdminController(mfa as never);

  it('resets the factor of another account for a system administrator', async () => {
    mfa.adminReset.mockResolvedValueOnce(undefined);

    await expect(controller.reset(TARGET, signedIn)).resolves.toBeUndefined();
    expect(mfa.adminReset).toHaveBeenCalledWith('user-1', TARGET, CTX);
  });

  it('is POST /admin/users/:id/mfa/reset for system_admin only', () => {
    const handler = handlerOf(MfaAdminController.prototype, 'reset');
    expect(Reflect.getMetadata(PATH_METADATA, MfaAdminController)).toBe(
      'admin/users',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id/mfa/reset');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(204);
    expect(Reflect.getMetadata(GUARDS_METADATA, MfaAdminController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(
      Reflect.getMetadata(ROLES_KEY, handler) ??
        Reflect.getMetadata(ROLES_KEY, MfaAdminController),
    ).toEqual(['system_admin']);
  });
});
