import { useState } from 'react';
import { Eye, EyeOff, Shield, AlertCircle } from 'lucide-react';
import ForgotPassword from './ForgotPassword';

interface LoginDQTVProps {
  onLogin: (username: string, password: string) => void;
}

export default function LoginDQTV({ onLogin }: LoginDQTVProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Simulate authentication delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Demo accounts for DQTV
    const validAccounts = [
      { username: 'dqtv001', password: '123456' },
      { username: 'dqtv002', password: '123456' },
      { username: 'dqtv003', password: '123456' },
    ];

    const isValid = validAccounts.some(
      account => account.username === username && account.password === password
    );

    if (isValid) {
      onLogin(username, password);
    } else {
      setError('Tên đăng nhập hoặc mật khẩu không đúng');
      setIsLoading(false);
    }
  };

  // Show Forgot Password screen
  if (showForgotPassword) {
    return <ForgotPassword onBack={() => setShowForgotPassword(false)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] flex flex-col items-center justify-center p-4">
      {/* Logo and Header */}
      <div className="text-center mb-8">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-[#DC2626] shadow-lg">
          <Shield className="text-[#DC2626]" size={56} strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-extrabold text-[#DC2626] mb-2">Bảo vệ ANTT</h1>
        <p className="text-[#0F172A] font-bold text-lg">Dân Quân Tự Vệ</p>
        <p className="text-[#DC2626] font-semibold text-sm mt-1">Phường Hiệp Định - TP. HCM</p>
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

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-[#DC2626] font-bold hover:text-[#B91C1C] transition-colors"
              >
                Quên mật khẩu?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#DC2626] text-white py-3 rounded-lg font-extrabold text-lg hover:bg-[#B91C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg border-2 border-[#991B1B]"
            >
              {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t-2 border-[#DC2626]">
            <p className="text-xs text-[#64748B] text-center mb-2 font-semibold">
              Tài khoản demo:
            </p>
            <div className="bg-white rounded-lg p-3 border-2 border-[#FBBF24]">
              <p className="text-xs font-bold text-[#0F172A]">
                <span className="text-[#DC2626]">•</span> dqtv001 / 123456
              </p>
              <p className="text-xs font-bold text-[#0F172A]">
                <span className="text-[#DC2626]">•</span> dqtv002 / 123456
              </p>
              <p className="text-xs font-bold text-[#0F172A]">
                <span className="text-[#DC2626]">•</span> dqtv003 / 123456
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-[#0F172A] text-xs mt-4 font-semibold">
          Phiên bản 1.0.0 • © 2024 Công An Khu Vực
        </p>
      </div>
    </div>
  );
}