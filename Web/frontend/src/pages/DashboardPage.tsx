// US-W001 AC-1: Post-login dashboard — role-specific landing
// US-W008 AC-2: SOS alert banner visible immediately
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useSocket } from '@/hooks/useSocket'
import { useRbac } from '@/hooks/useRbac'
import { VIETNAM_TIME_ZONE, todayInVietnam } from '@/lib/dates'
import { formatVietnamDateTime } from '@/lib/vietnamDateTime'
import type { SosIncidentType, SosSeverity } from '@/api/sos'
import type { SosLiveAlert } from '@/contexts/socketContextValue'
import type { TranslationKey } from '@/i18n/types'
import type { UserRole } from '@/types'
import {
  AlertTriangle,
  Users,
  ClipboardList,
  Clock,
  ArrowUpRight,
  UserCheck,
  Calendar,
  TrendingUp,
} from 'lucide-react'
import client from '@/api/client'
import { attendanceApi, type TimesheetDayStatus } from '@/api/attendance'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DashboardStats {
  totalMilitia: number
  activeToday: number
  pendingTasks: number
  pendingApprovals: number
  activeSosAlerts: number
}

async function fetchStats(): Promise<DashboardStats> {
  const res = await client.get('/dashboard/stats')
  return res.data
}

/**
 * GET /dashboard/charts (dashboard.service.ts getCharts), over the scope of the counters: twelve
 * months of task counts for the year and the active headcount of each unit.
 */
interface DashboardCharts {
  year: number
  tasks: { month: number; assigned: number; completed: number; overdue: number }[]
  areas: { unitCode: string; unitName: string; headcount: number }[]
}

async function fetchCharts(year: number): Promise<DashboardCharts> {
  const res = await client.get('/dashboard/charts', { params: { year } })
  return res.data
}

const PERIOD_OPTIONS = ['2026', '2025', '2024'] as const

// police_area is not listed: its subtitle names the area (see roleSubtitle)
const ROLE_SUBTITLE: Readonly<Partial<Record<UserRole, TranslationKey>>> = {
  police_ward: 'dashboard.overview.roleSubtitle.policeWard',
  office_staff: 'dashboard.overview.roleSubtitle.officeStaff',
  dqtv: 'dashboard.overview.roleSubtitle.dqtv',
  system_admin: 'dashboard.overview.roleSubtitle.systemAdmin',
  ubnd_leader: 'dashboard.overview.roleSubtitle.ubndLeader',
}

type RecordedDayStatus = Exclude<TimesheetDayStatus, null>

// Status of today's timesheet day; a day without one reads "Chưa chấm" on a grey dot
const ATTENDANCE_STATUS_LABEL = {
  present: 'dashboard.overview.attendance.present',
  late: 'dashboard.overview.attendance.late',
  early_leave: 'dashboard.overview.attendance.earlyLeave',
  absent: 'dashboard.overview.attendance.absent',
  leave: 'dashboard.overview.attendance.leave',
} as const satisfies Record<RecordedDayStatus, TranslationKey>

const ATTENDANCE_STATUS_DOT = {
  present: 'bg-[#2E7D32]',
  late: 'bg-[#F57C00]',
  early_leave: 'bg-[#F57C00]',
  absent: 'bg-[#C62828]',
  leave: 'bg-[#1F3A5F]',
} as const satisfies Record<RecordedDayStatus, string>

// ─── Live SOS alert ───────────────────────────────────────────────────────────

// Severity texts and badges as on the SOS page
const SOS_SEVERITY_LABEL = {
  urgent: 'sos.codes.severities.urgent',
  high: 'sos.codes.severities.high',
  medium: 'sos.codes.severities.medium',
  low: 'sos.codes.severities.low',
} as const satisfies Record<SosSeverity, TranslationKey>

const SOS_SEVERITY_BADGE = {
  urgent: 'bg-[#C62828] text-white',
  high: 'bg-red-100 text-[#C62828]',
  medium: 'bg-orange-100 text-orange-700',
  low: 'bg-slate-100 text-[#64748B]',
} as const satisfies Record<SosSeverity, string>

const SOS_TYPE_LABEL = {
  sos: 'dashboard.overview.sos.types.sos',
  security: 'dashboard.overview.sos.types.security',
  fire: 'dashboard.overview.sos.types.fire',
  medical: 'dashboard.overview.sos.types.medical',
  accident: 'dashboard.overview.sos.types.accident',
  utility: 'dashboard.overview.sos.types.utility',
  other: 'dashboard.overview.sos.types.other',
} as const satisfies Record<SosIncidentType, TranslationKey>

/**
 * One alert announced live (sos:new): its title, code and incident type, the time this browser
 * received it in Vietnam, and its severity. Every live alert is new, so there is no status.
 */
function SosAlertItem({ alert, compact = false }: { alert: SosLiveAlert; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <div
      data-testid={`sos-alert-${alert.id}`}
      className={`flex items-center justify-between gap-3 bg-red-50 rounded-lg px-4 border border-red-100 ${compact ? 'py-2' : 'py-3'}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#0F172A] truncate">{alert.title}</p>
        <p className="text-xs text-[#64748B]">
          {t('dashboard.overview.sos.alertMeta', { code: alert.code, type: t(SOS_TYPE_LABEL[alert.incidentType]) })}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-[#64748B]">{formatVietnamDateTime(alert.receivedAt)}</span>
        <span
          data-testid={`sos-severity-badge-${alert.id}`}
          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${SOS_SEVERITY_BADGE[alert.severity]}`}
        >
          {t(SOS_SEVERITY_LABEL[alert.severity])}
        </span>
      </div>
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  testId,
  icon,
  iconBg,
  label,
  value,
  highlight,
}: {
  testId: string
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      data-testid={testId}
      className={`bg-white rounded-xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all ${highlight ? 'border-2 border-[#C62828]' : 'border border-[#E2E8F0]'}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
      </div>
      <p className="text-xs text-[#64748B] font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#0F172A]">{value}</p>
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-lg animate-pulse bg-[#E2E8F0]" />
      </div>
      <div className="h-3 w-24 animate-pulse bg-[#E2E8F0] rounded mb-2" />
      <div className="h-7 w-16 animate-pulse bg-[#E2E8F0] rounded" />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { activeSosAlerts } = useSocket()
  const { can, role } = useRbac()
  const navigate = useNavigate()
  const [selectedPeriod, setSelectedPeriod] = useState('2026')

  const { data: stats, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchStats,
    refetchInterval: 30_000,
  })

  const { data: charts, refetch: refetchCharts } = useQuery({
    queryKey: ['dashboard-charts', selectedPeriod],
    queryFn: () => fetchCharts(Number(selectedPeriod)),
  })

  // Timesheet days are calendar days in Vietnam
  const today = todayInVietnam()

  const { data: timesheet } = useQuery({
    queryKey: ['timesheet', today, today],
    queryFn: () => attendanceApi.timesheet({ from: today, to: today }),
    enabled: role === 'dqtv',
    staleTime: 60_000,
  })

  // A member gets their own row only, none when the account has no militia profile
  const todayAttendance = timesheet?.data[0]?.days.find((day) => day.date === today)
  const attendanceStatus = todayAttendance?.status ?? null

  const roleSubtitleKey = role ? ROLE_SUBTITLE[role] : undefined
  const roleSubtitle =
    role === 'police_area' ? t('dashboard.overview.roleSubtitle.policeArea', { unit: user?.unitScope ?? '' }) :
    roleSubtitleKey ? t(roleSubtitleKey) : ''

  const taskChartData = (charts?.tasks ?? []).map((row) => ({ ...row, month: t('dashboard.overview.taskChart.month', { month: row.month }) }))
  const areaChartData = (charts?.areas ?? []).map(({ unitName, headcount }) => ({ name: unitName, count: headcount }))

  return (
    <div data-testid="dashboard-overview" className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            {t('dashboard.overview.greeting', { name: user?.fullName ?? '' })}
          </h1>
          <p className="text-sm text-[#64748B] mt-1">{roleSubtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="pl-3 pr-8 py-2 border border-[#E2E8F0] rounded-lg bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
          >
            {PERIOD_OPTIONS.map((year) => (
              <option key={year} value={year}>{t('dashboard.overview.period.option', { year })}</option>
            ))}
          </select>
          <button
            onClick={() => {
              void refetch()
              void refetchCharts()
            }}
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
          >
            <TrendingUp size={15} />
            {t('dashboard.overview.actions.refresh')}
          </button>
        </div>
      </div>

      {/* DQTV Hero Card — shown only for dqtv role */}
      {role === 'dqtv' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[#0F172A]">
              {t('dashboard.overview.today.title', {
                date: new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', timeZone: VIETNAM_TIME_ZONE }),
              })}
            </h2>
            <span className="text-xs text-[#64748B] bg-[#F8FAFC] px-3 py-1 rounded-full border border-[#E2E8F0]">
              {t('dashboard.overview.today.liveBadge')}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 bg-[#F8FAFC] rounded-lg">
              <div className={`w-3 h-3 rounded-full shrink-0 ${attendanceStatus ? ATTENDANCE_STATUS_DOT[attendanceStatus] : 'bg-[#94A3B8]'}`} />
              <div>
                <p className="text-xs text-[#64748B]">{t('dashboard.overview.attendance.label')}</p>
                <p className="text-sm font-semibold text-[#0F172A]">
                  {t(attendanceStatus ? ATTENDANCE_STATUS_LABEL[attendanceStatus] : 'dashboard.overview.attendance.notRecorded')}
                </p>
                {todayAttendance?.checkIn && (
                  <p className="text-xs text-[#64748B] mt-0.5">
                    {t('dashboard.overview.attendance.times', {
                      checkIn: todayAttendance.checkIn,
                      checkOut: todayAttendance.checkOut ?? t('common.states.none'),
                    })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-[#F8FAFC] rounded-lg">
              <ClipboardList size={20} className="text-[#1F3A5F] shrink-0" />
              <div>
                <p className="text-xs text-[#64748B]">{t('dashboard.overview.today.tasksInProgress')}</p>
                <p className="text-sm font-semibold text-[#0F172A]">{stats ? String(stats.pendingTasks) : '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-[#F8FAFC] rounded-lg">
              <Clock size={20} className="text-[#64748B] shrink-0" />
              <div>
                <p className="text-xs text-[#64748B]">{t('dashboard.overview.today.nextShift')}</p>
                <p className="text-sm font-semibold text-[#0F172A]">—</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SOS Alert Banner — US-W008 AC-2 */}
      {activeSosAlerts.length > 0 && (
        <div
          data-testid="sos-alert-section"
          className="bg-white border border-[#C62828] rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-[#C62828]" size={18} />
            </div>
            <h3 className="text-[#C62828] font-semibold">
              {t('dashboard.overview.sos.bannerTitle', { count: activeSosAlerts.length })}
            </h3>
          </div>
          <div className="space-y-2">
            {activeSosAlerts.map((alert) => (
              <SosAlertItem key={alert.id} alert={alert} compact />
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {can.manageMilitia ? (
          <StatCard
            testId="stat-militia-online"
            iconBg="bg-[#E3F2FD]"
            icon={<Users size={22} className="text-[#1F3A5F]" />}
            label={t('dashboard.overview.stats.totalMilitia')}
            value={stats ? String(stats.totalMilitia) : '—'}
          />
        ) : (
          !stats && <StatCardSkeleton />
        )}
        {stats ? (
          <StatCard
            testId="stat-tasks-pending"
            iconBg="bg-[#E8F5E9]"
            icon={<ClipboardList size={22} className="text-[#2E7D32]" />}
            label={t('dashboard.overview.stats.pendingTasks')}
            value={String(stats.pendingTasks)}
          />
        ) : (
          <StatCardSkeleton />
        )}
        {can.manageAttendance ? (
          stats ? (
            <StatCard
              testId="stat-attendance-today"
              iconBg="bg-[#FFF3E0]"
              icon={<UserCheck size={22} className="text-[#F57C00]" />}
              label={t('dashboard.overview.stats.attendanceToday')}
              value={String(stats.activeToday)}
            />
          ) : (
            <StatCardSkeleton />
          )
        ) : null}
        {stats ? (
          <StatCard
            testId="stat-sos-active"
            iconBg="bg-[#FFEBEE]"
            icon={<AlertTriangle size={22} className="text-[#C62828]" />}
            label={t('dashboard.overview.stats.sosActive')}
            value={String(stats.activeSosAlerts ?? activeSosAlerts.length)}
            highlight={(stats.activeSosAlerts ?? activeSosAlerts.length) > 0}
          />
        ) : (
          <StatCardSkeleton />
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line chart — task completion 2:1 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E2E8F0] p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-[#0F172A]">{t('dashboard.overview.taskChart.title')}</h2>
              <p className="text-xs text-[#64748B] mt-0.5">{t('dashboard.overview.taskChart.subtitle', { year: selectedPeriod })}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#64748B]">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#1F3A5F] rounded-full inline-block" />{t('dashboard.overview.taskChart.assigned')}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#2E7D32] rounded-full inline-block" />{t('dashboard.overview.taskChart.completed')}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#C62828] rounded-full inline-block" />{t('dashboard.overview.taskChart.overdue')}</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={taskChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                labelStyle={{ color: '#0F172A', fontWeight: 600 }}
              />
              <Line type="monotone" dataKey="assigned"  stroke="#1F3A5F" strokeWidth={2} dot={false} name={t('dashboard.overview.taskChart.assigned')} />
              <Line type="monotone" dataKey="completed" stroke="#2E7D32" strokeWidth={2} dot={false} name={t('dashboard.overview.taskChart.completed')} />
              <Line type="monotone" dataKey="overdue"   stroke="#C62828" strokeWidth={2} dot={false} name={t('dashboard.overview.taskChart.overdue')} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart — KP distribution */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[#0F172A]">{t('dashboard.overview.areaChart.title')}</h2>
            <p className="text-xs text-[#64748B] mt-0.5">{t('dashboard.overview.areaChart.subtitle')}</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={areaChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={72} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }}
                labelStyle={{ color: '#0F172A', fontWeight: 600 }}
              />
              <Bar dataKey="count" fill="#1F3A5F" radius={[0, 4, 4, 0]} name={t('dashboard.overview.areaChart.headcount')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alerts + quick actions row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SOS alerts table — always visible card (even when no active alerts) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E2E8F0] p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle size={16} className="text-[#C62828]" />
            </div>
            <h2 className="text-lg font-semibold text-[#0F172A]">{t('dashboard.overview.sos.cardTitle')}</h2>
            {activeSosAlerts.length > 0 && (
              <span className="ml-auto text-xs bg-[#C62828] text-white px-2 py-0.5 rounded-full font-medium">
                {t('dashboard.overview.sos.newCount', { count: activeSosAlerts.length })}
              </span>
            )}
          </div>

          {activeSosAlerts.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <UserCheck size={22} className="text-[#2E7D32]" />
              </div>
              <p className="text-sm text-[#64748B]">{t('dashboard.overview.sos.empty')}</p>
            </div>
          ) : (
            <div
              data-testid="sos-alert-section"
              className="space-y-3"
            >
              {activeSosAlerts.map((alert) => (
                <SosAlertItem key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </div>

        {/* Quick actions panel */}
        <div className="bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-xl p-6 flex flex-col gap-4">
          <div className="mb-2">
            <h2 className="text-lg font-semibold text-white">{t('dashboard.overview.quickActions.title')}</h2>
            <p className="text-xs text-white/70 mt-0.5">{t('dashboard.overview.quickActions.subtitle')}</p>
          </div>

          {[
            { icon: <ClipboardList size={16} />, label: t('dashboard.overview.quickActions.assignTask'),   route: '/tasks/new' },
            { icon: <Users size={16} />,         label: t('dashboard.overview.quickActions.addMilitia'),   route: '/recruitment' },
            { icon: <Calendar size={16} />,      label: t('dashboard.overview.quickActions.createReport'), route: '/reports/custom' },
            { icon: <Clock size={16} />,         label: t('dashboard.overview.quickActions.viewGps'),      route: '/gps' },
          ].map(({ icon, label, route }) => (
            <button
              key={route}
              onClick={() => navigate(route)}
              className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 transition-colors rounded-lg p-4 text-white text-sm font-medium"
            >
              <span className="text-white/80">{icon}</span>
              {label}
              <ArrowUpRight size={14} className="ml-auto text-white/60" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
