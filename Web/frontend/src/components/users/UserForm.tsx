// US-SS-08: UserForm — create user with unit SmartSelect
import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SmartSelect } from '@/components/ui/SmartSelect'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { unitsApi, usersApi } from '@/api/users'
import type { SmartSelectOption, UnitSearchItem } from '@/types'

const schema = z.object({
  username: z.string().min(3, 'Tên đăng nhập tối thiểu 3 ký tự').max(50),
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự').max(100),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  role: z.string().min(1, 'Vai trò là bắt buộc'),
  unitCode: z.string().optional(),
  email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  phone: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function toSmartSelectOption(u: UnitSearchItem): SmartSelectOption {
  return {
    id: u.id,
    label: u.name,
    sublabel: [u.code, u.parentCode].filter(Boolean).join(' / '),
    meta: u as unknown as Record<string, unknown>,
  }
}

interface UserFormProps {
  onSuccess?: () => void
}

export function UserForm({ onSuccess }: UserFormProps) {
  const queryClient = useQueryClient()
  const [unitId, setUnitId] = useState('')
  const [unitQuery, setUnitQuery] = useState('')

  const { data: unitOptions = [], isFetching: unitLoading } = useQuery({
    queryKey: ['units-search', unitQuery],
    queryFn: () => unitsApi.search({ q: unitQuery, limit: 20 }),
    select: (data) => data.map(toSmartSelectOption),
  })

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => {
      const unitOption = unitOptions.find((o) => o.id === unitId)
      const unitCode = unitOption
        ? (unitOption.meta as unknown as UnitSearchItem).code
        : undefined
      return usersApi.create({
        username: data.username,
        fullName: data.fullName,
        password: data.password,
        role: data.role as Parameters<typeof usersApi.create>[0]['role'],
        unitScope: unitCode ?? null,
        email: data.email ?? '',
        phone: data.phone ?? '',
      })
    },
    onSuccess: () => {
      toast.success('Tạo tài khoản thành công')
      reset()
      setUnitId('')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onSuccess?.()
    },
    onError: () => {
      toast.error('Có lỗi xảy ra. Vui lòng thử lại.')
    },
  })

  const handleUnitChange = useCallback(
    (id: string) => {
      setUnitId(id)
      const opt = unitOptions.find((o) => o.id === id)
      if (opt) {
        setValue('unitCode', (opt.meta as unknown as UnitSearchItem).code, { shouldValidate: true })
      }
    },
    [setValue, unitOptions],
  )

  const handleUnitClear = useCallback(() => {
    setUnitId('')
    setValue('unitCode', undefined)
  }, [setValue])

  const onSubmit = handleSubmit((data) => {
    void createMutation.mutate(data)
  })

  return (
    <form
      data-testid="user-form"
      onSubmit={onSubmit}
      className="space-y-4 max-w-xl"
      noValidate
    >
      <h2 className="text-lg font-semibold text-slate-800">Tạo tài khoản mới</h2>

      <Input
        id="user-username"
        data-testid="user-username-input"
        label="Tên đăng nhập *"
        placeholder="Nhập tên đăng nhập..."
        error={!!errors.username}
        errorMessage={errors.username?.message}
        {...register('username')}
      />

      <Input
        id="user-fullname"
        label="Họ và tên *"
        placeholder="Nhập họ tên đầy đủ..."
        error={!!errors.fullName}
        errorMessage={errors.fullName?.message}
        {...register('fullName')}
      />

      <Input
        id="user-password"
        type="password"
        label="Mật khẩu *"
        placeholder="Nhập mật khẩu..."
        error={!!errors.password}
        errorMessage={errors.password?.message}
        {...register('password')}
      />

      {/* Role */}
      <div className="flex flex-col gap-1">
        <label htmlFor="user-role" className="text-sm font-medium text-slate-700">Vai trò *</label>
        <select
          id="user-role"
          data-testid="user-role-select"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          {...register('role')}
        >
          <option value="">-- Chọn vai trò --</option>
          <option value="system_admin">Quản trị hệ thống</option>
          <option value="ubnd_leader">Lãnh đạo UBND</option>
          <option value="police_ward">CA Phường</option>
          <option value="police_area">CA Khu phố</option>
          <option value="office_staff">Văn phòng</option>
          <option value="dqtv">Dân quân tự vệ</option>
        </select>
        {errors.role && (
          <p className="text-xs text-red-500">{errors.role.message}</p>
        )}
      </div>

      {/* Unit SmartSelect */}
      <SmartSelect
        name="unit"
        label="Đơn vị / Khu phố"
        placeholder="Tìm đơn vị theo tên hoặc mã..."
        value={unitId}
        onChange={(id) => handleUnitChange(id)}
        onClear={handleUnitClear}
        options={unitOptions}
        isLoading={unitLoading}
        onSearch={setUnitQuery}
      />

      <Input
        id="user-email"
        type="email"
        label="Email"
        placeholder="email@example.com"
        error={!!errors.email}
        errorMessage={errors.email?.message}
        {...register('email')}
      />

      <Input
        id="user-phone"
        label="Số điện thoại"
        placeholder="0909xxxxxx"
        {...register('phone')}
      />

      {createMutation.isSuccess && (
        <div data-testid="user-create-success" className="text-sm text-green-600 font-medium">
          Tài khoản đã được tạo thành công!
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={() => { reset(); setUnitId('') }}>
          Đặt lại
        </Button>
        <Button
          type="submit"
          data-testid="user-submit-btn"
          loading={createMutation.isPending}
        >
          Tạo tài khoản
        </Button>
      </div>
    </form>
  )
}
