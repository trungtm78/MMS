import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Menu, Bell, AlertTriangle, User, Settings, LogOut, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useSocket } from '@/hooks/useSocket'
import { useNavigate } from 'react-router-dom'
import { notificationKeys, notificationsApi } from '@/api/notifications'
import { roleLabel } from '@/lib/roles'
import { NotificationDrawer } from './NotificationDrawer'
import anttLogo from '@/assets/668337ed7f590a8cbedffff9ffd07736f5a4d4e3.png'

interface HeaderProps {
  onMenuToggle?: () => void
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { activeSosAlerts, isConnected } = useSocket()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  // Same query (and cache entry) as the notification page and drawer counters
  const { data: unreadTotal = 0 } = useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: notificationsApi.unreadCount,
    enabled: !!user,
    refetchInterval: 60_000,
  })

  return (
    <>
      <header
        data-testid="app-header"
        className="fixed top-0 left-0 right-0 h-20 bg-[#F4F269] border-b-4 border-[#C62828] z-50 shadow-md"
      >
        <div className="h-full flex items-center justify-between px-4 md:px-6">
          {/* Left: burger (mobile) + logo */}
          <div className="flex items-center gap-3">
            <button
              aria-label={t('layout.header.menu.open')}
              onClick={onMenuToggle}
              className="lg:hidden w-10 h-10 flex items-center justify-center hover:bg-[#F0EE5F] rounded-lg transition-colors"
            >
              <Menu size={24} className="text-[#C62828]" />
            </button>
            <img
              src={anttLogo}
              alt={t('layout.header.logo.alt')}
              className="h-14 md:h-16 object-contain"
              onError={(e) => { const img = e.target as HTMLImageElement; img.style.display='none'; img.nextElementSibling?.classList.remove('hidden') }}
            />
            <span className="hidden text-[#C62828] font-bold text-lg">{t('layout.header.logo.fallback')}</span>
          </div>

          {/* Center: title */}
          <div className="flex-1 text-center px-4 hidden sm:block">
            <h1 className="font-bold text-base md:text-lg lg:text-xl text-[#C62828] leading-tight">
              {t('layout.header.title.full')}
            </h1>
            <p className="text-xs md:text-sm text-[#2E7D32] font-medium mt-0.5">
              {t('layout.header.title.slogan')}
            </p>
          </div>

          {/* Mobile title */}
          <div className="flex-1 text-center px-2 sm:hidden">
            <h1 className="font-bold text-sm text-[#C62828] leading-tight">{t('layout.header.title.short')}</h1>
          </div>

          {/* Right: WS status + SOS + notifications + user */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* WebSocket status dot */}
            <div
              data-testid="connection-status"
              title={isConnected ? t('layout.header.connection.online') : t('layout.header.connection.reconnecting')}
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-600' : 'bg-red-500'}`}
            />

            {/* SOS badge */}
            {activeSosAlerts.length > 0 && (
              <button
                data-testid="sos-alert-banner"
                className="flex items-center gap-1.5 bg-[#C62828] hover:bg-[#A91D1D] text-white text-xs font-medium px-3 py-1.5 rounded-full animate-pulse"
              >
                <AlertTriangle size={14} />
                {t('layout.header.sos.badge', { total: activeSosAlerts.length })}
              </button>
            )}

            {/* Notifications */}
            <button
              type="button"
              data-testid="notifications-btn"
              onClick={() => setNotificationsOpen((open) => !open)}
              aria-expanded={notificationsOpen}
              aria-label={
                unreadTotal > 0
                  ? t('layout.header.notifications.labelWithUnread', { total: unreadTotal })
                  : t('layout.header.notifications.label')
              }
              className="relative w-11 h-11 flex items-center justify-center hover:bg-[#F0EE5F] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]"
            >
              <Bell size={20} className="text-[#C62828]" aria-hidden="true" />
              {unreadTotal > 0 && (
                <span
                  data-testid="bell-unread-count"
                  aria-hidden="true"
                  className="absolute top-1 right-0.5 min-w-5 h-5 px-1 bg-[#C62828] text-white text-[10px] font-bold rounded-full flex items-center justify-center"
                >
                  {unreadTotal > 99 ? '99+' : unreadTotal}
                </span>
              )}
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                data-testid="user-chip"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 hover:bg-[#F0EE5F] rounded-lg px-2 py-2 transition-colors"
              >
                <div className="w-8 h-8 md:w-9 md:h-9 bg-[#2E7D32] rounded-full flex items-center justify-center text-white">
                  <span data-testid="user-initial" className="text-xs font-bold">
                    {user?.fullName?.[0]?.toUpperCase() ?? t('layout.header.user.initialFallback')}
                  </span>
                </div>
                <div className="text-left hidden xl:block">
                  <div className="text-sm font-medium text-[#C62828]">{user?.fullName}</div>
                  <div data-testid="user-role-label" className="text-xs text-[#2E7D32]">{roleLabel(user?.role)}</div>
                </div>
                <ChevronDown size={16} className="text-[#2E7D32] hidden md:block" />
              </button>

              {showUserMenu && (
                <>
                  <div data-testid="user-menu-backdrop" className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-14 w-56 bg-white rounded-lg shadow-xl border border-[#E2E8F0] z-50 py-2">
                    <button
                      onClick={() => { navigate('/settings/profile'); setShowUserMenu(false) }}
                      className="w-full px-4 py-2.5 text-left text-sm text-[#0F172A] hover:bg-[#F8FAFC] flex items-center gap-3"
                    >
                      <User size={16} className="text-[#64748B]" />
                      {t('layout.header.userMenu.profile')}
                    </button>
                    <button
                      onClick={() => { navigate('/settings/profile'); setShowUserMenu(false) }}
                      className="w-full px-4 py-2.5 text-left text-sm text-[#0F172A] hover:bg-[#F8FAFC] flex items-center gap-3"
                    >
                      <Settings size={16} className="text-[#64748B]" />
                      {t('layout.header.userMenu.settings')}
                    </button>
                    <div className="my-1 h-px bg-[#E2E8F0]" />
                    <button
                      onClick={() => { logout(); setShowUserMenu(false) }}
                      className="w-full px-4 py-2.5 text-left text-sm text-[#C62828] hover:bg-red-50 flex items-center gap-3"
                    >
                      <LogOut size={16} />
                      {t('layout.header.userMenu.logout')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <NotificationDrawer isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  )
}
