import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Clock, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import client from '@/api/client'
import { downloadExcelReport } from '@/utils/export-utils'

interface ComplianceStat {
  label: string
  value: number
  total: number
  unit?: string
  criticalThreshold: number // red if value/total*100 <= threshold
  higherIsBetter: boolean   // true: red when below threshold; false: red when above
}

interface ComplianceDashboardData {
  unitCode: string
  lastUpdated: string
  stats: {
    activePersonnel: { value: number; total: number; criticalThreshold: number }
    trainingCompliance: { value: number; total: number; criticalThreshold: number }
    attendanceThisMonth: { value: number; total: number; criticalThreshold: number }
    avgKpiScore: { value: number; total: number; criticalThreshold: number }
    exemptionsExpiringSoon: { value: number; total: number; criticalThreshold: number }
  }
}

async function fetchComplianceDashboard(unitCode: string): Promise<ComplianceDashboardData> {
  const res = await client.get('/dashboard/compliance', { params: { unitCode: unitCode || undefined } })
  return res.data
}

async function exportComplianceDashboard(unitCode: string): Promise<Blob> {
  const res = await client.get('/dashboard/compliance/export', {
    params: { format: 'xlsx', unitCode: unitCode || undefined },
    responseType: 'blob',
  })
  return res.data
}

function safePercent(value: number, total: number): string {
  if (!total || isNaN(value / total)) return '—'
  return `${Math.round((value / total) * 100)}%`
}

function safePercentNum(value: number, total: number): number | null {
  if (!total || isNaN(value / total)) return null
  return Math.round((value / total) * 100)
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse">
      <div className="h-4 bg-[#E2E8F0] rounded w-2/3 mb-3" />
      <div className="h-8 bg-[#E2E8F0] rounded w-1/2 mb-3" />
      <div className="h-2 bg-[#E2E8F0] rounded-full w-full mb-1.5" />
      <div className="h-3 bg-[#E2E8F0] rounded w-1/3" />
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  total: number
  criticalThreshold: number
  higherIsBetter: boolean
  suffix?: string
}

function StatCard({ label, value, total, criticalThreshold, higherIsBetter, suffix }: StatCardProps) {
  const pct = safePercentNum(value, total)
  const displayPct = safePercent(value, total)
  const isCritical = pct !== null
    ? (higherIsBetter ? pct <= criticalThreshold : pct >= criticalThreshold)
    : false
  const color = isCritical ? '#C62828' : '#2E7D32'

  return (
    <div className={`bg-white rounded-xl border p-5 ${isCritical ? 'border-red-300' : 'border-[#E2E8F0]'}`}>
      <p className="text-sm text-[#64748B] mb-2">{label}</p>
      <div className="flex items-end gap-1.5 mb-3">
        <span className="text-3xl font-bold" style={{ color }}>{displayPct}</span>
        {suffix && <span className="text-sm text-[#64748B] pb-0.5">{suffix}</span>}
      </div>
      <div className="w-full h-2 bg-[#E2E8F0] rounded-full overflow-hidden mb-1.5">
        <div
          className="h-2 rounded-full transition-all"
          style={{
            width: pct !== null ? `${Math.min(100, pct)}%` : '0%',
            backgroundColor: color,
          }}
        />
      </div>
      <p className="text-xs text-[#64748B]">
        {value.toLocaleString('vi-VN')} / {total.toLocaleString('vi-VN')}
      </p>
      {isCritical && (
        <div className="flex items-center gap-1 mt-1.5">
          <AlertCircle size={12} className="text-[#C62828]" />
          <span className="text-xs text-[#C62828] font-medium">Cần chú ý</span>
        </div>
      )}
    </div>
  )
}

export function ComplianceDashboardPage() {
  const [unitCode, setUnitCode] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['compliance-dashboard', unitCode],
    queryFn: () => fetchComplianceDashboard(unitCode),
    staleTime: 2 * 60_000,
  })

  async function handleExport() {
    await downloadExcelReport(
      () => exportComplianceDashboard(unitCode),
      `tong-quan-tuan-thu-${new Date().toISOString().slice(0, 10)}.xlsx`,
      () => setIsExporting(true),
      () => setIsExporting(false),
    )
  }

  const lastUpdatedDisplay = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="compliance-dashboard-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Bảng Tuân Thủ Pháp Định</h1>
          <p className="text-sm text-[#64748B] mt-1 flex items-center gap-1.5">
            Tổng quan tình trạng tuân thủ toàn đơn vị
            {lastUpdatedDisplay && (
              <>
                <span className="text-[#E2E8F0]">·</span>
                <Clock size={12} className="text-[#64748B]" />
                Cập nhật lúc: {lastUpdatedDisplay}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={unitCode}
            onChange={e => setUnitCode(e.target.value)}
            className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
          >
            <option value="">Toàn đơn vị</option>
            <option value="KP1">Khu phố 1</option>
            <option value="KP2">Khu phố 2</option>
            <option value="KP3">Khu phố 3</option>
            <option value="KP4">Khu phố 4</option>
            <option value="KP5">Khu phố 5</option>
            <option value="KP6">Khu phố 6</option>
          </select>
          <button
            onClick={handleExport}
            disabled={isExporting || isLoading}
            data-testid="export-btn"
            className="bg-[#1F3A5F] text-white hover:bg-[#162d4a] rounded-lg px-4 py-2 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            {isExporting ? 'Đang xuất...' : 'Xuất tổng quan'}
          </button>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          Không thể tải dữ liệu tuân thủ.
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : data ? (
          <>
            <StatCard
              label="Quân số hoạt động"
              value={data.stats.activePersonnel.value}
              total={data.stats.activePersonnel.total}
              criticalThreshold={data.stats.activePersonnel.criticalThreshold}
              higherIsBetter={true}
            />
            <StatCard
              label="Tuân thủ huấn luyện"
              value={data.stats.trainingCompliance.value}
              total={data.stats.trainingCompliance.total}
              criticalThreshold={data.stats.trainingCompliance.criticalThreshold}
              higherIsBetter={true}
            />
            <StatCard
              label="Có mặt tháng này"
              value={data.stats.attendanceThisMonth.value}
              total={data.stats.attendanceThisMonth.total}
              criticalThreshold={data.stats.attendanceThisMonth.criticalThreshold}
              higherIsBetter={true}
            />
            <StatCard
              label="Điểm KPI TB"
              value={data.stats.avgKpiScore.value}
              total={data.stats.avgKpiScore.total}
              criticalThreshold={data.stats.avgKpiScore.criticalThreshold}
              higherIsBetter={true}
              suffix="điểm"
            />
            <StatCard
              label="Miễn giảm sắp hết hạn"
              value={data.stats.exemptionsExpiringSoon.value}
              total={data.stats.exemptionsExpiringSoon.total}
              criticalThreshold={data.stats.exemptionsExpiringSoon.criticalThreshold}
              higherIsBetter={false}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
