import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarSign, Download, CheckCircle, Lock, Edit2, Shield, Heart } from 'lucide-react'
import { toast } from 'sonner'
import { payrollApi } from '@/api/payroll'
import { PayrollKpiFilter } from '@/components/payroll/PayrollKpiFilter'
import type { PayrollPeriod, KpiScore } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp',
  review: 'Đang xét duyệt',
  locked: 'Đã khóa',
}
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  review: 'bg-yellow-100 text-yellow-700',
  locked: 'bg-green-100 text-[#2E7D32]',
}

const scoreColor = (s: number) =>
  s >= 90 ? 'text-[#2E7D32]' : s >= 70 ? 'text-yellow-600' : 'text-[#C62828]'

const formatPeriod = (p: PayrollPeriod) => `Tháng ${p.month}/${p.year}`

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(n) + 'đ'

interface AdjustModalState {
  militiaId: string
  militiaName: string
  currentScore: number | null
}

type MainTab = 'kpi' | 'allowance'

export function PayrollPage() {
  const queryClient = useQueryClient()
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [adjustModal, setAdjustModal] = useState<AdjustModalState | null>(null)
  const [adjustScore, setAdjustScore] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [activeTab, setActiveTab] = useState<MainTab>('kpi')

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

  const adjustMutation = useMutation({
    mutationFn: ({ militiaId, score, note }: { militiaId: string; score: number; note: string }) =>
      payrollApi.adjustKpi(militiaId, { adjustedScore: score, adjustmentNote: note }),
    onSuccess: () => {
      toast.success('Đã lưu điều chỉnh KPI')
      queryClient.invalidateQueries({ queryKey: ['payroll-kpi', selectedPeriodId] })
      setAdjustModal(null)
      setAdjustScore('')
      setAdjustNote('')
    },
    onError: () => toast.error('Không thể lưu điều chỉnh'),
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
    const csv = '﻿' + rows.map((r) => r.join(',')).join('\n')
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
          <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
            <DollarSign size={20} className="text-[#C62828]" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Bảng Lương & KPI</h1>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <DollarSign size={40} className="text-[#E2E8F0] mx-auto mb-3" />
          <p className="text-[#64748B] text-sm">Không có dữ liệu kỳ lương</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="payroll-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
            <DollarSign size={20} className="text-[#C62828]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Bảng Lương & KPI</h1>
            <p className="text-sm text-[#64748B]">Quản lý lương và phụ cấp DQTV</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            data-testid="period-select"
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
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
            className="flex items-center gap-2 px-4 py-2 bg-[#C62828] text-white rounded-lg text-sm hover:bg-[#A91D1D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            <Lock size={16} />
            Khóa kỳ lương
          </button>
          <button
            onClick={handleExport}
            disabled={kpiScores.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-sm hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={16} />
            Xuất CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-xl p-5 text-white shadow-md">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-2">
            <CheckCircle size={16} />
            Điểm KPI TB
          </div>
          <p className="text-3xl font-bold">{avgScore}</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center gap-2 text-[#64748B] text-sm mb-2">
            <Edit2 size={16} />
            Đã hiệu chỉnh
          </div>
          <p className="text-3xl font-bold text-[#0F172A]">{adjustedCount}</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center gap-2 text-[#64748B] text-sm mb-2">
            <DollarSign size={16} />
            Tổng thành viên
          </div>
          <p className="text-3xl font-bold text-[#0F172A]">{kpiScores.length}</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center gap-2 text-[#64748B] text-sm mb-2">
            <Lock size={16} />
            Trạng thái
          </div>
          {selectedPeriod ? (
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                STATUS_COLOR[selectedPeriod.status] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {STATUS_LABEL[selectedPeriod.status] ?? selectedPeriod.status}
            </span>
          ) : (
            <span className="text-[#94A3B8] text-sm">—</span>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="flex border-b border-[#E2E8F0]">
          <button
            onClick={() => setActiveTab('kpi')}
            className={`px-6 py-3.5 text-sm font-medium transition-all relative ${
              activeTab === 'kpi'
                ? 'text-[#C62828] border-b-2 border-[#C62828] -mb-px'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
            }`}
          >
            Bảng Lương & KPI
          </button>
          <button
            onClick={() => setActiveTab('allowance')}
            className={`px-6 py-3.5 text-sm font-medium transition-all relative ${
              activeTab === 'allowance'
                ? 'text-[#C62828] border-b-2 border-[#C62828] -mb-px'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
            }`}
          >
            Phụ cấp &amp; Bảo hiểm
          </button>
        </div>

        {/* KPI Tab */}
        {activeTab === 'kpi' && (
          <>
            <div className="p-4">
              <PayrollKpiFilter />
            </div>
            {isLoading ? (
              <div className="p-12 text-center">
                <div className="inline-block w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Họ tên</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Ngày công</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">NV hoàn thành</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Tổng NV</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Điểm KPI</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Điểm hiệu chỉnh</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Ghi chú</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {kpiScores.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-[#94A3B8] text-sm">
                          Không có dữ liệu KPI cho kỳ này
                        </td>
                      </tr>
                    ) : (
                      kpiScores.map((k) => (
                        <tr key={k.id} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="px-6 py-4 text-sm font-semibold text-[#0F172A]">
                            {k.militiaName}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#0F172A]">
                            {k.attendanceDays}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#0F172A]">
                            {k.taskCompleted}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#0F172A]">
                            {k.taskTotal}
                          </td>
                          <td className={`px-6 py-4 text-sm font-bold ${scoreColor(k.score)}`}>
                            {k.score}
                          </td>
                          <td className={`px-6 py-4 text-sm font-bold ${k.adjustedScore != null ? scoreColor(k.adjustedScore) : 'text-[#94A3B8]'}`}>
                            {k.adjustedScore ?? '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#64748B] max-w-xs truncate">
                            {k.adjustmentNote ?? '—'}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              data-testid={`adjust-kpi-btn-${k.id}`}
                              onClick={() => {
                                setAdjustModal({ militiaId: k.militiaId, militiaName: k.militiaName, currentScore: k.score })
                                setAdjustScore(String(k.adjustedScore ?? k.score ?? ''))
                                setAdjustNote(k.adjustmentNote ?? '')
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#C62828] hover:bg-[#FFEBEE] rounded-lg border border-red-200 transition-colors"
                            >
                              <Edit2 size={12} />
                              Điều chỉnh
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Phụ cấp & Bảo hiểm Tab */}
        {activeTab === 'allowance' && (
          <div className="p-6 space-y-6">
            {/* Allowance section */}
            <div>
              <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide mb-4 flex items-center gap-2">
                <DollarSign size={16} />
                Phụ cấp hàng tháng
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] p-5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#64748B]">Phụ cấp chức vụ</span>
                    <span className="text-xs bg-[#E8F5E9] text-[#2E7D32] px-2 py-0.5 rounded-full font-medium">Hàng tháng</span>
                  </div>
                  <p className="text-2xl font-bold text-[#0F172A]">{formatVND(561600)}</p>
                  <p className="text-xs text-[#64748B] mt-1">Theo quy định UBND Phường</p>
                </div>
                <div className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] p-5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#64748B]">Trợ cấp huấn luyện</span>
                    <span className="text-xs bg-[#FFF3E0] text-[#F57C00] px-2 py-0.5 rounded-full font-medium">Theo ngày</span>
                  </div>
                  <p className="text-2xl font-bold text-[#0F172A]">{formatVND(327600)}</p>
                  <p className="text-xs text-[#64748B] mt-1">Áp dụng cho các ngày huấn luyện</p>
                </div>
              </div>
            </div>

            {/* Insurance section */}
            <div>
              <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide mb-4 flex items-center gap-2">
                <Shield size={16} />
                Bảo hiểm xã hội (BHXH)
              </h3>
              <div className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] overflow-hidden">
                <table className="w-full">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium text-[#64748B] uppercase">Loại bảo hiểm</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-[#64748B] uppercase">Tỷ lệ NLĐ</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-[#64748B] uppercase">Tỷ lệ NSDLĐ</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-[#64748B] uppercase">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    <tr className="hover:bg-white transition-colors">
                      <td className="px-5 py-4 text-sm font-medium text-[#0F172A]">Bảo hiểm xã hội (BHXH)</td>
                      <td className="px-5 py-4 text-sm text-center text-[#64748B]">8%</td>
                      <td className="px-5 py-4 text-sm text-center text-[#64748B]">17.5%</td>
                      <td className="px-5 py-4 text-right">
                        <span className="px-2.5 py-1 text-xs font-semibold bg-[#E8F5E9] text-[#2E7D32] rounded-full">Đang tham gia</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-white transition-colors">
                      <td className="px-5 py-4 text-sm font-medium text-[#0F172A]">Bảo hiểm y tế (BHYT)</td>
                      <td className="px-5 py-4 text-sm text-center text-[#64748B]">1.5%</td>
                      <td className="px-5 py-4 text-sm text-center text-[#64748B]">3%</td>
                      <td className="px-5 py-4 text-right">
                        <span className="px-2.5 py-1 text-xs font-semibold bg-[#E8F5E9] text-[#2E7D32] rounded-full">Đang tham gia</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-white transition-colors">
                      <td className="px-5 py-4 text-sm font-medium text-[#0F172A]">Bảo hiểm thất nghiệp (BHTN)</td>
                      <td className="px-5 py-4 text-sm text-center text-[#64748B]">1%</td>
                      <td className="px-5 py-4 text-sm text-center text-[#64748B]">1%</td>
                      <td className="px-5 py-4 text-right">
                        <span className="px-2.5 py-1 text-xs font-semibold bg-[#E8F5E9] text-[#2E7D32] rounded-full">Đang tham gia</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Health Insurance */}
            <div>
              <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide mb-4 flex items-center gap-2">
                <Heart size={16} />
                Bảo hiểm y tế (BHYT)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#E3F2FD] rounded-xl p-5 border border-blue-100">
                  <p className="text-sm text-[#64748B] mb-1">Mức hưởng BHYT</p>
                  <p className="text-xl font-bold text-[#1976D2]">80% – 100%</p>
                  <p className="text-xs text-[#64748B] mt-1">Chi phí khám chữa bệnh</p>
                </div>
                <div className="bg-[#E8F5E9] rounded-xl p-5 border border-green-100">
                  <p className="text-sm text-[#64748B] mb-1">Cơ sở KCB ban đầu</p>
                  <p className="text-xl font-bold text-[#2E7D32]">TYT Phường</p>
                  <p className="text-xs text-[#64748B] mt-1">Trạm y tế phường Phú Định</p>
                </div>
                <div className="bg-[#FFF3E0] rounded-xl p-5 border border-orange-100">
                  <p className="text-sm text-[#64748B] mb-1">Gia hạn thẻ</p>
                  <p className="text-xl font-bold text-[#F57C00]">31/12/2025</p>
                  <p className="text-xs text-[#64748B] mt-1">Ngày hết hạn thẻ BHYT</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-[#94A3B8] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-4 py-3">
              Thông tin phụ cấp và bảo hiểm mang tính chất tham khảo. Kết nối API đang được triển khai.
            </p>
          </div>
        )}
      </div>

      {/* KPI Adjustment Modal */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 border border-[#E2E8F0]" data-testid="kpi-adjust-modal">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
                <Edit2 size={18} className="text-[#C62828]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Điều chỉnh KPI</h3>
                <p className="text-sm text-[#64748B]">{adjustModal.militiaName}</p>
              </div>
            </div>
            <div className="bg-[#F8FAFC] rounded-lg px-4 py-3 mb-5 border border-[#E2E8F0]">
              <p className="text-sm text-[#64748B]">
                Điểm KPI hiện tại:{' '}
                <span className={`font-bold ${adjustModal.currentScore != null ? scoreColor(adjustModal.currentScore) : ''}`}>
                  {adjustModal.currentScore ?? '—'}
                </span>
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#C62828] mb-1.5">Điểm điều chỉnh (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={adjustScore}
                  onChange={(e) => setAdjustScore(e.target.value)}
                  data-testid="adjust-score-input"
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#C62828] mb-1.5">Lý do điều chỉnh</label>
                <textarea
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  data-testid="adjust-note-input"
                  rows={3}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  adjustMutation.mutate({
                    militiaId: adjustModal.militiaId,
                    score: Number(adjustScore),
                    note: adjustNote,
                  })
                }}
                disabled={!adjustScore || !adjustNote || adjustMutation.isPending}
                data-testid="save-adjust-btn"
                className="flex-1 px-4 py-2 bg-[#C62828] text-white rounded-lg text-sm font-medium hover:bg-[#A91D1D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {adjustMutation.isPending ? 'Đang lưu...' : 'Lưu điều chỉnh'}
              </button>
              <button
                onClick={() => { setAdjustModal(null); setAdjustScore(''); setAdjustNote('') }}
                data-testid="cancel-adjust-btn"
                className="flex-1 px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-sm font-medium hover:border-[#C62828] hover:text-[#C62828] transition-colors"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
