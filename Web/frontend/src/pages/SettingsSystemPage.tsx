// Admin-only: system settings with edit mode for system_admin
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Edit, Save, X } from 'lucide-react'
import client from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'

type SettingsMap = Record<string, string>

const EDITABLE_FIELDS: { key: string; label: string; type: 'number' | 'text' }[] = [
  { key: 'session_timeout_minutes', label: 'Thời gian hết phiên (phút)', type: 'number' },
  { key: 'password_min_length', label: 'Độ dài mật khẩu tối thiểu', type: 'number' },
  { key: 'max_login_attempts', label: 'Số lần đăng nhập sai tối đa', type: 'number' },
  { key: 'gps_retention_days', label: 'Lưu giữ GPS (ngày)', type: 'number' },
  { key: 'min_wage_region_1', label: 'Lương tối thiểu vùng I (VNĐ)', type: 'number' },
  { key: 'training_daily_allowance_rate', label: 'Hệ số phụ cấp huấn luyện/ngày', type: 'text' },
]

async function fetchSettings(): Promise<SettingsMap> {
  const res = await client.get('/admin/system-settings')
  return res.data
}

async function saveSettings(dto: SettingsMap): Promise<void> {
  await client.patch('/admin/system-settings', dto)
}

function SettingRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-gray-100 last:border-0">
      <p className="text-sm text-gray-700">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  )
}

export function SettingsSystemPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'system_admin'

  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['system-settings'],
    queryFn: fetchSettings,
  })

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<SettingsMap>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-settings'] })
      setIsEditing(false)
      setSaveError(null)
    },
    onError: () => setSaveError('Không thể lưu cài đặt. Vui lòng thử lại.'),
  })

  function startEdit() {
    const initial: SettingsMap = {}
    EDITABLE_FIELDS.forEach(({ key }) => {
      initial[key] = data?.[key] ?? ''
    })
    setDraft(initial)
    setSaveError(null)
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setSaveError(null)
  }

  function handleSave() {
    mutation.mutate(draft)
  }

  if (isLoading) return <div className="p-6 text-center text-gray-500">Đang tải...</div>

  return (
    <div className="p-6 space-y-6" data-testid="settings-system-page">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Cài Đặt Hệ Thống</h1>
          <p className="text-sm text-gray-600 mt-1">Cấu hình chung cho toàn bộ hệ thống MMS</p>
        </div>
        {isAdmin && !isEditing && (
          <button
            onClick={startEdit}
            data-testid="edit-settings-btn"
            className="flex items-center gap-2 px-4 py-2 bg-[#1F3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#162d4e] transition-colors"
          >
            <Edit size={15} />
            Chỉnh sửa
          </button>
        )}
        {isEditing && (
          <div className="flex gap-2">
            <button
              onClick={cancelEdit}
              data-testid="cancel-settings-btn"
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <X size={15} />
              Huỷ
            </button>
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              data-testid="save-settings-btn"
              className="flex items-center gap-2 px-4 py-2 bg-[#2E7D32] text-white rounded-lg text-sm font-medium hover:bg-[#1B5E20] disabled:opacity-50"
            >
              <Save size={15} />
              {mutation.isPending ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        )}
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Không thể tải cài đặt hệ thống.
        </div>
      )}

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700" data-testid="save-error">
          {saveError}
        </div>
      )}

      {data && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 bg-gray-50 rounded-t-lg border-b border-gray-200">
            <Settings size={18} className="text-[#1F3A5F]" />
            <p className="text-sm font-semibold text-gray-700">
              {isEditing ? 'Chỉnh sửa cài đặt hệ thống' : 'Thông số hệ thống'}
            </p>
          </div>
          <div className="px-6 py-2">
            {isEditing ? (
              <div className="py-4 space-y-4">
                {EDITABLE_FIELDS.map(({ key, label, type }) => (
                  <div key={key} className="grid grid-cols-2 gap-4 items-center">
                    <label className="text-sm text-gray-700">{label}</label>
                    <input
                      type={type}
                      value={draft[key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      data-testid={`setting-input-${key}`}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {EDITABLE_FIELDS.map(({ key, label }) => (
                  <SettingRow key={key} label={label} value={data[key] ?? '—'} />
                ))}
                {Object.entries(data)
                  .filter(([k]) => !EDITABLE_FIELDS.some((f) => f.key === k))
                  .map(([k, v]) => (
                    <SettingRow key={k} label={k} value={String(v)} />
                  ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
