// Phase 2: Unit tests for AuthService
// US-W001: AC-1 (login), BR-AUTH-02 (lockout slots via LoginAttemptsService), AC-3 (refresh), AC-5 (logout)
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { AuthStateService } from './auth-state.service';
import { LoginAttemptsService } from './login-attempts.service';
import { User } from '../database/entities/user.entity';
import { Session } from '../database/entities/refresh-token.entity';

const PW = 'Police@123';
const PW_HASH = bcrypt.hashSync(PW, 10); // synchronous for test setup

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const makeRawRow = (overrides: Partial<Record<string, string>> = {}) => ({
  id: 'test-uuid-001',
  username: 'caphuong',
  password_hash: PW_HASH,
  full_name: 'Phạm Minh Tuấn',
  email: null,
  phone: null,
  avatar_url: null,
  status: 'active',
  last_login_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const tokenUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-uuid-001',
  username: 'caphuong',
  passwordHash: PW_HASH,
  fullName: 'Test',
  email: null,
  phone: null,
  avatarUrl: null,
  status: 'active' as const,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  role: 'police_ward' as const,
  unitScope: null,
  ...overrides,
});

describe('AuthService', () => {
  let service: AuthService;
  let jwtSign: jest.Mock;
  let jwtVerify: jest.Mock;

  const mockUserRepo = {
    findOneOrFail: jest.fn(),
  };

  const mockSessionRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockManager = { query: jest.fn() };
  const mockDataSource = {
    query: jest.fn(),
    transaction: jest.fn(),
  };

  const mockAuthState = {
    invalidateUser: jest.fn(),
    isAccessValid: jest.fn(),
  };

  // Sign-in attempt slots; counting and locking are covered by LoginAttemptsService's spec
  const mockAttempt = {
    failed: jest.fn(),
    passed: jest.fn(),
    release: jest.fn(),
  };
  const mockLoginAttempts = {
    begin: jest.fn(),
    clear: jest.fn(),
  };

  // Payloads signed so far, by token kind
  const signed = (kind: 'access' | 'refresh') =>
    (jwtSign.mock.calls as unknown[][])
      .map((call) => call[0] as Record<string, unknown>)
      .filter((payload) => (payload.typ ?? payload.type) === kind);

  const callsWith = (mock: jest.Mock, pattern: RegExp) =>
    (mock.mock.calls as unknown[][]).filter(([sql]) =>
      pattern.test(String(sql)),
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    mockLoginAttempts.begin.mockResolvedValue(mockAttempt);

    mockSessionRepo.createQueryBuilder.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    });
    mockDataSource.transaction.mockImplementation(
      (work: (mgr: typeof mockManager) => unknown) => work(mockManager),
    );
    mockAuthState.invalidateUser.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const cfg: Record<string, unknown> = {
                'jwt.secret': 'test-secret',
                'jwt.accessExpiresIn': '15m',
                'jwt.refreshSecret': 'test-refresh-secret',
                'jwt.refreshExpiresIn': '7d',
              };
              return cfg[key];
            }),
          },
        },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Session), useValue: mockSessionRepo },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: LoginAttemptsService, useValue: mockLoginAttempts },
        { provide: AuthStateService, useValue: mockAuthState },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    const jwt = module.get<{ sign: jest.Mock; verify: jest.Mock }>(JwtService);
    jwtSign = jwt.sign;
    jwtVerify = jwt.verify;
    // Distinct tokens, so hashes and payloads can be told apart
    jwtSign.mockImplementation((payload: Record<string, unknown>) =>
      payload.type === 'refresh'
        ? `refresh.token.${String(payload.sid)}`
        : 'access.token',
    );
  });

  describe('validateUser', () => {
    test('test_us001_happy_valid_credentials_returns_user_with_role', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([makeRawRow()]) // user lookup
        .mockResolvedValueOnce([{ code: 'police_ward' }]) // role
        .mockResolvedValueOnce([]); // unit scope

      const result = await service.validateUser('caphuong', PW);
      expect(result.username).toBe('caphuong');
      expect(result.role).toBe('police_ward');
    });

    test('test_us001_validation_user_not_found_throws_unauthorized', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.validateUser('nonexistent', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    test('test_us001_validation_wrong_password_throws_unauthorized', async () => {
      mockDataSource.query.mockResolvedValueOnce([makeRawRow()]);
      await expect(
        service.validateUser('caphuong', 'WrongPass'),
      ).rejects.toThrow(UnauthorizedException);
    });

    test('test_us001_validation_inactive_account_throws_forbidden', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        makeRawRow({ status: 'inactive' }),
      ]);
      await expect(service.validateUser('caphuong', PW)).rejects.toThrow(
        ForbiddenException,
      );
    });

    // Account state is revealed only to someone who knows the password; otherwise a
    // disabled username would be distinguishable from a wrong password
    test('answers invalid_credentials for a disabled account with a wrong password', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        makeRawRow({ status: 'suspended' }),
      ]);

      await expect(
        service.validateUser('caphuong', 'WrongPass'),
      ).rejects.toThrow(new UnauthorizedException('invalid_credentials'));
    });

    test('answers account_disabled only once the password is right', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        makeRawRow({ status: 'suspended' }),
      ]);

      await expect(service.validateUser('caphuong', PW)).rejects.toThrow(
        new ForbiddenException('account_disabled'),
      );
    });

    // BR-AUTH-02: every attempt takes a slot before its password is checked
    test('refuses a locked name before looking the account up', async () => {
      mockLoginAttempts.begin.mockRejectedValueOnce(
        new ForbiddenException('account_locked'),
      );

      await expect(service.validateUser('caphuong', PW)).rejects.toThrow(
        new ForbiddenException('account_locked'),
      );
      expect(mockLoginAttempts.begin).toHaveBeenCalledWith('caphuong');
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    // Codex round 3: only existing accounts counted failures, so a lock revealed which
    // usernames exist. Every submitted name counts.
    test('counts an unknown name as a failure, so a lock reveals nothing', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // no such user

      await expect(
        service.validateUser('No_Such_User', 'whatever'),
      ).rejects.toThrow(new UnauthorizedException('invalid_credentials'));
      expect(mockLoginAttempts.begin).toHaveBeenCalledWith('No_Such_User');
      expect(mockAttempt.failed).toHaveBeenCalledTimes(1);
      expect(mockAttempt.passed).not.toHaveBeenCalled();
    });

    test('counts a wrong password as a failure, whatever the account state', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        makeRawRow({ status: 'suspended' }),
      ]);

      await expect(
        service.validateUser('caphuong', 'WrongPass'),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAttempt.failed).toHaveBeenCalledTimes(1);
      expect(mockAttempt.passed).not.toHaveBeenCalled();
    });

    test('does not count the right password of a disabled account', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        makeRawRow({ status: 'suspended' }),
      ]);

      await expect(service.validateUser('caphuong', PW)).rejects.toThrow(
        new ForbiddenException('account_disabled'),
      );
      expect(mockAttempt.passed).toHaveBeenCalledTimes(1);
      expect(mockAttempt.failed).not.toHaveBeenCalled();
    });

    test('frees the slot of an attempt an unexpected error ended, without counting it', async () => {
      mockDataSource.query.mockRejectedValueOnce(new Error('connection lost'));

      await expect(service.validateUser('caphuong', PW)).rejects.toThrow(
        'connection lost',
      );
      expect(mockAttempt.release).toHaveBeenCalledTimes(1);
      expect(mockAttempt.failed).not.toHaveBeenCalled();
      expect(mockAttempt.passed).not.toHaveBeenCalled();
    });
  });

  // Earlier failures must survive a correct password: an account with MFA is not signed
  // in until its second factor is also right
  test('keeps earlier failures when only the password was right', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([makeRawRow()])
      .mockResolvedValueOnce([{ code: 'police_ward' }])
      .mockResolvedValueOnce([]);

    await service.validateUser('caphuong', PW);

    expect(mockAttempt.passed).toHaveBeenCalledTimes(1);
    expect(mockAttempt.failed).not.toHaveBeenCalled();
    expect(mockLoginAttempts.clear).not.toHaveBeenCalled();
  });

  // The single place a sign-in (password alone or with a second factor) ends in tokens
  describe('signInUser', () => {
    const account = {
      id: 'test-uuid-001',
      username: 'caphuong',
      fullName: 'Phạm Minh Tuấn',
      status: 'active',
    };

    beforeEach(() => {
      mockDataSource.query.mockImplementation((sql: string) =>
        Promise.resolve(
          /FROM user_roles/.test(sql)
            ? [{ code: 'police_ward' }]
            : /INSERT INTO sessions/.test(sql)
              ? [{ auth_version: '0' }]
              : [],
        ),
      );
    });

    test('issues access tokens that say how the user authenticated', async () => {
      mockUserRepo.findOneOrFail.mockResolvedValue(account);

      const session = await service.signInUser(
        'test-uuid-001',
        ['pwd', 'otp', 'mfa'],
        { ip: '10.0.0.7', userAgent: 'jest' },
      );

      expect(session.tokens).toEqual(
        expect.objectContaining({ accessToken: 'access.token' }),
      );
      expect(session.user).toEqual(
        expect.objectContaining({ username: 'caphuong', role: 'police_ward' }),
      );
      expect(signed('access')[0]).toEqual(
        expect.objectContaining({
          sub: 'test-uuid-001',
          typ: 'access',
          amr: ['pwd', 'otp', 'mfa'],
        }),
      );
      const [[, insertParams]] = callsWith(
        mockDataSource.query,
        /INSERT INTO sessions/,
      ) as [string, unknown[]][];
      expect(insertParams).toEqual(
        expect.arrayContaining(['10.0.0.7', 'jest']),
      );
      expect(mockLoginAttempts.clear).toHaveBeenCalledWith('caphuong');
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE users SET last_login_at = now\(\)/),
        ['test-uuid-001'],
      );
    });

    test('refuses an account disabled since the password was checked', async () => {
      mockUserRepo.findOneOrFail.mockResolvedValue({
        ...account,
        status: 'suspended',
      });

      await expect(
        service.signInUser('test-uuid-001', ['pwd']),
      ).rejects.toThrow(new ForbiddenException('account_disabled'));
      expect(jwtSign).not.toHaveBeenCalled();
    });
  });

  describe('issueTokens', () => {
    beforeEach(() => {
      mockDataSource.query.mockImplementation((sql: string) =>
        Promise.resolve(
          /INSERT INTO sessions/.test(sql) ? [{ auth_version: '7' }] : [],
        ),
      );
    });

    // Codex round 3: tokens named no session and no account version, so nothing could
    // refuse them after the account changed
    test('stores the session with how the user authenticated and names it in both tokens', async () => {
      const result = await service.issueTokens(
        tokenUser(),
        '10.0.0.7',
        'jest',
        ['pwd', 'otp', 'mfa'],
      );

      const [[sql, params]] = callsWith(
        mockDataSource.query,
        /INSERT INTO sessions/,
      ) as [string, unknown[]][];
      expect(sql).toMatch(
        /INSERT INTO sessions \(id, user_id, refresh_token_hash, expires_at, ip, user_agent, amr, auth_version\)[\s\S]*SELECT \$1, u\.id, \$3, \$4, \$5, \$6, \$7::text\[\], u\.auth_version[\s\S]*FROM users u[\s\S]*WHERE u\.id = \$2[\s\S]*RETURNING auth_version/,
      );
      const [sid, userId, hash, expiresAt, ip, userAgent, amr] = params;
      expect(sid).toMatch(UUID);
      expect([userId, ip, userAgent, amr]).toEqual([
        'test-uuid-001',
        '10.0.0.7',
        'jest',
        ['pwd', 'otp', 'mfa'],
      ]);
      expect(expiresAt).toBeInstanceOf(Date);

      expect(signed('refresh')[0]).toEqual(
        expect.objectContaining({ sub: 'test-uuid-001', type: 'refresh', sid }),
      );
      expect(signed('access')[0]).toEqual(
        expect.objectContaining({
          sub: 'test-uuid-001',
          typ: 'access',
          sid,
          ver: 7,
          amr: ['pwd', 'otp', 'mfa'],
        }),
      );
      expect(hash).toBe(sha256(result.refreshToken));
      expect(result).toEqual({
        accessToken: 'access.token',
        refreshToken: `refresh.token.${String(sid)}`,
        expiresIn: 900,
      });
    });

    // bcrypt reads only the first 72 bytes, which every refresh JWT of a user shares
    test('binds the refresh token with a hash of all of it', async () => {
      await service.issueTokens(tokenUser());

      const [[, params]] = callsWith(
        mockDataSource.query,
        /INSERT INTO sessions/,
      ) as [string, unknown[]][];
      expect(params[2]).toMatch(/^[0-9a-f]{64}$/);
    });

    test('signs every assigned role', async () => {
      await service.issueTokens(
        tokenUser({ roles: ['police_ward', 'ubnd_leader'] }) as never,
      );

      expect(signed('access')[0]).toEqual(
        expect.objectContaining({
          role: 'police_ward',
          roles: ['police_ward', 'ubnd_leader'],
        }),
      );
    });

    test('opens no session for an account that no longer exists', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await expect(service.issueTokens(tokenUser())).rejects.toThrow(
        new UnauthorizedException('account_not_found'),
      );
      expect(signed('access')).toHaveLength(0);
    });
  });

  // US-W001 AC-3: silent refresh, rotating the session under a row lock
  describe('refreshTokens', () => {
    const USER = '11111111-1111-4111-8111-111111111111';
    const SID = '5d0c7a3e-9f1b-4c2d-8e6f-1a2b3c4d5e6f';
    const REFRESH = 'presented.refresh.token';

    const sessionState = (overrides: Record<string, unknown> = {}) => ({
      id: SID,
      user_id: USER,
      refresh_token_hash: sha256(REFRESH),
      expires_at: new Date(Date.now() + 60_000),
      revoked_at: null,
      replaced_by: null,
      amr: ['pwd'],
      session_version: '3',
      status: 'active',
      user_version: '3',
      mfa_enabled: false,
      mfa_required: false,
      ...overrides,
    });

    function database(
      state: Record<string, unknown> | null,
      roles: { code: string }[] = [{ code: 'police_ward' }],
    ) {
      jwtVerify.mockReturnValue({ sub: USER, type: 'refresh', sid: SID });
      mockManager.query.mockImplementation((sql: string) => {
        if (/FROM sessions s[\s\S]*FOR UPDATE OF s/.test(sql)) {
          return Promise.resolve(state ? [state] : []);
        }
        if (/INSERT INTO sessions/.test(sql)) {
          return Promise.resolve([{ auth_version: '3' }]);
        }
        return Promise.resolve([[], 1]);
      });
      mockDataSource.query.mockImplementation((sql: string) =>
        Promise.resolve(/FROM user_roles/.test(sql) ? roles : []),
      );
      mockUserRepo.findOneOrFail.mockResolvedValue(
        tokenUser({ id: USER, role: undefined }),
      );
    }

    const managerInserts = () =>
      callsWith(mockManager.query, /INSERT INTO sessions/);

    test('rotates a live session, keeping how the user authenticated', async () => {
      database(sessionState({ amr: ['pwd', 'otp', 'mfa'], mfa_enabled: true }));

      const tokens = await service.refreshTokens(REFRESH);

      const [[lockSql, lockParams]] = callsWith(
        mockManager.query,
        /FOR UPDATE OF s/,
      ) as [string, unknown[]][];
      expect(lockSql).toMatch(/bool_or\(r\.mfa_required\)/);
      expect(lockParams).toEqual([SID]);

      const [[, insertParams]] = managerInserts() as [string, unknown[]][];
      const newSid = insertParams[0];
      expect(insertParams[6]).toEqual(['pwd', 'otp', 'mfa']);
      expect(signed('access')[0]).toEqual(
        expect.objectContaining({ amr: ['pwd', 'otp', 'mfa'], sid: newSid }),
      );
      expect(
        callsWith(
          mockManager.query,
          /UPDATE sessions SET revoked_at = now\(\), replaced_by = \$2 WHERE id = \$1/,
        ).map(([, params]) => params),
      ).toEqual([[SID, newSid]]);
      expect(tokens.refreshToken).toBe(`refresh.token.${String(newSid)}`);
    });

    test.each([
      ['a token without a session id', null, { sub: USER, type: 'refresh' }],
      ['an unknown session', null, undefined],
      [
        "another user's session",
        { user_id: '22222222-2222-4222-8222-222222222222' },
        undefined,
      ],
      [
        'a different token for the session',
        { refresh_token_hash: sha256('other') },
        undefined,
      ],
    ])('refuses %s', async (_label, overrides, claims) => {
      database(overrides === null ? null : sessionState(overrides));
      if (claims) jwtVerify.mockReturnValue(claims);

      await expect(service.refreshTokens(REFRESH)).rejects.toThrow(
        new UnauthorizedException('invalid_refresh_token'),
      );
      expect(managerInserts()).toHaveLength(0);
    });

    // A rotated token can only come back if someone kept a copy of it
    test('treats a rotated refresh token presented again as theft and ends every session', async () => {
      database(
        sessionState({
          revoked_at: new Date(),
          replaced_by: '33333333-3333-4333-8333-333333333333',
        }),
      );

      await expect(service.refreshTokens(REFRESH)).rejects.toThrow(
        new UnauthorizedException('refresh_token_reused'),
      );
      expect(mockAuthState.invalidateUser).toHaveBeenCalledWith(
        mockManager,
        USER,
      );
      expect(managerInserts()).toHaveLength(0);
    });

    test.each([
      ['a revoked session', { revoked_at: new Date() }],
      ['an expired session', { expires_at: new Date(Date.now() - 1000) }],
      ['a session from before the account changed', { session_version: '2' }],
    ])('refuses %s', async (_label, overrides) => {
      database(sessionState(overrides));

      await expect(service.refreshTokens(REFRESH)).rejects.toThrow(
        new UnauthorizedException('refresh_token_revoked'),
      );
      expect(managerInserts()).toHaveLength(0);
      expect(mockAuthState.invalidateUser).not.toHaveBeenCalled();
    });

    test('ends every session of a disabled account', async () => {
      database(sessionState({ status: 'suspended' }));

      await expect(service.refreshTokens(REFRESH)).rejects.toThrow(
        new ForbiddenException('account_disabled'),
      );
      expect(mockAuthState.invalidateUser).toHaveBeenCalledWith(
        mockManager,
        USER,
      );
      expect(managerInserts()).toHaveLength(0);
    });

    // Codex round 3: a password-only session outlived MFA being enabled or required
    test.each([
      ['MFA was enabled on the account', { mfa_enabled: true }],
      ['a role of the account now requires MFA', { mfa_required: true }],
    ])('ends a password-only session once %s', async (_label, overrides) => {
      database(sessionState(overrides));

      await expect(service.refreshTokens(REFRESH)).rejects.toThrow(
        new UnauthorizedException('mfa_reauthentication_required'),
      );
      expect(
        callsWith(
          mockManager.query,
          /UPDATE sessions SET revoked_at = now\(\) WHERE id = \$1$/,
        ).map(([, params]) => params),
      ).toEqual([[SID]]);
      expect(managerInserts()).toHaveLength(0);
    });

    // Role changes are atomic and already end every session of the account, so a session
    // whose account has no role left has nothing a refresh could continue: it ends
    test('ends the session when the account has no role left', async () => {
      database(sessionState(), []);

      await expect(service.refreshTokens(REFRESH)).rejects.toThrow(
        new ForbiddenException('no_role_assigned'),
      );
      expect(
        callsWith(
          mockManager.query,
          /UPDATE sessions SET revoked_at = now\(\) WHERE id = \$1$/,
        ).map(([, params]) => params),
      ).toEqual([[SID]]);
      expect(managerInserts()).toHaveLength(0);
    });

    test('refuses a token that does not verify', async () => {
      jwtVerify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshTokens(REFRESH)).rejects.toThrow(
        new UnauthorizedException('invalid_refresh_token'),
      );
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    test('test_us001_happy_logout_revokes_sessions', async () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      mockSessionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.logout('test-uuid-001');
      expect(qb.execute).toHaveBeenCalled();
    });
  });

  // An account without a user_roles row must never be treated as DQTV
  describe('role resolution', () => {
    const activeUser = () => ({
      id: 'test-uuid-001',
      username: 'caphuong',
      fullName: 'Phạm Minh Tuấn',
      email: null,
      phone: null,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];

    test('test_auth_validateUser_rejects_account_without_role', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([makeRawRow()]) // user lookup
        .mockResolvedValueOnce([]); // roles

      await expect(service.validateUser('caphuong', PW)).rejects.toThrow(
        new ForbiddenException('no_role_assigned'),
      );
    });

    test('test_auth_validateUser_picks_highest_privilege_role_regardless_of_row_order', async () => {
      const orders = [
        [{ code: 'dqtv' }, { code: 'ca_officer' }],
        [{ code: 'ca_officer' }, { code: 'dqtv' }],
      ];
      for (const roleRows of orders) {
        mockDataSource.query
          .mockResolvedValueOnce([makeRawRow()]) // user lookup
          .mockResolvedValueOnce(roleRows) // roles
          .mockResolvedValueOnce([]); // unit scope

        const result = await service.validateUser('caphuong', PW);

        expect(result.role).toBe('ca_officer');
      }
    });

    test('test_auth_getUserById_reports_null_role_when_none_assigned', async () => {
      mockUserRepo.findOneOrFail.mockResolvedValueOnce(activeUser());
      mockDataSource.query
        .mockResolvedValueOnce([]) // roles
        .mockResolvedValueOnce([]); // unit scope

      const me = await service.getUserById('test-uuid-001');

      expect(me.role).toBeNull();
    });

    // Same order as the web client's ROLE_HIERARCHY (useRbac.ts)
    test('test_auth_role_priority_prefers_police_ward_over_ubnd_leader', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([makeRawRow()]) // user lookup
        .mockResolvedValueOnce([
          { code: 'ubnd_leader' },
          { code: 'police_ward' },
        ]) // roles
        .mockResolvedValueOnce([]); // unit scope

      const result = await service.validateUser('caphuong', PW);

      expect(result.role).toBe('police_ward');
      expect(result.roles).toEqual(['police_ward', 'ubnd_leader']);
    });

    test('test_auth_unit_scope_is_deterministic_and_all_scope_is_ward_wide', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([makeRawRow()]) // user lookup
        .mockResolvedValueOnce([{ code: 'police_ward' }]) // roles
        .mockResolvedValueOnce([{ code: 'KV1', scope_type: 'all' }]); // unit scope

      const result = await service.validateUser('caphuong', PW);

      expect(String(callsOf(mockDataSource.query)[2][0])).toMatch(/ORDER BY/);
      expect(result.unitScope).toBeNull();
    });

    test('test_auth_getUserById_lists_every_role_with_the_primary_first', async () => {
      mockUserRepo.findOneOrFail.mockResolvedValueOnce(activeUser());
      mockDataSource.query
        .mockResolvedValueOnce([{ code: 'dqtv' }, { code: 'police_area' }]) // roles
        .mockResolvedValueOnce([]); // unit scope

      const me = await service.getUserById('test-uuid-001');

      expect(me.role).toBe('police_area');
      expect(me.roles).toEqual(['police_area', 'dqtv']);
    });
  });
});
