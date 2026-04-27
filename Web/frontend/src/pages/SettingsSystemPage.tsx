// Admin-only: system settings with edit mode for system_admin
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Edit, Save, X, AlertTriangle } from 'lucide-react'
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

interface AlertDialogProps {
  title: string
  description: string
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
}

function AlertDialog({ title, description, onConfirm, onCancel, isPending }: AlertDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-[#C62828]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
            <p className="text-sm text-[#64748B] mt-1">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            data-testid="confirm-save-btn"
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Đang lưu...' : 'Xác nhận lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-[#E2E8F0] last:border-0">
      <p className="text-sm text-[#64748B]">{label}</p>
      <p className="text-sm font-medium text-[#0F172A]">{value}</p>
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
  const [showConfirm, setShowConfirm] = useState(false)

  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-settings'] })
      setIsEditing(false)
      setSaveError(null)
      setShowConfirm(false)
    },
    onError: () => {
      setSaveError('Không thể lưu cài đặt. Vui lòng thử lại.')
      setShowConfirm(false)
    },
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
    // Show AlertDialog confirm before destructive op
    setShowConfirm(true)
  }

  function handleConfirmSave() {
    mutation.mutate(draft)
  }

  if (isLoading) {
    return (
      <div className="p-6 bg-[#F8FAFC] min-h-full">
        <div className="text-center text-[#64748B] py-12 text-sm">Đang tải...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="settings-system-page">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Cài Đặt Hệ Thống</h1>
          <p className="text-sm text-[#64748B] mt-1">Cấu hình chung cho toàn bộ hệ thống MMS</p>
        </div>
        {isAdmin && !isEditing && (
          <button
            onClick={startEdit}
            data-testid="edit-settings-btn"
            className="flex items-center gap-2 border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828] rounded-lg px-4 py-2 text-sm font-medium transition-colors bg-white"
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
              className="flex items-center gap-2 border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              <X size={15} />
              Huỷ
            </button>
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              data-testid="save-settings-btn"
              className="flex items-center gap-2 bg-[#2E7D32] text-white hover:bg-[#1B5E20] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <Save size={15} />
              {mutation.isPending ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        )}
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          Không thể tải cài đặt hệ thống.
        </div>
      )}

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]" data-testid="save-error">
          {saveError}
        </div>
      )}

      {data && (
        <div className="bg-white rounded-xl border border-[#E2E8F0]">
          <div className="flex items-center gap-3 px-6 py-4 bg-[#F8FAFC] rounded-t-xl border-b border-[#E2E8F0]">
            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
              <Settings size={16} className="text-[#C62828]" />
            </div>
            <p className="text-sm font-semibold text-[#0F172A]">
              {isEditing ? 'Chỉnh sửa cài đặt hệ thống' : 'Thông số hệ thống'}
            </p>
          </div>
          <div className="px-6 py-2">
            {isEditing ? (
              <div className="py-4 space-y-4">
                {EDITABLE_FIELDS.map(({ key, label, type }) => (
                  <div key={key} className="grid grid-cols-2 gap-4 items-center">
                    <label className="text-sm text-[#64748B]">{label}</label>
                    <input
                      type={type}
                      value={draft[key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      data-testid={`setting-input-${key}`}
                      className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
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

      {/* Confirm AlertDialog */}
      {showConfirm && (
        <AlertDialog
          title="Xác nhận lưu cài đặt"
          description="Thao tác này sẽ thay đổi cấu hình toàn bộ hệ thống MMS. Bạn chắc chắn muốn tiếp tục?"
          onConfirm={handleConfirmSave}
          onCancel={() => setShowConfirm(false)}
          isPending={mutation.isPending}
        />
      )}
    </div>
  )
}
