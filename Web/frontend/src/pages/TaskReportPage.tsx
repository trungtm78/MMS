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
  { key: 'completed', label: 'Đã hoàn thành', icon: CheckSquare, color: '#15803D', bg: 'bg-green-50' },
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
    return <div className="p-6 text-center text-gray-500">Đang tải báo cáo...</div>
  }

  return (
    <div className="p-6 space-y-6" data-testid="task-report-page">
      <div>
        <h1 className="text-2xl font-bold text-[#1F3A5F]">Báo Cáo Nhiệm Vụ</h1>
        <p className="text-sm text-gray-600 mt-1">Thống kê tổng quan tình hình thực hiện nhiệm vụ</p>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Không thể tải báo cáo. Vui lòng thử lại.
        </div>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <p className="text-sm text-gray-500">Tổng nhiệm vụ</p>
              <p className="text-3xl font-bold text-[#1F3A5F] mt-1">{data.totalTasks}</p>
            </div>
            {STAT_CARDS.map(({ key, label, icon: Icon, color, bg }) => (
              <div key={key} className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-500">{label}</p>
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
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Hoàn thành theo tháng</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="completed" name="Hoàn thành" fill="#15803D" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="total" name="Tổng" fill="#1F3A5F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* By type */}
          {data.byType?.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Nhiệm vụ theo loại</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.byType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="type" type="category" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" name="Số nhiệm vụ" radius={[0, 4, 4, 0]}>
                    {data.byType.map((_, i) => (
                      <Cell key={i} fill={['#1F3A5F', '#15803D', '#1976D2', '#F57C00'][i % 4]} />
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
