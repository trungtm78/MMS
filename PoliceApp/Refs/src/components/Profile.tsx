import { ArrowLeft, ChevronRight, Bell, Moon, Globe, Lock, Trash2, RefreshCw, Book, Phone, FileText, Shield, LogOut, User } from 'lucide-react';
import { useState } from 'react';

interface ProfileProps {
  onNavigate: (screen: string) => void;
  onLogout?: () => void;
}

export default function Profile({ onNavigate, onLogout }: ProfileProps) {
  const [notifications, setNotifications] = useState(true);
  const [sound, setSound] = useState(true);
  const [vibration, setVibration] = useState(true);
  const [faceID, setFaceID] = useState(true);
  const [newTask, setNewTask] = useState(true);
  const [progressUpdate, setProgressUpdate] = useState(true);
  const [overdue, setOverdue] = useState(true);
  const [attendance, setAttendance] = useState(false);
  const [gpsOffline, setGpsOffline] = useState(true);
  const [leaveRequest, setLeaveRequest] = useState(true);

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) => (
    <button
      onClick={() => onChange(!checked)}
      className={`w-12 h-7 rounded-full relative transition-colors ${
        checked ? 'bg-[#10B981]' : 'bg-[#E2E8F0]'
      }`}
    >
      <div
        className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      ></div>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Profile Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-8 border-b-4 border-[#DC2626]">
        <div className="text-center">
          <div className="w-24 h-24 rounded-full bg-white mx-auto mb-3 flex items-center justify-center border-4 border-[#DC2626] shadow-lg">
            <User className="text-[#DC2626]" size={48} />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Trung úy Võ Văn Tân</h2>
          <p className="text-sm text-white text-opacity-80 mb-1">CA-KV1-2024</p>
          <p className="text-sm text-white text-opacity-90">Công An Khu vực 1</p>
          <button className="mt-3 px-6 py-2 border-2 border-white text-white rounded-lg text-sm font-medium hover:bg-white hover:text-[#366092] transition-colors">
            Chỉnh sửa
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-white rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-[#0F172A]">28</p>
            <p className="text-xs text-[#64748B]">DQTV</p>
            <p className="text-xs text-[#64748B]">Quản lý</p>
          </div>
          <div className="bg-white rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-[#0F172A]">89.2</p>
            <p className="text-xs text-[#64748B]">Chỉ tiêu</p>
            <p className="text-xs text-[#64748B]">Trung bình</p>
          </div>
          <div className="bg-white rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-[#0F172A]">2 năm</p>
            <p className="text-xs text-[#64748B]">Kinh nghiệm</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* Personal Info Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F1F5F9]">
            <h3 className="text-sm font-semibold text-[#64748B]">Thông tin cá nhân</h3>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Phone className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#64748B]">Số điện thoại</p>
                <p className="text-sm font-medium text-[#0F172A]">0915678901</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <FileText className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#64748B]">Email</p>
                <p className="text-sm font-medium text-[#0F172A]">votan@dqtv.com</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Globe className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#64748B]">Địa chỉ</p>
                <p className="text-sm font-medium text-[#0F172A]">123 Đường ABC, Q1...</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
          </div>
        </div>

        {/* Work Info Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F1F5F9]">
            <h3 className="text-sm font-semibold text-[#64748B]">Thông tin công tác</h3>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Shield className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#64748B]">Khu vực quản lý</p>
                <p className="text-sm font-medium text-[#0F172A]">Khu phố 1</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Shield className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#64748B]">Cấp trên</p>
                <p className="text-sm font-medium text-[#0F172A]">Đại úy Phạm Tuấn</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <FileText className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#64748B]">Ngày nhận nhiệm</p>
                <p className="text-sm font-medium text-[#0F172A]">01/01/2023</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Shield className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#64748B]">Số DQTV</p>
                <p className="text-sm font-medium text-[#0F172A]">28 người</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
          </div>
        </div>

        {/* App Settings Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F1F5F9]">
            <h3 className="text-sm font-semibold text-[#64748B]">Cài đặt ứng dụng</h3>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Bell className="text-[#64748B]" size={20} />
                <span className="text-sm text-[#0F172A]">Thông báo</span>
              </div>
              <Toggle checked={notifications} onChange={setNotifications} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Bell className="text-[#64748B]" size={20} />
                <span className="text-sm text-[#0F172A]">Âm thanh</span>
              </div>
              <Toggle checked={sound} onChange={setSound} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Bell className="text-[#64748B]" size={20} />
                <span className="text-sm text-[#0F172A]">Rung</span>
              </div>
              <Toggle checked={vibration} onChange={setVibration} />
            </div>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Moon className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Giao diện</p>
              </div>
              <span className="text-sm text-[#64748B]">Sáng</span>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Globe className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Ngôn ngữ</p>
              </div>
              <span className="text-sm text-[#64748B]">Tiếng Việt</span>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
          </div>
        </div>

        {/* Notification Management Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F1F5F9]">
            <h3 className="text-sm font-semibold text-[#64748B]">Quản lý thông báo</h3>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[#0F172A]">Nhiệm vụ mới</span>
              <Toggle checked={newTask} onChange={setNewTask} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[#0F172A]">Cập nhật tiến độ</span>
              <Toggle checked={progressUpdate} onChange={setProgressUpdate} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#0F172A]">Quá hạn</span>
                <span className="text-xs text-[#64748B]">(bắt buộc)</span>
              </div>
              <Toggle checked={overdue} onChange={() => {}} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[#0F172A]">Chấm công</span>
              <Toggle checked={attendance} onChange={setAttendance} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[#0F172A]">GPS offline</span>
              <Toggle checked={gpsOffline} onChange={setGpsOffline} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[#0F172A]">Đơn từ</span>
              <Toggle checked={leaveRequest} onChange={setLeaveRequest} />
            </div>
          </div>
        </div>

        {/* Data & Security Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F1F5F9]">
            <h3 className="text-sm font-semibold text-[#64748B]">Dữ liệu & bảo mật</h3>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Lock className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Đổi mật khẩu</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Shield className="text-[#64748B]" size={20} />
                <span className="text-sm text-[#0F172A]">Face ID</span>
              </div>
              <Toggle checked={faceID} onChange={setFaceID} />
            </div>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Trash2 className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Xóa cache</p>
              </div>
              <span className="text-sm text-[#64748B]">1.2 GB</span>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <RefreshCw className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Sao lưu dữ liệu</p>
              </div>
              <span className="text-sm text-[#64748B]">Auto</span>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
          </div>
        </div>

        {/* About Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F1F5F9]">
            <h3 className="text-sm font-semibold text-[#64748B]">Về ứng dụng</h3>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <FileText className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Phiên bản</p>
              </div>
              <span className="text-sm text-[#64748B]">1.0.0</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <RefreshCw className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Kiểm tra cập nhật</p>
              </div>
              <span className="text-sm text-[#10B981]">Mới nhất</span>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Book className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Hướng dẫn</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Phone className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Liên hệ hỗ trợ</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <FileText className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Điều khoản</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
              <Shield className="text-[#64748B]" size={20} />
              <div className="flex-1 text-left">
                <p className="text-sm text-[#0F172A]">Chính sách</p>
              </div>
              <ChevronRight className="text-[#CBD5E1]" size={20} />
            </button>
          </div>
        </div>

        {/* Logout Button */}
        <div className="bg-[#FEF2F2] rounded-xl p-4 border border-[#FEE2E2]">
          <button className="w-full flex items-center justify-center gap-2 py-3 text-[#EF4444] font-medium" onClick={onLogout}>
            <LogOut size={20} />
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}