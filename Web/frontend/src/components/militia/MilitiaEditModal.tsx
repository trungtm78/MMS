// US-W003: Edit militia member profile — inline modal
import { useCallback, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { militiaApi, type UpdateMilitiaDto } from '@/api/militia'
import type { MilitiaListItem } from '@/api/militia'
import i18n from '@/i18n'
import { describeApiError } from '@/lib/api-error'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// PATCH /militia/:id takes militia.controller.ts UpdateMilitiaDto only: the global ValidationPipe
// (forbidNonWhitelisted) refuses the whole body when it carries anything else, such as a status
const ADDRESS_MAX = 255
const RANK_MAX = 50

function buildSchema() {
  return z.object({
    phone: z
      .string()
      .regex(/^(0|\+84)\d{9}$/, i18n.t('militia.form.validation.phoneInvalid'))
      .optional()
      .or(z.literal('')),
    address: z
      .string()
      .max(ADDRESS_MAX, i18n.t('militia.edit.validation.addressMax', { max: ADDRESS_MAX }))
      .optional()
      .or(z.literal('')),
    rank: z
      .string()
      .max(RANK_MAX, i18n.t('militia.edit.validation.rankMax', { max: RANK_MAX }))
      .optional()
      .or(z.literal('')),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

interface MilitiaEditModalProps {
  open: boolean
  onClose: () => void
  id: string
  profile: MilitiaListItem
}

export function MilitiaEditModal({ open, onClose, id, profile }: MilitiaEditModalProps) {
  if (!open) return null
  // Each opening, and each other member, starts from the saved values; a re-read of the same
  // member while the dialog is open keeps the unsaved edits
  return <MilitiaEditDialog key={id} onClose={onClose} id={id} profile={profile} />
}

function MilitiaEditDialog({ onClose, id, profile }: Omit<MilitiaEditModalProps, 'open'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const schema = useMemo(() => buildSchema(), [])

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      phone: profile.phone ?? '',
      address: profile.permanentAddress ?? '',
      rank: profile.rank ?? '',
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) => {
      // An emptied field is not sent, so it keeps its saved value
      const dto: UpdateMilitiaDto = {}
      if (data.phone) dto.phone = data.phone
      if (data.address) dto.address = data.address
      if (data.rank) dto.rank = data.rank
      return militiaApi.update(id, dto)
    },
    onSuccess: () => {
      toast.success(t('militia.edit.submit.success'))
      queryClient.invalidateQueries({ queryKey: ['militia-profile', id] })
      queryClient.invalidateQueries({ queryKey: ['militia-list'] })
      onClose()
    },
    // errors.militia.update names the refusals of PATCH /militia/:id; the scope codes (no_unit_scope)
    // read as they do for the profile
    onError: (err) =>
      toast.error(
        describeApiError(err, {
          scope: ['militia.update', 'militia.profile'],
          statuses: { 403: 'errors.common.forbidden' },
          fallback: 'militia.form.submit.error',
        }),
      ),
  })

  const handleClose = useCallback(() => {
    if (isDirty && !window.confirm(t('militia.edit.dialog.discardConfirm'))) return
    onClose()
  }, [isDirty, onClose, t])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  const onSubmit = handleSubmit((data) => {
    updateMutation.mutate(data)
  })

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="militia-edit-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('militia.edit.dialog.title')}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">{t('militia.edit.dialog.title')}</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.actions.close')}
            className="p-2 rounded-lg hover:bg-[#F8FAFC] text-[#64748B] transition-colors"
            data-testid="close-modal-btn"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-4" noValidate>
          <Input
            id="edit-phone"
            data-testid="edit-phone-input"
            label={t('militia.form.fields.phone')}
            placeholder={t('militia.form.placeholders.phone')}
            error={!!errors.phone}
            errorMessage={errors.phone?.message}
            {...register('phone')}
          />

          <Input
            id="edit-address"
            data-testid="edit-address-input"
            label={t('militia.edit.fields.address')}
            placeholder={t('militia.edit.placeholders.address')}
            error={!!errors.address}
            errorMessage={errors.address?.message}
            {...register('address')}
          />

          <Input
            id="edit-rank"
            data-testid="edit-rank-input"
            label={t('militia.edit.fields.rank')}
            placeholder={t('militia.edit.placeholders.rank')}
            error={!!errors.rank}
            errorMessage={errors.rank?.message}
            {...register('rank')}
          />

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              data-testid="cancel-btn"
            >
              {t('common.actions.cancel')}
            </Button>
            <Button
              type="submit"
              loading={updateMutation.isPending}
              data-testid="save-btn"
              className="bg-[#C62828] hover:bg-[#A91D1D] focus:ring-red-500"
            >
              {t('militia.edit.dialog.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
