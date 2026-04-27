// TODO: Install react-leaflet for interactive map
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import { MapPin, Wifi, WifiOff, RefreshCw } from 'lucide-react'

interface GpsLocation {
  id: string
  userId: string
  name: string
  status: 'online' | 'offline'
  district?: string
  lat?: number
  lng?: number
  lastUpdate: string
  accuracy?: number
}

function formatTimestamp(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} giờ trước`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function GPSTrackingPage() {
  const { can } = useRbac()

  if (!can.viewGps) return <Navigate to="/forbidden" replace />

  const { data: locations = [], isLoading, dataUpdatedAt } = useQuery<GpsLocation[]>({
    queryKey: ['gps-locations'],
    queryFn: () => client.get('/gps/live').then((r) => r.data),
    refetchInterval: 30000,
  })

  const onlineCount = locations.filter((l) => l.status === 'online').length
  const offlineCount = locations.filter((l) => l.status === 'offline').length

  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt) : null

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="gps-page">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              <MapPin size={24} className="text-[#C62828]" />
              Theo dõi GPS
            </h1>
            <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – Giám sát vị trí DQTV</p>
          </div>
          {lastRefresh && (
            <div className="flex items-center gap-2 text-xs text-[#64748B]">
              <RefreshCw size={12} />
              Cập nhật: {formatTimestamp(lastRefresh.toISOString())}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Tổng</p>
            <p className="text-3xl font-bold text-[#0F172A]">{locations.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Trực tuyến</p>
            <p className="text-3xl font-bold text-[#2E7D32]">{onlineCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Ngoại tuyến</p>
            <p className="text-3xl font-bold text-[#64748B]">{offlineCount}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Map placeholder */}
          <div
            className="bg-[#2E7D32]/10 border-2 border-dashed border-[#2E7D32]/30 rounded-xl flex flex-col items-center justify-center min-h-[400px] p-8"
            data-testid="gps-map-placeholder"
          >
            <MapPin size={48} className="text-[#2E7D32] mb-4" />
            <p className="text-lg font-semibold text-[#2E7D32]">Bản đồ GPS</p>
            <p className="text-sm text-[#64748B] mt-2 text-center">
              Cài đặt react-leaflet để hiển thị bản đồ tương tác
            </p>
            <p className="text-xs text-[#64748B] mt-1">Phường Phú Định – Quận 8 – TP.HCM</p>
            {onlineCount > 0 && (
              <div className="mt-4 flex items-center gap-2 bg-[#2E7D32]/20 px-4 py-2 rounded-lg">
                <span className="w-2 h-2 bg-[#2E7D32] rounded-full animate-pulse" />
                <span className="text-sm text-[#2E7D32] font-medium">{onlineCount} thành viên đang trực tuyến</span>
              </div>
            )}
          </div>

          {/* Member list */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-sm font-semibold text-[#0F172A]">Danh sách thành viên</h2>
            </div>
            <div className="overflow-y-auto max-h-[380px]">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-9 h-9 bg-gray-200 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                        <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : locations.length === 0 ? (
                <div className="p-12 text-center text-[#64748B] text-sm">
                  Không có dữ liệu GPS
                </div>
              ) : (
                <ul className="divide-y divide-[#F1F5F9]">
                  {locations.map((loc) => (
                    <li
                      key={loc.id}
                      className="px-5 py-4 flex items-center gap-3 hover:bg-[#F8FAFC] transition-colors"
                      data-testid={`gps-member-${loc.userId}`}
                    >
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                          loc.status === 'online' ? 'bg-[#C62828]' : 'bg-[#64748B]'
                        }`}
                      >
                        {initials(loc.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#0F172A] truncate">{loc.name}</p>
                        <p className="text-xs text-[#64748B]">
                          {loc.district ?? 'Phú Định'} · {formatTimestamp(loc.lastUpdate)}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {loc.status === 'online' ? (
                          <>
                            <Wifi size={14} className="text-[#2E7D32]" />
                            <span className="text-xs font-medium text-[#2E7D32]">Online</span>
                          </>
                        ) : (
                          <>
                            <WifiOff size={14} className="text-[#64748B]" />
                            <span className="text-xs font-medium text-[#64748B]">Offline</span>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
