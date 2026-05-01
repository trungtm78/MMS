// US-W003: Edit militia member profile — inline modal
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { militiaApi, type UpdateMilitiaDto } from '@/api/militia'
import type { MilitiaListItem } from '@/api/militia'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const schema = z.object({
  phone: z
    .string()
    .regex(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ')
    .optional()
    .or(z.literal('')),
  address: z.string().max(255).optional().or(z.literal('')),
  rank: z.string().max(50).optional().or(z.literal('')),
  status: z.enum(['active', 'reserve', 'inactive', 'leave', '']).optional(),
  avatarUrl: z.string().url('URL không hợp lệ').optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface MilitiaEditModalProps {
  open: boolean
  onClose: () => void
  id: string
  profile: MilitiaListItem
}

export function MilitiaEditModal({ open, onClose, id, profile }: MilitiaEditModalProps) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      phone: profile.phone ?? '',
      address: profile.permanentAddress ?? '',
      rank: profile.rank ?? '',
      status: (profile.status as FormValues['status']) ?? '',
      avatarUrl: profile.avatarUrl ?? '',
    },
  })

  // Sync form when profile changes
  useEffect(() => {
    reset({
      phone: profile.phone ?? '',
      address: profile.permanentAddress ?? '',
      rank: profile.rank ?? '',
      status: (profile.status as FormValues['status']) ?? '',
      avatarUrl: profile.avatarUrl ?? '',
    })
  }, [profile, reset])

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) => {
      const dto: UpdateMilitiaDto = {}
      if (data.phone !== undefined) dto.phone = data.phone || undefined
      if (data.address !== undefined) dto.address = data.address || undefined
      if (data.rank !== undefined) dto.rank = data.rank || undefined
      if (data.status) dto.status = data.status as UpdateMilitiaDto['status']
      if (data.avatarUrl !== undefined) dto.avatarUrl = data.avatarUrl || null
      return militiaApi.update(id, dto)
    },
    onSuccess: () => {
      toast.success('Cập nhật thành công')
      queryClient.invalidateQueries({ queryKey: ['militia-profile', id] })
      queryClient.invalidateQueries({ queryKey: ['militia-list'] })
      onClose()
    },
    onError: () => {
      toast.error('Có lỗi xảy ra. Vui lòng thử lại.')
    },
  })

  function handleClose() {
    if (isDirty && !window.confirm('Bạn có thay đổi chưa lưu. Thoát không?')) return
    reset()
    onClose()
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDirty])

  if (!open) return null

  const onSubmit = handleSubmit((data) => {
    void updateMutation.mutate(data)
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">Chỉnh sửa thông tin</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-[#F8FAFC] text-[#64748B] transition-colors"
            data-testid="close-modal-btn"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-4" noValidate>
          <Input
            id="edit-phone"
            data-testid="edit-phone-input"
            label="Số điện thoại"
            placeholder="0909xxxxxx"
            error={!!errors.phone}
            errorMessage={errors.phone?.message}
            {...register('phone')}
          />

          <Input
            id="edit-address"
            data-testid="edit-address-input"
            label="Địa chỉ thường trú"
            placeholder="Nhập địa chỉ..."
            error={!!errors.address}
            errorMessage={errors.address?.message}
            {...register('address')}
          />

          <Input
            id="edit-rank"
            data-testid="edit-rank-input"
            label="Cấp bậc"
            placeholder="VD: Tiểu đội trưởng"
            error={!!errors.rank}
            errorMessage={errors.rank?.message}
            {...register('rank')}
          />

          {/* Status */}
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-status" className="text-sm font-medium text-slate-700">Trạng thái</label>
            <select
              id="edit-status"
              data-testid="edit-status-select"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...register('status')}
            >
              <option value="">-- Giữ nguyên --</option>
              <option value="active">Đang hoạt động</option>
              <option value="reserve">Dự bị</option>
              <option value="inactive">Đã xuất ngũ</option>
              <option value="leave">Nghỉ phép</option>
            </select>
          </div>

          <Input
            id="edit-avatarUrl"
            type="url"
            data-testid="edit-avatarUrl-input"
            label="URL ảnh đại diện"
            placeholder="https://..."
            error={!!errors.avatarUrl}
            errorMessage={errors.avatarUrl?.message}
            {...register('avatarUrl')}
          />

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              data-testid="cancel-btn"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              loading={updateMutation.isPending}
              data-testid="save-btn"
              className="bg-[#C62828] hover:bg-[#A91D1D] focus:ring-red-500"
            >
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
