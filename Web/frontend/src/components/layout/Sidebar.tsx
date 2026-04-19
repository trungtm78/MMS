// US-W001 AC-2: Sidebar — menu filtered by role (RBAC)
// US-W002: system_admin sees User Management; others do not
import { useRbac } from '@/hooks/useRbac'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Clock,
  CalendarOff,
  MapPin,
  DollarSign,
  FileText,
  Bell,
  Settings,
  LogOut,
  AlertTriangle,
  ShieldCheck,
  Smartphone,
  CheckSquare,
  Target,
  HelpCircle,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type AppRoute =
  | 'dashboard'
  | 'militia-list'
  | 'user-management'
  | 'tasks'
  | 'attendance'
  | 'leave'
  | 'sos'
  | 'gps-tracking'
  | 'payroll'
  | 'audit-log'
  | 'notifications'
  | 'device-sessions'
  | 'reports'
  | 'approvals'
  | 'timesheet'
  | 'kpi-dashboard'
  | 'settings'
  | 'help'

interface NavItem {
  route: AppRoute
  label: string
  icon: ReactNode
  badge?: string
}

interface SidebarProps {
  current: AppRoute
  onNavigate: (route: AppRoute) => void
  sosBadge?: number
}

export function Sidebar({ current, onNavigate, sosBadge = 0 }: SidebarProps) {
  const { logout } = useAuth()
  const { can } = useRbac()

  const navItems: NavItem[] = [
    { route: 'dashboard', label: 'Tổng quan', icon: <LayoutDashboard size={18} /> },
    ...(can.manageMilitia ? [{ route: 'militia-list' as AppRoute, label: 'Nhân sự DQTV', icon: <Users size={18} /> }] : []),
    ...(can.manageUsers ? [{ route: 'user-management' as AppRoute, label: 'Quản lý tài khoản', icon: <ShieldCheck size={18} /> }] : []),
    ...(can.createTask || !can.createTask ? [{ route: 'tasks' as AppRoute, label: 'Giao việc', icon: <ClipboardList size={18} /> }] : []),
    ...(can.manageAttendance ? [{ route: 'attendance' as AppRoute, label: 'Chấm công', icon: <Clock size={18} /> }] : []),
    { route: 'leave', label: 'Đơn nghỉ phép', icon: <CalendarOff size={18} /> },
    {
      route: 'sos',
      label: 'SOS / Cảnh báo',
      icon: <AlertTriangle size={18} />,
      badge: sosBadge > 0 ? String(sosBadge) : undefined,
    },
    ...(can.viewGps ? [{ route: 'gps-tracking' as AppRoute, label: 'GPS Tracking', icon: <MapPin size={18} /> }] : []),
    ...(can.viewPayroll ? [{ route: 'payroll' as AppRoute, label: 'KPI & Lương', icon: <DollarSign size={18} /> }] : []),
    ...(can.viewAuditLog ? [{ route: 'audit-log' as AppRoute, label: 'Nhật ký hệ thống', icon: <FileText size={18} /> }] : []),
    { route: 'approvals' as AppRoute, label: 'Phê duyệt', icon: <CheckSquare size={18} /> },
    { route: 'notifications', label: 'Thông báo', icon: <Bell size={18} /> },
    ...(can.manageDevices ? [{ route: 'device-sessions' as AppRoute, label: 'Thiết bị & Phiên', icon: <Smartphone size={18} /> }] : []),
    { route: 'reports', label: 'Báo cáo', icon: <FileText size={18} /> },
    ...(can.manageMilitia ? [{ route: 'kpi-dashboard' as AppRoute, label: 'Chỉ tiêu KPI', icon: <Target size={18} /> }] : []),
    { route: 'help' as AppRoute, label: 'Hướng dẫn', icon: <HelpCircle size={18} /> },
  ]

  return (
    <aside
      data-testid="sidebar"
      className="fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col z-20"
    >
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">M</span>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">MMS</p>
            <p className="text-xs text-slate-500">Quản lý DQTV</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {navItems.map((item) => (
          <button
            key={item.route}
            data-testid={`nav-${item.route}`}
            onClick={() => onNavigate(item.route)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5',
              current === item.route
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800',
            )}
          >
            {item.icon}
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-100 px-3 py-3">
        <button
          data-testid="settings-btn"
          onClick={() => onNavigate('settings')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 mb-1"
        >
          <Settings size={18} />
          Cài đặt
        </button>
        <button
          data-testid="logout-btn"
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
        >
          <LogOut size={18} />
          Đăng xuất
        </button>
      </div>
    </aside>
  )
}
