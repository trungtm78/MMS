// US-W003: Create new militia member
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { militiaApi } from '@/api/militia'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const schema = z.object({
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự').max(100),
  militiaCode: z
    .string()
    .min(3, 'Mã DQTV tối thiểu 3 ký tự')
    .max(20, 'Mã DQTV tối đa 20 ký tự')
    .regex(/^[A-Z0-9-]+$/, 'Mã DQTV chỉ gồm chữ hoa, số và dấu gạch ngang'),
  unitCode: z.string().min(1, 'Đơn vị là bắt buộc'),
  phone: z
    .string()
    .regex(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ')
    .optional()
    .or(z.literal('')),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh không hợp lệ')
    .optional()
    .or(z.literal('')),
  gender: z.enum(['male', 'female', '']).optional(),
})

type FormValues = z.infer<typeof schema>

export function MilitiaCreateForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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
        gender: (data.gender as 'male' | 'female' | undefined) || undefined,
      }),
    onSuccess: () => {
      toast.success('Thêm dân quân tự vệ thành công')
      queryClient.invalidateQueries({ queryKey: ['militia-list'] })
      navigate('/militia')
    },
    onError: (err: Error & { response?: { status?: number } }) => {
      if (err?.response?.status === 409) {
        toast.error('Mã DQTV đã tồn tại. Vui lòng dùng mã khác.')
      } else {
        toast.error('Có lỗi xảy ra. Vui lòng thử lại.')
      }
    },
  })

  const onSubmit = handleSubmit((data) => {
    void createMutation.mutate(data)
  })

  return (
    <div className="space-y-6" data-testid="militia-create-form">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/militia')}
          className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-[#E2E8F0]"
          data-testid="back-btn"
        >
          <ArrowLeft size={20} className="text-[#64748B]" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Thêm Dân Quân Tự Vệ</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Nhập thông tin cơ bản cho thành viên mới</p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-sm max-w-xl">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Input
            id="fullName"
            data-testid="fullName-input"
            label="Họ và tên *"
            placeholder="Nhập họ tên đầy đủ..."
            error={!!errors.fullName}
            errorMessage={errors.fullName?.message}
            {...register('fullName')}
          />

          <Input
            id="militiaCode"
            data-testid="militiaCode-input"
            label="Mã DQTV *"
            placeholder="VD: HCM-PHD-T12-0001"
            error={!!errors.militiaCode}
            errorMessage={errors.militiaCode?.message}
            {...register('militiaCode')}
          />

          <Input
            id="unitCode"
            data-testid="unitCode-input"
            label="Đơn vị *"
            placeholder="VD: KP1"
            error={!!errors.unitCode}
            errorMessage={errors.unitCode?.message}
            {...register('unitCode')}
          />

          <Input
            id="phone"
            data-testid="phone-input"
            label="Số điện thoại"
            placeholder="0909xxxxxx"
            error={!!errors.phone}
            errorMessage={errors.phone?.message}
            {...register('phone')}
          />

          <Input
            id="dob"
            type="date"
            data-testid="dob-input"
            label="Ngày sinh"
            error={!!errors.dob}
            errorMessage={errors.dob?.message}
            {...register('dob')}
          />

          {/* Gender */}
          <div className="flex flex-col gap-1">
            <label htmlFor="gender" className="text-sm font-medium text-slate-700">Giới tính</label>
            <select
              id="gender"
              data-testid="gender-select"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...register('gender')}
            >
              <option value="">-- Chọn giới tính --</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => reset()}
              data-testid="reset-btn"
            >
              Đặt lại
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              data-testid="submit-btn"
              className="bg-[#2E7D32] hover:bg-[#1B5E20] focus:ring-green-500"
            >
              Thêm DQTV
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
