// US-W001: Authentication API — Web/backend/src/auth/auth.controller.ts and the public
// second-factor routes of Web/backend/src/auth/mfa/mfa.controller.ts
import client, { clearTokens } from './client'
import { isMfaMethod, readEnrollment, readRecoveryCodes, type MfaEnrollment, type MfaMethod } from './mfa'
import { readSignedInSession, type SignedInSession } from './session'
import type { LoginRequest, User } from '@/types'

export type { SignedInSession }

/** MFA_REQUIRED: a code from the authenticator or a recovery code is needed */
export interface MfaChallenge {
  mfaToken: string
  expiresAt: string
  methods: MfaMethod[]
}

/** MFA_SETUP_REQUIRED: the role requires a second factor the account has not set up yet */
export interface MfaSetupChallenge {
  mfaToken: string
  expiresAt: string
}

export type LoginResult =
  | { status: 'SUCCESS'; session: SignedInSession }
  | { status: 'MFA_REQUIRED'; challenge: MfaChallenge }
  | { status: 'MFA_SETUP_REQUIRED'; challenge: MfaSetupChallenge }

export class UnexpectedAuthResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnexpectedAuthResponseError'
  }
}

type Body = Record<string, unknown>

function asBody(data: unknown, what: string): Body {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new UnexpectedAuthResponseError(`${what} did not return an object`)
  }
  return data as Body
}

// Tokens are read only from a SUCCESS answer
const readSession = (body: Body, what: string): SignedInSession => readSignedInSession(body, what)

function readChallengeToken(body: Body): MfaSetupChallenge {
  if (typeof body.mfaToken !== 'string' || !body.mfaToken) {
    throw new UnexpectedAuthResponseError('POST /auth/login challenge without mfaToken')
  }
  return { mfaToken: body.mfaToken, expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : '' }
}

export const authApi = {
  // US-W001 AC-1: a correct password answers SUCCESS, MFA_REQUIRED or MFA_SETUP_REQUIRED
  login: async (payload: LoginRequest): Promise<LoginResult> => {
    const response = await client.post<unknown>('/auth/login', payload)
    const body = asBody(response.data, 'POST /auth/login')
    switch (body.status) {
      case 'SUCCESS':
        return { status: 'SUCCESS', session: readSession(body, 'POST /auth/login') }
      case 'MFA_REQUIRED': {
        const methods = Array.isArray(body.methods) ? body.methods.filter(isMfaMethod) : []
        return {
          status: 'MFA_REQUIRED',
          challenge: { ...readChallengeToken(body), methods: methods.length ? methods : ['totp'] },
        }
      }
      case 'MFA_SETUP_REQUIRED':
        return { status: 'MFA_SETUP_REQUIRED', challenge: readChallengeToken(body) }
      default:
        throw new UnexpectedAuthResponseError('POST /auth/login answered an unknown status')
    }
  },

  // Sign-in step 2 (public): 401 invalid_code {details.attemptsRemaining}, 401 mfa_token_invalid,
  // 429 mfa_attempts_exceeded, 429 mfa_locked
  verifyMfa: async (input: {
    mfaToken: string
    method: MfaMethod
    code: string
  }): Promise<{ session: SignedInSession; recoveryCodesRemaining?: number }> => {
    const response = await client.post<unknown>('/auth/mfa/verify', input)
    const body = asBody(response.data, 'POST /auth/mfa/verify')
    const session = readSession(body, 'POST /auth/mfa/verify')
    return typeof body.recoveryCodesRemaining === 'number'
      ? { session, recoveryCodesRemaining: body.recoveryCodesRemaining }
      : { session }
  },

  // MFA_SETUP_REQUIRED step 1: a secret for the authenticator (each call replaces the previous one)
  startEnrollment: async (mfaToken: string): Promise<MfaEnrollment> => {
    const response = await client.post<unknown>('/auth/mfa/enroll', { mfaToken })
    return readEnrollment(response.data)
  },

  // MFA_SETUP_REQUIRED step 2: signed in, with the recovery codes shown this once
  confirmEnrollment: async (input: {
    mfaToken: string
    code: string
  }): Promise<{ session: SignedInSession; recoveryCodes: string[] }> => {
    const response = await client.post<unknown>('/auth/mfa/enroll/confirm', input)
    const body = asBody(response.data, 'POST /auth/mfa/enroll/confirm')
    return { session: readSession(body, 'POST /auth/mfa/enroll/confirm'), recoveryCodes: readRecoveryCodes(body) }
  },

  // US-W001 AC-6: Logout — invalidate token server-side
  logout: async (): Promise<void> => {
    try {
      await client.post('/auth/logout')
    } finally {
      clearTokens()
    }
  },

  // Get current authenticated user profile
  me: async (): Promise<User> => {
    const response = await client.get<User>('/auth/me')
    return response.data
  },
}
