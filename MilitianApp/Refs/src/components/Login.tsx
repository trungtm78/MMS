import { useState } from 'react';
import { User, Lock, Eye, EyeOff, AlertCircle, Shield } from 'lucide-react';
import logoImage from 'figma:asset/e84ffc931c5c4f64112e2ce4f8a20298edf80518.png';

import type { Role, UserData } from '../types/app';

interface LoginProps {
  onLogin: (role: Role, userData: UserData) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetPhone, setResetPhone] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // Mock accounts
  const accounts = {
    'dqtv001': { password: '123456', role: 'dqtv' as const, name: 'Nguyễn Văn An', code: 'HCM-PHD-T12-0001' },
    'dqtv002': { password: '123456', role: 'dqtv' as const, name: 'Trần Thị Bình', code: 'HCM-PHD-T12-0002' },
    'dqtv003': { password: '123456', role: 'dqtv' as const, name: 'Lê Văn Cường', code: 'HCM-PHD-T12-0003' },
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    const account = accounts[username as keyof typeof accounts];
    
    if (!account) {
      setError('Tài khoản không tồn tại');
      return;
    }

    if (account.password !== password) {
      setError('Mật khẩu không chính xác');
      return;
    }

    // Simulate API call with loading state
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    // Login success
    onLogin(account.role, {
      username,
      name: account.name,
      code: account.code,
    });
    
    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPhone) return;
    
    // Simulate sending reset link
    await new Promise(resolve => setTimeout(resolve, 1000));
    setResetSuccess(true);
    setTimeout(() => {
      setShowForgotPassword(false);
      setResetSuccess(false);
      setResetPhone('');
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="mx-auto w-40 h-40 relative">
          <img 
            src={logoImage} 
            alt="Logo Bảo vệ ANTT" 
            className="w-full h-full object-contain drop-shadow-2xl"
          />
        </div>
      </div>

      {/* Login Form */}
      <div className="w-full max-w-md">
        <div className="bg-gradient-to-br from-[#FEF9C3] to-[#FEF3C7] rounded-2xl shadow-2xl p-6 border-4 border-[#DC2626]">
          <h2 className="text-2xl font-extrabold text-[#DC2626] mb-6 text-center">Đăng nhập</h2>
          
          {error && (
            <div className="bg-[#FEE2E2] border-2 border-[#DC2626] text-[#DC2626] px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
              <AlertCircle size={20} />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-[#0F172A] mb-2">
                Tên đăng nhập
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border-2 border-[#DC2626] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#DC2626] bg-white font-semibold text-[#0F172A]"
                placeholder="dqtv001"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[#0F172A] mb-2">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-[#DC2626] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#DC2626] bg-white font-semibold text-[#0F172A] pr-12"
                  placeholder="••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#DC2626]"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-2 border-[#DC2626] text-[#15803D] focus:ring-2 focus:ring-[#DC2626] cursor-pointer"
                />
                <span className="text-sm font-semibold text-[#0F172A]">Ghi nhớ</span>
              </label>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm font-bold text-[#DC2626] hover:underline"
              >
                Quên mật khẩu?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#15803D] text-white py-3 rounded-lg font-extrabold text-base hover:bg-[#166534] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg border-2 border-[#166534]"
            >
              {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t-2 border-[#DC2626]">
            <p className="text-xs text-[#64748B] text-center mb-3 font-semibold">
              Tài khoản demo:
            </p>
            <div className="bg-white rounded-lg p-3 border-2 border-[#FBBF24]">
              <p className="text-sm font-bold text-[#0F172A] mb-1">
                <span className="text-[#DC2626]">•</span> dqtv001 / 123456
              </p>
              <p className="text-sm font-bold text-[#0F172A] mb-1">
                <span className="text-[#DC2626]">•</span> dqtv002 / 123456
              </p>
              <p className="text-sm font-bold text-[#0F172A]">
                <span className="text-[#DC2626]">•</span> dqtv003 / 123456
              </p>
            </div>
          </div>
        </div>

        {/* Footer Text Below Form */}
        <div className="text-center mt-6">
          <h1 className="text-base font-extrabold text-[#DC2626] mb-2 uppercase tracking-wide">
            Hệ thống quản lý dân quân tự vệ
          </h1>
          <p className="text-sm text-[#0F172A] font-semibold">
            UBND Phường Phú Định - TP. Hồ Chí Minh
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-[#FEF9C3] to-[#FEF3C7] rounded-2xl shadow-2xl p-6 border-4 border-[#DC2626] w-full max-w-md">
            <h3 className="text-xl font-extrabold text-[#DC2626] mb-4 text-center">
              Quên mật khẩu
            </h3>
            
            {!resetSuccess ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-sm text-[#0F172A] font-semibold mb-4">
                  Vui lòng nhập số điện thoại đã đăng ký. Chúng tôi sẽ gửi mã xác thực để đặt lại mật khẩu.
                </p>
                
                <div>
                  <label className="block text-sm font-bold text-[#0F172A] mb-2">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    value={resetPhone}
                    onChange={(e) => setResetPhone(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-[#DC2626] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#DC2626] bg-white font-semibold text-[#0F172A]"
                    placeholder="0912345678"
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetPhone('');
                    }}
                    className="flex-1 bg-white text-[#DC2626] py-3 rounded-lg font-bold border-2 border-[#DC2626] hover:bg-[#FEE2E2] transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#15803D] text-white py-3 rounded-lg font-bold hover:bg-[#166534] transition-colors border-2 border-[#166534]"
                  >
                    Gửi mã
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-[#15803D] rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-[#15803D] font-bold text-lg mb-2">Thành công!</p>
                <p className="text-sm text-[#0F172A] font-semibold">
                  Mã xác thực đã được gửi đến số điện thoại của bạn.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}