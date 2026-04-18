// US-W001 AC-1: Post-login dashboard — role-specific landing
// US-W008 AC-2: SOS alert banner visible immediately
import { useAuth } from '@/contexts/AuthContext'
import { useSocket } from '@/contexts/SocketContext'
import { useRbac } from '@/hooks/useRbac'
import { AlertTriangle, Users, ClipboardList, Clock } from 'lucide-react'

export function DashboardPage() {
  const { user } = useAuth()
  const { activeSosAlerts } = useSocket()
  const { can, role } = useRbac()

  return (
    <div data-testid="dashboard-overview" className="p-6 space-y-6">
      {/* SOS Alert Banner — US-W008 AC-2 */}
      {activeSosAlerts.length > 0 && (
        <div
          data-testid="sos-alert-section"
          className="bg-red-50 border border-red-300 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-red-600" size={20} />
            <h3 className="text-red-700 font-semibold">
              {activeSosAlerts.length} cảnh báo SOS chưa xử lý
            </h3>
          </div>
          <div className="space-y-2">
            {activeSosAlerts.map((alert) => (
              <div key={alert.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-red-200">
                <span className="text-sm font-medium text-slate-700">{alert.militiaName}</span>
                <span className="text-xs text-slate-500">{new Date(alert.createdAt).toLocaleTimeString('vi-VN')}</span>
                <span
                  data-testid={`sos-status-badge-${alert.id}`}
                  className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full"
                >
                  {alert.status === 'active' ? 'Chưa xử lý' : alert.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Xin chào, {user?.fullName}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {role === 'police_ward' && 'Tổng quan toàn phường'}
          {role === 'police_area' && `Khu vực: ${user?.unitScope}`}
          {role === 'office_staff' && 'Quản lý hành chính'}
          {role === 'dqtv' && 'Nhiệm vụ và lịch làm việc của bạn'}
          {role === 'system_admin' && 'Bảng điều khiển hệ thống'}
          {role === 'ubnd_leader' && 'Báo cáo tổng hợp'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {can.manageMilitia && (
          <StatCard
            testId="stat-militia-online"
            icon={<Users size={20} className="text-blue-600" />}
            label="DQTV đang online"
            value="—"
            bg="bg-blue-50"
          />
        )}
        <StatCard
          testId="stat-tasks-pending"
          icon={<ClipboardList size={20} className="text-amber-600" />}
          label="Nhiệm vụ đang chờ"
          value="—"
          bg="bg-amber-50"
        />
        {can.manageAttendance && (
          <StatCard
            testId="stat-attendance-today"
            icon={<Clock size={20} className="text-green-600" />}
            label="Chấm công hôm nay"
            value="—"
            bg="bg-green-50"
          />
        )}
        <StatCard
          testId="stat-sos-active"
          icon={<AlertTriangle size={20} className="text-red-600" />}
          label="SOS chưa xử lý"
          value={String(activeSosAlerts.length)}
          bg="bg-red-50"
        />
      </div>
    </div>
  )
}

function StatCard({
  testId,
  icon,
  label,
  value,
  bg,
}: {
  testId: string
  icon: React.ReactNode
  label: string
  value: string
  bg: string
}) {
  return (
    <div
      data-testid={testId}
      className={`${bg} rounded-xl p-4 flex items-center gap-4`}
    >
      <div className="p-2 bg-white rounded-lg shadow-sm">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  )
}
