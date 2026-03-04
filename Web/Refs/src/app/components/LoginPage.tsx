import { useState } from 'react';
import { Lock, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { GlobalFooter } from './GlobalFooter';
import logoAntt from 'figma:asset/cccc01b1c29ac475b2229ca7212e280eb38c1430.png';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    // Simulate network delay
    setTimeout(() => {
      const success = login(username, password);
      
      if (success) {
        setIsLoading(false);
        onLogin();
      } else {
        setIsLoading(false);
        setError('Tên đăng nhập hoặc mật khẩu không đúng!');
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#F4F269] flex flex-col">
      {/* Title */}
      <div className="w-full py-6">
        <h1 className="text-[#C62828] text-2xl md:text-3xl font-bold text-center"></h1>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md flex flex-col items-center justify-center gap-8">
          {/* Logo - Now on Top */}
          <div className="flex flex-col items-center justify-center">
            <img 
              src={logoAntt} 
              alt="Logo An ninh trật tự" 
              className="w-40 h-40 md:w-48 md:h-48 object-contain"
            />
          </div>

          {/* Login Form - Now Below Logo */}
          <div className="w-full">
            <div className="bg-[#F4F269] border-4 border-[#C62828] rounded-3xl p-8">
              <h3 className="text-[#C62828] text-2xl font-bold text-center mb-6">ĐĂNG NHẬP</h3>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Username */}
                <div>
                  <label className="block text-[#C62828] font-bold mb-2">
                    Tài khoản
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center">
                      <User size={20} className="text-gray-700" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full h-12 pl-12 pr-4 bg-white border-3 border-[#C62828] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] text-gray-900"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[#C62828] font-bold mb-2">
                    Mật khẩu
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center">
                      <Lock size={20} className="text-gray-700" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-12 pl-12 pr-12 bg-white border-3 border-[#C62828] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] text-gray-900"
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff size={20} className="text-gray-700" />
                      ) : (
                        <Eye size={20} className="text-gray-700" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 bg-[#C62828] text-white text-lg font-bold rounded-lg hover:bg-[#A91D1D] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg mt-6"
                >
                  {isLoading ? 'ĐANG ĐĂNG NHẬP...' : 'ĐĂNG NHẬP'}
                </button>

                {/* Error Message */}
                {error && (
                  <div className="p-3 bg-red-100 border-2 border-red-600 rounded-lg">
                    <p className="text-red-700 font-semibold text-center text-sm">{error}</p>
                  </div>
                )}

                {/* Remember Me */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-5 h-5 border-2 border-[#FF69B4] accent-[#FF69B4] rounded focus:ring-2 focus:ring-[#FF69B4]"
                  />
                  <label htmlFor="rememberMe" className="text-[#C62828] font-medium cursor-pointer">
                    Ghi nhớ tôi
                  </label>
                </div>

                {/* Demo Accounts Info */}
                <div className="pt-5 mt-5 border-t-2 border-[#C62828]">
                  <p className="text-[#C62828] font-bold text-xs mb-3 text-center">TÀI KHOẢN DEMO:</p>
                  <div className="space-y-1.5 text-xs text-gray-700">
                    <p><span className="font-semibold">Admin:</span> admin / Admin@123</p>
                    <p><span className="font-semibold">Lãnh đạo:</span> lanhdao1 / Leader@123</p>
                    <p><span className="font-semibold">Công an:</span> caphuong / Police@123</p>
                    <p><span className="font-semibold">Văn phòng:</span> nvvp1 / Staff@123</p>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <GlobalFooter />
    </div>
  );
}