// US-W001 AC-1: Post-login dashboard — role-specific landing
// US-W008 AC-2: SOS alert banner visible immediately
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useSocket } from '@/contexts/SocketContext'
import { useRbac } from '@/hooks/useRbac'
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

// ─── Mock chart data ──────────────────────────────────────────────────────────

const TASK_CHART_DATA = [
  { month: 'T1',  assigned: 42, completed: 38, overdue: 4 },
  { month: 'T2',  assigned: 38, completed: 35, overdue: 3 },
  { month: 'T3',  assigned: 55, completed: 50, overdue: 5 },
  { month: 'T4',  assigned: 48, completed: 45, overdue: 3 },
  { month: 'T5',  assigned: 60, completed: 54, overdue: 6 },
  { month: 'T6',  assigned: 52, completed: 49, overdue: 3 },
  { month: 'T7',  assigned: 45, completed: 44, overdue: 1 },
  { month: 'T8',  assigned: 58, completed: 52, overdue: 6 },
  { month: 'T9',  assigned: 63, completed: 60, overdue: 3 },
  { month: 'T10', assigned: 70, completed: 65, overdue: 5 },
  { month: 'T11', assigned: 66, completed: 62, overdue: 4 },
  { month: 'T12', assigned: 74, completed: 70, overdue: 4 },
]

const KP_CHART_DATA = [
  { name: 'Khu phố 1', count: 32 },
  { name: 'Khu phố 2', count: 28 },
  { name: 'Khu phố 3', count: 41 },
  { name: 'Khu phố 4', count: 25 },
  { name: 'Khu phố 5', count: 36 },
  { name: 'Khu phố 6', count: 30 },
]

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  testId,
  icon,
  iconBg,
  label,
  value,
  trend,
  trendLabel,
}: {
  testId: string
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  trend?: number
  trendLabel?: string
}) {
  return (
    <div
      data-testid={testId}
      className="bg-white rounded-xl p-6 border border-[#E2E8F0] hover:shadow-lg hover:-translate-y-1 transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        {trend !== undefined && (
          <span
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
              trend >= 0
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            <ArrowUpRight size={11} className={trend < 0 ? 'rotate-90' : ''} />
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-xs text-[#64748B] font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#0F172A]">{value}</p>
      {trendLabel && <p className="text-xs text-[#64748B] mt-1">{trendLabel}</p>}
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl animate-pulse bg-[#E2E8F0]" />
      </div>
      <div className="h-3 w-24 animate-pulse bg-[#E2E8F0] rounded mb-2" />
      <div className="h-7 w-16 animate-pulse bg-[#E2E8F0] rounded" />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth()
  const { activeSosAlerts } = useSocket()
  const { can, role } = useRbac()
  const [selectedPeriod, setSelectedPeriod] = useState('2026')

  const { data: stats, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchStats,
    refetchInterval: 30_000,
  })

  const roleSubtitle =
    role === 'police_ward'   ? 'Tổng quan toàn phường' :
    role === 'police_area'   ? `Khu vực: ${user?.unitScope}` :
    role === 'office_staff'  ? 'Quản lý hành chính' :
    role === 'dqtv'          ? 'Nhiệm vụ và lịch làm việc của bạn' :
    role === 'system_admin'  ? 'Bảng điều khiển hệ thống' :
    role === 'ubnd_leader'   ? 'Báo cáo tổng hợp' : ''

  return (
    <div data-testid="dashboard-overview" className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Xin chào, {user?.fullName}
          </h1>
          <p className="text-sm text-[#64748B] mt-1">{roleSubtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="pl-3 pr-8 py-2 border border-[#E2E8F0] rounded-lg bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
          >
            <option value="2026">Năm 2026</option>
            <option value="2025">Năm 2025</option>
            <option value="2024">Năm 2024</option>
          </select>
          <button
            onClick={() => refetch()}
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
          >
            <TrendingUp size={15} />
            Làm mới
          </button>
        </div>
      </div>

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
              {activeSosAlerts.length} cảnh báo SOS chưa xử lý
            </h3>
          </div>
          <div className="space-y-2">
            {activeSosAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between bg-red-50 rounded-lg px-4 py-2 border border-red-100"
              >
                <span className="text-sm font-medium text-[#0F172A]">{alert.militiaName}</span>
                <span className="text-xs text-[#64748B]">
                  {new Date(alert.createdAt).toLocaleTimeString('vi-VN')}
                </span>
                <span
                  data-testid={`sos-status-badge-${alert.id}`}
                  className="text-xs bg-[#C62828] text-white px-2.5 py-0.5 rounded-full font-medium"
                >
                  {alert.status === 'active' ? 'Chưa xử lý' : alert.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {can.manageMilitia ? (
          <StatCard
            testId="stat-militia-online"
            iconBg="bg-blue-100"
            icon={<Users size={22} className="text-blue-600" />}
            label="Tổng DQTV đang hoạt động"
            value={stats ? String(stats.totalMilitia) : '—'}
            trend={5}
            trendLabel="so với tháng trước"
          />
        ) : (
          !stats && <StatCardSkeleton />
        )}
        {stats ? (
          <StatCard
            testId="stat-tasks-pending"
            iconBg="bg-amber-100"
            icon={<ClipboardList size={22} className="text-amber-600" />}
            label="Nhiệm vụ đang chờ"
            value={String(stats.pendingTasks)}
            trend={-3}
            trendLabel="so với hôm qua"
          />
        ) : (
          <StatCardSkeleton />
        )}
        {can.manageAttendance ? (
          stats ? (
            <StatCard
              testId="stat-attendance-today"
              iconBg="bg-[#2E7D32]/10"
              icon={<UserCheck size={22} className="text-[#2E7D32]" />}
              label="Chấm công hôm nay"
              value={String(stats.activeToday)}
              trend={8}
              trendLabel="so với hôm qua"
            />
          ) : (
            <StatCardSkeleton />
          )
        ) : null}
        {stats ? (
          <StatCard
            testId="stat-sos-active"
            iconBg="bg-red-100"
            icon={<AlertTriangle size={22} className="text-[#C62828]" />}
            label="SOS chưa xử lý"
            value={String(stats.activeSosAlerts ?? activeSosAlerts.length)}
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
              <h2 className="text-base font-semibold text-[#0F172A]">Tỷ lệ hoàn thành công việc</h2>
              <p className="text-xs text-[#64748B] mt-0.5">Theo tháng — năm {selectedPeriod}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#64748B]">
              <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#1F3A5F] rounded inline-block" />Giao</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#2E7D32] rounded inline-block" />Hoàn thành</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#C62828] rounded inline-block" />Trễ hạn</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={TASK_CHART_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                labelStyle={{ color: '#0F172A', fontWeight: 600 }}
              />
              <Line type="monotone" dataKey="assigned"  stroke="#1F3A5F" strokeWidth={2} dot={false} name="Giao" />
              <Line type="monotone" dataKey="completed" stroke="#2E7D32" strokeWidth={2} dot={false} name="Hoàn thành" />
              <Line type="monotone" dataKey="overdue"   stroke="#C62828" strokeWidth={2} dot={false} name="Trễ hạn" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart — KP distribution */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-[#0F172A]">Phân bố DQTV theo Khu phố</h2>
            <p className="text-xs text-[#64748B] mt-0.5">Tổng quân số hiện tại</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={KP_CHART_DATA} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={72} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }}
                labelStyle={{ color: '#0F172A', fontWeight: 600 }}
              />
              <Bar dataKey="count" fill="#1F3A5F" radius={[0, 4, 4, 0]} name="Quân số" />
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
            <h2 className="text-base font-semibold text-[#0F172A]">Cảnh báo SOS</h2>
            {activeSosAlerts.length > 0 && (
              <span className="ml-auto text-xs bg-[#C62828] text-white px-2 py-0.5 rounded-full font-medium">
                {activeSosAlerts.length} mới
              </span>
            )}
          </div>

          {activeSosAlerts.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <UserCheck size={22} className="text-[#2E7D32]" />
              </div>
              <p className="text-sm text-[#64748B]">Không có cảnh báo SOS nào</p>
            </div>
          ) : (
            <div
              data-testid="sos-alert-section"
              className="space-y-2"
            >
              {activeSosAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between bg-red-50 rounded-lg px-4 py-3 border border-red-100"
                >
                  <span className="text-sm font-medium text-[#0F172A]">{alert.militiaName}</span>
                  <span className="text-xs text-[#64748B]">
                    {new Date(alert.createdAt).toLocaleTimeString('vi-VN')}
                  </span>
                  <span
                    data-testid={`sos-status-badge-${alert.id}`}
                    className="text-xs bg-[#C62828] text-white px-2.5 py-0.5 rounded-full font-medium"
                  >
                    {alert.status === 'active' ? 'Chưa xử lý' : alert.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions panel */}
        <div className="bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-xl p-6 flex flex-col gap-4">
          <div className="mb-2">
            <h2 className="text-base font-semibold text-white">Thao tác nhanh</h2>
            <p className="text-xs text-white/70 mt-0.5">Truy cập nhanh các chức năng</p>
          </div>

          {[
            { icon: <ClipboardList size={16} />, label: 'Giao việc mới' },
            { icon: <Users size={16} />,         label: 'Thêm DQTV' },
            { icon: <Calendar size={16} />,       label: 'Tạo báo cáo' },
            { icon: <Clock size={16} />,           label: 'Xem GPS' },
          ].map(({ icon, label }) => (
            <button
              key={label}
              className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-4 py-3 text-white text-sm font-medium"
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
