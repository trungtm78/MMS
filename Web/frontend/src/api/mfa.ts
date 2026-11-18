// Second factor: TOTP authenticator app plus one-time recovery codes.
// Web/backend/src/auth/mfa/mfa.controller.ts, mfa.service.ts, recovery-codes.ts
import client from './client'
import { readSignedInSession, type SignedInSession } from './session'
import i18n from '@/i18n'
import type { ErrorScope, TranslationKey } from '@/i18n/types'
import { describeApiError, parseApiError } from '@/lib/api-error'

export type MfaMethod = 'totp' | 'recovery_code'

export function isMfaMethod(value: unknown): value is MfaMethod {
  return value === 'totp' || value === 'recovery_code'
}

/** POST /auth/mfa/enroll (during sign-in) and POST /auth/mfa/setup (signed in) */
export interface MfaEnrollment {
  mfaToken: string
  secret: string
  otpauthUri: string
  qrUri: string
  expiresAt: string
}

/** GET /auth/mfa/status */
export interface MfaStatus {
  enabled: boolean
  enrolledAt: string | null
  required: boolean
  recoveryCodesRemaining: number
}

/** Warn the user once this few recovery codes are left */
export const RECOVERY_CODES_LOW_THRESHOLD = 3

export class UnexpectedMfaResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnexpectedMfaResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function readEnrollment(body: unknown): MfaEnrollment {
  if (
    !isRecord(body) ||
    !isNonEmptyString(body.mfaToken) ||
    !isNonEmptyString(body.secret) ||
    typeof body.otpauthUri !== 'string' ||
    !body.otpauthUri.startsWith('otpauth://')
  ) {
    throw new UnexpectedMfaResponseError('enrolment answer without mfaToken, secret or otpauth URI')
  }
  return {
    mfaToken: body.mfaToken,
    secret: body.secret,
    otpauthUri: body.otpauthUri,
    qrUri: typeof body.qrUri === 'string' ? body.qrUri : body.otpauthUri,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : '',
  }
}

export function readRecoveryCodes(body: unknown): string[] {
  const codes = isRecord(body) ? body.recoveryCodes : undefined
  if (!Array.isArray(codes) || codes.length === 0 || !codes.every(isNonEmptyString)) {
    throw new UnexpectedMfaResponseError('answer without recovery codes')
  }
  return codes
}

function readStatus(body: unknown): MfaStatus {
  if (!isRecord(body) || typeof body.enabled !== 'boolean') {
    throw new UnexpectedMfaResponseError('GET /auth/mfa/status did not return a status')
  }
  return {
    enabled: body.enabled,
    enrolledAt: typeof body.enrolledAt === 'string' ? body.enrolledAt : null,
    required: body.required === true,
    recoveryCodesRemaining: typeof body.recoveryCodesRemaining === 'number' ? body.recoveryCodesRemaining : 0,
  }
}

// ─── Codes typed by the user ──────────────────────────────────────────────────

const TOTP_CODE = /^\d{6}$/
// Recovery codes are XXXXX-XXXXX; the server ignores case, spaces and the hyphen
const RECOVERY_CODE = /^[0-9A-Za-z]{10}$/

/** Why the typed code cannot be right, or null when it may be */
export function mfaCodeFormatError(method: MfaMethod, input: string): string | null {
  if (method === 'totp') return TOTP_CODE.test(input.replace(/\s/g, '')) ? null : i18n.t('auth.mfa.code.totpFormat')
  return RECOVERY_CODE.test(input.replace(/[\s-]/g, '')) ? null : i18n.t('auth.mfa.code.recoveryFormat')
}

/** The code as sent: digits only for TOTP; a recovery code as typed, trimmed (the server normalises it) */
export function mfaCodeForRequest(method: MfaMethod, input: string): string {
  return method === 'totp' ? input.replace(/\s/g, '') : input.trim()
}

// ─── Errors ───────────────────────────────────────────────────────────────────

// Codes thrown by MfaService / MfaChallengeService have their texts in errors.auth.mfa:
// invalid_code (401, details.attemptsRemaining on a challenge), mfa_token_invalid (401 expired,
// used or unknown challenge), mfa_attempts_exceeded (429 challenge closed), mfa_locked (429
// account locked for 15 minutes), mfa_already_enabled / mfa_not_enabled / mfa_setup_not_started
// (409), mfa_required_by_role (403), user_not_found (404)
const MFA_ERROR_SCOPE: ErrorScope = 'auth.mfa'

// Any other 429 comes from the ThrottlerGuard (code E006)
const MFA_STATUS_TEXTS: Readonly<Partial<Record<number, TranslationKey>>> = { 429: 'auth.mfa.error.throttled' }

// After these the challenge can never succeed: the password step has to be repeated
const CHALLENGE_CLOSED_CODES: ReadonlySet<string> = new Set(['mfa_token_invalid', 'mfa_attempts_exceeded'])

export type MfaFailure =
  /** The challenge is gone; start again from the password (or the set-up start) */
  | { kind: 'restart'; code: string; message: string }
  /** About the code that was typed */
  | { kind: 'code'; message: string }
  /** Anything else, shown for the whole form */
  | { kind: 'form'; code: string | null; message: string }

/** `fallback` is the text key used when neither the code nor the status says more */
export function classifyMfaError(err: unknown, fallback: TranslationKey): MfaFailure {
  const { code, details } = parseApiError(err)
  const message = () => describeApiError(err, { scope: MFA_ERROR_SCOPE, statuses: MFA_STATUS_TEXTS, fallback })
  if (code !== null && CHALLENGE_CLOSED_CODES.has(code)) {
    return { kind: 'restart', code, message: message() }
  }
  if (code === 'invalid_code') {
    const left = details?.attemptsRemaining
    return {
      kind: 'code',
      message: typeof left === 'number' ? i18n.t('auth.mfa.code.attemptsLeft', { count: left }) : message(),
    }
  }
  return { kind: 'form', code, message: message() }
}

// ─── Signed-in management (Bearer) ────────────────────────────────────────────

export const mfaKeys = {
  status: ['auth', 'mfa', 'status'] as const,
}

export const mfaApi = {
  status: async (): Promise<MfaStatus> => {
    const response = await client.get<unknown>('/auth/mfa/status')
    return readStatus(response.data)
  },

  // 409 mfa_already_enabled
  setup: async (): Promise<MfaEnrollment> => {
    const response = await client.post<unknown>('/auth/mfa/setup')
    return readEnrollment(response.data)
  },

  // Enabling the second factor ends every earlier session, the caller's included: the answer
  // carries the recovery codes and the new session (mfa.service.ts confirmEnrollment)
  confirm: async (body: { mfaToken: string; code: string }): Promise<{ recoveryCodes: string[]; session: SignedInSession }> => {
    const response = await client.post<unknown>('/auth/mfa/confirm', body)
    return {
      recoveryCodes: readRecoveryCodes(response.data),
      session: readSignedInSession(response.data, 'POST /auth/mfa/confirm'),
    }
  },

  // Needs an authenticator code; the previous recovery codes stop working
  regenerateRecoveryCodes: async (code: string): Promise<string[]> => {
    const response = await client.post<unknown>('/auth/mfa/recovery-codes/regenerate', { code })
    return readRecoveryCodes(response.data)
  },

  // 204; 403 mfa_required_by_role, 409 mfa_not_enabled
  disable: async (body: { method: MfaMethod; code: string }): Promise<void> => {
    await client.post('/auth/mfa/disable', body)
  },
}
