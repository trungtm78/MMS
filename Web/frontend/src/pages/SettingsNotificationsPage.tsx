import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
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

  function handleToggle(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    // Call mutation immediately on each toggle
    mutation.mutate()
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="settings-notifications-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Cài Đặt Thông Báo</h1>
          <p className="text-sm text-[#64748B] mt-1">Quản lý các loại thông báo bạn muốn nhận</p>
        </div>
      </div>

      {isLoading && <div className="text-center text-[#64748B] py-8 text-sm">Đang tải...</div>}

      {!isLoading && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden divide-y divide-[#E2E8F0]">
          {/* Section header */}
          <div className="px-6 py-4 flex items-center gap-3 bg-[#F8FAFC]">
            <Bell size={18} className="text-[#C62828]" />
            <p className="text-sm font-semibold text-[#0F172A]">Loại thông báo</p>
          </div>

          {PREF_LABELS.map(({ key, label, desc }) => (
            <div key={key} className="px-6 py-4 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors">
              <div>
                <p className="text-sm font-medium text-[#0F172A]">{label}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{desc}</p>
              </div>
              {/* Toggle styled with #C62828 when active */}
              <button
                role="switch"
                aria-checked={prefs[key]}
                onClick={() => handleToggle(key)}
                data-testid={`toggle-${key}`}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:ring-offset-1 ${
                  prefs[key] ? 'bg-[#C62828]' : 'bg-[#E2E8F0]'
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
        </div>
      )}
    </div>
  )
}
