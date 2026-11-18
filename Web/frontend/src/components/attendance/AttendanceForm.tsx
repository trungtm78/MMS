// US-SS-07: AttendanceForm — record attendance with SmartSelect militia
import { useState, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarCheck } from 'lucide-react'
import { SmartSelect } from '@/components/ui/SmartSelect'
import { Button } from '@/components/ui/Button'
import { militiaApi } from '@/api/militia'
import { attendanceApi } from '@/api/attendance'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError } from '@/lib/api-error'
import { todayInVietnam } from '@/lib/dates'
import type { SmartSelectOption, MilitiaSearchItem } from '@/types'

const STATUSES = ['present', 'absent', 'late', 'half_day'] as const

const STATUS_OPTION_LABEL = {
  present: 'attendance.form.statusOptions.present',
  absent: 'attendance.form.statusOptions.absent',
  late: 'attendance.form.statusOptions.late',
  half_day: 'attendance.form.statusOptions.halfDay',
} as const satisfies Record<(typeof STATUSES)[number], TranslationKey>

function createSchema(t: TFunction) {
  const militiaRequired = t('attendance.form.validation.militiaRequired')
  const workDateRequired = t('attendance.form.validation.workDateRequired')
  return z.object({
    // No militia chosen yet is undefined, a cleared choice is '': both get the same text
    militiaId: z.string({ required_error: militiaRequired }).uuid(militiaRequired),
    workDate: z.string({ required_error: workDateRequired }).min(1, workDateRequired),
    status: z.enum(STATUSES, {
      required_error: t('attendance.form.validation.statusRequired'),
    }),
    note: z.string().optional(),
  })
}

type FormValues = z.infer<ReturnType<typeof createSchema>>

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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [militiaId, setMilitiaId] = useState('')
  const [militiaQuery, setMilitiaQuery] = useState('')
  const schema = useMemo(() => createSchema(t), [t])

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
    defaultValues: { status: 'present', workDate: todayInVietnam() },
  })

  const recordMutation = useMutation({
    mutationFn: attendanceApi.record,
    onSuccess: () => {
      toast.success(t('attendance.form.record.success'))
      reset({ status: 'present', workDate: todayInVietnam() })
      setMilitiaId('')
      setMilitiaQuery('')
      queryClient.invalidateQueries({ queryKey: ['attendance-report'] })
      onSuccess?.()
    },
    onError: (err: unknown) => {
      toast.error(describeApiError(err, { scope: 'attendance.record', fallback: 'attendance.form.record.error' }))
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
          <h2 className="text-lg font-bold text-[#0F172A]">{t('attendance.form.header.title')}</h2>
          <p className="text-xs text-[#64748B]">{t('attendance.form.header.subtitle')}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-5">
        {/* Militia SmartSelect */}
        <SmartSelect
          name="militia"
          label={t('attendance.form.fields.militia')}
          placeholder={t('attendance.form.fields.militiaPlaceholder')}
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
            {t('attendance.form.fields.workDate')}
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
            {t('attendance.form.fields.status')}
          </label>
          <select
            id="attendance-status"
            data-testid="attendance-status-select"
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('status')}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>{t(STATUS_OPTION_LABEL[status])}</option>
            ))}
          </select>
        </div>

        {/* Note */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="attendance-note" className="text-sm font-bold text-[#C62828]">{t('attendance.form.fields.note')}</label>
          <textarea
            id="attendance-note"
            rows={2}
            placeholder={t('attendance.form.fields.notePlaceholder')}
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('note')}
          />
        </div>
      </div>

      {/* Success indicator */}
      {recordMutation.isSuccess && (
        <div data-testid="attendance-create-success" className="text-sm text-[#2E7D32] font-medium bg-[#E8F5E9] px-4 py-3 rounded-lg border border-green-200">
          {t('attendance.form.record.successBanner')}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => { reset(); setMilitiaId('') }}
          className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {t('attendance.form.actions.reset')}
        </button>
        <Button
          type="submit"
          data-testid="attendance-submit-btn"
          loading={recordMutation.isPending}
        >
          {t('attendance.form.actions.submit')}
        </Button>
      </div>
    </form>
  )
}
