import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CheckSquare, Clock, AlertTriangle, XCircle } from 'lucide-react'
import client from '@/api/client'

interface TaskStats {
  totalTasks: number
  completed: number
  inProgress: number
  overdue: number
  cancelled: number
  byType: { type: string; count: number }[]
  byMonth: { month: string; completed: number; total: number }[]
}

async function getTaskReport(): Promise<TaskStats> {
  const res = await client.get('/tasks/report')
  return res.data
}

const STAT_CARDS = [
  { key: 'completed', label: 'Đã hoàn thành', icon: CheckSquare, color: '#2E7D32', bg: 'bg-green-50' },
  { key: 'inProgress', label: 'Đang thực hiện', icon: Clock,       color: '#1976D2', bg: 'bg-blue-50' },
  { key: 'overdue',    label: 'Quá hạn',         icon: AlertTriangle, color: '#C62828', bg: 'bg-red-50' },
  { key: 'cancelled',  label: 'Đã hủy',           icon: XCircle,    color: '#F57C00', bg: 'bg-orange-50' },
] as const

export function TaskReportPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['task-report'],
    queryFn: getTaskReport,
    staleTime: 5 * 60_000,
  })

  if (isLoading) {
    return (
      <div className="p-6 bg-[#F8FAFC] min-h-full">
        <div className="text-center text-[#64748B] py-12 text-sm">Đang tải báo cáo...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="task-report-page">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-bold text-[#0F172A]">Báo Cáo Nhiệm Vụ</h1>
        <p className="text-sm text-[#64748B] mt-1">Báo cáo thống kê tình hình thực hiện nhiệm vụ</p>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          Không thể tải báo cáo. Vui lòng thử lại.
        </div>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <p className="text-sm text-[#64748B]">Tổng nhiệm vụ</p>
              <p className="text-3xl font-bold text-[#1F3A5F] mt-1">{data.totalTasks}</p>
            </div>
            {STAT_CARDS.map(({ key, label, icon: Icon, color, bg }) => (
              <div key={key} className="bg-white rounded-xl border border-[#E2E8F0] p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-[#64748B]">{label}</p>
                  <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                    <Icon size={16} style={{ color }} />
                  </div>
                </div>
                <p className="text-3xl font-bold" style={{ color }}>{data[key]}</p>
              </div>
            ))}
          </div>

          {/* Monthly chart */}
          {data.byMonth?.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-base font-semibold text-[#0F172A] mb-4">Hoàn thành theo tháng</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Bar dataKey="completed" name="Hoàn thành" fill="#2E7D32" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="total" name="Tổng" fill="#1F3A5F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* By type */}
          {data.byType?.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-base font-semibold text-[#0F172A] mb-4">Nhiệm vụ theo loại</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.byType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis dataKey="type" type="category" tick={{ fontSize: 12, fill: '#64748B' }} width={120} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Bar dataKey="count" name="Số nhiệm vụ" radius={[0, 4, 4, 0]}>
                    {data.byType.map((_, i) => (
                      <Cell key={i} fill={['#C62828', '#2E7D32', '#1F3A5F', '#F57C00'][i % 4]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
