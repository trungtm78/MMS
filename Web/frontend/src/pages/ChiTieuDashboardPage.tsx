import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadialBarChart, RadialBar,
} from 'recharts'
import client from '@/api/client'

interface KpiMetric {
  name: string
  current: number
  target: number
  unit: string
}

interface KpiDashboard {
  period: string
  metrics: KpiMetric[]
  trend: { month: string; score: number }[]
  teamRanking: { name: string; score: number }[]
}

async function getKpiDashboard(): Promise<KpiDashboard> {
  const res = await client.get('/kpi/dashboard')
  return res.data
}

function MetricCard({ metric }: { metric: KpiMetric }) {
  const pct = Math.min(100, Math.round((metric.current / metric.target) * 100))
  const isOk = pct >= 100
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
      <p className="text-sm text-gray-500 mb-1">{metric.name}</p>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-2xl font-bold text-gray-900">{metric.current}</span>
        <span className="text-sm text-gray-400">/ {metric.target} {metric.unit}</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all ${isOk ? 'bg-green-500' : 'bg-[#1F3A5F]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs mt-1.5 font-medium ${isOk ? 'text-green-600' : 'text-gray-500'}`}>
        {pct}% chỉ tiêu {isOk ? '✓ Đạt' : ''}
      </p>
    </div>
  )
}

export function ChiTieuDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['kpi-dashboard'],
    queryFn: getKpiDashboard,
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <div className="p-6 text-center text-gray-500">Đang tải...</div>

  return (
    <div className="p-6 space-y-6" data-testid="chitieu-dashboard-page">
      <div>
        <h1 className="text-2xl font-bold text-[#1F3A5F]">Bảng Chỉ Tiêu KPI</h1>
        <p className="text-sm text-gray-600 mt-1">
          Theo dõi hiệu suất so với chỉ tiêu{data ? ` — kỳ ${data.period}` : ''}
        </p>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Không thể tải dữ liệu KPI.
        </div>
      )}

      {data && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {data.metrics.map((m) => <MetricCard key={m.name} metric={m} />)}
          </div>

          {/* Trend chart */}
          {data.trend?.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Xu hướng điểm KPI</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#1F3A5F"
                    strokeWidth={2}
                    dot={{ fill: '#1F3A5F', r: 4 }}
                    name="Điểm KPI"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Team ranking */}
          {data.teamRanking?.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Xếp hạng đơn vị</h2>
              <div className="space-y-3">
                {data.teamRanking.map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <span className="w-6 text-center text-sm font-bold text-gray-400">{i + 1}</span>
                    <span className="flex-1 text-sm text-gray-900">{item.name}</span>
                    <div className="w-40 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-2 bg-[#1F3A5F] rounded-full"
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-12 text-right">{item.score}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
