import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { DollarSign, Download, CheckCircle, Lock, Edit2, Shield, Heart, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { payrollApi } from '@/api/payroll'
import { PayrollKpiFilter } from '@/components/payroll/PayrollKpiFilter'
import client from '@/api/client'
import type { TranslationKey } from '@/i18n/types'
import type { PayrollPeriod, PayrollPeriodStatus, KpiScore } from '@/types'

interface ComplianceItem {
  militiaId: string
  militiaName: string
  baseSalary: number
  net: number
  minWage: number
  diff: number
  compliant: boolean
}

const STATUS_LABEL: Readonly<Partial<Record<string, TranslationKey>>> = {
  draft: 'payroll.period.status.draft',
  review: 'payroll.period.status.review',
  locked: 'payroll.period.status.locked',
} satisfies Record<PayrollPeriodStatus, TranslationKey>
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  review: 'bg-yellow-100 text-yellow-700',
  locked: 'bg-green-100 text-[#2E7D32]',
}

const KPI_COLUMNS = [
  'payroll.kpi.columns.name',
  'payroll.kpi.columns.attendanceDays',
  'payroll.kpi.columns.tasksCompleted',
  'payroll.kpi.columns.tasksTotal',
  'payroll.kpi.columns.score',
  'payroll.kpi.columns.adjustedScore',
  'payroll.kpi.columns.note',
  'payroll.kpi.columns.actions',
] as const satisfies readonly TranslationKey[]

const KPI_CSV_COLUMNS = [
  'payroll.kpi.columns.name',
  'payroll.kpi.columns.attendanceDays',
  'payroll.kpi.columns.tasksRatio',
  'payroll.kpi.columns.score',
  'payroll.kpi.columns.adjustedScore',
  'payroll.kpi.columns.note',
] as const satisfies readonly TranslationKey[]

const COMPLIANCE_COLUMNS = [
  'payroll.compliance.columns.name',
  'payroll.compliance.columns.baseSalary',
  'payroll.compliance.columns.net',
  'payroll.compliance.columns.minWage',
  'payroll.compliance.columns.diff',
  'payroll.compliance.columns.status',
] as const satisfies readonly TranslationKey[]

// Contribution rates of the insurance schemes (employee, employer)
const INSURANCE_ROWS = [
  { type: 'payroll.allowance.insuranceTypes.social', employee: '8%', employer: '17.5%' },
  { type: 'payroll.allowance.insuranceTypes.health', employee: '1.5%', employer: '3%' },
  { type: 'payroll.allowance.insuranceTypes.unemployment', employee: '1%', employer: '1%' },
] as const satisfies readonly { type: TranslationKey; employee: string; employer: string }[]

const scoreColor = (s: number | null) =>
  s === null ? 'text-[#94A3B8]' : s >= 90 ? 'text-[#2E7D32]' : s >= 70 ? 'text-yellow-600' : 'text-[#C62828]'

const pad2 = (n: number) => String(n).padStart(2, '0')

// lockedAt is an ISO timestamp; shown as local HH:mm dd/MM/yyyy
function formatLockedAt(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

interface AdjustModalState {
  militiaId: string
  militiaName: string
  currentScore: number | null
}

type MainTab = 'kpi' | 'allowance' | 'compliance'

export function PayrollPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [adjustModal, setAdjustModal] = useState<AdjustModalState | null>(null)
  const [adjustScore, setAdjustScore] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [activeTab, setActiveTab] = useState<MainTab>('kpi')

  const none = t('common.states.none')
  const formatPeriod = (p: PayrollPeriod) => t('payroll.period.option.label', { month: p.month, year: p.year })
  const formatVND = (n: number) =>
    t('payroll.format.money.vnd', { amount: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(n) })

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
      toast.success(t('payroll.period.lock.success'))
      queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
    },
    onError: () => toast.error(t('payroll.period.lock.error')),
  })

  const adjustMutation = useMutation({
    mutationFn: ({ militiaId, score, note }: { militiaId: string; score: number; note: string }) =>
      payrollApi.adjustKpi(militiaId, { adjustedScore: score, adjustmentNote: note }),
    onSuccess: () => {
      toast.success(t('payroll.kpi.adjust.success'))
      queryClient.invalidateQueries({ queryKey: ['payroll-kpi', selectedPeriodId] })
      setAdjustModal(null)
      setAdjustScore('')
      setAdjustNote('')
    },
    onError: () => toast.error(t('payroll.kpi.adjust.error')),
  })

  const { data: complianceData, isLoading: complianceLoading } = useQuery<ComplianceItem[]>({
    queryKey: ['payroll-compliance', selectedPeriodId],
    queryFn: () => client.get(`/payroll/compliance-check?periodId=${selectedPeriodId}`).then(r => r.data),
    enabled: !!selectedPeriodId && activeTab === 'compliance',
  })

  const handleComplianceExport = async () => {
    if (!selectedPeriodId) return
    try {
      const resp = await client.get(`/payroll/export?periodId=${selectedPeriodId}`, { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `BangLuong_${selectedPeriodId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t('payroll.compliance.export.error'))
    }
  }

  const selectedPeriod = periods?.find((p) => p.id === selectedPeriodId)
  const selectedStatusLabel = selectedPeriod ? STATUS_LABEL[selectedPeriod.status] : undefined

  // Members without a KPI evaluation (score null) do not pull the average down
  const scored = kpiScores.flatMap((k) => (k.score === null ? [] : [k.score]))
  const avgScore =
    scored.length > 0
      ? (scored.reduce((sum, s) => sum + s, 0) / scored.length).toFixed(1)
      : none

  const adjustedCount = kpiScores.filter((k) => k.adjustedScore != null).length

  const handleExport = () => {
    const rows = [
      KPI_CSV_COLUMNS.map((column) => t(column)),
      ...kpiScores.map((k) => [
        k.militiaName,
        String(k.attendanceDays),
        `${k.taskCompleted}/${k.taskTotal}`,
        String(k.score ?? ''),
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
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('payroll.page.header.title')}</h1>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <DollarSign size={40} className="text-[#E2E8F0] mx-auto mb-3" />
          <p className="text-[#64748B] text-sm">{t('payroll.page.periods.empty')}</p>
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
            <h1 className="text-2xl font-bold text-[#0F172A]">{t('payroll.page.header.title')}</h1>
            <p className="text-sm text-[#64748B]">{t('payroll.page.header.subtitle')}</p>
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
            {t('payroll.period.lock.button')}
          </button>
          <button
            onClick={handleExport}
            disabled={kpiScores.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-sm hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={16} />
            {t('payroll.kpi.export.button')}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-xl p-5 text-white shadow-md">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-2">
            <CheckCircle size={16} />
            {t('payroll.summary.cards.averageScore')}
          </div>
          <p className="text-3xl font-bold" data-testid="kpi-average">{avgScore}</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center gap-2 text-[#64748B] text-sm mb-2">
            <Edit2 size={16} />
            {t('payroll.summary.cards.adjusted')}
          </div>
          <p className="text-3xl font-bold text-[#0F172A]">{adjustedCount}</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center gap-2 text-[#64748B] text-sm mb-2">
            <DollarSign size={16} />
            {t('payroll.summary.cards.members')}
          </div>
          <p className="text-3xl font-bold text-[#0F172A]">{kpiScores.length}</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center gap-2 text-[#64748B] text-sm mb-2">
            <Lock size={16} />
            {t('payroll.summary.cards.status')}
          </div>
          {selectedPeriod ? (
            <>
              <span
                data-testid="period-status"
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  STATUS_COLOR[selectedPeriod.status] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {selectedStatusLabel ? t(selectedStatusLabel) : selectedPeriod.status}
              </span>
              {selectedPeriod.status === 'locked' && selectedPeriod.lockedAt && (
                <p data-testid="period-locked-at" className="mt-2 text-xs text-[#64748B]">
                  {t('payroll.period.lock.lockedAt', { time: formatLockedAt(selectedPeriod.lockedAt) })}
                </p>
              )}
            </>
          ) : (
            <span className="text-[#94A3B8] text-sm">{none}</span>
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
            {t('payroll.page.tabs.kpi')}
          </button>
          <button
            onClick={() => setActiveTab('allowance')}
            className={`px-6 py-3.5 text-sm font-medium transition-all relative ${
              activeTab === 'allowance'
                ? 'text-[#C62828] border-b-2 border-[#C62828] -mb-px'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
            }`}
          >
            {t('payroll.page.tabs.allowance')}
          </button>
          <button
            onClick={() => setActiveTab('compliance')}
            className={`px-6 py-3.5 text-sm font-medium transition-all relative ${
              activeTab === 'compliance'
                ? 'text-[#C62828] border-b-2 border-[#C62828] -mb-px'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
            }`}
          >
            {t('payroll.page.tabs.compliance')}
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
                      {KPI_COLUMNS.map((column) => (
                        <th key={column} className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t(column)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {kpiScores.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-[#94A3B8] text-sm">
                          {t('payroll.kpi.table.empty')}
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
                          <td data-testid={`kpi-score-${k.id}`} className={`px-6 py-4 text-sm font-bold ${scoreColor(k.score)}`}>
                            {k.score ?? none}
                          </td>
                          <td className={`px-6 py-4 text-sm font-bold ${k.adjustedScore != null ? scoreColor(k.adjustedScore) : 'text-[#94A3B8]'}`}>
                            {k.adjustedScore ?? none}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#64748B] max-w-xs truncate">
                            {k.adjustmentNote ?? none}
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
                              {t('payroll.kpi.adjust.button')}
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
          <div className="p-6 space-y-6" data-testid="allowance-tab">
            {/* Allowance section */}
            <div>
              <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide mb-4 flex items-center gap-2">
                <DollarSign size={16} />
                {t('payroll.allowance.monthly.title')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] p-5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#64748B]">{t('payroll.allowance.position.title')}</span>
                    <span className="text-xs bg-[#E8F5E9] text-[#2E7D32] px-2 py-0.5 rounded-full font-medium">{t('payroll.allowance.position.frequency')}</span>
                  </div>
                  <p className="text-2xl font-bold text-[#0F172A]">{formatVND(561600)}</p>
                  <p className="text-xs text-[#64748B] mt-1">{t('payroll.allowance.position.note')}</p>
                </div>
                <div className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] p-5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#64748B]">{t('payroll.allowance.training.title')}</span>
                    <span className="text-xs bg-[#FFF3E0] text-[#F57C00] px-2 py-0.5 rounded-full font-medium">{t('payroll.allowance.training.frequency')}</span>
                  </div>
                  <p className="text-2xl font-bold text-[#0F172A]">{formatVND(327600)}</p>
                  <p className="text-xs text-[#64748B] mt-1">{t('payroll.allowance.training.note')}</p>
                </div>
              </div>
            </div>

            {/* Insurance section */}
            <div>
              <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide mb-4 flex items-center gap-2">
                <Shield size={16} />
                {t('payroll.allowance.insurance.title')}
              </h3>
              <div className="bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] overflow-hidden">
                <table className="w-full">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium text-[#64748B] uppercase">{t('payroll.allowance.insuranceColumns.type')}</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-[#64748B] uppercase">{t('payroll.allowance.insuranceColumns.employeeRate')}</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-[#64748B] uppercase">{t('payroll.allowance.insuranceColumns.employerRate')}</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-[#64748B] uppercase">{t('payroll.allowance.insuranceColumns.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {INSURANCE_ROWS.map((row) => (
                      <tr key={row.type} className="hover:bg-white transition-colors">
                        <td className="px-5 py-4 text-sm font-medium text-[#0F172A]">{t(row.type)}</td>
                        <td className="px-5 py-4 text-sm text-center text-[#64748B]">{row.employee}</td>
                        <td className="px-5 py-4 text-sm text-center text-[#64748B]">{row.employer}</td>
                        <td className="px-5 py-4 text-right">
                          <span className="px-2.5 py-1 text-xs font-semibold bg-[#E8F5E9] text-[#2E7D32] rounded-full">{t('payroll.allowance.insurance.enrolled')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Health Insurance */}
            <div>
              <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide mb-4 flex items-center gap-2">
                <Heart size={16} />
                {t('payroll.allowance.health.title')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#E3F2FD] rounded-xl p-5 border border-blue-100">
                  <p className="text-sm text-[#64748B] mb-1">{t('payroll.allowance.health.coverageLabel')}</p>
                  <p className="text-xl font-bold text-[#1976D2]">80% – 100%</p>
                  <p className="text-xs text-[#64748B] mt-1">{t('payroll.allowance.health.coverageNote')}</p>
                </div>
                <div className="bg-[#E8F5E9] rounded-xl p-5 border border-green-100">
                  <p className="text-sm text-[#64748B] mb-1">{t('payroll.allowance.health.clinicLabel')}</p>
                  <p className="text-xl font-bold text-[#2E7D32]">{t('payroll.allowance.health.clinicValue')}</p>
                  <p className="text-xs text-[#64748B] mt-1">{t('payroll.allowance.health.clinicNote')}</p>
                </div>
                <div className="bg-[#FFF3E0] rounded-xl p-5 border border-orange-100">
                  <p className="text-sm text-[#64748B] mb-1">{t('payroll.allowance.health.cardLabel')}</p>
                  <p className="text-xl font-bold text-[#F57C00]">31/12/2025</p>
                  <p className="text-xs text-[#64748B] mt-1">{t('payroll.allowance.health.cardNote')}</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-[#94A3B8] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-4 py-3">
              {t('payroll.allowance.notice.disclaimer')}
            </p>
          </div>
        )}

        {/* Tuân thủ lương Tab */}
        {activeTab === 'compliance' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                {complianceData && (
                  <p className="text-sm text-[#64748B]" data-testid="compliance-summary">
                    <Trans
                      i18nKey="payroll.compliance.summary.compliantCount"
                      values={{ compliant: complianceData.filter(r => r.compliant).length, total: complianceData.length }}
                      components={{ compliant: <span className="font-semibold text-[#2E7D32]" /> }}
                    />
                  </p>
                )}
              </div>
              <button
                onClick={handleComplianceExport}
                disabled={!selectedPeriodId}
                className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-sm hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-50 transition-colors"
                data-testid="compliance-export-btn"
              >
                <Download size={16} />
                {t('common.actions.export')}
              </button>
            </div>

            {complianceLoading ? (
              <div className="p-12 text-center">
                <div className="inline-block w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
                <table className="w-full">
                  <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                    <tr>
                      {COMPLIANCE_COLUMNS.map(column => (
                        <th key={column} className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t(column)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {!complianceData || complianceData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-[#94A3B8] text-sm">
                          {t('payroll.compliance.table.empty')}
                        </td>
                      </tr>
                    ) : (
                      complianceData.map((item) => (
                        <tr
                          key={item.militiaId}
                          className={`transition-colors ${item.compliant ? 'hover:bg-[#F8FAFC]' : 'bg-red-50 hover:bg-red-100'}`}
                          data-testid={`compliance-row-${item.militiaId}`}
                        >
                          <td className="px-6 py-4 text-sm font-semibold text-[#0F172A]">{item.militiaName}</td>
                          <td className="px-6 py-4 text-sm text-[#0F172A]">{formatVND(item.baseSalary)}</td>
                          <td className="px-6 py-4 text-sm font-bold text-[#0F172A]">{formatVND(item.net)}</td>
                          <td className="px-6 py-4 text-sm text-[#64748B]">{formatVND(item.minWage)}</td>
                          <td className={`px-6 py-4 text-sm font-bold ${item.diff >= 0 ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
                            {item.diff >= 0 ? '+' : ''}{formatVND(item.diff)}
                          </td>
                          <td className="px-6 py-4">
                            {item.compliant ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-[#2E7D32] text-xs font-semibold rounded-full">
                                <CheckCircle size={12} /> {t('payroll.compliance.status.compliant')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-[#C62828] text-xs font-semibold rounded-full">
                                <AlertCircle size={12} /> {t('payroll.compliance.status.violation')}
                              </span>
                            )}
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

      {/* KPI Adjustment Modal */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 border border-[#E2E8F0]" data-testid="kpi-adjust-modal">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
                <Edit2 size={18} className="text-[#C62828]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">{t('payroll.kpi.adjust.title')}</h3>
                <p className="text-sm text-[#64748B]">{adjustModal.militiaName}</p>
              </div>
            </div>
            <div className="bg-[#F8FAFC] rounded-lg px-4 py-3 mb-5 border border-[#E2E8F0]">
              <p className="text-sm text-[#64748B]" data-testid="adjust-current-score">
                {t('payroll.kpi.adjust.currentScore')}{' '}
                <span className={`font-bold ${adjustModal.currentScore != null ? scoreColor(adjustModal.currentScore) : ''}`}>
                  {adjustModal.currentScore ?? none}
                </span>
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#C62828] mb-1.5">{t('payroll.kpi.adjust.scoreLabel')}</label>
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
                <label className="block text-sm font-bold text-[#C62828] mb-1.5">{t('payroll.kpi.adjust.noteLabel')}</label>
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
                {t(adjustMutation.isPending ? 'common.actions.saving' : 'payroll.kpi.adjust.save')}
              </button>
              <button
                onClick={() => { setAdjustModal(null); setAdjustScore(''); setAdjustNote('') }}
                data-testid="cancel-adjust-btn"
                className="flex-1 px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-sm font-medium hover:border-[#C62828] hover:text-[#C62828] transition-colors"
              >
                {t('common.actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
