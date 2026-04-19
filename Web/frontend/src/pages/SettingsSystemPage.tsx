// Admin-only: read-only display of system settings
// Edit mode gated until audit trail is in place (Phase 3 decision)
import { useQuery } from '@tanstack/react-query'
import { Settings, Info } from 'lucide-react'
import client from '@/api/client'

interface SystemSettings {
  appName: string
  version: string
  maintenanceMode: boolean
  maxLoginAttempts: number
  sessionTimeoutMinutes: number
  passwordMinLength: number
  requireTwoFactor: boolean
  allowedFileTypes: string[]
  maxFileSizeMb: number
}

async function getSystemSettings(): Promise<SystemSettings> {
  const res = await client.get('/system-settings')
  return res.data
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
  const { data, isLoading, isError } = useQuery({
    queryKey: ['system-settings'],
    queryFn: getSystemSettings,
  })

  if (isLoading) return <div className="p-6 text-center text-gray-500">Đang tải...</div>

  return (
    <div className="p-6 space-y-6" data-testid="settings-system-page">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Cài Đặt Hệ Thống</h1>
          <p className="text-sm text-gray-600 mt-1">Cấu hình chung cho toàn bộ hệ thống MMS</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
          <Info size={14} />
          Chế độ xem — chỉnh sửa sẽ mở sau khi audit trail hoàn thiện
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Không thể tải cài đặt hệ thống.
        </div>
      )}

      {data && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 bg-gray-50 rounded-t-lg border-b border-gray-200">
            <Settings size={18} className="text-[#1F3A5F]" />
            <p className="text-sm font-semibold text-gray-700">Thông số hệ thống</p>
          </div>
          <div className="px-6 py-2">
            <SettingRow label="Tên ứng dụng" value={data.appName} />
            <SettingRow label="Phiên bản" value={data.version} />
            <SettingRow label="Chế độ bảo trì" value={data.maintenanceMode ? 'Đang bật' : 'Tắt'} />
            <SettingRow label="Số lần đăng nhập sai tối đa" value={data.maxLoginAttempts} />
            <SettingRow label="Thời gian hết phiên (phút)" value={data.sessionTimeoutMinutes} />
            <SettingRow label="Độ dài mật khẩu tối thiểu" value={data.passwordMinLength} />
            <SettingRow label="Bắt buộc xác thực 2 yếu tố" value={data.requireTwoFactor ? 'Có' : 'Không'} />
            <SettingRow label="Kích thước file tối đa (MB)" value={data.maxFileSizeMb} />
            <SettingRow label="Loại file cho phép" value={data.allowedFileTypes?.join(', ')} />
          </div>
        </div>
      )}
    </div>
  )
}
