import { useState } from 'react';
import { Bell, Mail, MessageSquare, Smartphone, Save, Volume2, VolumeX } from 'lucide-react';

interface NotificationSetting {
  id: string;
  category: string;
  label: string;
  description: string;
  email: boolean;
  push: boolean;
  sms: boolean;
  inApp: boolean;
}

export function SettingsNotifications() {
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [muteAll, setMuteAll] = useState(false);

  const [settings, setSettings] = useState<NotificationSetting[]>([
    {
      id: '1',
      category: 'Nhiệm vụ',
      label: 'Nhiệm vụ mới được giao',
      description: 'Nhận thông báo khi có nhiệm vụ mới được giao cho bạn',
      email: true,
      push: true,
      sms: false,
      inApp: true,
    },
    {
      id: '2',
      category: 'Nhiệm vụ',
      label: 'Sắp đến hạn nhiệm vụ',
      description: 'Nhắc nhở trước 24h khi nhiệm vụ sắp đến hạn',
      email: true,
      push: true,
      sms: false,
      inApp: true,
    },
    {
      id: '3',
      category: 'Nhiệm vụ',
      label: 'Quá hạn nhiệm vụ',
      description: 'Cảnh báo khi có nhiệm vụ bị quá hạn',
      email: true,
      push: true,
      sms: true,
      inApp: true,
    },
    {
      id: '4',
      category: 'Chấm công',
      label: 'Nhắc nhở chấm công',
      description: 'Nhắc nhở chấm công vào đầu ca và cuối ca',
      email: false,
      push: true,
      sms: false,
      inApp: true,
    },
    {
      id: '5',
      category: 'Chấm công',
      label: 'Thiếu chấm công',
      description: 'Cảnh báo khi quên chấm công',
      email: true,
      push: true,
      sms: false,
      inApp: true,
    },
    {
      id: '6',
      category: 'Đơn từ',
      label: 'Đơn từ được duyệt',
      description: 'Thông báo khi đơn từ của bạn được phê duyệt hoặc từ chối',
      email: true,
      push: true,
      sms: false,
      inApp: true,
    },
    {
      id: '7',
      category: 'Đơn từ',
      label: 'Đơn từ cần duyệt',
      description: 'Thông báo cho cấp quản lý khi có đơn từ cần duyệt',
      email: true,
      push: true,
      sms: false,
      inApp: true,
    },
    {
      id: '8',
      category: 'Tuyển dụng',
      label: 'Hồ sơ ứng tuyển mới',
      description: 'Thông báo khi có hồ sơ ứng tuyển mới',
      email: true,
      push: false,
      sms: false,
      inApp: true,
    },
    {
      id: '9',
      category: 'Hệ thống',
      label: 'Cập nhật hệ thống',
      description: 'Thông báo về các bản cập nhật và bảo trì hệ thống',
      email: true,
      push: false,
      sms: false,
      inApp: true,
    },
    {
      id: '10',
      category: 'Hệ thống',
      label: 'Thông báo quan trọng',
      description: 'Thông báo khẩn cấp và quan trọng từ ban quản lý',
      email: true,
      push: true,
      sms: true,
      inApp: true,
    },
  ]);

  const handleToggle = (id: string, channel: 'email' | 'push' | 'sms' | 'inApp') => {
    setSettings(settings.map(setting => {
      if (setting.id === id) {
        return { ...setting, [channel]: !setting[channel] };
      }
      return setting;
    }));
  };

  const handleMuteAll = (mute: boolean) => {
    setMuteAll(mute);
    if (mute) {
      setSettings(settings.map(s => ({
        ...s,
        email: false,
        push: false,
        sms: false,
        inApp: false,
      })));
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1000);
  };

  const categories = [...new Set(settings.map(s => s.category))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Cấu Hình Thông Báo</h1>
          <p className="text-sm text-gray-600 mt-1">Tùy chỉnh các kênh nhận thông báo của bạn</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1b5e20] transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={18} />
          {isSaving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-[#2E7D32] text-white px-4 py-3 rounded-lg">
          ✓ Cập nhật cài đặt thông báo thành công!
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-[#1F3A5F] mb-4">Tùy chọn nhanh</h3>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            {muteAll ? <VolumeX size={20} className="text-[#C62828]" /> : <Volume2 size={20} className="text-[#2E7D32]" />}
            <div>
              <p className="font-medium text-gray-900">
                {muteAll ? 'Tắt tất cả thông báo' : 'Bật tất cả thông báo'}
              </p>
              <p className="text-sm text-gray-600">
                {muteAll ? 'Bạn sẽ không nhận bất kỳ thông báo nào' : 'Nhận thông báo từ tất cả các kênh'}
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={muteAll}
              onChange={(e) => handleMuteAll(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C62828]"></div>
          </label>
        </div>
      </div>

      {/* Notification Settings by Category */}
      {categories.map((category) => (
        <div key={category} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {/* Category Header */}
          <div className="bg-gradient-to-r from-[#1F3A5F] to-[#2d5380] px-6 py-3">
            <h3 className="font-semibold text-white">{category}</h3>
          </div>

          {/* Settings Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Loại thông báo
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    <Mail size={16} className="inline mr-1" />
                    Email
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    <Bell size={16} className="inline mr-1" />
                    Push
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    <MessageSquare size={16} className="inline mr-1" />
                    SMS
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    <Smartphone size={16} className="inline mr-1" />
                    In-App
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {settings
                  .filter((s) => s.category === category)
                  .map((setting) => (
                    <tr key={setting.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{setting.label}</p>
                          <p className="text-sm text-gray-600">{setting.description}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={setting.email}
                            onChange={() => handleToggle(setting.id, 'email')}
                            disabled={muteAll}
                            className="w-5 h-5 text-[#2E7D32] border-gray-300 rounded focus:ring-[#1F3A5F] disabled:opacity-50"
                          />
                        </label>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={setting.push}
                            onChange={() => handleToggle(setting.id, 'push')}
                            disabled={muteAll}
                            className="w-5 h-5 text-[#2E7D32] border-gray-300 rounded focus:ring-[#1F3A5F] disabled:opacity-50"
                          />
                        </label>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={setting.sms}
                            onChange={() => handleToggle(setting.id, 'sms')}
                            disabled={muteAll}
                            className="w-5 h-5 text-[#2E7D32] border-gray-300 rounded focus:ring-[#1F3A5F] disabled:opacity-50"
                          />
                        </label>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={setting.inApp}
                            onChange={() => handleToggle(setting.id, 'inApp')}
                            disabled={muteAll}
                            className="w-5 h-5 text-[#2E7D32] border-gray-300 rounded focus:ring-[#1F3A5F] disabled:opacity-50"
                          />
                        </label>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Notification Methods Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-[#1F3A5F] mb-3">Giải thích các kênh thông báo</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <Mail size={16} className="text-[#1F3A5F] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Email</p>
              <p className="text-gray-600">Gửi thông báo qua email đã đăng ký</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Bell size={16} className="text-[#1F3A5F] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Push Notification</p>
              <p className="text-gray-600">Thông báo đẩy trên thiết bị di động</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MessageSquare size={16} className="text-[#1F3A5F] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">SMS</p>
              <p className="text-gray-600">Tin nhắn SMS đến số điện thoại</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Smartphone size={16} className="text-[#1F3A5F] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">In-App</p>
              <p className="text-gray-600">Thông báo trong ứng dụng</p>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-[#1F3A5F] mb-4">Thống kê thông báo</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <Mail size={24} className="mx-auto mb-2 text-[#1F3A5F]" />
            <p className="text-2xl font-bold text-[#1F3A5F]">
              {settings.filter(s => s.email).length}
            </p>
            <p className="text-xs text-gray-600 mt-1">Email bật</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <Bell size={24} className="mx-auto mb-2 text-[#2E7D32]" />
            <p className="text-2xl font-bold text-[#2E7D32]">
              {settings.filter(s => s.push).length}
            </p>
            <p className="text-xs text-gray-600 mt-1">Push bật</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <MessageSquare size={24} className="mx-auto mb-2 text-purple-600" />
            <p className="text-2xl font-bold text-purple-600">
              {settings.filter(s => s.sms).length}
            </p>
            <p className="text-xs text-gray-600 mt-1">SMS bật</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <Smartphone size={24} className="mx-auto mb-2 text-[#F57C00]" />
            <p className="text-2xl font-bold text-[#F57C00]">
              {settings.filter(s => s.inApp).length}
            </p>
            <p className="text-xs text-gray-600 mt-1">In-App bật</p>
          </div>
        </div>
      </div>
    </div>
  );
}
