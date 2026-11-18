import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Clock, XCircle } from 'lucide-react'
import {
  attendanceApi,
  type TimesheetDay,
  type TimesheetDayStatus,
  type TimesheetRow,
  type TimesheetTotals,
} from '@/api/attendance'
import { unitsApi } from '@/api/users'
import { SmartSelect } from '@/components/ui/SmartSelect'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError } from '@/lib/api-error'
import { dayOfMonth, todayInVietnam } from '@/lib/dates'
import type { SmartSelectOption, UnitSearchItem } from '@/types'

// Members per page: each one is a month calendar
const PAGE_SIZE = 10

const STATUS_STYLES: Record<NonNullable<TimesheetDayStatus>, { label: TranslationKey; bg: string; text: string; dot: string }> = {
  present:     { label: 'attendance.timesheet.status.present',    bg: 'bg-green-50',  text: 'text-[#2E7D32]',  dot: 'bg-[#2E7D32]' },
  late:        { label: 'attendance.timesheet.status.late',       bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  early_leave: { label: 'attendance.timesheet.status.earlyLeave', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  absent:      { label: 'attendance.timesheet.status.absent',     bg: 'bg-red-50',    text: 'text-[#C62828]',  dot: 'bg-[#C62828]' },
  leave:       { label: 'attendance.timesheet.status.leave',      bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
}

const TOTALS = [
  { key: 'present', label: 'attendance.timesheet.totals.present' },
  { key: 'late', label: 'attendance.timesheet.totals.late' },
  { key: 'earlyLeave', label: 'attendance.timesheet.totals.earlyLeave' },
  { key: 'absent', label: 'attendance.timesheet.totals.absent' },
  { key: 'leave', label: 'attendance.timesheet.totals.leave' },
  { key: 'unrecorded', label: 'attendance.timesheet.totals.unrecorded' },
] as const satisfies readonly { key: keyof TimesheetTotals; label: TranslationKey }[]

const DOW = [
  'attendance.timesheet.weekdays.mon',
  'attendance.timesheet.weekdays.tue',
  'attendance.timesheet.weekdays.wed',
  'attendance.timesheet.weekdays.thu',
  'attendance.timesheet.weekdays.fri',
  'attendance.timesheet.weekdays.sat',
  'attendance.timesheet.weekdays.sun',
] as const satisfies readonly TranslationKey[]

// Column of a YYYY-MM-DD day in a week that starts on Monday (0 = Monday); UTC keeps it zone-free
function weekdayColumn(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

function DayCell({ day, today }: { day: TimesheetDay; today: string }) {
  const { t } = useTranslation()
  const none = t('common.states.none')
  const style = day.status ? STATUS_STYLES[day.status] : null
  const isToday = day.date === today
  // Check-in and check-out arrive as HH:MM in Vietnam time and are shown as they are
  const times =
    day.checkIn && !day.checkOut
      ? day.checkIn
      : day.checkOut
        ? t('attendance.timesheet.day.hours', { checkIn: day.checkIn ?? none, checkOut: day.checkOut })
        : null

  return (
    <div
      data-testid={`day-${day.date}`}
      aria-current={isToday ? 'date' : undefined}
      className={`border-r border-b border-[#F1F5F9] p-3 min-h-[90px] flex flex-col gap-1.5 transition-colors ${
        isToday ? 'bg-[#FFF8F8]' : 'hover:bg-[#F8FAFC]'
      }`}
    >
      <span
        className={`text-sm font-semibold ${
          isToday ? 'w-6 h-6 bg-[#C62828] text-white rounded-full flex items-center justify-center text-xs' : 'text-[#0F172A]'
        }`}
      >
        {dayOfMonth(day.date)}
      </span>
      {style ? (
        <span className={`inline-flex w-fit items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
          {t(style.label)}
        </span>
      ) : (
        <span className="text-xs text-[#CBD5E1]">{none}</span>
      )}
      {day.onLeave && day.status !== 'leave' && (
        <span className="text-xs text-blue-700">{t('attendance.timesheet.day.onLeave')}</span>
      )}
      {times && (
        <div className="flex items-center gap-1">
          <Clock size={11} className="text-[#94A3B8]" />
          <p className="text-xs text-[#64748B]">{times}</p>
        </div>
      )}
      {day.workHours != null && (
        <p className="text-xs text-[#64748B]">{t('attendance.timesheet.day.workHours', { hours: day.workHours })}</p>
      )}
    </div>
  )
}

function MemberTimesheet({ row, today }: { row: TimesheetRow; today: string }) {
  const { t } = useTranslation()
  const leadingBlanks = row.days.length > 0 ? weekdayColumn(row.days[0].date) : 0

  return (
    <section data-testid={`timesheet-row-${row.militiaId}`} className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">{row.fullName}</h2>
          <p className="text-xs text-[#64748B]">
            {t('attendance.timesheet.row.member', { code: row.militiaCode, unit: row.unitName })}
          </p>
        </div>
        <dl className="flex flex-wrap gap-2">
          {TOTALS.map(({ key, label }) => (
            <div
              key={key}
              data-testid={`total-${key}`}
              className="flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-xs"
            >
              <dt className="text-[#64748B]">{t(label)}</dt>
              <dd className="font-semibold text-[#0F172A]">{row.totals[key]}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="grid grid-cols-7 border-b-2 border-[#E2E8F0]">
        {DOW.map((weekday) => (
          <div
            key={weekday}
            className="px-3 py-3.5 text-center text-xs font-bold text-white bg-[#C62828] border-r border-red-700 last:border-r-0"
          >
            {t(weekday)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} data-testid="day-blank" aria-hidden="true" className="border-r border-b border-[#F1F5F9] bg-[#F8FAFC] min-h-[90px]" />
        ))}
        {row.days.map((day) => (
          <DayCell key={day.date} day={day} today={today} />
        ))}
      </div>
    </section>
  )
}

export function TimesheetPage() {
  const { t } = useTranslation()
  // Timesheet days are calendar days in Vietnam
  const today = todayInVietnam()
  const [currentYear, currentMonth] = today.split('-').map(Number)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [unitId, setUnitId] = useState('')
  const [unitCode, setUnitCode] = useState('')
  const [unitQuery, setUnitQuery] = useState('')
  const [page, setPage] = useState(1)
  // The backend reads the month as YYYY-MM
  const month = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`

  const { data: unitOptions = [], isFetching: unitsLoading } = useQuery({
    queryKey: ['units-search', unitQuery],
    queryFn: () => unitsApi.search({ q: unitQuery, limit: 20 }),
    select: (items: UnitSearchItem[]): SmartSelectOption[] =>
      items.map((unit) => ({ id: unit.id, label: unit.name, sublabel: unit.code, meta: { code: unit.code } })),
  })

  // Staff see the members they manage (a unit narrows it where their role allows); a militia
  // member's answer holds only their own row
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['attendance-timesheet', month, unitCode, page],
    queryFn: () => attendanceApi.timesheet({ month, unitCode, page, limit: PAGE_SIZE }),
    staleTime: 60_000,
  })
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <div className="p-6 space-y-6" data-testid="timesheet-page">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('attendance.timesheet.header.title')}</h1>
          <p className="text-sm text-[#64748B] mt-1">
            {t('attendance.timesheet.header.period', { month: selectedMonth, year: selectedYear })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(Number(e.target.value)); setPage(1) }}
            className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            data-testid="month-select"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{t('attendance.timesheet.filters.month', { month: m })}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => { setSelectedYear(Number(e.target.value)); setPage(1) }}
            className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            data-testid="year-select"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Unit filter */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 max-w-md">
        <SmartSelect
          name="timesheet-unit"
          label={t('attendance.timesheet.filters.unit')}
          placeholder={t('attendance.timesheet.filters.unitPlaceholder')}
          value={unitId}
          onChange={(id, option) => {
            setUnitId(id)
            setUnitCode(String(option.meta?.code ?? ''))
            setPage(1)
          }}
          onClear={() => {
            setUnitId('')
            setUnitCode('')
            setPage(1)
          }}
          options={unitOptions}
          isLoading={unitsLoading}
          onSearch={setUnitQuery}
        />
      </div>

      {isError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-sm text-[#C62828]">
          <XCircle size={18} className="flex-shrink-0" />
          {describeApiError(error, { scope: 'attendance.timesheet', fallback: 'attendance.timesheet.list.loadError' })}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-[#64748B] mt-3">{t('attendance.timesheet.list.loading')}</p>
        </div>
      ) : data ? (
        <>
          {data.data.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center text-sm text-[#64748B]">
              {t('attendance.timesheet.list.empty')}
            </div>
          ) : (
            <div className="space-y-4">
              {data.data.map((row) => (
                <MemberTimesheet key={row.militiaId} row={row} today={today} />
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#64748B]">{t('attendance.timesheet.pagination.total', { total: data.total })}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
              >
                {t('common.pagination.previous')}
              </button>
              <span className="text-sm text-[#0F172A] font-medium">
                {t('attendance.timesheet.pagination.page', { page, pages })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="px-3 py-1.5 text-sm rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
              >
                {t('common.pagination.next')}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
