import { useState } from 'react';
import { ArrowLeft, Shield, Mail, Key, CheckCircle, AlertCircle } from 'lucide-react';

interface ForgotPasswordProps {
  onBack: () => void;
}

type Step = 'username' | 'otp' | 'newpassword' | 'success';

export default function ForgotPassword({ onBack }: ForgotPasswordProps) {
  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Valid demo accounts
  const validAccounts = ['dqtv001', 'dqtv002', 'dqtv003'];

  // Step 1: Submit Username
  const handleSubmitUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    await new Promise(resolve => setTimeout(resolve, 1000));

    if (validAccounts.includes(username)) {
      setStep('otp');
    } else {
      setError('Tên đăng nhập không tồn tại');
    }
    setIsLoading(false);
  };

  // Step 2: Submit OTP
  const handleSubmitOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const otpCode = otp.join('');
    // Demo OTP is always "123456"
    if (otpCode === '123456') {
      setStep('newpassword');
    } else {
      setError('Mã OTP không đúng');
    }
    setIsLoading(false);
  };

  // Step 3: Submit New Password
  const handleSubmitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));

    setStep('success');
    setIsLoading(false);
  };

  // Handle OTP input change
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  // Handle OTP backspace
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] flex flex-col items-center justify-center p-4">
      {/* Logo and Header */}
      <div className="text-center mb-8">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-[#DC2626] shadow-lg">
          <Shield className="text-[#DC2626]" size={56} strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-extrabold text-[#DC2626] mb-2">Bảo vệ ANTT</h1>
        <p className="text-[#0F172A] font-bold text-lg">Khôi phục mật khẩu</p>
      </div>

      {/* Form Container */}
      <div className="w-full max-w-md">
        <div className="bg-gradient-to-br from-[#FEF9C3] to-[#FEF3C7] rounded-2xl shadow-2xl p-6 border-4 border-[#DC2626]">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[#DC2626] font-bold mb-4 hover:text-[#B91C1C] transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Quay lại đăng nhập</span>
          </button>

          {/* Error Alert */}
          {error && (
            <div className="bg-[#FEE2E2] border-2 border-[#DC2626] text-[#DC2626] px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
              <AlertCircle size={20} />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          )}

          {/* STEP 1: Enter Username */}
          {step === 'username' && (
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-3">
                  <Mail className="text-white" size={32} />
                </div>
                <h2 className="text-2xl font-extrabold text-[#DC2626] mb-2">Quên mật khẩu?</h2>
                <p className="text-sm text-[#64748B]">Nhập tên đăng nhập để nhận mã OTP</p>
              </div>

              <form onSubmit={handleSubmitUsername} className="space-y-4">
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

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#DC2626] text-white py-3 rounded-lg font-extrabold text-lg hover:bg-[#B91C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg border-2 border-[#991B1B]"
                >
                  {isLoading ? 'Đang xử lý...' : 'Gửi mã OTP'}
                </button>
              </form>
            </div>
          )}

          {/* STEP 2: Enter OTP */}
          {step === 'otp' && (
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-3">
                  <Key className="text-white" size={32} />
                </div>
                <h2 className="text-2xl font-extrabold text-[#DC2626] mb-2">Nhập mã OTP</h2>
                <p className="text-sm text-[#64748B]">
                  Mã OTP đã được gửi đến số điện thoại đăng ký của <span className="font-bold text-[#DC2626]">{username}</span>
                </p>
              </div>

              <form onSubmit={handleSubmitOTP} className="space-y-6">
                {/* OTP Input Boxes */}
                <div className="flex justify-center gap-2">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      id={`otp-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-12 h-14 text-center text-2xl font-extrabold border-2 border-[#DC2626] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#DC2626] bg-white text-[#DC2626]"
                    />
                  ))}
                </div>

                <div className="text-center">
                  <p className="text-xs text-[#64748B] mb-2">Không nhận được mã?</p>
                  <button
                    type="button"
                    className="text-sm text-[#DC2626] font-bold hover:text-[#B91C1C] transition-colors"
                  >
                    Gửi lại mã OTP
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otp.some(d => !d)}
                  className="w-full bg-[#DC2626] text-white py-3 rounded-lg font-extrabold text-lg hover:bg-[#B91C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg border-2 border-[#991B1B]"
                >
                  {isLoading ? 'Đang xác thực...' : 'Xác nhận'}
                </button>
              </form>

              {/* Demo OTP Hint */}
              <div className="mt-4 p-3 bg-white rounded-lg border-2 border-[#FBBF24]">
                <p className="text-xs font-bold text-[#64748B] text-center">
                  💡 Demo OTP: <span className="text-[#DC2626]">123456</span>
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Enter New Password */}
          {step === 'newpassword' && (
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-3">
                  <Key className="text-white" size={32} />
                </div>
                <h2 className="text-2xl font-extrabold text-[#DC2626] mb-2">Đặt mật khẩu mới</h2>
                <p className="text-sm text-[#64748B]">Tạo mật khẩu mới cho tài khoản của bạn</p>
              </div>

              <form onSubmit={handleSubmitNewPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-[#0F172A] mb-2">
                    Mật khẩu mới
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-[#DC2626] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#DC2626] bg-white font-semibold text-[#0F172A]"
                    placeholder="••••••"
                    required
                  />
                  <p className="text-xs text-[#64748B] mt-1">Tối thiểu 6 ký tự</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#0F172A] mb-2">
                    Xác nhận mật khẩu
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-[#DC2626] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#DC2626] bg-white font-semibold text-[#0F172A]"
                    placeholder="••••••"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#DC2626] text-white py-3 rounded-lg font-extrabold text-lg hover:bg-[#B91C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg border-2 border-[#991B1B]"
                >
                  {isLoading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
                </button>
              </form>
            </div>
          )}

          {/* STEP 4: Success */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-full bg-[#15803D] flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="text-white" size={48} />
              </div>
              <h2 className="text-2xl font-extrabold text-[#DC2626] mb-2">Thành công!</h2>
              <p className="text-sm text-[#64748B] mb-6">
                Mật khẩu của bạn đã được đặt lại thành công
              </p>
              <button
                onClick={onBack}
                className="w-full bg-[#DC2626] text-white py-3 rounded-lg font-extrabold text-lg hover:bg-[#B91C1C] transition-colors shadow-lg border-2 border-[#991B1B]"
              >
                Quay lại đăng nhập
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[#0F172A] text-xs mt-4 font-semibold">
          Phiên bản 1.0.0 • © 2024 Công An Khu Vực
        </p>
      </div>
    </div>
  );
}
