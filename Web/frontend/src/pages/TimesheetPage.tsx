import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

async function getTimesheet(userId: string, weekOffset: number): Promise<TimesheetData> {
  const res = await client.get('/attendance/timesheet', { params: { userId, weekOffset } })
  return res.data
}

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  present: { label: 'Có mặt', bg: 'bg-green-100', text: 'text-green-700' },
  absent:  { label: 'Vắng',   bg: 'bg-red-100',   text: 'text-red-700' },
  leave:   { label: 'Nghỉ phép', bg: 'bg-blue-100', text: 'text-blue-700' },
  holiday: { label: 'Nghỉ lễ',  bg: 'bg-purple-100', text: 'text-purple-700' },
}

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export function TimesheetPage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const userId = 'current'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['timesheet', userId, weekOffset],
    queryFn: () => getTimesheet(userId, weekOffset),
    staleTime: 60_000,
  })

  return (
    <div className="p-6 space-y-6" data-testid="timesheet-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Bảng Chấm Công</h1>
          <p className="text-sm text-gray-600 mt-1">Xem lịch sử chấm công theo tuần</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            data-testid="prev-week"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[150px] text-center">
            {data?.weekLabel ?? 'Tuần hiện tại'}
          </span>
          <button
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            disabled={weekOffset >= 0}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
            data-testid="next-week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Không thể tải bảng chấm công.
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-400 py-12 text-sm">Đang tải...</div>
      ) : data ? (
        <>
          {/* Weekly grid */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200">
              {DOW.map((d, i) => (
                <div key={i} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 bg-gray-50">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {data.days.map((day, i) => {
                const st = day.status ? STATUS_STYLES[day.status] : null
                return (
                  <div
                    key={i}
                    data-testid={`day-${day.date}`}
                    className="border-r border-b border-gray-100 last:border-r-0 p-3 min-h-[80px] flex flex-col gap-1"
                  >
                    <p className="text-xs text-gray-400">{new Date(day.date).getDate()}</p>
                    {st ? (
                      <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                    {day.checkIn && (
                      <p className="text-xs text-gray-500">{day.checkIn} - {day.checkOut ?? '?'}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Ngày có mặt', value: data.summary.present, color: 'text-green-600' },
              { label: 'Ngày vắng',   value: data.summary.absent,  color: 'text-red-600' },
              { label: 'Nghỉ phép',   value: data.summary.leave,   color: 'text-blue-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm text-center">
                <p className="text-sm text-gray-500">{label}</p>
                <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
