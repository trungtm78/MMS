// US-W001 AC-1: Login page with JWT authentication
// data-testid map: login-form, username-input, password-input, remember-me-checkbox,
//                  login-btn, login-error-message
// Design ported from Web/Refs/src/app/components/LoginPage.tsx (proportions match Refs)
// Icon-in-input uses flex row (not absolute) to prevent overlap with entered text.
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, User, Lock } from 'lucide-react'
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

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const onSubmit = handleSubmit(async ({ username, password, rememberMe }) => {
    setServerError(null)
    try {
      await login({ username, password, rememberMe })
      onSuccess?.()
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { message?: string } } }
      if (axiosError.response?.status === 423) {
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
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md flex flex-col items-center justify-center gap-8">
          {/* Logo */}
          <img
            src={anttLogo}
            alt="Bảo vệ An ninh Trật tự"
            className="w-36 h-36 md:w-44 md:h-44 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />

          {/* Form container */}
          <div className="w-full bg-[#F4F269] border-4 border-[#C62828] rounded-3xl px-10 pt-7 pb-8">
            <h3 className="text-[#C62828] text-2xl font-bold text-center mb-7 leading-relaxed tracking-wide">
              ĐĂNG NHẬP
            </h3>

            <form
              data-testid="login-form"
              onSubmit={onSubmit}
              className="space-y-5"
              aria-label="Đăng nhập"
              noValidate
            >
              {/* Username */}
              <div>
                <label
                  htmlFor="username"
                  className="block text-[#C62828] text-sm font-bold mb-2 leading-relaxed"
                >
                  Tài khoản
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
                    placeholder="Nhập tên đăng nhập"
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
                  Mật khẩu
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
                    placeholder="Nhập mật khẩu"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="mr-1.5 w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded transition-colors shrink-0"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
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
                  Ghi nhớ đăng nhập
                </label>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                data-testid="login-btn"
                disabled={isSubmitting}
                className="w-full h-10 bg-[#C62828] hover:bg-[#A91D1D] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg active:scale-95 transition-all shadow-md tracking-wider mt-2"
              >
                {isSubmitting ? 'ĐANG ĐĂNG NHẬP...' : 'ĐĂNG NHẬP'}
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
              <p className="text-[#C62828] text-xs font-semibold mb-2 text-center">Tài khoản demo</p>
              <div className="space-y-1 text-xs text-[#C62828]/80">
                <div className="flex justify-between px-2 py-1 bg-[#C62828]/5 rounded">
                  <span>admin</span>
                  <span className="font-mono">Admin@123</span>
                </div>
                <div className="flex justify-between px-2 py-1 bg-[#C62828]/5 rounded">
                  <span>dqtv01</span>
                  <span className="font-mono">Dqtv@123</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <GlobalFooter />
    </div>
  )
}
