// US-SS-07: AttendanceForm — record attendance with SmartSelect militia
import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarCheck } from 'lucide-react'
import { SmartSelect } from '@/components/ui/SmartSelect'
import { Button } from '@/components/ui/Button'
import { militiaApi } from '@/api/militia'
import { attendanceApi } from '@/api/attendance'
import type { SmartSelectOption, MilitiaSearchItem } from '@/types'

const schema = z.object({
  militiaId: z.string().uuid('Vui lòng chọn cán bộ dân quân'),
  workDate: z.string().min(1, 'Ngày chấm công là bắt buộc'),
  status: z.enum(['present', 'absent', 'late', 'half_day'], {
    required_error: 'Trạng thái là bắt buộc',
  }),
  note: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function toSmartSelectOption(m: MilitiaSearchItem): SmartSelectOption {
  return {
    id: m.id,
    label: `${m.militiaCode} — ${m.fullName}`,
    sublabel: [m.phone, m.unitName].filter(Boolean).join(' | '),
    meta: m as unknown as Record<string, unknown>,
  }
}

interface AttendanceFormProps {
  onSuccess?: () => void
}

export function AttendanceForm({ onSuccess }: AttendanceFormProps) {
  const queryClient = useQueryClient()
  const [militiaId, setMilitiaId] = useState('')
  const [militiaQuery, setMilitiaQuery] = useState('')

  const { data: militiaOptions = [], isFetching: militiaLoading } = useQuery({
    queryKey: ['militia-search', militiaQuery],
    queryFn: () => militiaApi.search({ q: militiaQuery, limit: 20 }),
    select: (data) => data.map(toSmartSelectOption),
  })

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'present', workDate: new Date().toISOString().slice(0, 10) },
  })

  const recordMutation = useMutation({
    mutationFn: attendanceApi.record,
    onSuccess: () => {
      toast.success('Ghi nhận chấm công thành công')
      reset({ status: 'present', workDate: new Date().toISOString().slice(0, 10) })
      setMilitiaId('')
      setMilitiaQuery('')
      queryClient.invalidateQueries({ queryKey: ['attendance-report'] })
      onSuccess?.()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      if (msg === 'attendance_already_recorded') {
        toast.error('Dân quân này đã được chấm công cho ngày đã chọn.')
      } else {
        toast.error('Có lỗi xảy ra. Vui lòng thử lại.')
      }
    },
  })

  const handleMilitiaChange = useCallback(
    (id: string) => {
      setMilitiaId(id)
      setValue('militiaId', id, { shouldValidate: true })
    },
    [setValue],
  )

  const handleMilitiaClear = useCallback(() => {
    setMilitiaId('')
    setValue('militiaId', '', { shouldValidate: true })
  }, [setValue])

  const onSubmit = handleSubmit((data) => {
    recordMutation.mutate(data)
  })

  return (
    <form
      data-testid="attendance-form"
      onSubmit={onSubmit}
      className="space-y-6 max-w-xl"
      noValidate
    >
      {/* Form header */}
      <div className="flex items-center gap-3 pb-4 border-b border-[#E2E8F0]">
        <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
          <CalendarCheck size={20} className="text-[#C62828]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#0F172A]">Ghi nhận chấm công</h2>
          <p className="text-xs text-[#64748B]">Điền thông tin chấm công cho DQTV</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-5">
        {/* Militia SmartSelect */}
        <SmartSelect
          name="militia"
          label="Cán bộ dân quân *"
          placeholder="Tìm theo tên, mã hoặc SĐT..."
          value={militiaId}
          onChange={(id) => handleMilitiaChange(id)}
          onClear={handleMilitiaClear}
          options={militiaOptions}
          isLoading={militiaLoading}
          error={!!errors.militiaId}
          errorMessage={errors.militiaId?.message}
          required
          onSearch={setMilitiaQuery}
        />

        {/* Work date */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="attendance-date" className="text-sm font-bold text-[#C62828]">
            Ngày chấm công *
          </label>
          <input
            id="attendance-date"
            type="date"
            data-testid="attendance-date-input"
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('workDate')}
          />
          {errors.workDate && (
            <p className="text-xs text-red-500">{errors.workDate.message}</p>
          )}
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="attendance-status" className="text-sm font-bold text-[#C62828]">
            Trạng thái *
          </label>
          <select
            id="attendance-status"
            data-testid="attendance-status-select"
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('status')}
          >
            <option value="present">Có mặt</option>
            <option value="absent">Vắng mặt</option>
            <option value="late">Đi trễ</option>
            <option value="half_day">Nửa ngày</option>
          </select>
        </div>

        {/* Note */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="attendance-note" className="text-sm font-bold text-[#C62828]">Ghi chú</label>
          <textarea
            id="attendance-note"
            rows={2}
            placeholder="Ghi chú thêm..."
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('note')}
          />
        </div>
      </div>

      {/* Success indicator */}
      {recordMutation.isSuccess && (
        <div data-testid="attendance-create-success" className="text-sm text-[#2E7D32] font-medium bg-[#E8F5E9] px-4 py-3 rounded-lg border border-green-200">
          Ghi nhận chấm công thành công!
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => { reset(); setMilitiaId('') }}
          className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          Đặt lại
        </button>
        <Button
          type="submit"
          data-testid="attendance-submit-btn"
          loading={recordMutation.isPending}
        >
          Ghi nhận
        </Button>
      </div>
    </form>
  )
}
