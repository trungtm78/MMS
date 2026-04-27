// Phase 2: Unit tests for AuthService
// US-W001: AC-1 (login), BR-AUTH-02 (lockout via Redis cache), AC-5 (logout)
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../database/entities/user.entity';
import { Session } from '../database/entities/refresh-token.entity';

const PW = 'Police@123';
const PW_HASH = bcrypt.hashSync(PW, 10); // synchronous for test setup

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

describe('AuthService', () => {
  let service: AuthService;

  const mockUserRepo = {
    findOneOrFail: jest.fn(),
  };

  const mockSessionRepo = {
    save: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    }),
  };

  const mockDataSource = {
    query: jest.fn(),
  };

  // In-memory cache mock that simulates Redis TTL cache for lockout
  const cacheStore = new Map<string, unknown>();
  const mockCacheManager = {
    get: jest.fn().mockImplementation((key: string) => Promise.resolve(cacheStore.get(key) ?? null)),
    set: jest.fn().mockImplementation((key: string, value: unknown) => { cacheStore.set(key, value); return Promise.resolve(); }),
    del: jest.fn().mockImplementation((key: string) => { cacheStore.delete(key); return Promise.resolve(); }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    cacheStore.clear();

    // Reset QB chain on sessionRepo
    mockSessionRepo.createQueryBuilder.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock.jwt.token'),
            verify: jest
              .fn()
              .mockReturnValue({ sub: 'test-uuid-001', type: 'refresh' }),
          },
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
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('validateUser', () => {
    test('test_us001_happy_valid_credentials_returns_user_with_role', async () => {
      // Call 1: user lookup raw SQL → returns [rawRow]
      // Call 2: role query → returns [{ code: 'police_ward' }]
      // Call 3: unit scope query → returns []
      mockDataSource.query
        .mockResolvedValueOnce([makeRawRow()]) // user lookup
        .mockResolvedValueOnce([{ code: 'police_ward' }]) // role
        .mockResolvedValueOnce([]); // unit scope

      const result = await service.validateUser('caphuong', PW);
      expect(result.username).toBe('caphuong');
      expect(result.role).toBe('police_ward');
    });

    test('test_us001_validation_user_not_found_throws_unauthorized', async () => {
      // User lookup returns empty array → user not found
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.validateUser('nonexistent', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    test('test_us001_validation_wrong_password_throws_unauthorized', async () => {
      // User found but password won't match
      mockDataSource.query.mockResolvedValueOnce([makeRawRow()]);
      await expect(
        service.validateUser('caphuong', 'WrongPass'),
      ).rejects.toThrow(UnauthorizedException);
    });

    test('test_us001_validation_inactive_account_throws_forbidden', async () => {
      // User found with status='inactive'
      mockDataSource.query.mockResolvedValueOnce([
        makeRawRow({ status: 'inactive' }),
      ]);
      await expect(service.validateUser('caphuong', PW)).rejects.toThrow(
        ForbiddenException,
      );
    });

    // BR-AUTH-02: Lockout after 5 attempts on same username
    test('test_us001_boundary_lockout_after_5_failures', async () => {
      const lockedUsername = 'locktest_' + Date.now();
      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        mockDataSource.query.mockResolvedValueOnce([
          makeRawRow({ username: lockedUsername }),
        ]);
        try {
          await service.validateUser(lockedUsername, 'Wrong');
        } catch {
          /* expected UnauthorizedException */
        }
      }
      // 6th attempt — should throw ForbiddenException (account locked) WITHOUT hitting DB
      await expect(
        service.validateUser(lockedUsername, 'anything'),
      ).rejects.toThrow(ForbiddenException);
    });

    // BR-AUTH-02: Boundary — 4th failure NOT yet locked
    test('test_us001_boundary_4th_failure_not_locked', async () => {
      const username = 'lockboundary_' + Date.now();
      for (let i = 0; i < 4; i++) {
        mockDataSource.query.mockResolvedValueOnce([makeRawRow({ username })]);
        try {
          await service.validateUser(username, 'Wrong');
        } catch {
          /* expected */
        }
      }
      // 4th+1 = 5th attempt — still UnauthorizedException (not ForbiddenException)
      mockDataSource.query.mockResolvedValueOnce([makeRawRow({ username })]);
      await expect(service.validateUser(username, 'Wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('issueTokens', () => {
    test('test_us001_happy_issueTokens_returns_token_pair', async () => {
      mockSessionRepo.save.mockResolvedValue(undefined);
      const user = {
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
      };
      const result = await service.issueTokens(user);
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.expiresIn).toBe(900);
    });

    test('test_us001_happy_issueTokens_persists_session', async () => {
      mockSessionRepo.save.mockResolvedValue(undefined);
      const user = {
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
      };
      await service.issueTokens(user);
      expect(mockSessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          expiresAt: expect.any(Date),
        }),
      );
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

  describe('issueMfaTempToken', () => {
    test('test_mfa_issueMfaTempToken_stores_bcrypt_hash_in_db', async () => {
      mockDataSource.query.mockResolvedValueOnce(undefined); // INSERT

      const rawToken = await service.issueMfaTempToken('test-uuid-001');

      // Token is a 64-char hex string
      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);

      // INSERT was called with user_id, a bcrypt hash, and expiry date
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO mfa_temp_tokens'),
        expect.arrayContaining(['test-uuid-001']),
      );
      // Verify the stored hash is a valid bcrypt hash of the returned token
      const callArgs = mockDataSource.query.mock.calls[0] as unknown[][];
      const storedHash = (callArgs[1] as string[])[1];
      const valid = await bcrypt.compare(rawToken, storedHash);
      expect(valid).toBe(true);
    });
  });

  describe('verifyMfaAndIssueTokens', () => {
    test('test_mfa_verifyMfa_throws_on_invalid_otp', async () => {
      // Return no matching unexpired rows → invalid
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(
        service.verifyMfaAndIssueTokens('bad-token', '000000'),
      ).rejects.toThrow(UnauthorizedException);
    });

    test('test_mfa_verifyMfa_throws_on_expired_temp_token', async () => {
      // An expired token would not be returned by the SQL (expires_at > NOW()),
      // so the service finds no matching row and throws
      mockDataSource.query.mockResolvedValueOnce([]); // no unexpired rows
      await expect(
        service.verifyMfaAndIssueTokens('expired-token', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    test('test_mfa_verifyMfa_throws_when_otp_wrong_for_valid_temp_token', async () => {
      // Issue a real temp token so we have a valid bcrypt hash
      mockDataSource.query.mockResolvedValueOnce(undefined); // INSERT in issueMfaTempToken
      const rawToken = await service.issueMfaTempToken('test-uuid-001');
      const storedHash = (mockDataSource.query.mock.calls[0] as unknown[][])[1] as string[];

      // verifyMfaAndIssueTokens: return one unexpired row with matching hash
      mockDataSource.query.mockResolvedValueOnce([
        { id: 'tmp-id-1', user_id: 'test-uuid-001', token_hash: storedHash[1], used_at: null },
      ]);
      // totp_secret row — use a valid base32 secret (20-byte minimum for otplib v13)
      mockDataSource.query.mockResolvedValueOnce([{ totp_secret: 'YL3AOTAN4S72X3JSHIPP5ADNUEUCT7AJ' }]);

      // Wrong OTP (000000 is extremely unlikely to match)
      await expect(
        service.verifyMfaAndIssueTokens(rawToken, '000000'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
