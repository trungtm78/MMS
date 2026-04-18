import { v4 as uuidv4 } from 'uuid';
import speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { queryOne, queryMany, transaction } from '../db/pool';
import { hashPassword, verifyPassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';

interface LoginResult {
  accessToken?: string;
  refreshToken?: string;
  // When MFA is set up but not yet verified in this session
  requiresMfa?: boolean;
  // When MFA has never been set up (first login after account creation)
  requiresMfaSetup?: boolean;
  // userId needed to issue tempToken
  userId: string;
  user: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
    roles: string[];
    unitScopes: { unitId: string; scopeType: string }[];
  };
}

interface DeviceInfo {
  name?: string;
  fingerprint?: string;
  platform?: 'android' | 'ios' | 'web';
}

// US-001: Unified authentication and scoped authorization
// BR-004: Unified auth/session/device policy - Validate credentials and create secure session
export async function login(
  username: string,
  password: string,
  device: DeviceInfo | undefined,
  ip: string,
  userAgent: string
): Promise<LoginResult | null> {
  // Find user
  const user = await queryOne<{
    id: string;
    username: string;
    password_hash: string;
    full_name: string;
    email: string | null;
    status: string;
    mfa_enabled: boolean;
    totp_secret: string | null;
  }>(
    'SELECT id, username, password_hash, full_name, email, status, mfa_enabled, totp_secret FROM users WHERE username = $1',
    [username.toLowerCase()]
  );

  if (!user || user.status !== 'active') {
    return null;
  }

  // Verify password
  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  // Get user roles
  const roles = await queryMany<{ code: string }>(
    `SELECT r.code FROM roles r
     JOIN user_roles ur ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [user.id]
  );

  // Get unit scopes
  const scopes = await queryMany<{ unitId: string; scopeType: string }>(
    `SELECT unit_id as "unitId", scope_type as "scopeType" 
     FROM user_unit_scopes 
     WHERE user_id = $1`,
    [user.id]
  );

  const userPayload = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    email: user.email,
    roles: roles.map(r => r.code),
    unitScopes: scopes,
  };

  // MFA enabled → require OTP verification step
  if (user.mfa_enabled && user.totp_secret) {
    return { requiresMfa: true, userId: user.id, user: userPayload };
  }

  // MFA not set up → signal setup required (enforce 2FA for all users)
  if (!user.totp_secret) {
    return { requiresMfaSetup: true, userId: user.id, user: userPayload };
  }

  // Create device record if provided
  let deviceId: string | null = null;
  if (device?.fingerprint) {
    const existingDevice = await queryOne<{ id: string }>(
      'SELECT id FROM devices WHERE fingerprint = $1 AND user_id = $2',
      [device.fingerprint, user.id]
    );

    if (existingDevice) {
      deviceId = existingDevice.id;
      await queryOne(
        'UPDATE devices SET last_seen_at = NOW() WHERE id = $1',
        [deviceId]
      );
    } else {
      const newDevice = await queryOne<{ id: string }>(
        `INSERT INTO devices (user_id, device_name, fingerprint, platform, last_seen_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id`,
        [user.id, device.name || 'Unknown', device.fingerprint, device.platform || 'web']
      );
      deviceId = newDevice?.id || null;
    }
  }

  // Create session
  const sessionId = uuidv4();
  const refreshToken = generateRefreshToken(user.id, sessionId, 0);
  const refreshTokenHash = await hashPassword(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await queryOne(
    `INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sessionId, user.id, deviceId, refreshTokenHash, expiresAt, ip, userAgent]
  );

  // Update last login
  await queryOne(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.id]
  );

  // Generate access token
  const accessToken = generateAccessToken(user.id, sessionId);

  return {
    accessToken,
    refreshToken,
    userId: user.id,
    user: userPayload,
  };
}

// US-010: Session management and remote revoke
// BR-004: Refresh token rotation for security
export async function refreshAccessToken(
  refreshToken: string,
  ip: string,
  userAgent: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  // Decode refresh token
  const { verifyRefreshToken } = await import('../utils/jwt');
  const payload = verifyRefreshToken(refreshToken);
  
  if (!payload) {
    return null;
  }

  // Find session
  const session = await queryOne<{
    id: string;
    user_id: string;
    refresh_token_hash: string;
    revoked_at: Date | null;
    expires_at: Date;
  }>(
    'SELECT id, user_id, refresh_token_hash, revoked_at, expires_at FROM sessions WHERE id = $1',
    [payload.sessionId]
  );

  if (!session || session.revoked_at || session.expires_at < new Date()) {
    return null;
  }

  // Verify refresh token hash
  const isValid = await verifyPassword(refreshToken, session.refresh_token_hash);
  if (!isValid) {
    return null;
  }

  // Check user status
  const user = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM users WHERE id = $1',
    [session.user_id]
  );

  if (!user || user.status !== 'active') {
    return null;
  }

  // Revoke old session and create new one
  const newSessionId = uuidv4();
  const newRefreshToken = generateRefreshToken(user.id, newSessionId, 0);
  const newRefreshTokenHash = await hashPassword(newRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await transaction(async (client) => {
    // Revoke old session
    await client.query(
      'UPDATE sessions SET revoked_at = NOW() WHERE id = $1',
      [session.id]
    );

    // Create new session
    await client.query(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [newSessionId, user.id, newRefreshTokenHash, expiresAt, ip, userAgent]
    );
  });

  // Generate new access token
  const accessToken = generateAccessToken(user.id, newSessionId);

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logout(userId: string, sessionId: string): Promise<void> {
  await queryOne(
    'UPDATE sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );
}

export async function logoutAllDevices(userId: string): Promise<void> {
  await queryOne(
    'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

// ─── MFA / TOTP ────────────────────────────────────────────────────────────

const APP_NAME = 'MilitianApp';
const RECOVERY_CODE_COUNT = 10;

function generateRecoveryCode(): string {
  // Format: XXXX-XXXX-XXXX (alphanumeric, uppercase)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${segment()}-${segment()}-${segment()}`;
}

export interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
}

// Generate TOTP secret, QR code, and recovery codes. Does NOT enable MFA yet.
// MFA is only enabled after the user verifies the first OTP.
export async function setupMfa(userId: string): Promise<MfaSetupResult> {
  const user = await queryOne<{ username: string; full_name: string }>(
    'SELECT username, full_name FROM users WHERE id = $1',
    [userId]
  );
  if (!user) throw new Error('User not found');

  const secretObj = speakeasy.generateSecret({ length: 20, name: `${APP_NAME}:${user.username}`, issuer: APP_NAME });
  const secret = secretObj.base32;
  const otpauthUrl = secretObj.otpauth_url || speakeasy.otpauthURL({
    secret,
    label: user.username,
    issuer: APP_NAME,
    encoding: 'base32',
  });
  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

  // Generate 10 one-time recovery codes
  const plainCodes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    plainCodes.push(generateRecoveryCode());
  }

  await transaction(async (client) => {
    // Store secret (not yet enabling MFA)
    await client.query(
      'UPDATE users SET totp_secret = $1 WHERE id = $2',
      [secret, userId]
    );

    // Delete existing unused recovery codes (re-setup)
    await client.query('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);

    // Store hashed recovery codes
    for (const code of plainCodes) {
      const codeHash = await hashPassword(code);
      await client.query(
        'INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)',
        [userId, codeHash]
      );
    }
  });

  return { secret, otpauthUrl, qrCodeDataUrl, recoveryCodes: plainCodes };
}

// Issue a short-lived temp token after password verification (for MFA step 2)
export async function issueMfaTempToken(userId: string): Promise<string> {
  const token = uuidv4();
  const tokenHash = await hashPassword(token);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await queryOne(
    `INSERT INTO mfa_temp_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  // Return composite: userId:token (so we can look up user_id from it)
  return `${userId}:${token}`;
}

// Validate a temp MFA token; returns userId if valid, null otherwise
async function validateMfaTempToken(tempToken: string): Promise<string | null> {
  const parts = tempToken.split(':');
  if (parts.length !== 2) return null;
  const [userId, token] = parts;

  const row = await queryOne<{ id: string; token_hash: string; expires_at: Date; used_at: Date | null }>(
    `SELECT id, token_hash, expires_at, used_at
     FROM mfa_temp_tokens
     WHERE user_id = $1 AND expires_at > NOW() AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (!row) return null;

  const isValid = await verifyPassword(token, row.token_hash);
  if (!isValid) return null;

  // Mark as used
  await queryOne('UPDATE mfa_temp_tokens SET used_at = NOW() WHERE id = $1', [row.id]);

  return userId;
}

// Verify TOTP code and complete login → returns full session tokens + userId
export async function verifyMfaAndLogin(
  tempToken: string,
  totpCode: string,
  ip: string,
  userAgent: string
): Promise<{ accessToken: string; refreshToken: string; userId: string } | null> {
  const userId = await validateMfaTempToken(tempToken);
  if (!userId) return null;

  const user = await queryOne<{ totp_secret: string | null; mfa_enabled: boolean; status: string }>(
    'SELECT totp_secret, mfa_enabled, status FROM users WHERE id = $1',
    [userId]
  );
  if (!user || user.status !== 'active' || !user.totp_secret) return null;

  // First verification → enable MFA
  const isValid = speakeasy.totp.verify({
    secret: user.totp_secret,
    encoding: 'base32',
    token: totpCode,
    window: 1, // allow 1 step tolerance (±30s)
  });
  if (!isValid) return null;

  if (!user.mfa_enabled) {
    await queryOne(
      'UPDATE users SET mfa_enabled = TRUE, mfa_setup_at = NOW() WHERE id = $1',
      [userId]
    );
  }

  return _createSession(userId, ip, userAgent);
}

// Verify a recovery code and complete login (disables that code)
export async function verifyRecoveryCodeAndLogin(
  tempToken: string,
  recoveryCode: string,
  ip: string,
  userAgent: string
): Promise<{ accessToken: string; refreshToken: string; userId: string } | null> {
  const userId = await validateMfaTempToken(tempToken);
  if (!userId) return null;

  const user = await queryOne<{ status: string }>(
    'SELECT status FROM users WHERE id = $1',
    [userId]
  );
  if (!user || user.status !== 'active') return null;

  // Find matching unused recovery code
  const codes = await queryMany<{ id: string; code_hash: string }>(
    'SELECT id, code_hash FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL',
    [userId]
  );

  let matchedId: string | null = null;
  for (const c of codes) {
    if (await verifyPassword(recoveryCode, c.code_hash)) {
      matchedId = c.id;
      break;
    }
  }
  if (!matchedId) return null;

  // Mark code as used
  await queryOne('UPDATE recovery_codes SET used_at = NOW() WHERE id = $1', [matchedId]);

  return _createSession(userId, ip, userAgent);
}

// Internal: create a new session and return tokens + userId
async function _createSession(
  userId: string,
  ip: string,
  userAgent: string
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const sessionId = uuidv4();
  const refreshToken = generateRefreshToken(userId, sessionId, 0);
  const refreshTokenHash = await hashPassword(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await queryOne(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, userId, refreshTokenHash, expiresAt, ip, userAgent]
  );

  await queryOne('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);

  const accessToken = generateAccessToken(userId, sessionId);
  return { accessToken, refreshToken, userId };
}
