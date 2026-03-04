import { useState } from 'react';
import { User, Mail, Phone, MapPin, Calendar, Save, Camera, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function SettingsProfile() {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [formData, setFormData] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || '',
    dateOfBirth: user?.dateOfBirth || '',
    citizenId: user?.citizenId || '',
    avatar: user?.avatar || '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    setIsSaving(true);
    // Simulate API call
    setTimeout(() => {
      setIsSaving(false);
      setIsEditing(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1000);
  };

  const handleCancel = () => {
    setFormData({
      fullName: user?.fullName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      address: user?.address || '',
      dateOfBirth: user?.dateOfBirth || '',
      citizenId: user?.citizenId || '',
      avatar: user?.avatar || '',
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Thông Tin Cá Nhân</h1>
          <p className="text-sm text-gray-600 mt-1">Quản lý thông tin tài khoản của bạn</p>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-[#1F3A5F] text-white rounded-lg hover:bg-[#2d5380] transition-colors"
          >
            Chỉnh sửa
          </button>
        )}
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-[#2E7D32] text-white px-4 py-3 rounded-lg flex items-center justify-between">
          <span>✓ Cập nhật thông tin thành công!</span>
          <button onClick={() => setShowSuccess(false)}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        {/* Avatar Section */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-[#1F3A5F] to-[#2d5380]">
          <div className="flex items-center gap-6">
            <div className="relative">
              <img
                src={formData.avatar}
                alt={formData.fullName}
                className="w-24 h-24 rounded-full border-4 border-white shadow-lg object-cover"
              />
              {isEditing && (
                <button className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
                  <Camera size={16} className="text-[#1F3A5F]" />
                </button>
              )}
            </div>
            <div className="text-white">
              <h2 className="text-xl font-bold">{formData.fullName}</h2>
              <p className="text-blue-100 mt-1">{user?.position}</p>
              <p className="text-blue-200 text-sm mt-1">Mã NV: {user?.id}</p>
            </div>
          </div>
        </div>

        {/* Form Section */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Họ và tên */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User size={16} className="inline mr-2" />
                Họ và tên
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail size={16} className="inline mr-2" />
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>

            {/* Số điện thoại */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone size={16} className="inline mr-2" />
                Số điện thoại
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>

            {/* Ngày sinh */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar size={16} className="inline mr-2" />
                Ngày sinh
              </label>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>

            {/* CCCD */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User size={16} className="inline mr-2" />
                Số CCCD/CMND
              </label>
              <input
                type="text"
                value={formData.citizenId}
                onChange={(e) => handleChange('citizenId', e.target.value)}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>

            {/* Địa chỉ */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin size={16} className="inline mr-2" />
                Địa chỉ
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                disabled={!isEditing}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600 resize-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          {isEditing && (
            <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1b5e20] transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={18} />
                {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Additional Info */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-[#1F3A5F] mb-4">Thông tin hệ thống</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Vai trò:</span>
            <span className="ml-2 font-medium text-gray-900">{user?.position}</span>
          </div>
          <div>
            <span className="text-gray-600">Trạng thái:</span>
            <span className="ml-2 px-2 py-1 bg-[#2E7D32] text-white rounded text-xs font-medium">Hoạt động</span>
          </div>
          <div>
            <span className="text-gray-600">Ngày tạo tài khoản:</span>
            <span className="ml-2 font-medium text-gray-900">01/01/2024</span>
          </div>
        </div>
      </div>
    </div>
  );
}
