import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Save } from 'lucide-react'
import { toast } from 'sonner'
import client from '@/api/client'

interface NotificationPrefs {
  taskAssigned: boolean
  taskOverdue: boolean
  attendanceReminder: boolean
  leaveApproval: boolean
  systemAnnouncements: boolean
  sosAlerts: boolean
}

async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const res = await client.get('/settings/notifications')
  return res.data
}
async function updateNotificationPrefs(prefs: NotificationPrefs): Promise<NotificationPrefs> {
  const res = await client.put('/settings/notifications', prefs)
  return res.data
}

const PREF_LABELS: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
  { key: 'taskAssigned',        label: 'Nhiệm vụ mới',         desc: 'Nhận thông báo khi được giao nhiệm vụ mới' },
  { key: 'taskOverdue',         label: 'Nhiệm vụ quá hạn',     desc: 'Cảnh báo khi nhiệm vụ sắp hoặc đã quá hạn' },
  { key: 'attendanceReminder',  label: 'Nhắc nhở chấm công',   desc: 'Nhắc nhở chấm công đầu và cuối ngày' },
  { key: 'leaveApproval',       label: 'Đơn nghỉ phép',        desc: 'Thông báo khi đơn nghỉ phép được duyệt / từ chối' },
  { key: 'systemAnnouncements', label: 'Thông báo hệ thống',   desc: 'Tin tức và cập nhật từ hệ thống MMS' },
  { key: 'sosAlerts',           label: 'Cảnh báo SOS',         desc: 'Cảnh báo khẩn cấp SOS từ các thành viên' },
]

const DEFAULT_PREFS: NotificationPrefs = {
  taskAssigned: true, taskOverdue: true, attendanceReminder: true,
  leaveApproval: true, systemAnnouncements: true, sosAlerts: true,
}

export function SettingsNotificationsPage() {
  const queryClient = useQueryClient()
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)

  const { data: loadedPrefs, isLoading } = useQuery({
    queryKey: ['settings-notifications'],
    queryFn: getNotificationPrefs,
  })

  useEffect(() => {
    if (loadedPrefs) setPrefs(loadedPrefs)
  }, [loadedPrefs])

  const mutation = useMutation({
    mutationFn: () => updateNotificationPrefs(prefs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-notifications'] })
      toast.success('Đã lưu cài đặt thông báo')
    },
    onError: () => toast.error('Lưu thất bại, vui lòng thử lại'),
  })

  return (
    <div className="p-6 space-y-6" data-testid="settings-notifications-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Cài Đặt Thông Báo</h1>
          <p className="text-sm text-gray-600 mt-1">Quản lý các loại thông báo bạn muốn nhận</p>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || isLoading}
          className="px-4 py-2 bg-[#1F3A5F] text-white rounded-lg hover:bg-[#2d5380] text-sm font-medium flex items-center gap-2 disabled:opacity-60"
          data-testid="save-notifications-btn"
        >
          <Save size={16} />
          {mutation.isPending ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>

      {isLoading && <div className="text-center text-gray-400 py-8 text-sm">Đang tải...</div>}

      {!isLoading && <div className="bg-white rounded-lg border border-gray-200 shadow-sm divide-y divide-gray-100">
        <div className="px-6 py-4 flex items-center gap-3 bg-gray-50 rounded-t-lg">
          <Bell size={18} className="text-[#1F3A5F]" />
          <p className="text-sm font-semibold text-gray-700">Loại thông báo</p>
        </div>
        {PREF_LABELS.map(({ key, label, desc }) => (
          <div key={key} className="px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
            <button
              role="switch"
              aria-checked={prefs[key]}
              onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
              data-testid={`toggle-${key}`}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                prefs[key] ? 'bg-[#1F3A5F]' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  prefs[key] ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>}
    </div>
  )
}
