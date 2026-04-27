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
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { GlobalFooter } from '@/components/layout/GlobalFooter'
import anttLogo from '@/assets/668337ed7f590a8cbedffff9ffd07736f5a4d4e3.png'

const loginSchema = z.object({
  username:   z.string().min(1, 'Vui lòng nhập tên đăng nhập'),
  password:   z.string().min(1, 'Vui lòng nhập mật khẩu'),
  rememberMe: z.boolean(),
})

type LoginFormValues = z.infer<typeof loginSchema>

interface LoginPageProps {
  onSuccess?: () => void
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const { login, isAuthenticated } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
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
    <div className="min-h-screen bg-[#F4F269] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img
              src={anttLogo}
              alt="Bảo vệ An ninh Trật tự"
              className="w-40 h-40 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          {/* Form container */}
          <div className="bg-[#F4F269] border-4 border-[#C62828] rounded-3xl p-8">
            <h1 className="text-[#C62828] text-2xl font-bold text-center mb-6">ĐĂNG NHẬP</h1>

            <form
              data-testid="login-form"
              onSubmit={onSubmit}
              className="space-y-5"
              aria-label="Đăng nhập"
              noValidate
            >
              <div>
                <label htmlFor="username" className="block text-sm font-bold text-[#C62828] mb-1">
                  Tên đăng nhập
                </label>
                <input
                  id="username"
                  type="text"
                  data-testid="username-input"
                  autoComplete="username"
                  {...register('username')}
                  className="w-full border-2 border-[#C62828] rounded-lg px-3 h-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] bg-white"
                  placeholder="Nhập tên đăng nhập"
                />
                {errors.username && (
                  <p className="mt-1 text-xs text-red-600" role="alert">{errors.username.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-bold text-[#C62828] mb-1">
                  Mật khẩu
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    data-testid="password-input"
                    autoComplete="current-password"
                    {...register('password')}
                    className="w-full border-2 border-[#C62828] rounded-lg px-3 pr-10 h-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] bg-white"
                    placeholder="Nhập mật khẩu"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#C62828] transition-colors"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600" role="alert">{errors.password.message}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="remember-me"
                  type="checkbox"
                  data-testid="remember-me-checkbox"
                  {...register('rememberMe')}
                  className="w-4 h-4 text-[#C62828] border-[#C62828] rounded accent-[#C62828]"
                />
                <label htmlFor="remember-me" className="text-sm text-[#0F172A]">
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
                className="w-full bg-[#C62828] hover:bg-[#A91D1D] disabled:opacity-60 text-white font-bold h-12 rounded-lg transition-colors"
              >
                {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>
            </form>
          </div>
        </div>
      </div>
      <GlobalFooter />
    </div>
  )
}
