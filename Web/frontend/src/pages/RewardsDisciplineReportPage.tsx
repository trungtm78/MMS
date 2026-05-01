import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Award, Download, Filter } from 'lucide-react'
import { toast } from 'sonner'
import client from '@/api/client'

interface RewardItem {
  id: string
  fullName: string
  militiaCode: string
  unitName: string
  rewardType: string
  description: string
  content: string
  decisionNo: string
  decisionDate: string | null
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function firstDayOfYearStr() {
  return `${new Date().getFullYear()}-01-01`
}

export function RewardsDisciplineReportPage() {
  const [activeTab, setActiveTab] = useState<'reward' | 'discipline'>('reward')
  const [from, setFrom] = useState(firstDayOfYearStr())
  const [to, setTo] = useState(todayStr())
  const [typeFilter, setTypeFilter] = useState<'all' | 'reward' | 'discipline'>('all')
  const [unitCode, setUnitCode] = useState('')
  const [exporting, setExporting] = useState(false)

  const params = {
    from: from || undefined,
    to: to || undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    unitCode: unitCode || undefined,
  }

  const { data = [], isLoading, isError } = useQuery<RewardItem[]>({
    queryKey: ['rewards-report', params],
    queryFn: () =>
      client.get('/militia/rewards-report', { params }).then(r => r.data),
    staleTime: 30_000,
  })

  const rewards = data.filter(r => r.rewardType === 'reward')
  const discipline = data.filter(r => r.rewardType !== 'reward')
  const activeItems = activeTab === 'reward' ? rewards : discipline

  const handleExport = async () => {
    if (data.length === 0) return toast.error('Không có dữ liệu để xuất')
    setExporting(true)
    try {
      const resp = await client.get('/militia/rewards-export', {
        params,
        responseType: 'blob',
      })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `KhenThuong_KyLuat_${from ?? 'all'}_${to ?? 'all'}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Không thể xuất báo cáo')
    } finally {
      setExporting(false)
    }
  }

  // summary stats per month
  const monthStats = (() => {
    const map = new Map<string, { reward: number; discipline: number }>()
    data.forEach(item => {
      if (!item.decisionDate) return
      const key = item.decisionDate.slice(0, 7) // YYYY-MM
      if (!map.has(key)) map.set(key, { reward: 0, discipline: 0 })
      const s = map.get(key)!
      if (item.rewardType === 'reward') { s.reward++ } else { s.discipline++ }
    })
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  })()

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="rewards-discipline-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
          <Award size={20} className="text-[#C62828]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Khen thưởng & Kỷ luật</h1>
          <p className="text-sm text-[#64748B]">Báo cáo theo TT 57/2020/TT-BQP</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
          <Filter size={16} className="text-[#64748B]" />
          Bộ lọc
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#C62828] mb-1">Từ ngày</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#C62828] mb-1">Đến ngày</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#C62828] mb-1">Loại</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as 'all' | 'reward' | 'discipline')}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
            >
              <option value="all">Tất cả</option>
              <option value="reward">Khen thưởng</option>
              <option value="discipline">Kỷ luật</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#C62828] mb-1">Mã đơn vị</label>
            <input
              type="text"
              placeholder="VD: DV01"
              value={unitCode}
              onChange={e => setUnitCode(e.target.value)}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
            />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {monthStats.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-sm font-semibold text-[#0F172A] mb-3">Thống kê theo tháng</p>
          <div className="flex flex-wrap gap-3">
            {monthStats.map(([month, stats]) => (
              <div key={month} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs">
                <p className="font-semibold text-[#64748B]">{month}</p>
                <p className="text-[#2E7D32]">KT: {stats.reward}</p>
                <p className="text-[#C62828]">KL: {stats.discipline}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab bar + table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="flex border-b border-[#E2E8F0] items-center justify-between pr-4">
          <div className="flex">
            {(['reward', 'discipline'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3.5 text-sm font-medium transition-all relative ${
                  activeTab === tab
                    ? 'text-[#C62828] border-b-2 border-[#C62828] -mb-px'
                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                }`}
              >
                {tab === 'reward' ? `Khen thưởng (${rewards.length})` : `Kỷ luật (${discipline.length})`}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || data.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-sm hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-50 transition-colors"
            data-testid="rewards-export-btn"
          >
            <Download size={16} />
            {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
        </div>

        {isError && (
          <div className="p-4 text-sm text-[#C62828] bg-red-50">Không thể tải dữ liệu.</div>
        )}

        {isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                <tr>
                  {['STT', 'Họ tên', 'Mã DQTV', 'Đơn vị', 'Hình thức', 'Nội dung', 'Số QĐ', 'Ngày QĐ'].map(h => (
                    <th key={h} className="px-5 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {activeItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-[#94A3B8] text-sm">
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : (
                  activeItems.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-5 py-4 text-sm text-[#64748B]">{idx + 1}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-[#0F172A]">{item.fullName}</td>
                      <td className="px-5 py-4 text-sm font-mono text-[#64748B]">{item.militiaCode}</td>
                      <td className="px-5 py-4 text-sm text-[#64748B]">{item.unitName}</td>
                      <td className="px-5 py-4 text-sm text-[#0F172A]">{item.rewardType}</td>
                      <td className="px-5 py-4 text-sm text-[#64748B] max-w-xs truncate">{item.content || item.description || '—'}</td>
                      <td className="px-5 py-4 text-sm text-[#0F172A]">{item.decisionNo || '—'}</td>
                      <td className="px-5 py-4 text-sm text-[#64748B]">{formatDate(item.decisionDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
