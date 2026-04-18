// US-W001 AC-1: Login page with JWT authentication
// data-testid map: login-form, username-input, password-input, remember-me-checkbox,
//                  login-btn, login-error-message
// F4: migrated from controlled useState inputs to react-hook-form + zodResolver
//     for consistency with other forms and to eliminate per-keystroke re-renders
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'

const loginSchema = z.object({
  username:   z.string().min(1, 'Vui lòng nhập tên đăng nhập'),
  password:   z.string().min(1, 'Vui lòng nhập mật khẩu'),
  rememberMe: z.boolean().default(false),
})

type LoginFormValues = z.infer<typeof loginSchema>

interface LoginPageProps {
  onSuccess?: () => void
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const { login, isAuthenticated } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '', rememberMe: false },
  })

  // Already authenticated — redirect to dashboard (must be after all hooks)
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const onSubmit = handleSubmit(async ({ username, password, rememberMe }) => {
    setServerError(null)
    try {
      await login({ username, password, rememberMe })
      onSuccess?.()
    } catch (err: unknown) {
      // US-W001 NP-01: Vague error message — do not reveal if username exists
      const axiosError = err as { response?: { status?: number; data?: { message?: string } } }
      if (axiosError.response?.status === 423) {
        // US-W001 NP-02: Account locked
        setServerError('Tài khoản đã bị khóa tạm thời. Vui lòng thử lại sau 30 phút.')
      } else if (axiosError.response?.status === 403) {
        setServerError('Tài khoản đã bị vô hiệu hóa. Liên hệ quản trị viên.')
      } else {
        setServerError('Tên đăng nhập hoặc mật khẩu không đúng.')
      }
    }
  })

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        {/* Logo / title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">M</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Hệ thống MMS</h1>
          <p className="text-slate-500 text-sm mt-1">Quản lý Dân Quân Tự Vệ</p>
        </div>

        <form
          data-testid="login-form"
          onSubmit={onSubmit}
          className="space-y-5"
          aria-label="Đăng nhập"
          noValidate
        >
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
              Tên đăng nhập
            </label>
            <input
              id="username"
              type="text"
              data-testid="username-input"
              autoComplete="username"
              {...register('username')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nhập tên đăng nhập"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              data-testid="password-input"
              autoComplete="current-password"
              {...register('password')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nhập mật khẩu"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="remember-me"
              type="checkbox"
              data-testid="remember-me-checkbox"
              {...register('rememberMe')}
              className="w-4 h-4 text-blue-600 border-slate-300 rounded"
            />
            <label htmlFor="remember-me" className="text-sm text-slate-600">
              Ghi nhớ tôi (7 ngày)
            </label>
          </div>

          {/* US-W001 NP-01: Server error message */}
          {serverError && (
            <div
              role="alert"
              data-testid="login-error-message"
              className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"
            >
              {serverError}
            </div>
          )}

          <button
            type="submit"
            data-testid="login-btn"
            disabled={isSubmitting}
            className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
