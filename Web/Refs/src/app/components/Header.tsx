import { Menu, Bell, User, ChevronDown, LogOut, Settings } from 'lucide-react';
import { useState } from 'react';
import anttLogo from 'figma:asset/668337ed7f590a8cbedffff9ffd07736f5a4d4e3.png';

interface HeaderProps {
  onLogout?: () => void;
  onToggleMobileMenu?: () => void;
  user?: {
    fullName?: string;
    position?: string;
    role?: string;
  };
}

export function Header({ onToggleMobileMenu, user, onLogout }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  const notifications = [
    { id: 1, text: 'Anh Nguyễn Văn A đã hoàn thành nhiệm vụ tuần tra khu vực 3', time: '5 phút trước' },
    { id: 2, text: 'Đơn nghỉ phép của anh Trần Văn B đã được duyệt', time: '1 giờ trước' },
    { id: 3, text: 'Nhắc nhở: Họp giao ban định kỳ vào 14:00 hôm nay', time: '2 giờ trước' },
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-20 bg-[#F4F269] border-b-4 border-[#C62828] z-50 shadow-md">
        <div className="h-full flex items-center justify-between px-4 md:px-8">
          {/* Left Section - Mobile Menu + Logo */}
          <div className="flex items-center gap-3 md:gap-4">
            {/* Mobile Menu Button */}
            <button
              onClick={onToggleMobileMenu}
              className="lg:hidden w-10 h-10 flex items-center justify-center hover:bg-[#F0EE5F] rounded-lg transition-colors"
            >
              <Menu size={24} className="text-[#C62828]" />
            </button>

            {/* Logo ANTT */}
            <img 
              src={anttLogo}
              alt="Bảo vệ An ninh Trật tự" 
              className="h-14 md:h-16 object-contain" 
            />
          </div>

          {/* Center Section - Title */}
          <div className="flex-1 text-center px-4 hidden sm:block">
            <h1 className="font-bold text-base md:text-xl lg:text-2xl text-[#C62828] leading-tight">
              HỆ THỐNG QUẢN LÝ LỰC LƯỢNG BẢO VỆ AN NINH TRẬT TỰ
            </h1>
            <p className="text-xs md:text-sm text-[#2E7D32] font-medium mt-1">
              Giữ vững bình yên, vững vàng cơ sở
            </p>
          </div>

          {/* Mobile Title */}
          <div className="flex-1 text-center px-2 sm:hidden">
            <h1 className="font-bold text-sm text-[#C62828] leading-tight">
              QUẢN LÝ ANTT
            </h1>
            <p className="text-xs text-[#2E7D32] font-medium">
              Phú Định
            </p>
          </div>
        
          {/* Right Section - Notifications & User */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="w-10 h-10 flex items-center justify-center hover:bg-[#F0EE5F] rounded-lg transition-colors relative"
              >
                <Bell size={20} className="text-[#C62828]" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-[#C62828] rounded-full"></span>
              </button>
            
              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
                  <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-[#E2E8F0] z-50">
                    <div className="p-4 border-b border-[#E2E8F0]">
                      <h3 className="font-semibold text-[#0F172A]">Thông báo</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.map(notif => (
                        <div key={notif.id} className="p-4 border-b border-[#F1F5F9] hover:bg-[#F8FAFC] cursor-pointer transition-colors">
                          <p className="text-sm text-[#0F172A] mb-1">{notif.text}</p>
                          <p className="text-xs text-[#64748B]">{notif.time}</p>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 text-center border-t border-[#E2E8F0]">
                      <button className="text-sm text-[#1F3A5F] font-medium hover:underline">
                        Xem tất cả
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User Profile */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 md:gap-3 hover:bg-[#F0EE5F] rounded-lg px-2 md:px-3 py-2 transition-colors"
              >
                <div className="w-8 h-8 md:w-9 md:h-9 bg-[#2E7D32] rounded-full flex items-center justify-center text-white">
                  <User size={16} className="md:w-[18px] md:h-[18px]" />
                </div>
                <div className="text-left hidden xl:block">
                  <div className="text-sm font-medium text-[#C62828]">{user?.fullName || 'Người dùng'}</div>
                  <div className="text-xs text-[#2E7D32]">{user?.position || user?.role}</div>
                </div>
                <ChevronDown size={16} className="text-[#2E7D32] hidden md:block" />
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)}></div>
                  <div className="absolute right-0 top-14 w-56 bg-white rounded-lg shadow-xl border border-[#E2E8F0] z-50 py-2">
                    <button className="w-full px-4 py-2.5 text-left text-sm text-[#0F172A] hover:bg-[#F8FAFC] transition-colors flex items-center gap-3">
                      <User size={16} className="text-[#64748B]" />
                      Thông tin cá nhân
                    </button>
                    <button className="w-full px-4 py-2.5 text-left text-sm text-[#0F172A] hover:bg-[#F8FAFC] transition-colors flex items-center gap-3">
                      <Settings size={16} className="text-[#64748B]" />
                      Cài đặt
                    </button>
                    <div className="my-1 h-px bg-[#E2E8F0]"></div>
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-[#C62828] hover:bg-[#FEF2F2] transition-colors flex items-center gap-3"
                      onClick={onLogout}
                    >
                      <LogOut size={16} />
                      Đăng xuất
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Search Bar (slides down) */}
      {showMobileSearch && (
        <div className="fixed top-16 left-0 right-0 bg-[#1F3A5F] border-t border-[#2A4A73] z-40 px-4 py-3 lg:hidden">
          <div className="relative">
            <input
              type="text"
              placeholder="Tìm kiếm DQTV, nhiệm vụ..."
              className="w-full h-10 pl-10 pr-4 bg-[#2A4A73] border border-[#3A5A83] rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2E7D32] focus:border-transparent transition-all"
            />
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
      )}
    </>
  );
}