// US-W001 AC-2: Sidebar — menu filtered by role (RBAC)
// US-W002: system_admin sees User Management; others do not
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useRbac } from '@/hooks/useRbac'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import client from '@/api/client'
import {
  LayoutDashboard, Users, ClipboardList, Clock, CalendarOff, MapPin,
  DollarSign, FileText, Bell, Settings, LogOut, AlertTriangle, ShieldCheck,
  Smartphone, CheckSquare, Target, HelpCircle, GitBranch, BookOpen,
  MessageCircle, ChevronDown, X, Shield, Award, UserPlus, Building2, Wrench,
  Star, X as XIcon, Scale, ListChecks, UsersRound, CalendarCheck, Medal,
} from 'lucide-react'
import { useFavorites } from '@/hooks/useFavorites'
import { ROUTE_PERMISSIONS } from '@/lib/navigation'
import type { TranslationKey } from '@/i18n/types'

import type { AppRoute } from '@/types/routes'
export type { AppRoute }

interface NavItem {
  route: AppRoute
  label: TranslationKey
  icon: ReactNode
  badge?: string
}

interface NavGroup {
  id: string
  label: TranslationKey
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
  const { t } = useTranslation()
  const { logout, user } = useAuth()
  const { can } = useRbac()
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set(['personnel', 'favorites']))
  const { favorites, isFavorite, toggle, remove } = useFavorites(user?.id != null ? String(user.id) : 'guest')

  const isDqtv = !can.manageMilitia && !can.manageAttendance

  const { data: dqtvStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => client.get('/dashboard/stats').then(r => r.data),
    enabled: isDqtv,
    staleTime: 60_000,
    refetchInterval: isDqtv ? 60_000 : false,
  })

  const toggleMenu = (groupId: string) => {
    setOpenMenus(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const handleNavigate = (route: AppRoute) => {
    onNavigate(route)
    onClose?.()
  }

  // Each entry is shown to exactly the roles the backend lets load its page (ROUTE_PERMISSIONS);
  // a group appears only when at least one of its entries does
  const visible = (route: AppRoute) => {
    const permission = ROUTE_PERMISSIONS[route]
    return permission === null || can[permission]
  }
  const group = (id: string, label: TranslationKey, items: NavItem[]): NavGroup[] => {
    const shown = items.filter((item) => visible(item.route))
    return shown.length ? [{ id, label, items: shown }] : []
  }

  const groups: NavGroup[] = [
    ...group('personnel', 'navigation.sidebar.groups.personnel', [
      { route: 'militia-list', label: 'navigation.sidebar.items.militiaList', icon: <Users size={16} /> },
      { route: 'organization', label: 'navigation.sidebar.items.organization', icon: <Building2 size={16} /> },
      { route: 'recruitment', label: 'navigation.sidebar.items.recruitment', icon: <UserPlus size={16} /> },
      { route: 'exemptions', label: 'navigation.sidebar.items.exemptions', icon: <Shield size={16} /> },
    ]),
    ...group('tasks', 'navigation.sidebar.groups.tasks', [
      { route: 'tasks', label: 'navigation.sidebar.items.tasks', icon: <ClipboardList size={16} /> },
    ]),
    ...group('attendance', 'navigation.sidebar.groups.attendance', [
      { route: 'attendance', label: 'navigation.sidebar.items.attendance', icon: <Clock size={16} /> },
      { route: 'timesheet', label: 'navigation.sidebar.items.timesheet', icon: <CalendarOff size={16} /> },
      { route: 'payroll', label: 'navigation.sidebar.items.payroll', icon: <DollarSign size={16} /> },
      { route: 'leave', label: 'navigation.sidebar.items.leave', icon: <CalendarOff size={16} /> },
      { route: 'approvals', label: 'navigation.sidebar.items.approvals', icon: <CheckSquare size={16} /> },
    ]),
    ...group('monitoring', 'navigation.sidebar.groups.monitoring', [
      { route: 'sos', label: 'navigation.sidebar.items.sos', icon: <AlertTriangle size={16} />, badge: sosBadge > 0 ? String(sosBadge) : undefined },
      { route: 'notifications', label: 'navigation.sidebar.items.notifications', icon: <Bell size={16} /> },
      { route: 'gps-tracking', label: 'navigation.sidebar.items.gpsTracking', icon: <MapPin size={16} /> },
    ]),
    ...group('training', 'navigation.sidebar.groups.training', [
      { route: 'training', label: 'navigation.sidebar.items.training', icon: <Target size={16} /> },
    ]),
    // Staff and the DQTV members the decisions concern (rewards.roles.ts REWARD_READER_ROLES)
    ...group('rewards', 'navigation.sidebar.groups.rewards', [
      { route: 'rewards', label: 'navigation.sidebar.items.rewards', icon: <Award size={16} /> },
    ]),
    ...group('compliance-reports', 'navigation.sidebar.groups.complianceReports', [
      { route: 'compliance-dashboard', label: 'navigation.sidebar.items.complianceDashboard', icon: <Scale size={16} /> },
      { route: 'report-training-compliance', label: 'navigation.sidebar.items.reportTrainingCompliance', icon: <ListChecks size={16} /> },
      { route: 'report-roster', label: 'navigation.sidebar.items.reportRoster', icon: <UsersRound size={16} /> },
      { route: 'report-attendance-summary', label: 'navigation.sidebar.items.reportAttendanceSummary', icon: <CalendarCheck size={16} /> },
      { route: 'report-rewards-discipline', label: 'navigation.sidebar.items.reportRewardsDiscipline', icon: <Medal size={16} /> },
    ]),
    ...group('reports', 'navigation.sidebar.groups.reports', [
      { route: 'reports', label: 'navigation.sidebar.items.reports', icon: <FileText size={16} /> },
      { route: 'kpi-dashboard', label: 'navigation.sidebar.items.kpiDashboard', icon: <Target size={16} /> },
    ]),
    ...group('documents', 'navigation.sidebar.groups.documents', [
      { route: 'official-documents', label: 'navigation.sidebar.items.officialDocuments', icon: <BookOpen size={16} /> },
      { route: 'chat', label: 'navigation.sidebar.items.chat', icon: <MessageCircle size={16} /> },
    ]),
    // Everyone's own sessions (devices.controller.ts)
    ...group('account', 'navigation.sidebar.groups.account', [
      { route: 'device-sessions', label: 'navigation.sidebar.items.deviceSessions', icon: <Smartphone size={16} /> },
    ]),
    ...group('admin', 'navigation.sidebar.groups.admin', [
      { route: 'user-management', label: 'navigation.sidebar.items.userManagement', icon: <ShieldCheck size={16} /> },
      { route: 'assignments', label: 'navigation.sidebar.items.assignments', icon: <GitBranch size={16} /> },
      { route: 'audit-log', label: 'navigation.sidebar.items.auditLog', icon: <FileText size={16} /> },
      { route: 'weapons', label: 'navigation.sidebar.items.weapons', icon: <Wrench size={16} /> },
    ]),
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
        aria-label={t('navigation.sidebar.landmark.label')}
        className={cn(
          'fixed left-0 top-20 w-64 h-[calc(100vh-5rem)] bg-[#2E7D32] border-r border-[#1F5F23] overflow-y-auto shadow-lg z-50 flex flex-col transition-transform duration-300 ease-in-out',
          'lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Mobile close */}
        {onClose && (
          <div className="lg:hidden sticky top-0 bg-[#2E7D32] border-b border-[#1F5F23] p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">{t('navigation.sidebar.mobile.title')}</span>
            <button
              aria-label={t('navigation.sidebar.mobile.close')}
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center hover:bg-[#236127] rounded-lg"
            >
              <X size={20} className="text-white" />
            </button>
          </div>
        )}

        {/* Dashboard standalone */}
        <nav className="flex-1 p-4">
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
            <span className="flex-1 text-left">{t('navigation.sidebar.fixed.dashboard')}</span>
          </button>

          {/* Favourites group */}
          {favorites.length > 0 && (() => {
            const isFavOpen = openMenus.has('favorites')
            // gather label+icon for each favorited route from groups
            const favItems = favorites.map(route => {
              for (const g of groups) {
                const found = g.items.find(i => i.route === route)
                if (found) return found
              }
              return null
            }).filter(Boolean) as NavItem[]
            return (
              <div className="mb-1">
                <button
                  aria-expanded={isFavOpen}
                  onClick={() => toggleMenu('favorites')}
                  className="w-full flex items-center justify-between px-3 py-2 text-[#F4F269] hover:bg-[#236127] rounded-lg text-sm font-semibold transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Star size={13} className="fill-[#F4F269] text-[#F4F269]" />
                    {t('navigation.sidebar.favorites.group')}
                  </span>
                  <ChevronDown size={14} className={cn('transition-transform text-[#F4F269]', isFavOpen ? 'rotate-180' : '')} />
                </button>
                {isFavOpen && (
                  <div className="ml-2 mt-0.5 space-y-0.5">
                    {favItems.map((item) => (
                      <div key={item.route} className="group relative flex items-center">
                        <button
                          data-testid={`nav-${item.route}`}
                          onClick={() => handleNavigate(item.route)}
                          aria-current={current === item.route ? 'page' : undefined}
                          className={cn(
                            'flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                            current === item.route ? 'bg-[#F4F269] text-[#C62828]' : 'text-white hover:bg-[#236127]',
                          )}
                        >
                          <span className={current === item.route ? 'text-[#C62828]' : 'text-white'}>{item.icon}</span>
                          <span className="flex-1 text-left">{t(item.label)}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); remove(item.route) }}
                          className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-300 text-white/60 rounded"
                          aria-label={t('navigation.sidebar.favorites.removeFromGroup')}
                        >
                          <XIcon size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Grouped items */}
          {groups.map((group) => {
            const isGroupOpen = openMenus.has(group.id)
            return (
              <div key={group.id} className="mb-1">
                <button
                  aria-expanded={isGroupOpen}
                  onClick={() => toggleMenu(group.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-white hover:bg-[#236127] rounded-lg text-sm font-semibold transition-colors"
                >
                  <span>{t(group.label)}</span>
                  <ChevronDown
                    size={14}
                    className={cn('transition-transform text-white', isGroupOpen ? 'rotate-180' : '')}
                  />
                </button>

                {isGroupOpen && (
                  <div className="ml-2 mt-0.5 space-y-0.5">
                    {group.items.map((item) => (
                      <div key={item.route} className="group relative flex items-center">
                        <button
                          data-testid={`nav-${item.route}`}
                          onClick={() => handleNavigate(item.route)}
                          aria-current={current === item.route ? 'page' : undefined}
                          className={cn(
                            'flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                            current === item.route
                              ? 'bg-[#F4F269] text-[#C62828]'
                              : 'text-white hover:bg-[#236127]',
                          )}
                        >
                          <span className={current === item.route ? 'text-[#C62828]' : 'text-white'}>{item.icon}</span>
                          <span className="flex-1 text-left">{t(item.label)}</span>
                          {item.badge && (
                            <span className="bg-[#C62828] text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
                              {item.badge}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggle(item.route) }}
                          className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                          aria-label={t(isFavorite(item.route) ? 'navigation.sidebar.favorites.remove' : 'navigation.sidebar.favorites.add')}
                        >
                          <Star
                            size={12}
                            className={isFavorite(item.route) ? 'fill-[#F4F269] text-[#F4F269]' : 'text-white/50'}
                          />
                        </button>
                      </div>
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
            <span>{t('navigation.sidebar.fixed.help')}</span>
          </button>
        </nav>

        {/* DQTV stats widget — shown when user has limited role */}
        {isDqtv && (
          <div className="mx-3 mb-3 bg-[#1F5F23] rounded-lg px-3 py-2.5 text-white text-xs space-y-1.5">
            <p className="font-semibold text-white/90 text-xs">{t('navigation.sidebar.today.title')}</p>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${dqtvStats ? 'bg-[#69F0AE]' : 'bg-white/40'}`} />
              <span className="text-white/80">{t('navigation.sidebar.today.attendance')}</span>
              <span className="font-medium">
                {t(dqtvStats ? 'navigation.sidebar.today.attendanceRecorded' : 'navigation.sidebar.today.attendanceMissing')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ClipboardList size={12} className="text-white/70 shrink-0" />
              <span className="text-white/80">{t('navigation.sidebar.today.tasks')}</span>
              <span className="font-medium">{dqtvStats ? String(dqtvStats.pendingTasks) : t('common.states.none')}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[#1F5F23] p-4 sticky bottom-0 bg-[#1F5F23]">
          <button
            data-testid="settings-btn"
            onClick={() => handleNavigate('settings')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white hover:bg-[#236127] mb-1"
          >
            <Settings size={16} />
            {t('navigation.sidebar.fixed.settings')}
          </button>
          <button
            data-testid="logout-btn"
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-300 hover:bg-red-900/30"
          >
            <LogOut size={16} />
            {t('navigation.sidebar.fixed.logout')}
          </button>
        </div>
      </aside>
    </>
  )
}
