// US-SS-09: PayrollKpiFilter — filter by unit + militia for KPI/Payroll
import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SmartSelect } from '@/components/ui/SmartSelect'
import { Button } from '@/components/ui/Button'
import { militiaApi } from '@/api/militia'
import { unitsApi } from '@/api/users'
import type { SmartSelectOption, MilitiaSearchItem, UnitSearchItem } from '@/types'

function militiaToOption(m: MilitiaSearchItem): SmartSelectOption {
  return {
    id: m.id,
    label: `${m.militiaCode} — ${m.fullName}`,
    sublabel: [m.phone, m.unitName].filter(Boolean).join(' | '),
    meta: m as unknown as Record<string, unknown>,
  }
}

function unitToOption(u: UnitSearchItem): SmartSelectOption {
  return {
    id: u.id,
    label: u.name,
    sublabel: u.code,
    meta: u as unknown as Record<string, unknown>,
  }
}

export interface PayrollFilterValues {
  unitId?: string
  unitCode?: string
  militiaId?: string
  month?: number
  year?: number
}

interface PayrollKpiFilterProps {
  onFilter?: (values: PayrollFilterValues) => void
}

export function PayrollKpiFilter({ onFilter }: PayrollKpiFilterProps) {
  const [unitId, setUnitId] = useState('')
  const [unitQuery, setUnitQuery] = useState('')
  const [militiaId, setMilitiaId] = useState('')
  const [militiaQuery, setMilitiaQuery] = useState('')
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1)
  const [year, setYear] = useState<number>(new Date().getFullYear())

  const { data: unitOptions = [], isFetching: unitLoading } = useQuery({
    queryKey: ['units-search', unitQuery],
    queryFn: () => unitsApi.search({ q: unitQuery, limit: 20 }),
    select: (data) => data.map(unitToOption),
  })

  // US-SS-09: Filter militia by selected unit (unitCode from selected unit option)
  const selectedUnitCode = unitId
    ? (unitOptions.find((o) => o.id === unitId)?.meta as unknown as UnitSearchItem)?.code
    : undefined

  const { data: militiaOptions = [], isFetching: militiaLoading } = useQuery({
    queryKey: ['militia-search', militiaQuery, selectedUnitCode],
    queryFn: () =>
      militiaApi.search({ q: militiaQuery, unitCode: selectedUnitCode, limit: 20 }),
    select: (data) => data.map(militiaToOption),
  })

  const handleUnitChange = useCallback(
    (id: string) => {
      setUnitId(id)
      // Reset militia when unit changes
      setMilitiaId('')
    },
    [],
  )

  const handleUnitClear = useCallback(() => {
    setUnitId('')
    setMilitiaId('')
  }, [])

  const handleMilitiaChange = useCallback((id: string) => {
    setMilitiaId(id)
  }, [])

  const handleMilitiaClear = useCallback(() => {
    setMilitiaId('')
  }, [])

  const handleApply = () => {
    const unitOpt = unitOptions.find((o) => o.id === unitId)
    onFilter?.({
      unitId: unitId || undefined,
      unitCode: unitOpt ? (unitOpt.meta as unknown as UnitSearchItem).code : undefined,
      militiaId: militiaId || undefined,
      month,
      year,
    })
  }

  const handleReset = () => {
    setUnitId('')
    setMilitiaId('')
    setUnitQuery('')
    setMilitiaQuery('')
    setMonth(new Date().getMonth() + 1)
    setYear(new Date().getFullYear())
    onFilter?.({})
  }

  return (
    <div
      data-testid="payroll-kpi-filter"
      className="bg-white border border-slate-200 rounded-xl p-4 space-y-4"
    >
      <h3 className="text-sm font-semibold text-slate-700">Lọc KPI / Lương</h3>

      <div className="grid grid-cols-2 gap-3">
        {/* Month */}
        <div className="flex flex-col gap-1">
          <label htmlFor="payroll-month" className="text-sm font-medium text-slate-700">Tháng</label>
          <select
            id="payroll-month"
            data-testid="payroll-month-select"
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
        </div>

        {/* Year */}
        <div className="flex flex-col gap-1">
          <label htmlFor="payroll-year" className="text-sm font-medium text-slate-700">Năm</label>
          <select
            id="payroll-year"
            data-testid="payroll-year-select"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Unit SmartSelect */}
      <SmartSelect
        name="unit"
        label="Đơn vị / Khu phố"
        placeholder="Tất cả đơn vị..."
        value={unitId}
        onChange={(id) => handleUnitChange(id)}
        onClear={handleUnitClear}
        options={unitOptions}
        isLoading={unitLoading}
        onSearch={setUnitQuery}
      />

      {/* Militia SmartSelect — filtered by unit */}
      <SmartSelect
        name="militia"
        label="Cán bộ dân quân"
        placeholder={unitId ? 'Lọc theo dân quân...' : 'Chọn đơn vị trước...'}
        value={militiaId}
        onChange={(id) => handleMilitiaChange(id)}
        onClear={handleMilitiaClear}
        options={militiaOptions}
        isLoading={militiaLoading}
        onSearch={setMilitiaQuery}
      />

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={handleReset} className="flex-1">
          Xoá lọc
        </Button>
        <Button
          type="button"
          data-testid="payroll-filter-apply-btn"
          onClick={handleApply}
          className="flex-1"
        >
          Áp dụng
        </Button>
      </div>
    </div>
  )
}
