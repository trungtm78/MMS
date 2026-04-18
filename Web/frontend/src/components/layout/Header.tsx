// US-W001: Top header — user info, notifications badge
import { useAuth } from '@/contexts/AuthContext'
import { useSocket } from '@/contexts/SocketContext'
import { Bell, AlertTriangle } from 'lucide-react'

interface HeaderProps {
  onOpenNotifications?: () => void
}

const ROLE_LABELS: Record<string, string> = {
  system_admin: 'Quản trị viên',
  ubnd_leader: 'Lãnh đạo UBND',
  police_ward: 'CA Phường',
  police_area: 'CA Khu vực',
  office_staff: 'Nhân viên VP',
  dqtv: 'Dân quân tự vệ',
}

export function Header({ onOpenNotifications }: HeaderProps) {
  const { user } = useAuth()
  const { activeSosAlerts, isConnected } = useSocket()

  return (
    <header
      data-testid="app-header"
      className="fixed top-0 left-64 right-0 h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 z-10"
    >
      <div className="flex-1" />

      {/* WebSocket status indicator */}
      <div
        title={isConnected ? 'Kết nối real-time hoạt động' : 'Đang kết nối lại...'}
        className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-400'}`}
      />

      {/* SOS badge */}
      {activeSosAlerts.length > 0 && (
        <button
          data-testid="sos-alert-banner"
          className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-full animate-pulse"
        >
          <AlertTriangle size={14} />
          {activeSosAlerts.length} SOS chưa xử lý
        </button>
      )}

      {/* Notifications */}
      <button
        data-testid="notifications-btn"
        onClick={onOpenNotifications}
        className="relative p-2 rounded-lg hover:bg-slate-100"
      >
        <Bell size={20} className="text-slate-600" />
      </button>

      {/* User chip */}
      <div data-testid="user-chip" className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
          <span className="text-white text-xs font-bold">
            {user?.fullName?.[0]?.toUpperCase() ?? 'U'}
          </span>
        </div>
        <div className="hidden md:block text-right">
          <p className="text-sm font-medium text-slate-800">{user?.fullName}</p>
          <p className="text-xs text-slate-500">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</p>
        </div>
      </div>
    </header>
  )
}
