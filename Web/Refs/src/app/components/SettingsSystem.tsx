import { useState } from 'react';
import { Settings, Save, Database, Mail, MapPin, Clock, Globe, Building2, Phone, AlertCircle } from 'lucide-react';

export function SettingsSystem() {
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'organization' | 'email' | 'backup'>('general');

  const [generalSettings, setGeneralSettings] = useState({
    systemName: 'Hệ Thống Quản Lý Dân Quân Tự Vệ',
    timezone: 'Asia/Ho_Chi_Minh',
    dateFormat: 'DD/MM/YYYY',
    language: 'vi',
    sessionTimeout: '30',
  });

  const [organizationSettings, setOrganizationSettings] = useState({
    orgName: 'UBND Phường Phú Định',
    orgAddress: 'Phường Phú Định, Quận 8, TP. Hồ Chí Minh',
    orgPhone: '028-xxxx-xxxx',
    orgEmail: 'phuddinh.q8@tphcm.gov.vn',
    orgWebsite: 'https://q8.hochiminhcity.gov.vn',
  });

  const [emailSettings, setEmailSettings] = useState({
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpUser: 'system@phuddinh.gov.vn',
    smtpPassword: '••••••••',
    senderName: 'Hệ Thống DQTV Phú Định',
    senderEmail: 'noreply@phuddinh.gov.vn',
  });

  const [backupSettings, setBackupSettings] = useState({
    autoBackup: true,
    backupFrequency: 'daily',
    backupTime: '02:00',
    retentionDays: '30',
  });

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1000);
  };

  const tabs = [
    { id: 'general' as const, label: 'Cài đặt chung', icon: Settings },
    { id: 'organization' as const, label: 'Thông tin cơ quan', icon: Building2 },
    { id: 'email' as const, label: 'Cấu hình Email', icon: Mail },
    { id: 'backup' as const, label: 'Sao lưu dữ liệu', icon: Database },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Cấu Hình Hệ Thống</h1>
          <p className="text-sm text-gray-600 mt-1">Quản lý các thiết lập tổng quan của hệ thống</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1b5e20] transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={18} />
          {isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-[#2E7D32] text-white px-4 py-3 rounded-lg">
          ✓ Lưu cấu hình thành công!
        </div>
      )}

      {/* Admin Only Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle size={20} className="text-[#F57C00] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-gray-700">
          <p className="font-medium text-[#F57C00]">Cảnh báo quan trọng:</p>
          <p className="mt-1">Chỉ quản trị viên hệ thống mới được phép thay đổi các cài đặt này. Vui lòng cẩn thận khi chỉnh sửa để tránh ảnh hưởng đến hoạt động của toàn hệ thống.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#1F3A5F] text-[#1F3A5F]'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-[#1F3A5F]">Cài đặt chung</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tên hệ thống
                </label>
                <input
                  type="text"
                  value={generalSettings.systemName}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, systemName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Globe size={16} className="inline mr-2" />
                  Múi giờ
                </label>
                <select
                  value={generalSettings.timezone}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, timezone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                >
                  <option value="Asia/Ho_Chi_Minh">Việt Nam (UTC+7)</option>
                  <option value="Asia/Bangkok">Bangkok (UTC+7)</option>
                  <option value="Asia/Singapore">Singapore (UTC+8)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Định dạng ngày tháng
                </label>
                <select
                  value={generalSettings.dateFormat}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, dateFormat: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ngôn ngữ
                </label>
                <select
                  value={generalSettings.language}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, language: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                >
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock size={16} className="inline mr-2" />
                  Thời gian hết phiên (phút)
                </label>
                <input
                  type="number"
                  value={generalSettings.sessionTimeout}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, sessionTimeout: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Organization Settings */}
        {activeTab === 'organization' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-[#1F3A5F]">Thông tin cơ quan</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Building2 size={16} className="inline mr-2" />
                  Tên cơ quan
                </label>
                <input
                  type="text"
                  value={organizationSettings.orgName}
                  onChange={(e) => setOrganizationSettings({ ...organizationSettings, orgName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone size={16} className="inline mr-2" />
                  Số điện thoại
                </label>
                <input
                  type="tel"
                  value={organizationSettings.orgPhone}
                  onChange={(e) => setOrganizationSettings({ ...organizationSettings, orgPhone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin size={16} className="inline mr-2" />
                  Địa chỉ
                </label>
                <input
                  type="text"
                  value={organizationSettings.orgAddress}
                  onChange={(e) => setOrganizationSettings({ ...organizationSettings, orgAddress: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail size={16} className="inline mr-2" />
                  Email
                </label>
                <input
                  type="email"
                  value={organizationSettings.orgEmail}
                  onChange={(e) => setOrganizationSettings({ ...organizationSettings, orgEmail: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Globe size={16} className="inline mr-2" />
                  Website
                </label>
                <input
                  type="url"
                  value={organizationSettings.orgWebsite}
                  onChange={(e) => setOrganizationSettings({ ...organizationSettings, orgWebsite: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Email Settings */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-[#1F3A5F]">Cấu hình Email SMTP</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={emailSettings.smtpHost}
                  onChange={(e) => setEmailSettings({ ...emailSettings, smtpHost: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SMTP Port
                </label>
                <input
                  type="text"
                  value={emailSettings.smtpPort}
                  onChange={(e) => setEmailSettings({ ...emailSettings, smtpPort: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SMTP Username
                </label>
                <input
                  type="text"
                  value={emailSettings.smtpUser}
                  onChange={(e) => setEmailSettings({ ...emailSettings, smtpUser: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SMTP Password
                </label>
                <input
                  type="password"
                  value={emailSettings.smtpPassword}
                  onChange={(e) => setEmailSettings({ ...emailSettings, smtpPassword: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tên người gửi
                </label>
                <input
                  type="text"
                  value={emailSettings.senderName}
                  onChange={(e) => setEmailSettings({ ...emailSettings, senderName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email người gửi
                </label>
                <input
                  type="email"
                  value={emailSettings.senderEmail}
                  onChange={(e) => setEmailSettings({ ...emailSettings, senderEmail: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <button className="px-4 py-2 bg-[#1F3A5F] text-white rounded-lg hover:bg-[#2d5380] transition-colors">
                Gửi email thử nghiệm
              </button>
            </div>
          </div>
        )}

        {/* Backup Settings */}
        {activeTab === 'backup' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-[#1F3A5F]">Cấu hình sao lưu dữ liệu</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Tự động sao lưu</p>
                  <p className="text-sm text-gray-600">Bật tính năng sao lưu tự động theo lịch</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={backupSettings.autoBackup}
                    onChange={(e) => setBackupSettings({ ...backupSettings, autoBackup: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2E7D32]"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tần suất sao lưu
                  </label>
                  <select
                    value={backupSettings.backupFrequency}
                    onChange={(e) => setBackupSettings({ ...backupSettings, backupFrequency: e.target.value })}
                    disabled={!backupSettings.autoBackup}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="hourly">Mỗi giờ</option>
                    <option value="daily">Hàng ngày</option>
                    <option value="weekly">Hàng tuần</option>
                    <option value="monthly">Hàng tháng</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Giờ sao lưu
                  </label>
                  <input
                    type="time"
                    value={backupSettings.backupTime}
                    onChange={(e) => setBackupSettings({ ...backupSettings, backupTime: e.target.value })}
                    disabled={!backupSettings.autoBackup}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lưu giữ (ngày)
                  </label>
                  <input
                    type="number"
                    value={backupSettings.retentionDays}
                    onChange={(e) => setBackupSettings({ ...backupSettings, retentionDays: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <button className="px-4 py-2 bg-[#1F3A5F] text-white rounded-lg hover:bg-[#2d5380] transition-colors flex items-center gap-2">
                  <Database size={18} />
                  Sao lưu ngay
                </button>
              </div>

              {/* Backup History */}
              <div className="pt-4 border-t border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3">Lịch sử sao lưu gần đây</h4>
                <div className="space-y-2">
                  {[
                    { date: '22/01/2025 02:00', size: '245 MB', status: 'success' },
                    { date: '21/01/2025 02:00', size: '243 MB', status: 'success' },
                    { date: '20/01/2025 02:00', size: '241 MB', status: 'success' },
                  ].map((backup, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Database size={16} className="text-[#2E7D32]" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{backup.date}</p>
                          <p className="text-xs text-gray-600">{backup.size}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-[#2E7D32] text-white rounded text-xs">Thành công</span>
                        <button className="text-[#1F3A5F] hover:text-[#2d5380] text-sm">Tải xuống</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
