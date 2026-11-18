// US-W001 AC-1: Login page with JWT authentication and the second factor
// data-testid map: login-form, username-input, password-input, remember-me-checkbox,
//                  login-btn, login-error-message
// Design ported from Web/Refs/src/app/components/LoginPage.tsx (proportions match Refs)
// Icon-in-input uses flex row (not absolute) to prevent overlap with entered text.
import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Eye, EyeOff, User, Lock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { GlobalFooter } from '@/components/layout/GlobalFooter'
import type { MfaChallenge, MfaSetupChallenge, SignedInSession } from '@/api/auth'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError } from '@/lib/api-error'
import { MfaEnrollStep } from './MfaEnrollStep'
import { MfaVerifyStep } from './MfaVerifyStep'
import anttLogo from '@/assets/668337ed7f590a8cbedffff9ffd07736f5a4d4e3.png'

function createLoginSchema(t: TFunction) {
  return z.object({
    username:   z.string().min(1, t('auth.login.username.required')),
    password:   z.string().min(1, t('auth.login.password.required')),
    rememberMe: z.boolean(),
  })
}

// Codes thrown by Web/backend/src/auth/auth.service.ts and MfaService.beginLogin during login
// are explained by errors.auth.login (invalid_credentials 401, account_disabled / no_role_assigned /
// account_locked 403, mfa_locked 429); a status without a known code by these texts
const LOGIN_STATUS_TEXTS: Readonly<Partial<Record<number, TranslationKey>>> = {
  401: 'auth.login.error.invalidCredentials',
  // LOGIN_THROTTLE (Web/backend/src/auth/auth-throttle.ts), code E006
  429: 'auth.login.error.throttled',
  500: 'auth.login.error.server',
  502: 'auth.login.error.server',
  503: 'auth.login.error.server',
  504: 'auth.login.error.server',
}

function loginErrorMessage(err: unknown): string {
  return describeApiError(err, {
    scope: 'auth.login',
    statuses: LOGIN_STATUS_TEXTS,
    fallback: 'auth.login.error.fallback',
  })
}

// Seeded demo accounts: user names and passwords are data, not texts
const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'Admin@123' },
  { username: 'dqtv01', password: 'Dqtv@123' },
] as const

type LoginFormValues = z.infer<ReturnType<typeof createLoginSchema>>

type Step =
  | { kind: 'credentials' }
  | { kind: 'verify'; challenge: MfaChallenge; rememberMe: boolean }
  | { kind: 'enroll'; challenge: MfaSetupChallenge; rememberMe: boolean }

interface LoginPageProps {
  onSuccess?: () => void
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const { t } = useTranslation()
  const { login, completeSignIn, isAuthenticated, notice, clearNotice } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState<Step>({ kind: 'credentials' })
  const loginSchema = useMemo(() => createLoginSchema(t), [t])

  const {
    register,
    handleSubmit,
    resetField,
    formState: { isSubmitting, errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '', rememberMe: false },
  })

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const onSubmit = handleSubmit(async ({ username, password, rememberMe }) => {
    setServerError(null)
    clearNotice()
    try {
      const result = await login({ username, password, rememberMe })
      if (result.status === 'MFA_REQUIRED') {
        setStep({ kind: 'verify', challenge: result.challenge, rememberMe })
      } else if (result.status === 'MFA_SETUP_REQUIRED') {
        setStep({ kind: 'enroll', challenge: result.challenge, rememberMe })
      } else {
        onSuccess?.()
      }
    } catch (err: unknown) {
      setServerError(loginErrorMessage(err))
    }
  })

  // A closed challenge needs the password again; it is not kept once the step is left
  const restart = (message: string | null) => {
    resetField('password')
    setServerError(message)
    setStep({ kind: 'credentials' })
  }

  const finishSignIn = (session: SignedInSession) => {
    completeSignIn(session, step.kind === 'credentials' ? false : step.rememberMe)
    onSuccess?.()
  }

  return (
    <div className="min-h-screen bg-[#F4F269] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md flex flex-col items-center justify-center gap-8">
          {/* Logo */}
          <img
            src={anttLogo}
            alt={t('auth.login.logoAlt')}
            className="w-36 h-36 md:w-44 md:h-44 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />

          {/* Form container */}
          <div className="w-full bg-[#F4F269] border-4 border-[#C62828] rounded-3xl px-6 sm:px-10 pt-7 pb-8">
            {step.kind === 'verify' && (
              <MfaVerifyStep challenge={step.challenge} onSignedIn={finishSignIn} onRestart={restart} />
            )}

            {step.kind === 'enroll' && (
              <MfaEnrollStep challenge={step.challenge} onSignedIn={finishSignIn} onRestart={restart} />
            )}

            {step.kind === 'credentials' && (
              <>
                <h3 className="text-[#C62828] text-2xl font-bold text-center mb-7 leading-relaxed tracking-wide">
                  {t('auth.login.heading')}
                </h3>

                {/* Why the previous session ended (refused refresh, password change) */}
                {notice && (
                  <div
                    role="status"
                    data-testid="login-notice"
                    className={`mb-5 px-3 py-2 rounded-lg border ${
                      notice.tone === 'success'
                        ? 'bg-green-50 border-green-600 text-green-800'
                        : 'bg-white border-[#C62828]/40 text-[#0F172A]'
                    }`}
                  >
                    <p className="text-center text-xs font-medium">{notice.message}</p>
                  </div>
                )}

                <form
                  data-testid="login-form"
                  onSubmit={onSubmit}
                  className="space-y-5"
                  aria-label={t('auth.login.formLabel')}
                  noValidate
                >
                  {/* Username */}
                  <div>
                    <label
                      htmlFor="username"
                      className="block text-[#C62828] text-sm font-bold mb-2 leading-relaxed"
                    >
                      {t('auth.login.username.label')}
                    </label>
                    <div className="flex items-center h-10 bg-white border-2 border-[#C62828] rounded-lg focus-within:ring-2 focus-within:ring-[#C62828]/40 transition-shadow">
                      <div className="pl-3 pr-2 flex items-center justify-center text-gray-600 shrink-0">
                        <User size={18} />
                      </div>
                      <input
                        id="username"
                        type="text"
                        data-testid="username-input"
                        autoComplete="username"
                        {...register('username')}
                        className="flex-1 min-w-0 h-full pr-3 bg-transparent outline-none text-gray-900 text-sm placeholder:text-gray-400"
                        placeholder={t('auth.login.username.placeholder')}
                      />
                    </div>
                    {errors.username && (
                      <p className="mt-1.5 text-xs text-red-600 font-medium" role="alert">{errors.username.message}</p>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label
                      htmlFor="password"
                      className="block text-[#C62828] text-sm font-bold mb-2 leading-relaxed"
                    >
                      {t('auth.login.password.label')}
                    </label>
                    <div className="flex items-center h-10 bg-white border-2 border-[#C62828] rounded-lg focus-within:ring-2 focus-within:ring-[#C62828]/40 transition-shadow">
                      <div className="pl-3 pr-2 flex items-center justify-center text-gray-600 shrink-0">
                        <Lock size={18} />
                      </div>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        data-testid="password-input"
                        autoComplete="current-password"
                        {...register('password')}
                        className="flex-1 min-w-0 h-full bg-transparent outline-none text-gray-900 text-sm placeholder:text-gray-400"
                        placeholder={t('auth.login.password.placeholder')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="mr-1.5 w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded transition-colors shrink-0"
                        aria-label={showPassword ? t('auth.login.password.hide') : t('auth.login.password.show')}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="mt-1.5 text-xs text-red-600 font-medium" role="alert">{errors.password.message}</p>
                    )}
                  </div>

                  {/* Remember Me — moved above button so it's not at the form edge */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      id="remember-me"
                      type="checkbox"
                      data-testid="remember-me-checkbox"
                      {...register('rememberMe')}
                      className="w-5 h-5 accent-[#FF69B4] cursor-pointer"
                    />
                    <label
                      htmlFor="remember-me"
                      className="text-[#C62828] text-sm font-medium cursor-pointer select-none leading-relaxed"
                    >
                      {t('auth.login.rememberMe.label')}
                    </label>
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    data-testid="login-btn"
                    disabled={isSubmitting}
                    className="w-full h-10 bg-[#C62828] hover:bg-[#A91D1D] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg active:scale-95 transition-all shadow-md tracking-wider mt-2"
                  >
                    {isSubmitting ? t('auth.login.submit.pending') : t('auth.login.submit.idle')}
                  </button>

                  {/* Server error — placed AFTER button per US-W001 NP-01 */}
                  {serverError && (
                    <div
                      role="alert"
                      data-testid="login-error-message"
                      className="px-3 py-2 bg-red-50 border border-red-500 rounded-lg"
                    >
                      <p className="text-red-700 font-medium text-center text-xs">{serverError}</p>
                    </div>
                  )}
                </form>

                <div className="border-t border-[#C62828]/30 mt-6 pt-4">
                  <p className="text-[#C62828] text-xs font-semibold mb-2 text-center">{t('auth.login.demo.title')}</p>
                  <div className="space-y-1 text-xs text-[#C62828]/80">
                    {DEMO_ACCOUNTS.map((account) => (
                      <div key={account.username} className="flex justify-between px-2 py-1 bg-[#C62828]/5 rounded">
                        <span>{account.username}</span>
                        <span className="font-mono">{account.password}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <GlobalFooter />
    </div>
  )
}
