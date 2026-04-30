import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Clock, XCircle, CheckCircle } from 'lucide-react'
import client from '@/api/client'

interface AttendanceDay {
  date: string
  status: 'present' | 'absent' | 'leave' | 'holiday' | null
  checkIn?: string
  checkOut?: string
}

interface TimesheetData {
  userId: string
  fullName: string
  weekLabel: string
  days: AttendanceDay[]
  summary: { present: number; absent: number; leave: number }
}

async function getTimesheet(userId: string, month: number, year: number): Promise<TimesheetData> {
  const res = await client.get('/attendance/timesheet', { params: { userId, month, year } })
  return res.data
}

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  present: { label: 'Có mặt',   bg: 'bg-green-50',  text: 'text-[#2E7D32]', dot: 'bg-[#2E7D32]' },
  absent:  { label: 'Vắng',     bg: 'bg-red-50',    text: 'text-[#C62828]', dot: 'bg-[#C62828]' },
  leave:   { label: 'Nghỉ phép', bg: 'bg-blue-50',  text: 'text-blue-700',  dot: 'bg-blue-500' },
  holiday: { label: 'Nghỉ lễ',  bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
}

const DOW = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN']

export function TimesheetPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const userId = 'current'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['timesheet', userId, selectedMonth, selectedYear],
    queryFn: () => getTimesheet(userId, selectedMonth, selectedYear),
    staleTime: 60_000,
  })

  return (
    <div className="p-6 space-y-6" data-testid="timesheet-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Bảng Chấm Công</h1>
          <p className="text-sm text-[#64748B] mt-1">Tháng {selectedMonth}/{selectedYear}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            data-testid="month-select"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            data-testid="year-select"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-sm text-[#C62828]">
          <XCircle size={18} className="flex-shrink-0" />
          Không thể tải bảng chấm công. Vui lòng thử lại.
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-[#64748B] mt-3">Đang tải dữ liệu...</p>
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-[#E8F5E9] rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle size={22} className="text-[#2E7D32]" />
              </div>
              <div>
                <p className="text-sm text-[#64748B]">Ngày có mặt</p>
                <p className="text-3xl font-bold text-[#2E7D32]">{data.summary.present}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-[#FFEBEE] rounded-lg flex items-center justify-center flex-shrink-0">
                <XCircle size={22} className="text-[#C62828]" />
              </div>
              <div>
                <p className="text-sm text-[#64748B]">Ngày vắng</p>
                <p className="text-3xl font-bold text-[#C62828]">{data.summary.absent}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-[#E3F2FD] rounded-lg flex items-center justify-center flex-shrink-0">
                <Calendar size={22} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-[#64748B]">Nghỉ phép</p>
                <p className="text-3xl font-bold text-blue-600">{data.summary.leave}</p>
              </div>
            </div>
          </div>

          {/* Weekly grid */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b-2 border-[#E2E8F0]">
              {DOW.map((d, i) => (
                <div
                  key={i}
                  className="px-3 py-3.5 text-center text-xs font-bold text-white bg-[#C62828] border-r border-red-700 last:border-r-0"
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7">
              {data.days.map((day, i) => {
                const st = day.status ? STATUS_STYLES[day.status] : null
                const dayNum = new Date(day.date).getDate()
                const isToday = day.date === new Date().toISOString().slice(0, 10)
                return (
                  <div
                    key={i}
                    data-testid={`day-${day.date}`}
                    className={`border-r border-b border-[#F1F5F9] last:border-r-0 p-3 min-h-[90px] flex flex-col gap-1.5 transition-colors ${
                      isToday ? 'bg-[#FFF8F8]' : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${
                        isToday ? 'w-6 h-6 bg-[#C62828] text-white rounded-full flex items-center justify-center text-xs' : 'text-[#0F172A]'
                      }`}>
                        {dayNum}
                      </span>
                    </div>
                    {st ? (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>
                        {st.label}
                      </span>
                    ) : (
                      <span className="text-xs text-[#CBD5E1]">—</span>
                    )}
                    {day.checkIn && (
                      <div className="flex items-center gap-1">
                        <Clock size={11} className="text-[#94A3B8]" />
                        <p className="text-xs text-[#64748B]">{day.checkIn}{day.checkOut ? ` – ${day.checkOut}` : ''}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
