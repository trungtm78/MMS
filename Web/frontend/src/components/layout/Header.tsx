import { useState } from 'react'
import { Menu, Bell, AlertTriangle, User, Settings, LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSocket } from '@/contexts/SocketContext'
import { useNavigate } from 'react-router-dom'
import anttLogo from '@/assets/668337ed7f590a8cbedffff9ffd07736f5a4d4e3.png'

interface HeaderProps {
  onOpenNotifications?: () => void
  onMenuToggle?: () => void
}

const ROLE_LABELS: Record<string, string> = {
  system_admin: 'Quản trị viên',
  ubnd_leader: 'Lãnh đạo UBND',
  police_ward: 'CA Phường',
  police_area: 'CA Khu vực',
  office_staff: 'Nhân viên VP',
  dqtv: 'Dân quân tự vệ',
}

export function Header({ onOpenNotifications, onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth()
  const { activeSosAlerts, isConnected } = useSocket()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)

  return (
    <header
      data-testid="app-header"
      className="fixed top-0 left-0 right-0 h-20 bg-[#F4F269] border-b-4 border-[#C62828] z-50 shadow-md"
    >
      <div className="h-full flex items-center justify-between px-4 md:px-6">
        {/* Left: burger (mobile) + logo */}
        <div className="flex items-center gap-3">
          <button
            aria-label="Mở menu"
            onClick={onMenuToggle}
            className="lg:hidden w-10 h-10 flex items-center justify-center hover:bg-[#F0EE5F] rounded-lg transition-colors"
          >
            <Menu size={24} className="text-[#C62828]" />
          </button>
          <img
            src={anttLogo}
            alt="Bảo vệ An ninh Trật tự"
            className="h-14 md:h-16 object-contain"
            onError={(e) => { const t = e.target as HTMLImageElement; t.style.display='none'; t.nextElementSibling?.classList.remove('hidden') }}
          />
          <span className="hidden text-[#C62828] font-bold text-lg">MMS</span>
        </div>

        {/* Center: title */}
        <div className="flex-1 text-center px-4 hidden sm:block">
          <h1 className="font-bold text-base md:text-lg lg:text-xl text-[#C62828] leading-tight">
            HỆ THỐNG QUẢN LÝ LỰC LƯỢNG BẢO VỆ AN NINH TRẬT TỰ
          </h1>
          <p className="text-xs md:text-sm text-[#2E7D32] font-medium mt-0.5">
            Giữ vững bình yên, vững vàng cơ sở
          </p>
        </div>

        {/* Mobile title */}
        <div className="flex-1 text-center px-2 sm:hidden">
          <h1 className="font-bold text-sm text-[#C62828] leading-tight">QUẢN LÝ ANTT</h1>
        </div>

        {/* Right: WS status + SOS + notifications + user */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* WebSocket status dot */}
          <div
            title={isConnected ? 'Kết nối real-time hoạt động' : 'Đang kết nối lại...'}
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-600' : 'bg-red-500'}`}
          />

          {/* SOS badge */}
          {activeSosAlerts.length > 0 && (
            <button
              data-testid="sos-alert-banner"
              className="flex items-center gap-1.5 bg-[#C62828] hover:bg-[#A91D1D] text-white text-xs font-medium px-3 py-1.5 rounded-full animate-pulse"
            >
              <AlertTriangle size={14} />
              {activeSosAlerts.length} SOS
            </button>
          )}

          {/* Notifications */}
          <button
            data-testid="notifications-btn"
            onClick={onOpenNotifications}
            className="relative w-10 h-10 flex items-center justify-center hover:bg-[#F0EE5F] rounded-lg transition-colors"
          >
            <Bell size={20} className="text-[#C62828]" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#C62828] rounded-full" />
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              data-testid="user-chip"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 hover:bg-[#F0EE5F] rounded-lg px-2 py-2 transition-colors"
            >
              <div className="w-8 h-8 md:w-9 md:h-9 bg-[#2E7D32] rounded-full flex items-center justify-center text-white">
                <span className="text-xs font-bold">
                  {user?.fullName?.[0]?.toUpperCase() ?? 'U'}
                </span>
              </div>
              <div className="text-left hidden xl:block">
                <div className="text-sm font-medium text-[#C62828]">{user?.fullName}</div>
                <div className="text-xs text-[#2E7D32]">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</div>
              </div>
              <ChevronDown size={16} className="text-[#2E7D32] hidden md:block" />
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-14 w-56 bg-white rounded-lg shadow-xl border border-[#E2E8F0] z-50 py-2">
                  <button
                    onClick={() => { navigate('/settings/profile'); setShowUserMenu(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#0F172A] hover:bg-[#F8FAFC] flex items-center gap-3"
                  >
                    <User size={16} className="text-[#64748B]" />
                    Thông tin cá nhân
                  </button>
                  <button
                    onClick={() => { navigate('/settings/profile'); setShowUserMenu(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#0F172A] hover:bg-[#F8FAFC] flex items-center gap-3"
                  >
                    <Settings size={16} className="text-[#64748B]" />
                    Cài đặt
                  </button>
                  <div className="my-1 h-px bg-[#E2E8F0]" />
                  <button
                    onClick={() => { logout(); setShowUserMenu(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm text-[#C62828] hover:bg-red-50 flex items-center gap-3"
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
  )
}
