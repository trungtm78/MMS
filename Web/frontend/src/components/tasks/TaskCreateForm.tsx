// US-SS-06: TaskCreateForm — create task with SmartSelect assignee
import { useState, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Paperclip, ClipboardList } from 'lucide-react'
import { SmartSelect } from '@/components/ui/SmartSelect'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { militiaApi } from '@/api/militia'
import { tasksApi } from '@/api/tasks'
import client from '@/api/client'
import type { SmartSelectOption, MilitiaSearchItem } from '@/types'

// ─── Quick-create militia inline form ────────────────────────────────────────
interface QuickCreateMilitiaFormProps {
  code: string
  name: string
  unit: string
  onCodeChange: (v: string) => void
  onNameChange: (v: string) => void
  onUnitChange: (v: string) => void
  // US-SS-03 AC-6: inline validation errors
  validationErrors?: { code?: string; name?: string; unit?: string; server?: string }
}

function QuickCreateMilitiaForm({
  code,
  name,
  unit,
  onCodeChange,
  onNameChange,
  onUnitChange,
  validationErrors,
}: QuickCreateMilitiaFormProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Server error (e.g. duplicate code) */}
      {validationErrors?.server && (
        <p data-testid="quick-create-server-error" className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">
          {validationErrors.server}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-bold text-[#C62828]">
          Mã dân quân <span className="text-red-500">*</span>
        </label>
        <input
          data-testid="quick-create-militia-code"
          className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] ${validationErrors?.code ? 'border-red-400' : 'border-[#E2E8F0]'}`}
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder="VD: HCM-PHD-T12-0004"
        />
        {validationErrors?.code && (
          <p data-testid="quick-create-code-error" className="text-xs text-red-500">{validationErrors.code}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-bold text-[#C62828]">
          Họ và tên <span className="text-red-500">*</span>
        </label>
        <input
          data-testid="quick-create-militia-name"
          className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] ${validationErrors?.name ? 'border-red-400' : 'border-[#E2E8F0]'}`}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Nhập họ và tên"
        />
        {validationErrors?.name && (
          <p data-testid="quick-create-name-error" className="text-xs text-red-500">{validationErrors.name}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-bold text-[#C62828]">
          Đơn vị <span className="text-red-500">*</span>
        </label>
        <input
          data-testid="quick-create-militia-unit"
          className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] ${validationErrors?.unit ? 'border-red-400' : 'border-[#E2E8F0]'}`}
          value={unit}
          onChange={(e) => onUnitChange(e.target.value)}
          placeholder="Mã đơn vị (VD: PHU_DINH)"
        />
        {validationErrors?.unit && (
          <p data-testid="quick-create-unit-error" className="text-xs text-red-500">{validationErrors.unit}</p>
        )}
      </div>
    </div>
  )
}

const schema = z.object({
  title: z.string().min(1, 'Tiêu đề là bắt buộc').max(255),
  description: z.string().optional(),
  type: z.string(),
  priority: z.string(),
  deadline: z.string().optional(),
  location: z.string().optional(),
  attachmentIds: z.array(z.string()),
  assigneeMilitiaId: z.string().uuid('Vui lòng chọn người thực hiện'),
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

interface TaskCreateFormProps {
  onSuccess?: () => void
}

export function TaskCreateForm({ onSuccess }: TaskCreateFormProps) {
  const queryClient = useQueryClient()
  const [assigneeId, setAssigneeId] = useState('')
  const [militiaQuery, setMilitiaQuery] = useState('')
  // F6: store latest militiaQuery in a ref so createModal.onSubmit can read it
  //     without being stale — avoids syncing qcName on every debounced keystroke
  const militiaQueryRef = useRef('')
  const [qcName, setQcName] = useState('')
  const [qcCode, setQcCode] = useState(() => 'QS-E2E-' + Date.now().toString().slice(-6))
  const [qcUnit, setQcUnit] = useState('PHU_DINH')
  // US-SS-03 AC-6: inline validation errors for quick-create modal
  const [qcErrors, setQcErrors] = useState<{ code?: string; name?: string; unit?: string; server?: string }>({})
  // Extra options from quick-create — ensures selected chip shows immediately
  const [extraOptions, setExtraOptions] = useState<SmartSelectOption[]>([])
  // File attachment state
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string; name: string }[]>([])

  // F6: militiaQueryRef tracks the latest search query without extra setState.
  //     qcName (for modal pre-fill) is initialised from the ref — one state update
  //     per debounced search instead of two, since React 18 batches setState calls
  //     inside event handlers but NOT inside async/setTimeout callbacks (debounce).
  const handleSearch = useCallback((q: string) => {
    militiaQueryRef.current = q
    setMilitiaQuery(q)
    // Pre-fill the quick-create name field with whatever the user typed.
    // This is the only place qcName is synced from search — done here instead of
    // inside a separate useEffect to keep the update in the same batched cycle.
    if (q) setQcName(q)
  }, [])

  const { data: fetchedMilitiaOptions = [], isFetching: militiaLoading } = useQuery({
    queryKey: ['militia-search', militiaQuery],
    queryFn: () => militiaApi.search({ q: militiaQuery, limit: 20 }),
    enabled: true,
    select: (data) => data.map(toSmartSelectOption),
  })

  // Merge fetched options with any quick-created options (dedup by id)
  const militiaOptions = [
    ...fetchedMilitiaOptions,
    ...extraOptions.filter((eo) => !fetchedMilitiaOptions.some((fo) => fo.id === eo.id)),
  ]

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: 'other', priority: 'medium', attachmentIds: [] } })

  const createMutation = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: () => {
      toast.success('Tạo nhiệm vụ thành công')
      reset()
      setAssigneeId('')
      setMilitiaQuery('')
      setUploadedFiles([])
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onSuccess?.()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      if (msg === 'militia_no_user_account') {
        toast.error('Dân quân này chưa có tài khoản hệ thống. Vui lòng liên kết tài khoản trước khi giao việc.')
      } else {
        toast.error('Có lỗi xảy ra. Vui lòng thử lại.')
      }
    },
  })

  const handleAssigneeChange = useCallback(
    (id: string) => {
      setAssigneeId(id)
      setValue('assigneeMilitiaId', id, { shouldValidate: true })
    },
    [setValue],
  )

  const handleAssigneeClear = useCallback(() => {
    setAssigneeId('')
    setValue('assigneeMilitiaId', '', { shouldValidate: true })
  }, [setValue])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await client.post<{ fileId: string; url: string }>('/files/upload', fd)
        const newFile = { id: res.data.fileId, name: file.name }
        setUploadedFiles((prev) => {
          const updated = [...prev, newFile]
          setValue('attachmentIds', updated.map((f) => f.id))
          return updated
        })
      } catch {
        toast.error(`Không thể tải lên tệp: ${file.name}`)
      }
    }
  }

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => {
      const updated = prev.filter((f) => f.id !== id)
      setValue('attachmentIds', updated.map((f) => f.id))
      return updated
    })
  }

  const onSubmit = handleSubmit(({ attachmentIds: _a, location: _l, ...taskData }) => {
    createMutation.mutate(taskData)
  })

  return (
    <form
      data-testid="task-create-form"
      onSubmit={onSubmit}
      className="space-y-6 max-w-xl"
      noValidate
    >
      {/* Form header */}
      <div className="flex items-center gap-3 pb-4 border-b border-[#E2E8F0]">
        <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
          <ClipboardList size={20} className="text-[#C62828]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#0F172A]">Tạo nhiệm vụ mới</h2>
          <p className="text-xs text-[#64748B]">Điền đầy đủ thông tin bên dưới</p>
        </div>
      </div>

      {/* Task Info Card */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-4">
        <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide">Thông tin nhiệm vụ</h3>

        {/* Title */}
        <div>
          <Input
            id="task-title"
            data-testid="task-title-input"
            label="Tiêu đề *"
            placeholder="Nhập tiêu đề nhiệm vụ..."
            error={!!errors.title}
            errorMessage={errors.title?.message}
            {...register('title')}
          />
          {errors.title && (
            <p data-testid="task-title-error" className="text-xs text-red-500 mt-1">
              {errors.title.message}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label htmlFor="task-description" className="text-sm font-bold text-[#C62828]">
            Mô tả
          </label>
          <textarea
            id="task-description"
            data-testid="task-description-input"
            rows={3}
            placeholder="Mô tả chi tiết nhiệm vụ..."
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('description')}
          />
        </div>

        {/* Priority + Type row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="task-priority" className="text-sm font-bold text-[#C62828]">Độ ưu tiên</label>
            <select
              id="task-priority"
              data-testid="task-priority-select"
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
              {...register('priority')}
            >
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
              <option value="urgent">Khẩn cấp</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="task-type" className="text-sm font-bold text-[#C62828]">Loại nhiệm vụ</label>
            <select
              id="task-type"
              data-testid="task-type-select"
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
              {...register('type')}
            >
              <option value="patrol">Tuần tra</option>
              <option value="guard">Bảo vệ</option>
              <option value="inspection">Kiểm tra</option>
              <option value="support">Hỗ trợ</option>
              <option value="training">Tập huấn</option>
              <option value="admin">Hành chính</option>
              <option value="other">Khác</option>
            </select>
          </div>
        </div>

        {/* Deadline */}
        <div className="flex flex-col gap-1">
          <label htmlFor="task-due-date" className="text-sm font-bold text-[#C62828]">Hạn hoàn thành</label>
          <input
            id="task-due-date"
            type="date"
            data-testid="task-due-date-input"
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('deadline')}
          />
        </div>

        {/* Location */}
        <div className="flex flex-col gap-1">
          <label htmlFor="task-location" className="text-sm font-bold text-[#C62828]">Địa điểm</label>
          <input
            id="task-location"
            type="text"
            data-testid="task-location-input"
            placeholder="Nhập địa điểm thực hiện..."
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('location')}
          />
        </div>
      </div>

      {/* Attachments Card */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-3">
        <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide">Tệp đính kèm</h3>
        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
          data-testid="task-file-input"
          className="text-sm text-[#64748B] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[#E2E8F0] file:text-sm file:bg-white file:text-[#64748B] hover:file:bg-[#F8FAFC] file:cursor-pointer"
          onChange={handleFileUpload}
        />
        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {uploadedFiles.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-1 px-2 py-1 bg-[#FFEBEE] text-[#C62828] text-xs rounded-md border border-red-100">
                <Paperclip size={12} />
                {f.name}
                <button type="button" onClick={() => removeFile(f.id)} className="ml-1 hover:text-red-800 font-bold">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Assignee Card */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-3">
        <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide">Người thực hiện</h3>
        {/* US-SS-06 AC-1: militia SmartSelect for task assignee */}
        <SmartSelect
          name="assignee"
          label="Người thực hiện *"
          placeholder="Tìm dân quân theo tên, mã hoặc SĐT..."
          value={assigneeId}
          onChange={(id) => handleAssigneeChange(id)}
          onClear={handleAssigneeClear}
          options={militiaOptions}
          isLoading={militiaLoading}
          error={!!errors.assigneeMilitiaId}
          errorMessage={errors.assigneeMilitiaId?.message}
          required
          onSearch={handleSearch}
          createModal={{
            title: 'Thêm dân quân mới',
            content: (
              <QuickCreateMilitiaForm
                code={qcCode}
                name={qcName}
                unit={qcUnit}
                onCodeChange={(v) => { setQcCode(v); setQcErrors((e) => ({ ...e, code: undefined, server: undefined })) }}
                onNameChange={(v) => { setQcName(v); setQcErrors((e) => ({ ...e, name: undefined })) }}
                onUnitChange={(v) => { setQcUnit(v); setQcErrors((e) => ({ ...e, unit: undefined })) }}
                validationErrors={qcErrors}
              />
            ),
            onSubmit: async () => {
              const fullName = qcName.trim()
              const militiaCode = qcCode.trim()
              const unitCode = qcUnit.trim()
              // US-SS-03 AC-6: inline validation — do not close modal on missing fields
              const errs: typeof qcErrors = {}
              if (!militiaCode) errs.code = 'Mã dân quân là bắt buộc'
              if (!fullName) errs.name = 'Họ và tên là bắt buộc'
              if (!unitCode) errs.unit = 'Đơn vị là bắt buộc'
              if (Object.keys(errs).length > 0) {
                setQcErrors(errs)
                return null
              }
              try {
                setQcErrors({})
                const item = await militiaApi.quickCreate({ militiaCode, fullName, unitCode })
                const opt: SmartSelectOption = {
                  id: item.id,
                  label: `${item.militiaCode} — ${item.fullName}`,
                  sublabel: [item.phone, item.unitName].filter(Boolean).join(' | '),
                  meta: item as unknown as Record<string, unknown>,
                }
                // Add to extraOptions so the selected chip renders immediately
                setExtraOptions((prev) => [...prev, opt])
                // Reset quick-create fields
                setQcName('')
                setQcCode('QS-E2E-' + Date.now().toString().slice(-6))
                setQcErrors({})
                return opt
              } catch (err: unknown) {
                // US-SS-03 AC-7: show inline error for duplicate militia_code
                const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
                if (msg === 'militia_code_duplicate') {
                  setQcErrors({ code: 'Mã dân quân đã tồn tại. Vui lòng dùng mã khác.' })
                } else {
                  setQcErrors({ server: 'Không thể tạo dân quân. Vui lòng kiểm tra lại thông tin.' })
                }
                return null
              }
            },
          }}
        />
      </div>

      {/* Success indicator */}
      {createMutation.isSuccess && (
        <div data-testid="task-create-success" className="text-sm text-[#2E7D32] font-medium bg-[#E8F5E9] px-4 py-3 rounded-lg border border-green-200">
          Nhiệm vụ đã được tạo thành công!
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => { reset(); setAssigneeId('') }}
          className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          Đặt lại
        </button>
        <Button
          type="submit"
          data-testid="task-submit-btn"
          loading={createMutation.isPending}
        >
          Tạo nhiệm vụ
        </Button>
      </div>
    </form>
  )
}
