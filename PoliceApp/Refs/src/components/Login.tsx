import { User, Lock, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import policeLogoImage from 'figma:asset/cccc01b1c29ac475b2229ca7212e280eb38c1430.png';

interface LoginProps {
  onLogin: (username: string, password: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!username.trim()) {
      setError('Vui lòng nhập tên đăng nhập');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu');
      return;
    }

    // Demo credentials - accept cakv001, cakv002, admin, vovattan
    const validUsers = ['cakv001', 'cakv002', 'admin', 'vovattan'];
    if (validUsers.includes(username.toLowerCase())) {
      onLogin(username, password);
    } else {
      setError('Tên đăng nhập hoặc mật khẩu không đúng');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] flex flex-col items-center justify-center px-6 py-12">
      {/* Police Logo */}
      <div className="mb-8">
        <img 
          src={policeLogoImage} 
          alt="Logo Công An" 
          className="w-32 h-32 md:w-40 md:h-40 object-contain drop-shadow-xl" 
        />
      </div>

      {/* Login Form Card */}
      <div className="w-full max-w-md bg-[#FEFCE8] rounded-3xl border-4 border-[#DC2626] shadow-2xl p-8">
        {/* Title */}
        <h1 className="text-3xl font-extrabold text-[#DC2626] text-center mb-8 tracking-tight">
          ĐĂNG NHẬP
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Username Input */}
          <div>
            <label className="block text-base font-bold text-[#DC2626] mb-2">
              Tài khoản
            </label>
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-12 bg-white border-2 border-[#DC2626] rounded-l-lg flex items-center justify-center">
                <User className="text-[#0F172A]" size={20} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder=""
                className="w-full h-12 pl-14 pr-4 bg-white border-2 border-[#DC2626] rounded-lg text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:border-[#DC2626] transition-all"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-base font-bold text-[#DC2626] mb-2">
              Mật khẩu
            </label>
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-12 bg-white border-2 border-[#DC2626] rounded-l-lg flex items-center justify-center">
                <Lock className="text-[#0F172A]" size={20} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=""
                className="w-full h-12 pl-14 pr-12 bg-white border-2 border-[#DC2626] rounded-lg text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:border-[#DC2626] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-[#FEE2E2] border-2 border-[#EF4444] rounded-lg p-3">
              <p className="text-sm text-[#EF4444] text-center font-semibold">{error}</p>
            </div>
          )}

          {/* Login Button */}
          <button
            type="submit"
            className="w-full h-12 bg-[#15803D] text-[#FEFCE8] font-extrabold text-lg rounded-lg shadow-lg hover:bg-[#166534] active:scale-[0.98] transition-all border-2 border-[#DC2626]"
          >
            ĐĂNG NHẬP
          </button>

          {/* Remember Me */}
          <div className="flex items-center justify-center pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-5 h-5 appearance-none border-2 border-[#DC2626] rounded bg-white checked:bg-[#15803D] checked:border-[#15803D] cursor-pointer transition-all"
                />
                {rememberMe && (
                  <svg className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-base font-semibold text-[#0F172A]">Ghi nhớ tôi</span>
            </label>
          </div>
        </form>

        {/* Demo Credentials Info */}
        <div className="mt-6 p-4 bg-white/50 border-2 border-[#F59E0B] rounded-lg">
          <p className="text-sm font-bold text-[#0F172A] mb-2 text-center">Tài khoản demo:</p>
          <div className="space-y-1 text-center">
            <p className="text-xs text-[#64748B]">
              <span className="font-semibold text-[#0F172A]">cakv001</span> / <span className="font-semibold text-[#0F172A]">cakv002</span>
            </p>
            <p className="text-xs text-[#64748B]">
              Mật khẩu: <span className="font-semibold text-[#0F172A]">123456</span>
            </p>
          </div>
        </div>
      </div>

      {/* Footer Text */}
      <div className="mt-6 text-center">
        <p className="text-sm font-bold text-[#DC2626] drop-shadow">
          HỆ THỐNG QUẢN LÝ DÂN QUÂN TỰ VỆ
        </p>
        <p className="text-xs text-[#0F172A] font-semibold mt-1">
          UBND Phường Phú Định - TP. Hồ Chí Minh
        </p>
      </div>
    </div>
  );
}