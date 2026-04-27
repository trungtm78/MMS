import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
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
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
      <p className="text-sm text-[#64748B] mb-1">{metric.name}</p>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-2xl font-bold text-[#0F172A]">{metric.current}</span>
        <span className="text-sm text-[#64748B] pb-0.5">/ {metric.target} {metric.unit}</span>
      </div>
      <div className="w-full h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
        <div
          className="h-2 rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: isOk ? '#2E7D32' : '#C62828',
          }}
        />
      </div>
      <p className={`text-xs mt-1.5 font-medium ${isOk ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
        {pct}% chỉ tiêu {isOk ? '✓ Đạt' : '— Chưa đạt'}
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

  if (isLoading) {
    return (
      <div className="p-6 bg-[#F8FAFC] min-h-full">
        <div className="text-center text-[#64748B] py-12 text-sm">Đang tải...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="chitieu-dashboard-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Bảng Chỉ Tiêu KPI</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Theo dõi hiệu suất so với chỉ tiêu{data ? ` — kỳ ${data.period}` : ''}
        </p>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
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
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-base font-semibold text-[#0F172A] mb-4">Xu hướng điểm KPI</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#C62828"
                    strokeWidth={2}
                    dot={{ fill: '#C62828', r: 4 }}
                    name="Điểm KPI"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Team ranking */}
          {data.teamRanking?.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-base font-semibold text-[#0F172A] mb-4">Xếp hạng đơn vị</h2>
              <div className="space-y-3">
                {data.teamRanking.map((item, i) => {
                  const isTop = i === 0
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <span className={`w-6 text-center text-sm font-bold ${isTop ? 'text-[#C62828]' : 'text-[#64748B]'}`}>
                        {i + 1}
                      </span>
                      <span className="flex-1 text-sm text-[#0F172A]">{item.name}</span>
                      <div className="w-40 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${item.score}%`,
                            backgroundColor: item.score >= 80 ? '#2E7D32' : item.score >= 60 ? '#C62828' : '#64748B',
                          }}
                        />
                      </div>
                      <span className={`text-sm font-medium w-12 text-right ${
                        item.score >= 80 ? 'text-[#2E7D32]' : 'text-[#C62828]'
                      }`}>
                        {item.score}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
