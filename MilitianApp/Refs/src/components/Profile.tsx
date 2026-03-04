import { useState } from 'react';
import {
  Phone,
  Mail,
  MapPin,
  IdCard,
  Calendar,
  Briefcase,
  DollarSign,
  FileText,
  Bell,
  Moon,
  Lock,
  Globe,
  Info,
  HelpCircle,
  LogOut,
  ChevronRight,
  Edit,
  Copy,
  Download,
  Users,
  Settings,
  ArrowLeft,
} from 'lucide-react';
import { LeaveRequest } from './LeaveRequest';
import { MyRequests } from './MyRequests';

export function Profile({ onLogout, onBack }: { onLogout: () => void; onBack?: () => void }) {
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaveRequest, setShowLeaveRequest] = useState(false);
  const [showMyRequests, setShowMyRequests] = useState(false);

  const userInfo = {
    name: 'Nguyễn Văn An',
    code: 'HCM-PHD-T12-0001',
    email: 'dqtv001@dqtv.com',
    dob: '15/05/1995 (28 tuổi)',
    address: '123 Đường ABC, Phường Phú Định, TP.HCM',
    cccd: '079095******',
    district: 'Khu phố 1',
    supervisor: 'Trung úy Võ Văn Tân',
    startDate: '01/10/2022',
    tenure: '2 năm 3 tháng',
    position: 'Dân quân thường trực',
    salary: 'X,XXX,XXX ₫/tháng',
    emergencyContact: {
      name: 'Nguyễn Thị Bích',
      relationship: 'Vợ',
      phone: '0916789012',
    },
  };

  const quickStats = [
    { label: 'Thâm niên', value: '2 năm 3 tháng' },
    { label: 'Điểm Chỉ tiêu', value: '92.4' },
    { label: 'Xếp hạng', value: '#3/28' },
  ];

  if (showSettings) {
    return <SettingsScreen onBack={() => setShowSettings(false)} />;
  }

  if (showLeaveRequest) {
    return <LeaveRequest onClose={() => setShowLeaveRequest(false)} />;
  }

  if (showMyRequests) {
    return <MyRequests onClose={() => setShowMyRequests(false)} />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <h1 className="text-xl font-extrabold text-[#DC2626]">Cá Nhân</h1>
      </div>

      {/* Profile Card */}
      <div className="px-4 pt-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border-2 border-[#15803D]">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#15803D] to-[#166534] flex items-center justify-center mb-4 mx-auto text-white text-2xl font-bold">
            NA
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center text-[#366092] font-bold text-2xl">
                {userInfo.name.split(' ').pop()?.charAt(0)}
              </div>
              <button className="absolute bottom-0 right-0 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-lg">
                <Edit className="w-4 h-4 text-[#366092]" />
              </button>
              <div className="absolute bottom-1 left-1 w-4 h-4 bg-[#10B981] border-2 border-white rounded-full"></div>
            </div>

            <h1 className="text-xl font-bold text-black mb-1">{userInfo.name}</h1>
            <p className="text-black/80 text-sm mb-2">{userInfo.code}</p>
            <span className="inline-block px-3 py-1 bg-black/20 text-black text-xs rounded-full backdrop-blur-sm">
              {userInfo.position}
            </span>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
              <span className="text-black/90 text-sm">Đang hoạt động</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="px-4 -mt-12 mb-4">
        <div className="grid grid-cols-3 gap-3">
          {quickStats.map((stat, index) => (
            <div key={index} className="bg-white rounded-xl p-3 shadow-sm text-center">
              <p className="text-xs text-[#64748B] mb-1">{stat.label}</p>
              <p className="text-sm font-bold text-[#0F172A]">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Personal Info */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#0F172A]">Thông tin cá nhân</h2>
            <button className="text-[#366092] text-sm font-medium">
              <Edit className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
              <Phone className="w-5 h-5 text-[#64748B] mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Số điện thoại</p>
                <p className="text-sm font-medium text-[#0F172A]">0909123456</p>
              </div>
              <div className="flex gap-2">
                <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <Copy className="w-4 h-4 text-[#64748B]" />
                </button>
                <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <Phone className="w-4 h-4 text-[#10B981]" />
                </button>
              </div>
            </div>

            <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
              <Mail className="w-5 h-5 text-[#64748B] mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Email</p>
                <p className="text-sm font-medium text-[#0F172A]">{userInfo.email}</p>
              </div>
              <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <Copy className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>

            <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
              <Calendar className="w-5 h-5 text-[#64748B] mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Ngày sinh</p>
                <p className="text-sm font-medium text-[#0F172A]">{userInfo.dob}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
              <MapPin className="w-5 h-5 text-[#64748B] mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Địa chỉ</p>
                <p className="text-sm font-medium text-[#0F172A]">{userInfo.address}</p>
              </div>
              <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <MapPin className="w-4 h-4 text-[#366092]" />
              </button>
            </div>

            <div className="flex items-start gap-3">
              <IdCard className="w-5 h-5 text-[#64748B] mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">CCCD</p>
                <p className="text-sm font-medium text-[#0F172A]">{userInfo.cccd}</p>
              </div>
              <button className="px-3 py-1 text-xs text-[#366092] font-medium border border-[#366092] rounded-lg">
                Hiển thị
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Work Info */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-[#0F172A] mb-4">Thông tin công tác</h2>

          <div className="space-y-3">
            <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
              <MapPin className="w-5 h-5 text-[#64748B] mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Khu phố</p>
                <p className="text-sm font-medium text-[#0F172A]">{userInfo.district}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
              <Users className="w-5 h-5 text-[#64748B] mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Công An KV</p>
                <p className="text-sm font-medium text-[#0F172A]">{userInfo.supervisor}</p>
              </div>
              <div className="flex gap-2">
                <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <Phone className="w-4 h-4 text-[#10B981]" />
                </button>
                <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <Mail className="w-4 h-4 text-[#366092]" />
                </button>
              </div>
            </div>

            <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
              <Calendar className="w-5 h-5 text-[#64748B] mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Ngày vào lực lượng</p>
                <p className="text-sm font-medium text-[#0F172A]">{userInfo.startDate}</p>
                <p className="text-xs text-[#64748B] mt-1">Thâm niên: {userInfo.tenure}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
              <Briefcase className="w-5 h-5 text-[#64748B] mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Ngạch công tác</p>
                <p className="text-sm font-medium text-[#0F172A]">{userInfo.position}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <DollarSign className="w-5 h-5 text-[#64748B] mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Lương cơ bản</p>
                <p className="text-sm font-medium text-[#0F172A]">{userInfo.salary}</p>
              </div>
              <button className="text-xs text-[#366092] font-medium">Xem chi tiết</button>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-[#0F172A] mb-4">Người liên hệ khẩn cấp</h2>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-[#F59E0B]/10 flex items-center justify-center text-[#F59E0B] font-bold">
              {userInfo.emergencyContact.name.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#0F172A]">{userInfo.emergencyContact.name}</p>
              <p className="text-xs text-[#64748B]">{userInfo.emergencyContact.relationship}</p>
              <p className="text-xs text-[#64748B]">{userInfo.emergencyContact.phone}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 py-2 bg-[#10B981] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              <Phone className="w-4 h-4" />
              Gọi
            </button>
            <button className="flex-1 py-2 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              <Mail className="w-4 h-4" />
              Nhắn tin
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowLeaveRequest(true)}
            className="bg-white rounded-xl p-4 shadow-sm text-left active:scale-98 transition-transform"
          >
            <FileText className="w-6 h-6 text-[#366092] mb-2" />
            <h3 className="text-sm font-semibold text-[#0F172A]">Đăng ký nghỉ phép</h3>
          </button>
          <button
            onClick={() => setShowMyRequests(true)}
            className="bg-white rounded-xl p-4 shadow-sm text-left active:scale-98 transition-transform"
          >
            <FileText className="w-6 h-6 text-[#366092] mb-2" />
            <h3 className="text-sm font-semibold text-[#0F172A]">Xem đơn đã gửi</h3>
          </button>
          <button className="bg-white rounded-xl p-4 shadow-sm text-left active:scale-98 transition-transform">
            <Calendar className="w-6 h-6 text-[#366092] mb-2" />
            <h3 className="text-sm font-semibold text-[#0F172A]">Lịch sử công tác</h3>
          </button>
          <button className="bg-white rounded-xl p-4 shadow-sm text-left active:scale-98 transition-transform">
            <Phone className="w-6 h-6 text-[#366092] mb-2" />
            <h3 className="text-sm font-semibold text-[#0F172A]">Hotline hỗ trợ</h3>
          </button>
        </div>
      </div>

      {/* Settings */}
      <div className="px-4 mb-20">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-[#64748B]" />
              <span className="text-sm font-medium text-[#0F172A]">Cài đặt</span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#64748B]" />
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-t border-gray-100">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-[#64748B]" />
              <span className="text-sm font-medium text-[#0F172A]">Về ứng dụng</span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#64748B]" />
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-t border-gray-100">
            <div className="flex items-center gap-3">
              <HelpCircle className="w-5 h-5 text-[#64748B]" />
              <span className="text-sm font-medium text-[#0F172A]">Hỗ trợ</span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#64748B]" />
          </button>

          <button
            className="w-full flex items-center justify-between p-4 bg-[#FEF2F2] border-2 border-[#FEE2E2] rounded-lg mt-3 hover:bg-[#FEE2E2] transition-colors"
            onClick={onLogout}
          >
            <div className="flex items-center gap-3">
              <LogOut className="w-5 h-5 text-[#EF4444]" />
              <span className="text-sm font-medium text-[#EF4444]">Đăng xuất</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [notifications, setNotifications] = useState({
    tasks: true,
    checkin: true,
    messages: true,
    sound: true,
    vibrate: true,
  });

  const [darkMode, setDarkMode] = useState<'auto' | 'light' | 'dark'>('light');
  const [biometric, setBiometric] = useState(true);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="bg-white pt-12 pb-4 px-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-[#366092] font-medium flex items-center gap-1">
            <ChevronRight className="w-5 h-5 rotate-180" />
            Quay lại
          </button>
          <h1 className="text-xl font-bold text-[#0F172A]">Cài đặt</h1>
          <div className="w-16"></div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Notifications */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-5 h-5 text-[#64748B]" />
            <h2 className="font-semibold text-[#0F172A]">Thông báo</h2>
          </div>

          <div className="space-y-4">
            {[
              { key: 'tasks', label: 'Nhiệm vụ mới' },
              { key: 'checkin', label: 'Nhắc nhở điểm danh' },
              { key: 'messages', label: 'Tin nhắn' },
              { key: 'sound', label: 'Âm thanh' },
              { key: 'vibrate', label: 'Rung' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-sm text-[#0F172A]">{item.label}</span>
                <button
                  onClick={() =>
                    setNotifications((prev) => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))
                  }
                  className={`w-12 h-7 rounded-full transition-colors ${
                    notifications[item.key as keyof typeof notifications] ? 'bg-[#366092]' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      notifications[item.key as keyof typeof notifications] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  ></div>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Moon className="w-5 h-5 text-[#64748B]" />
            <h2 className="font-semibold text-[#0F172A]">Giao diện</h2>
          </div>

          <div className="flex gap-3">
            {['auto', 'light', 'dark'].map((mode) => (
              <button
                key={mode}
                onClick={() => setDarkMode(mode as typeof darkMode)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  darkMode === mode
                    ? 'bg-[#366092] text-white'
                    : 'bg-gray-100 text-[#64748B]'
                }`}
              >
                {mode === 'auto' && 'Tự động'}
                {mode === 'light' && 'Sáng'}
                {mode === 'dark' && 'Tối'}
              </button>
            ))}
          </div>
        </div>

        {/* Security */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-5 h-5 text-[#64748B]" />
            <h2 className="font-semibold text-[#0F172A]">Bảo mật</h2>
          </div>

          <div className="space-y-4">
            <button className="w-full flex items-center justify-between">
              <span className="text-sm text-[#0F172A]">Đổi mật khẩu</span>
              <ChevronRight className="w-5 h-5 text-[#64748B]" />
            </button>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <span className="text-sm text-[#0F172A]">Face ID / Touch ID</span>
              <button
                onClick={() => setBiometric(!biometric)}
                className={`w-12 h-7 rounded-full transition-colors ${
                  biometric ? 'bg-[#366092]' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    biometric ? 'translate-x-6' : 'translate-x-1'
                  }`}
                ></div>
              </button>
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-5 h-5 text-[#64748B]" />
            <h2 className="font-semibold text-[#0F172A]">Ngôn ngữ</h2>
          </div>

          <div className="flex gap-3">
            <button className="flex-1 py-2 px-3 bg-[#366092] text-white rounded-lg text-sm font-medium">
              Tiếng Việt
            </button>
            <button className="flex-1 py-2 px-3 bg-gray-100 text-[#64748B] rounded-lg text-sm font-medium">
              English
            </button>
          </div>
        </div>

        {/* About */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#64748B]">Phiên bản</span>
            <span className="text-sm font-medium text-[#0F172A]">1.0.0</span>
          </div>
          <button className="w-full py-2 mt-2 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium">
            Kiểm tra cập nhật
          </button>
        </div>
      </div>
    </div>
  );
}