// A signed-in session as answered by the sign-in routes and by POST /auth/mfa/confirm and disable:
// { user, tokens: { accessToken, refreshToken, expiresIn } } (auth.service.ts signInUser)
import type { LoginResponse, User } from '@/types'

/** The user and the token pair (stored by AuthContext.completeSignIn) */
export type SignedInSession = LoginResponse

export class UnexpectedSessionResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnexpectedSessionResponseError'
  }
}

export function readSignedInSession(body: unknown, what: string): SignedInSession {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const user = record.user as Partial<User> | undefined
  const tokens = record.tokens as Partial<LoginResponse['tokens']> | undefined
  if (
    typeof user !== 'object' || user === null || typeof user.id !== 'string' ||
    typeof tokens !== 'object' || tokens === null ||
    typeof tokens.accessToken !== 'string' || typeof tokens.refreshToken !== 'string'
  ) {
    throw new UnexpectedSessionResponseError(`${what} did not return a user and tokens`)
  }
  return {
    user: user as User,
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: typeof tokens.expiresIn === 'number' ? tokens.expiresIn : 0,
    },
  }
}
