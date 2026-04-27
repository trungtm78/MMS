import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target, Save } from 'lucide-react'
import { toast } from 'sonner'
import client from '@/api/client'

interface KpiTargets {
  minAttendanceDays: number
  minTasksCompleted: number
  maxOverdueTasks: number
  minTrainingHours: number
  evaluationPeriod: 'monthly' | 'quarterly' | 'yearly'
}

async function getKpiTargets(): Promise<KpiTargets> {
  const res = await client.get('/settings/kpi-targets')
  return res.data
}
async function updateKpiTargets(data: KpiTargets): Promise<KpiTargets> {
  const res = await client.put('/settings/kpi-targets', data)
  return res.data
}

const DEFAULTS: KpiTargets = {
  minAttendanceDays: 22, minTasksCompleted: 10, maxOverdueTasks: 2,
  minTrainingHours: 40, evaluationPeriod: 'monthly',
}

interface NumberFieldProps {
  label: string
  desc: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  error?: string
}

function NumberField({ label, desc, value, min, max, onChange, error }: NumberFieldProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-[#E2E8F0] last:border-0">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-[#0F172A]">{label}</p>
        <p className="text-xs text-[#64748B] mt-0.5">{desc}</p>
        {error && <p className="text-xs text-[#C62828] mt-1">{error}</p>}
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-20 px-3 py-2 border rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] ${
          error ? 'border-[#C62828] bg-red-50' : 'border-[#E2E8F0]'
        }`}
      />
    </div>
  )
}

export function SettingsChiTieuPage() {
  const queryClient = useQueryClient()
  const [targets, setTargets] = useState<KpiTargets>(DEFAULTS)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof KpiTargets, string>>>({})

  const { data: loadedTargets, isLoading } = useQuery({
    queryKey: ['settings-kpi-targets'],
    queryFn: getKpiTargets,
  })

  useEffect(() => {
    if (loadedTargets) setTargets(loadedTargets)
  }, [loadedTargets])

  function validate(): boolean {
    const e: Partial<Record<keyof KpiTargets, string>> = {}
    if (targets.minAttendanceDays < 1 || targets.minAttendanceDays > 31) {
      e.minAttendanceDays = 'Phải từ 1 đến 31 ngày'
    }
    if (targets.minTasksCompleted < 0 || targets.minTasksCompleted > 100) {
      e.minTasksCompleted = 'Phải từ 0 đến 100 nhiệm vụ'
    }
    if (targets.maxOverdueTasks < 0 || targets.maxOverdueTasks > 20) {
      e.maxOverdueTasks = 'Phải từ 0 đến 20 nhiệm vụ'
    }
    if (targets.minTrainingHours < 0 || targets.minTrainingHours > 500) {
      e.minTrainingHours = 'Phải từ 0 đến 500 giờ'
    }
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  const mutation = useMutation({
    mutationFn: () => updateKpiTargets(targets),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-kpi-targets'] })
      toast.success('Đã lưu chỉ tiêu KPI')
    },
    onError: () => toast.error('Lưu thất bại'),
  })

  function handleSave() {
    if (validate()) mutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="p-6 bg-[#F8FAFC] min-h-full">
        <div className="text-center text-[#64748B] py-12 text-sm">Đang tải...</div>
      </div>
    )
  }

  const set = (key: keyof KpiTargets) => (v: number) => {
    setTargets((t) => ({ ...t, [key]: v }))
    setFieldErrors((e) => ({ ...e, [key]: undefined }))
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="settings-chitieu-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Chỉ Tiêu KPI</h1>
          <p className="text-sm text-[#64748B] mt-1">Cài đặt ngưỡng đánh giá hiệu suất cho DQTV</p>
        </div>
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60 transition-colors"
          data-testid="save-chitieu-btn"
        >
          <Save size={16} />
          {mutation.isPending ? 'Đang lưu...' : 'Lưu chỉ tiêu'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
            <Target size={18} className="text-[#C62828]" />
          </div>
          <p className="text-sm font-semibold text-[#0F172A]">Ngưỡng KPI theo kỳ đánh giá</p>
        </div>

        <NumberField
          label="Số ngày chấm công tối thiểu"
          desc="Ngày làm việc yêu cầu mỗi tháng"
          value={targets.minAttendanceDays}
          min={1} max={31}
          onChange={set('minAttendanceDays')}
          error={fieldErrors.minAttendanceDays}
        />
        <NumberField
          label="Số nhiệm vụ hoàn thành tối thiểu"
          desc="Số nhiệm vụ cần hoàn thành mỗi kỳ"
          value={targets.minTasksCompleted}
          min={0} max={100}
          onChange={set('minTasksCompleted')}
          error={fieldErrors.minTasksCompleted}
        />
        <NumberField
          label="Số nhiệm vụ quá hạn tối đa"
          desc="Giới hạn nhiệm vụ được phép quá hạn"
          value={targets.maxOverdueTasks}
          min={0} max={20}
          onChange={set('maxOverdueTasks')}
          error={fieldErrors.maxOverdueTasks}
        />
        <NumberField
          label="Giờ huấn luyện tối thiểu"
          desc="Tổng giờ huấn luyện yêu cầu mỗi năm"
          value={targets.minTrainingHours}
          min={0} max={500}
          onChange={set('minTrainingHours')}
          error={fieldErrors.minTrainingHours}
        />

        <div className="flex items-center justify-between pt-4">
          <div>
            <p className="text-sm font-medium text-[#0F172A]">Chu kỳ đánh giá</p>
            <p className="text-xs text-[#64748B] mt-0.5">Tần suất đánh giá KPI cho DQTV</p>
          </div>
          <select
            value={targets.evaluationPeriod}
            onChange={(e) => setTargets((t) => ({ ...t, evaluationPeriod: e.target.value as KpiTargets['evaluationPeriod'] }))}
            className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
            data-testid="evaluation-period-select"
          >
            <option value="monthly">Hàng tháng</option>
            <option value="quarterly">Hàng quý</option>
            <option value="yearly">Hàng năm</option>
          </select>
        </div>
      </div>
    </div>
  )
}
