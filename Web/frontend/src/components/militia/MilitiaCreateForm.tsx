// US-W003: Create new militia member
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { militiaApi } from '@/api/militia'
import i18n from '@/i18n'
import { describeApiError } from '@/lib/api-error'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// militia.controller.ts QuickCreateMilitiaDto: fullName @Length(2, 100), militiaCode @Length(3, 30)
const FULL_NAME = { min: 2, max: 100 } as const
const MILITIA_CODE = { min: 3, max: 30 } as const

function buildSchema() {
  return z.object({
    fullName: z
      .string()
      .min(FULL_NAME.min, i18n.t('militia.create.validation.fullNameMin', { min: FULL_NAME.min }))
      .max(FULL_NAME.max, i18n.t('militia.create.validation.fullNameMax', { max: FULL_NAME.max })),
    militiaCode: z
      .string()
      .min(MILITIA_CODE.min, i18n.t('militia.create.validation.codeMin', { min: MILITIA_CODE.min }))
      .max(MILITIA_CODE.max, i18n.t('militia.create.validation.codeMax', { max: MILITIA_CODE.max }))
      .regex(/^[A-Z0-9-]+$/, i18n.t('militia.create.validation.codeFormat')),
    unitCode: z.string().min(1, i18n.t('militia.create.validation.unitRequired')),
    phone: z
      .string()
      .regex(/^(0|\+84)\d{9}$/, i18n.t('militia.form.validation.phoneInvalid'))
      .optional()
      .or(z.literal('')),
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, i18n.t('militia.create.validation.dobInvalid'))
      .optional()
      .or(z.literal('')),
    gender: z.enum(['male', 'female', '']).optional(),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

export function MilitiaCreateForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const schema = useMemo(() => buildSchema(), [])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      militiaApi.quickCreate({
        fullName: data.fullName,
        militiaCode: data.militiaCode,
        unitCode: data.unitCode,
        phone: data.phone || undefined,
        dob: data.dob || undefined,
        gender: data.gender || undefined,
      }),
    onSuccess: () => {
      toast.success(t('militia.create.submit.success'))
      queryClient.invalidateQueries({ queryKey: ['militia-list'] })
      navigate('/militia')
    },
    // errors.militia.create holds the codes of POST /militia/quick-create. The status texts answer what
    // carries no code of the table: the RolesGuard's 403, and the backend's `unit_not_found:<code>`.
    onError: (err) =>
      toast.error(
        describeApiError(err, {
          scope: 'militia.create',
          statuses: { 400: 'militia.create.submit.invalid', 403: 'militia.create.submit.forbidden' },
          fallback: 'militia.form.submit.error',
        }),
      ),
  })

  const onSubmit = handleSubmit((data) => {
    createMutation.mutate(data)
  })

  return (
    <div className="space-y-6" data-testid="militia-create-form">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/militia')}
          aria-label={t('militia.create.header.back')}
          className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-[#E2E8F0]"
          data-testid="back-btn"
        >
          <ArrowLeft size={20} className="text-[#64748B]" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('militia.create.header.title')}</h1>
          <p className="text-sm text-[#64748B] mt-0.5">{t('militia.create.header.subtitle')}</p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-sm max-w-xl">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Input
            id="fullName"
            data-testid="fullName-input"
            label={t('militia.create.fields.fullName')}
            placeholder={t('militia.create.placeholders.fullName')}
            error={!!errors.fullName}
            errorMessage={errors.fullName?.message}
            {...register('fullName')}
          />

          <Input
            id="militiaCode"
            data-testid="militiaCode-input"
            label={t('militia.create.fields.militiaCode')}
            placeholder={t('militia.create.placeholders.militiaCode')}
            error={!!errors.militiaCode}
            errorMessage={errors.militiaCode?.message}
            {...register('militiaCode')}
          />

          <Input
            id="unitCode"
            data-testid="unitCode-input"
            label={t('militia.create.fields.unitCode')}
            placeholder={t('militia.create.placeholders.unitCode')}
            error={!!errors.unitCode}
            errorMessage={errors.unitCode?.message}
            {...register('unitCode')}
          />

          <Input
            id="phone"
            data-testid="phone-input"
            label={t('militia.form.fields.phone')}
            placeholder={t('militia.form.placeholders.phone')}
            error={!!errors.phone}
            errorMessage={errors.phone?.message}
            {...register('phone')}
          />

          <Input
            id="dob"
            type="date"
            data-testid="dob-input"
            label={t('militia.create.fields.dob')}
            error={!!errors.dob}
            errorMessage={errors.dob?.message}
            {...register('dob')}
          />

          {/* Gender */}
          <div className="flex flex-col gap-1">
            <label htmlFor="gender" className="text-sm font-medium text-slate-700">{t('militia.create.fields.gender')}</label>
            <select
              id="gender"
              data-testid="gender-select"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...register('gender')}
            >
              <option value="">{t('militia.create.gender.placeholder')}</option>
              <option value="male">{t('militia.create.gender.male')}</option>
              <option value="female">{t('militia.create.gender.female')}</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => reset()}
              data-testid="reset-btn"
            >
              {t('militia.form.actions.reset')}
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              data-testid="submit-btn"
              className="bg-[#2E7D32] hover:bg-[#1B5E20] focus:ring-green-500"
            >
              {t('militia.create.form.submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
