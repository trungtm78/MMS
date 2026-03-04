import { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Shield } from 'lucide-react';

export function SettingsPassword() {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Password strength checker
  const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
    if (!password) return { strength: 0, label: '', color: '' };
    
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (password.length >= 12) strength += 15;
    if (/[a-z]/.test(password)) strength += 15;
    if (/[A-Z]/.test(password)) strength += 15;
    if (/[0-9]/.test(password)) strength += 15;
    if (/[^a-zA-Z0-9]/.test(password)) strength += 15;

    if (strength <= 40) return { strength, label: 'Yếu', color: '#C62828' };
    if (strength <= 70) return { strength, label: 'Trung bình', color: '#F57C00' };
    return { strength, label: 'Mạnh', color: '#2E7D32' };
  };

  const passwordStrength = getPasswordStrength(formData.newPassword);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.currentPassword) {
      newErrors.currentPassword = 'Vui lòng nhập mật khẩu hiện tại';
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'Vui lòng nhập mật khẩu mới';
    } else if (formData.newPassword.length < 8) {
      newErrors.newPassword = 'Mật khẩu phải có ít nhất 8 ký tự';
    } else if (formData.newPassword === formData.currentPassword) {
      newErrors.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Vui lòng xác nhận mật khẩu mới';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setShowSuccess(false), 5000);
    }, 1000);
  };

  const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1F3A5F]">Đổi Mật Khẩu</h1>
        <p className="text-sm text-gray-600 mt-1">Cập nhật mật khẩu để bảo mật tài khoản của bạn</p>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-[#2E7D32] text-white px-4 py-3 rounded-lg flex items-center gap-3">
          <CheckCircle size={20} />
          <span>Đổi mật khẩu thành công! Vui lòng sử dụng mật khẩu mới cho lần đăng nhập tiếp theo.</span>
        </div>
      )}

      {/* Security Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Shield size={20} className="text-[#1F3A5F] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700">
            <p className="font-medium text-[#1F3A5F] mb-2">Khuyến nghị bảo mật:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Mật khẩu nên có ít nhất 8 ký tự</li>
              <li>Sử dụng kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt</li>
              <li>Không sử dụng thông tin cá nhân dễ đoán</li>
              <li>Thay đổi mật khẩu định kỳ 3-6 tháng</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Password Change Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="space-y-6">
          {/* Current Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mật khẩu hiện tại <span className="text-[#C62828]">*</span>
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPasswords.current ? 'text' : 'password'}
                value={formData.currentPassword}
                onChange={(e) => handleChange('currentPassword', e.target.value)}
                className={`w-full pl-10 pr-12 py-2 border rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent ${
                  errors.currentPassword ? 'border-[#C62828]' : 'border-gray-300'
                }`}
                placeholder="Nhập mật khẩu hiện tại"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('current')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.currentPassword && (
              <p className="text-[#C62828] text-sm mt-1 flex items-center gap-1">
                <AlertCircle size={14} />
                {errors.currentPassword}
              </p>
            )}
          </div>

          <div className="border-t border-gray-200 my-6"></div>

          {/* New Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mật khẩu mới <span className="text-[#C62828]">*</span>
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPasswords.new ? 'text' : 'password'}
                value={formData.newPassword}
                onChange={(e) => handleChange('newPassword', e.target.value)}
                className={`w-full pl-10 pr-12 py-2 border rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent ${
                  errors.newPassword ? 'border-[#C62828]' : 'border-gray-300'
                }`}
                placeholder="Nhập mật khẩu mới"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('new')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPasswords.new ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.newPassword && (
              <p className="text-[#C62828] text-sm mt-1 flex items-center gap-1">
                <AlertCircle size={14} />
                {errors.newPassword}
              </p>
            )}
            
            {/* Password Strength Indicator */}
            {formData.newPassword && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Độ mạnh mật khẩu:</span>
                  <span className="text-xs font-medium" style={{ color: passwordStrength.color }}>
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${passwordStrength.strength}%`,
                      backgroundColor: passwordStrength.color,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Xác nhận mật khẩu mới <span className="text-[#C62828]">*</span>
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPasswords.confirm ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
                className={`w-full pl-10 pr-12 py-2 border rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent ${
                  errors.confirmPassword ? 'border-[#C62828]' : 'border-gray-300'
                }`}
                placeholder="Nhập lại mật khẩu mới"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('confirm')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-[#C62828] text-sm mt-1 flex items-center gap-1">
                <AlertCircle size={14} />
                {errors.confirmPassword}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-[#1F3A5F] text-white rounded-lg hover:bg-[#2d5380] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Lock size={18} />
              {isSubmitting ? 'Đang xử lý...' : 'Đổi mật khẩu'}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                setErrors({});
              }}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Hủy
            </button>
          </div>
        </div>
      </form>

      {/* Last Changed Info */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock size={16} />
          <span>Mật khẩu được thay đổi lần cuối: <span className="font-medium text-gray-900">15/01/2025 - 14:30</span></span>
        </div>
      </div>
    </div>
  );
}

function Clock({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}
