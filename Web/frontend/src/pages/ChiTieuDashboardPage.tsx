import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
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

interface KpiSummaryItem {
  militiaId: string
  name: string
  code: string
  unit: string
  attendanceScore: number | null
  taskScore: number | null
  disciplineScore: number | null
  attitudeScore: number | null
  supervisorScore: number | null
  total: number | null
  rank: number
  rankInUnit: number
  xepLoai: 'Xuất sắc' | 'Tốt' | 'Khá' | 'Cần cải thiện'
}

const XEP_LOAI_STYLE: Record<string, string> = {
  'Xuất sắc': 'bg-yellow-100 text-yellow-700',
  'Tốt': 'bg-green-100 text-[#2E7D32]',
  'Khá': 'bg-blue-100 text-blue-700',
  'Cần cải thiện': 'bg-orange-100 text-orange-700',
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'kpi-report'>('dashboard')
  const [kpiPeriodId, setKpiPeriodId] = useState('')
  const [kpiUnitCode, setKpiUnitCode] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['kpi-dashboard'],
    queryFn: getKpiDashboard,
    staleTime: 5 * 60_000,
  })

  const { data: kpiSummary, isLoading: kpiSummaryLoading } = useQuery<KpiSummaryItem[]>({
    queryKey: ['kpi-summary-report', kpiPeriodId, kpiUnitCode],
    queryFn: () => client.get('/kpi/summary-report', { params: { periodId: kpiPeriodId, unitCode: kpiUnitCode || undefined } }).then(r => r.data),
    enabled: !!kpiPeriodId && activeTab === 'kpi-report',
  })

  const handleKpiExport = async () => {
    if (!kpiPeriodId) return toast.error('Chọn kỳ trước khi xuất')
    try {
      const resp = await client.get('/kpi/export', {
        params: { periodId: kpiPeriodId, unitCode: kpiUnitCode || undefined },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `BaoCaoKPI_${kpiPeriodId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Không thể xuất báo cáo KPI')
    }
  }

  if (isLoading && activeTab === 'dashboard') {
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

      {/* Tab navigation */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="flex border-b border-[#E2E8F0]">
          {(['dashboard', 'kpi-report'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3.5 text-sm font-medium transition-all relative ${
                activeTab === tab
                  ? 'text-[#C62828] border-b-2 border-[#C62828] -mb-px'
                  : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
            >
              {tab === 'dashboard' ? 'Chỉ tiêu' : 'Báo cáo KPI'}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && (
          <div className="p-6 space-y-6">
            {isError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
                Không thể tải dữ liệu KPI.
              </div>
            )}
            {data && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {data.metrics.map((m) => <MetricCard key={m.name} metric={m} />)}
                </div>
                {data.trend?.length > 0 && (
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
                    <h2 className="text-base font-semibold text-[#0F172A] mb-4">Xu hướng điểm KPI</h2>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={data.trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="score" stroke="#C62828" strokeWidth={2} dot={{ fill: '#C62828', r: 4 }} name="Điểm KPI" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {data.teamRanking?.length > 0 && (
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
                    <h2 className="text-base font-semibold text-[#0F172A] mb-4">Xếp hạng đơn vị</h2>
                    <div className="space-y-3">
                      {data.teamRanking.map((item, i) => {
                        const isTop = i === 0
                        return (
                          <div key={i} className="flex items-center gap-4">
                            <span className={`w-6 text-center text-sm font-bold ${isTop ? 'text-[#C62828]' : 'text-[#64748B]'}`}>{i + 1}</span>
                            <span className="flex-1 text-sm text-[#0F172A]">{item.name}</span>
                            <div className="w-40 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                              <div className="h-2 rounded-full transition-all" style={{ width: `${item.score}%`, backgroundColor: item.score >= 80 ? '#2E7D32' : item.score >= 60 ? '#C62828' : '#64748B' }} />
                            </div>
                            <span className={`text-sm font-medium w-12 text-right ${item.score >= 80 ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>{item.score}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'kpi-report' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                placeholder="Kỳ lương (ID)"
                value={kpiPeriodId}
                onChange={e => setKpiPeriodId(e.target.value)}
                className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
              />
              <input
                type="text"
                placeholder="Mã đơn vị (tuỳ chọn)"
                value={kpiUnitCode}
                onChange={e => setKpiUnitCode(e.target.value)}
                className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
              />
              <button
                onClick={handleKpiExport}
                disabled={!kpiPeriodId || !kpiSummary || kpiSummary.length === 0}
                className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-sm hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-50 transition-colors"
                data-testid="kpi-report-export-btn"
              >
                <Download size={16} />
                Xuất Excel
              </button>
            </div>

            {kpiSummaryLoading ? (
              <div className="p-12 text-center">
                <div className="inline-block w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
                <table className="w-full">
                  <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                    <tr>
                      {['Họ tên', 'Mã', 'Đơn vị', 'Chuyên cần', 'Nhiệm vụ', 'Kỷ luật', 'Thái độ', 'Chỉ huy', 'Tổng', 'Xếp loại'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {!kpiSummary || kpiSummary.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-6 py-12 text-center text-[#94A3B8] text-sm">
                          {kpiPeriodId ? 'Không có dữ liệu KPI' : 'Nhập kỳ lương để xem báo cáo'}
                        </td>
                      </tr>
                    ) : (
                      kpiSummary.map((item) => (
                        <tr key={item.militiaId} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{item.name}</td>
                          <td className="px-4 py-3 text-sm font-mono text-[#64748B]">{item.code}</td>
                          <td className="px-4 py-3 text-sm text-[#64748B]">{item.unit}</td>
                          <td className="px-4 py-3 text-sm text-center">{item.attendanceScore ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-center">{item.taskScore ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-center">{item.disciplineScore ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-center">{item.attitudeScore ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-center">{item.supervisorScore != null ? item.supervisorScore.toFixed(1) : '—'}</td>
                          <td className="px-4 py-3 text-sm font-bold text-[#0F172A] text-center">{item.total ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${XEP_LOAI_STYLE[item.xepLoai] ?? ''}`}>
                              {item.xepLoai}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
