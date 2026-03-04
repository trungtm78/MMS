import { ArrowLeft, User, Phone, Mail, MapPin, Calendar, Award, LogOut, ChevronRight, Settings, Shield, FileText } from 'lucide-react';
import { useState } from 'react';

interface ProfileDQTVProps {
  onNavigate: (screen: string) => void;
  onLogout: () => void;
  currentUser: string;
}

export default function ProfileDQTV({ onNavigate, onLogout, currentUser }: ProfileDQTVProps) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Map username to user info
  const getUserInfo = (username: string) => {
    const userMap: { [key: string]: any } = {
      'dqtv001': {
        name: 'Nguyễn Văn An',
        code: 'HCM-PHD-T12-0001',
        phone: '0915678901',
        email: 'nguyenvanan@gmail.com',
        address: 'KP1, Phường Hiệp Định, TP. HCM',
        joinDate: '01/01/2023',
        chitieu: 92.4,
        rank: 'Xuất sắc'
      },
      'dqtv002': {
        name: 'Trần Thị Bình',
        code: 'HCM-PHD-T12-0002',
        phone: '0915678902',
        email: 'tranthibinh@gmail.com',
        address: 'KP2, Phường Hiệp Định, TP. HCM',
        joinDate: '15/02/2023',
        chitieu: 88.5,
        rank: 'Tốt'
      },
      'dqtv003': {
        name: 'Lê Văn Cường',
        code: 'HCM-PHD-T12-0003',
        phone: '0915678903',
        email: 'levancuong@gmail.com',
        address: 'KP3, Phường Hiệp Định, TP. HCM',
        joinDate: '10/03/2023',
        chitieu: 85.2,
        rank: 'Tốt'
      },
    };
    return userMap[username] || {
      name: 'DQTV',
      code: 'N/A',
      phone: 'N/A',
      email: 'N/A',
      address: 'N/A',
      joinDate: 'N/A',
      chitieu: 0,
      rank: 'N/A'
    };
  };

  const userInfo = getUserInfo(currentUser);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Profile Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-8 border-b-4 border-[#DC2626]">
        <div className="text-center">
          <div className="w-24 h-24 rounded-full bg-white mx-auto mb-3 flex items-center justify-center border-4 border-[#DC2626] shadow-lg">
            <User className="text-[#DC2626]" size={48} />
          </div>
          <h1 className="text-2xl font-extrabold text-[#DC2626] mb-1">{userInfo.name}</h1>
          <p className="text-sm text-[#0F172A] font-bold">{userInfo.code}</p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="px-3 py-1 bg-[#DC2626] text-white rounded-full text-xs font-bold">
              DQTV
            </span>
            <span className="px-3 py-1 bg-[#15803D] text-white rounded-full text-xs font-bold">
              {userInfo.rank}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-4 -mt-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-3 shadow-md text-center border-2 border-[#15803D]">
            <p className="text-2xl font-bold text-[#15803D]">{userInfo.chitieu}</p>
            <p className="text-xs text-[#64748B] mt-1">Chỉ tiêu</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-md text-center border-2 border-[#DC2626]">
            <p className="text-2xl font-bold text-[#DC2626]">18</p>
            <p className="text-xs text-[#64748B] mt-1">Ngày công</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-md text-center border-2 border-[#F59E0B]">
            <p className="text-2xl font-bold text-[#F59E0B]">15</p>
            <p className="text-xs text-[#64748B] mt-1">Nhiệm vụ</p>
          </div>
        </div>
      </div>

      {/* Personal Info */}
      <div className="px-4 pt-6">
        <h2 className="text-lg font-extrabold text-[#0F172A] mb-3">Thông tin cá nhân</h2>
        <div className="bg-white rounded-xl shadow-sm divide-y divide-[#F1F5F9]">
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FEF3C7] flex items-center justify-center">
              <Phone className="text-[#F59E0B]" size={20} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-[#64748B]">Số điện thoại</p>
              <p className="font-semibold text-[#0F172A]">{userInfo.phone}</p>
            </div>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#DBEAFE] flex items-center justify-center">
              <Mail className="text-[#3B82F6]" size={20} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-[#64748B]">Email</p>
              <p className="font-semibold text-[#0F172A]">{userInfo.email}</p>
            </div>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FEE2E2] flex items-center justify-center">
              <MapPin className="text-[#DC2626]" size={20} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-[#64748B]">Địa chỉ</p>
              <p className="font-semibold text-[#0F172A]">{userInfo.address}</p>
            </div>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#DCFCE7] flex items-center justify-center">
              <Calendar className="text-[#15803D]" size={20} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-[#64748B]">Ngày tham gia</p>
              <p className="font-semibold text-[#0F172A]">{userInfo.joinDate}</p>
            </div>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FEF3C7] flex items-center justify-center">
              <Award className="text-[#F59E0B]" size={20} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-[#64748B]">Xếp loại</p>
              <p className="font-semibold text-[#0F172A]">{userInfo.rank}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Options */}
      <div className="px-4 pt-6">
        <h2 className="text-lg font-extrabold text-[#0F172A] mb-3">Cài đặt</h2>
        <div className="bg-white rounded-xl shadow-sm divide-y divide-[#F1F5F9]">
          <button className="w-full p-4 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors">
            <div className="flex items-center gap-3">
              <Settings className="text-[#64748B]" size={20} />
              <span className="font-semibold text-[#0F172A]">Cài đặt tài khoản</span>
            </div>
            <ChevronRight className="text-[#CBD5E1]" size={20} />
          </button>

          <button className="w-full p-4 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors">
            <div className="flex items-center gap-3">
              <Shield className="text-[#64748B]" size={20} />
              <span className="font-semibold text-[#0F172A]">Đổi mật khẩu</span>
            </div>
            <ChevronRight className="text-[#CBD5E1]" size={20} />
          </button>

          <button className="w-full p-4 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors">
            <div className="flex items-center gap-3">
              <FileText className="text-[#64748B]" size={20} />
              <span className="font-semibold text-[#0F172A]">Điều khoản & Chính sách</span>
            </div>
            <ChevronRight className="text-[#CBD5E1]" size={20} />
          </button>

          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full p-4 flex items-center justify-between hover:bg-[#FEE2E2] transition-colors"
          >
            <div className="flex items-center gap-3">
              <LogOut className="text-[#DC2626]" size={20} />
              <span className="font-semibold text-[#DC2626]">Đăng xuất</span>
            </div>
            <ChevronRight className="text-[#CBD5E1]" size={20} />
          </button>
        </div>
      </div>

      <p className="text-center text-[#64748B] text-xs mt-6 px-4">
        Phiên bản 1.0.0 • © 2024 Công An Khu Vực
      </p>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-[#FEE2E2] flex items-center justify-center mx-auto mb-4">
                <LogOut className="text-[#DC2626]" size={32} />
              </div>
              <h2 className="text-xl font-extrabold text-[#0F172A] mb-2">Xác nhận đăng xuất</h2>
              <p className="text-sm text-[#64748B]">
                Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 border-2 border-[#E2E8F0] text-[#64748B] rounded-lg font-bold hover:bg-[#F8FAFC] transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3 bg-[#DC2626] text-white rounded-lg font-bold hover:bg-[#B91C1C] transition-colors shadow-md"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
