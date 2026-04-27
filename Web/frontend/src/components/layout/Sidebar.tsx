// US-W001 AC-2: Sidebar — menu filtered by role (RBAC)
// US-W002: system_admin sees User Management; others do not
import { useState } from 'react'
import { useRbac } from '@/hooks/useRbac'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, ClipboardList, Clock, CalendarOff, MapPin,
  DollarSign, FileText, Bell, Settings, LogOut, AlertTriangle, ShieldCheck,
  Smartphone, CheckSquare, Target, HelpCircle, GitBranch, BookOpen,
  MessageCircle, ChevronDown, X, Shield, Award, UserPlus, Building2, Wrench
} from 'lucide-react'
import type { ReactNode } from 'react'

export type AppRoute =
  | 'dashboard'
  | 'militia-list'
  | 'militia-search'
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
  | 'assignments'
  | 'official-documents'
  | 'chat'
  | 'settings'
  | 'help'
  | 'organization'
  | 'weapons'
  | 'recruitment'
  | 'exemptions'
  | 'training'
  | 'rewards'

interface NavItem {
  route: AppRoute
  label: string
  icon: ReactNode
  badge?: string
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

interface SidebarProps {
  current: AppRoute
  onNavigate: (route: AppRoute) => void
  sosBadge?: number
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ current, onNavigate, sosBadge = 0, isOpen = true, onClose }: SidebarProps) {
  const { logout } = useAuth()
  const { can } = useRbac()
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set(['personnel']))

  const toggleMenu = (groupId: string) => {
    setOpenMenus(prev => {
      const next = new Set(prev)
      next.has(groupId) ? next.delete(groupId) : next.add(groupId)
      return next
    })
  }

  const handleNavigate = (route: AppRoute) => {
    onNavigate(route)
    onClose?.()
  }

  const groups: NavGroup[] = [
    ...(can.manageMilitia ? [{
      id: 'personnel',
      label: 'Quản Lý Nhân Sự',
      items: [
        { route: 'militia-list' as AppRoute, label: 'Danh sách DQTV', icon: <Users size={16} /> },
        { route: 'organization' as AppRoute, label: 'Tổ chức biên chế', icon: <Building2 size={16} /> },
        { route: 'recruitment' as AppRoute, label: 'Tuyển chọn & Đăng ký', icon: <UserPlus size={16} /> },
        { route: 'exemptions' as AppRoute, label: 'Miễn hoãn nghĩa vụ', icon: <Shield size={16} /> },
      ]
    }] : []),
    {
      id: 'tasks',
      label: 'Giao Việc',
      items: [
        { route: 'tasks' as AppRoute, label: 'Danh sách giao việc', icon: <ClipboardList size={16} /> },
      ]
    },
    ...(can.manageAttendance ? [{
      id: 'attendance',
      label: 'Chấm Công & Lương',
      items: [
        { route: 'attendance' as AppRoute, label: 'Chấm công', icon: <Clock size={16} /> },
        { route: 'timesheet' as AppRoute, label: 'Bảng công', icon: <CalendarOff size={16} /> },
        { route: 'payroll' as AppRoute, label: 'KPI & Lương', icon: <DollarSign size={16} /> },
        { route: 'leave' as AppRoute, label: 'Đơn nghỉ phép', icon: <CalendarOff size={16} /> },
        { route: 'approvals' as AppRoute, label: 'Phê duyệt', icon: <CheckSquare size={16} /> },
      ]
    }] : []),
    {
      id: 'monitoring',
      label: 'Theo Dõi & Cảnh Báo',
      items: [
        { route: 'sos' as AppRoute, label: 'SOS / Cảnh báo', icon: <AlertTriangle size={16} />, badge: sosBadge > 0 ? String(sosBadge) : undefined },
        { route: 'notifications' as AppRoute, label: 'Thông báo', icon: <Bell size={16} /> },
        ...(can.viewGps ? [{ route: 'gps-tracking' as AppRoute, label: 'GPS Tracking', icon: <MapPin size={16} /> }] : []),
      ]
    },
    ...(can.manageMilitia ? [{
      id: 'training',
      label: 'Huấn Luyện',
      items: [
        { route: 'training' as AppRoute, label: 'Lịch huấn luyện', icon: <Target size={16} /> },
      ]
    }] : []),
    {
      id: 'reports',
      label: 'Báo Cáo & Thống Kê',
      items: [
        { route: 'reports' as AppRoute, label: 'Báo cáo', icon: <FileText size={16} /> },
        { route: 'kpi-dashboard' as AppRoute, label: 'Chỉ tiêu KPI', icon: <Target size={16} /> },
      ]
    },
    {
      id: 'documents',
      label: 'Văn Bản & Tin Nhắn',
      items: [
        { route: 'official-documents' as AppRoute, label: 'Văn bản pháp lý', icon: <BookOpen size={16} /> },
        { route: 'chat' as AppRoute, label: 'Tin nhắn', icon: <MessageCircle size={16} /> },
      ]
    },
    ...(can.manageUsers ? [{
      id: 'admin',
      label: 'Quản Trị',
      items: [
        { route: 'user-management' as AppRoute, label: 'Quản lý tài khoản', icon: <ShieldCheck size={16} /> },
        { route: 'assignments' as AppRoute, label: 'Phân công', icon: <GitBranch size={16} /> },
        ...(can.manageDevices ? [{ route: 'device-sessions' as AppRoute, label: 'Thiết bị & Phiên', icon: <Smartphone size={16} /> }] : []),
        ...(can.viewAuditLog ? [{ route: 'audit-log' as AppRoute, label: 'Nhật ký hệ thống', icon: <FileText size={16} /> }] : []),
        { route: 'weapons' as AppRoute, label: 'Vũ khí trang thiết bị', icon: <Wrench size={16} /> },
        { route: 'rewards' as AppRoute, label: 'Khen thưởng - Kỷ luật', icon: <Award size={16} /> },
      ]
    }] : []),
  ]

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        data-testid="sidebar"
        aria-label="Navigation"
        className={cn(
          'fixed left-0 top-20 w-64 h-[calc(100vh-5rem)] bg-[#2E7D32] border-r border-[#1F5F23] overflow-y-auto z-40 flex flex-col transition-transform duration-300 ease-in-out',
          'lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Mobile close */}
        {onClose && (
          <div className="lg:hidden sticky top-0 bg-[#2E7D32] border-b border-[#1F5F23] p-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Menu</span>
            <button
              aria-label="Đóng menu"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center hover:bg-[#236127] rounded-lg"
            >
              <X size={20} className="text-white" />
            </button>
          </div>
        )}

        {/* Dashboard standalone */}
        <nav className="flex-1 py-3 px-3">
          <button
            data-testid="nav-dashboard"
            onClick={() => handleNavigate('dashboard')}
            aria-current={current === 'dashboard' ? 'page' : undefined}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1',
              current === 'dashboard'
                ? 'bg-[#F4F269] text-[#C62828]'
                : 'text-white hover:bg-[#236127]',
            )}
          >
            <LayoutDashboard size={16} className={current === 'dashboard' ? 'text-[#C62828]' : 'text-white'} />
            <span className="flex-1 text-left">Tổng quan</span>
          </button>

          {/* Grouped items */}
          {groups.map((group) => {
            const isGroupOpen = openMenus.has(group.id)
            return (
              <div key={group.id} className="mb-1">
                <button
                  aria-expanded={isGroupOpen}
                  onClick={() => toggleMenu(group.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-white hover:bg-[#236127] rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    size={14}
                    className={cn('transition-transform text-white', isGroupOpen ? 'rotate-180' : '')}
                  />
                </button>

                {isGroupOpen && (
                  <div className="ml-2 mt-0.5 space-y-0.5">
                    {group.items.map((item) => (
                      <button
                        key={item.route}
                        data-testid={`nav-${item.route}`}
                        onClick={() => handleNavigate(item.route)}
                        aria-current={current === item.route ? 'page' : undefined}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                          current === item.route
                            ? 'bg-[#F4F269] text-[#C62828]'
                            : 'text-white hover:bg-[#236127]',
                        )}
                      >
                        <span className={current === item.route ? 'text-[#C62828]' : 'text-white'}>{item.icon}</span>
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.badge && (
                          <span className="bg-[#C62828] text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Help */}
          <button
            data-testid="nav-help"
            onClick={() => handleNavigate('help')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-1',
              current === 'help'
                ? 'bg-[#F4F269] text-[#C62828]'
                : 'text-white hover:bg-[#236127]',
            )}
          >
            <HelpCircle size={16} className={current === 'help' ? 'text-[#C62828]' : 'text-white'} />
            <span>Hướng dẫn</span>
          </button>
        </nav>

        {/* Footer */}
        <div className="border-t border-[#1F5F23] px-3 py-3 sticky bottom-0 bg-[#2E7D32]">
          <button
            data-testid="settings-btn"
            onClick={() => handleNavigate('settings')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white hover:bg-[#236127] mb-1"
          >
            <Settings size={16} />
            Cài đặt
          </button>
          <button
            data-testid="logout-btn"
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-300 hover:bg-red-900/30"
          >
            <LogOut size={16} />
            Đăng xuất
          </button>
        </div>
      </aside>
    </>
  )
}
