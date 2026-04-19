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

function NumberField({
  label, desc, value, min, max, onChange,
}: {
  label: string; desc: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
      />
    </div>
  )
}

export function SettingsChiTieuPage() {
  const queryClient = useQueryClient()
  const [targets, setTargets] = useState<KpiTargets>(DEFAULTS)

  const { data: loadedTargets, isLoading } = useQuery({
    queryKey: ['settings-kpi-targets'],
    queryFn: getKpiTargets,
  })

  useEffect(() => {
    if (loadedTargets) setTargets(loadedTargets)
  }, [loadedTargets])

  const mutation = useMutation({
    mutationFn: () => updateKpiTargets(targets),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-kpi-targets'] })
      toast.success('Đã lưu chỉ tiêu KPI')
    },
    onError: () => toast.error('Lưu thất bại'),
  })

  if (isLoading) return <div className="p-6 text-center text-gray-500">Đang tải...</div>

  const set = (key: keyof KpiTargets) => (v: number) => setTargets((t) => ({ ...t, [key]: v }))

  return (
    <div className="p-6 space-y-6" data-testid="settings-chitieu-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Chỉ Tiêu KPI</h1>
          <p className="text-sm text-gray-600 mt-1">Cài đặt ngưỡng đánh giá hiệu suất cho DQTV</p>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="px-4 py-2 bg-[#1F3A5F] text-white rounded-lg hover:bg-[#2d5380] text-sm font-medium flex items-center gap-2 disabled:opacity-60"
          data-testid="save-chitieu-btn"
        >
          <Save size={16} />
          {mutation.isPending ? 'Đang lưu...' : 'Lưu chỉ tiêu'}
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <Target size={18} className="text-[#1F3A5F]" />
          <p className="text-sm font-semibold text-gray-700">Ngưỡng KPI theo kỳ đánh giá</p>
        </div>

        <NumberField label="Số ngày chấm công tối thiểu" desc="Ngày làm việc yêu cầu mỗi tháng" value={targets.minAttendanceDays} min={1} max={31} onChange={set('minAttendanceDays')} />
        <NumberField label="Số nhiệm vụ hoàn thành tối thiểu" desc="Số nhiệm vụ cần hoàn thành mỗi kỳ" value={targets.minTasksCompleted} min={0} max={100} onChange={set('minTasksCompleted')} />
        <NumberField label="Số nhiệm vụ quá hạn tối đa" desc="Giới hạn nhiệm vụ được phép quá hạn" value={targets.maxOverdueTasks} min={0} max={20} onChange={set('maxOverdueTasks')} />
        <NumberField label="Giờ huấn luyện tối thiểu" desc="Tổng giờ huấn luyện yêu cầu mỗi năm" value={targets.minTrainingHours} min={0} max={500} onChange={set('minTrainingHours')} />

        <div className="flex items-center justify-between pt-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Chu kỳ đánh giá</p>
            <p className="text-xs text-gray-500 mt-0.5">Tần suất đánh giá KPI cho DQTV</p>
          </div>
          <select
            value={targets.evaluationPeriod}
            onChange={(e) => setTargets((t) => ({ ...t, evaluationPeriod: e.target.value as KpiTargets['evaluationPeriod'] }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
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
