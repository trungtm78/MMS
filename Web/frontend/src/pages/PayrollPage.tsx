import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarSign, Download, CheckCircle, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { payrollApi } from '@/api/payroll'
import type { PayrollPeriod, KpiScore } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp',
  review: 'Đang xét duyệt',
  locked: 'Đã khóa',
}
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  review: 'bg-yellow-100 text-yellow-700',
  locked: 'bg-green-100 text-green-700',
}

const scoreColor = (s: number) =>
  s >= 90 ? 'text-green-600' : s >= 70 ? 'text-yellow-600' : 'text-red-600'

const formatPeriod = (p: PayrollPeriod) => `Tháng ${p.month}/${p.year}`

export function PayrollPage() {
  const queryClient = useQueryClient()
  const [selectedPeriodId, setSelectedPeriodId] = useState('')

  const { data: periods, isLoading: periodsLoading } = useQuery({
    queryKey: ['payroll-periods'],
    queryFn: payrollApi.listPeriods,
  })

  useEffect(() => {
    if (periods?.[0]) setSelectedPeriodId(periods[0].id)
  }, [periods])

  const { data: kpiData, isLoading: kpiLoading } = useQuery({
    queryKey: ['payroll-kpi', selectedPeriodId],
    queryFn: () => payrollApi.listKpi({ periodId: selectedPeriodId, limit: 100 }),
    enabled: !!selectedPeriodId,
  })

  const kpiScores: KpiScore[] = kpiData?.data ?? []

  const lockMutation = useMutation({
    mutationFn: () => payrollApi.lockPeriod(selectedPeriodId),
    onSuccess: () => {
      toast.success('Đã khóa kỳ lương')
      queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
    },
    onError: () => toast.error('Không thể khóa kỳ lương'),
  })

  const selectedPeriod = periods?.find((p) => p.id === selectedPeriodId)

  const avgScore =
    kpiScores.length > 0
      ? (kpiScores.reduce((sum, k) => sum + k.score, 0) / kpiScores.length).toFixed(1)
      : '—'

  const adjustedCount = kpiScores.filter((k) => k.adjustedScore != null).length

  const handleExport = () => {
    const rows = [
      ['Họ tên', 'Ngày công', 'HT/Tổng NV', 'Điểm KPI', 'Điểm hiệu chỉnh', 'Ghi chú'],
      ...kpiScores.map((k) => [
        k.militiaName,
        String(k.attendanceDays),
        `${k.taskCompleted}/${k.taskTotal}`,
        String(k.score),
        String(k.adjustedScore ?? ''),
        k.adjustmentNote ?? '',
      ]),
    ]
    const csv = '\uFEFF' + rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-kpi-${selectedPeriodId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isLoading = periodsLoading || kpiLoading

  if (!periodsLoading && (!periods || periods.length === 0)) {
    return (
      <div className="p-6" data-testid="payroll-page">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign size={24} className="text-[#1F3A5F]" />
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Bảng Lương & KPI</h1>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
          <p className="text-gray-400 text-sm">Không có dữ liệu kỳ lương</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6" data-testid="payroll-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <DollarSign size={24} className="text-[#1F3A5F]" />
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Bảng Lương & KPI</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            data-testid="period-select"
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
          >
            {(periods ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {formatPeriod(p)}
              </option>
            ))}
          </select>
          <button
            onClick={() => lockMutation.mutate()}
            disabled={selectedPeriod?.status === 'locked' || lockMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#1F3A5F] text-white rounded-lg text-sm hover:bg-[#162d4a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Lock size={16} />
            Khóa kỳ lương
          </button>
          <button
            onClick={handleExport}
            disabled={kpiScores.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={16} />
            Xuất CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Avg score */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
            <CheckCircle size={16} />
            Điểm TB
          </div>
          <p className="text-2xl font-bold text-[#1F3A5F]">{avgScore}</p>
        </div>

        {/* Adjusted count */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
            <CheckCircle size={16} />
            Đã hiệu chỉnh
          </div>
          <p className="text-2xl font-bold text-[#1F3A5F]">{adjustedCount}</p>
        </div>

        {/* Total members */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
            <DollarSign size={16} />
            Tổng thành viên
          </div>
          <p className="text-2xl font-bold text-[#1F3A5F]">{kpiScores.length}</p>
        </div>

        {/* Status */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
            <Lock size={16} />
            Trạng thái
          </div>
          {selectedPeriod ? (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                STATUS_COLOR[selectedPeriod.status] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {STATUS_LABEL[selectedPeriod.status] ?? selectedPeriod.status}
            </span>
          ) : (
            <span className="text-gray-400 text-sm">—</span>
          )}
        </div>
      </div>

      {/* KPI Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500 text-sm">Đang tải...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Họ tên
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Ngày công
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Nhiệm vụ hoàn thành
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Tổng nhiệm vụ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Điểm KPI
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Điểm hiệu chỉnh
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Ghi chú
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {kpiScores.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center text-gray-400 text-sm"
                    >
                      Không có dữ liệu KPI cho kỳ này
                    </td>
                  </tr>
                ) : (
                  kpiScores.map((k) => (
                    <tr key={k.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {k.militiaName}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {k.attendanceDays}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {k.taskCompleted}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {k.taskTotal}
                      </td>
                      <td className={`px-6 py-4 text-sm font-semibold ${scoreColor(k.score)}`}>
                        {k.score}
                      </td>
                      <td className={`px-6 py-4 text-sm font-semibold ${k.adjustedScore != null ? scoreColor(k.adjustedScore) : 'text-gray-400'}`}>
                        {k.adjustedScore ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                        {k.adjustmentNote ?? '—'}
                      </td>
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
