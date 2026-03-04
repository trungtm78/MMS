import { ArrowLeft, RefreshCw, MapPin, ZoomIn, ZoomOut, Layers, X, Phone, MessageCircle, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface GPSTrackingProps {
  onNavigate: (screen: string) => void;
}

const dqtvLocations = [
  { id: 1, name: 'Nguyễn Văn An', status: 'online', lat: 10.7769, lng: 106.7009, speed: '3.5 km/h', battery: 85, task: 'Tuần tra', location: 'Chợ Bến Thành, KP1', updated: '2 phút trước' },
  { id: 2, name: 'Trần Thị Bình', status: 'online', lat: 10.7789, lng: 106.7029, speed: '2.1 km/h', battery: 92, task: 'Tuyên truyền', location: 'Đường Lê Lợi', updated: '1 phút trước' },
  { id: 3, name: 'Lê Văn Cường', status: 'stationary', lat: 10.7749, lng: 106.6989, speed: '0 km/h', battery: 45, task: null, location: 'Công viên 30/4', updated: '35 phút trước' },
  { id: 4, name: 'Phạm Thị Dung', status: 'online', lat: 10.7809, lng: 106.7049, speed: '4.2 km/h', battery: 78, task: 'Xử lý sự vụ', location: 'Đường Nguyễn Huệ', updated: '1 phút trước' },
  { id: 5, name: 'Hoàng Văn Hải', status: 'offline', lat: 10.7729, lng: 106.6969, speed: '-', battery: 12, task: null, location: 'Khu vực 3', updated: '2 giờ trước' },
];

export default function GPSTracking({ onNavigate }: GPSTrackingProps) {
  const [selectedDQTV, setSelectedDQTV] = useState<number | null>(null);
  const [filter, setFilter] = useState('all');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10B981';
      case 'stationary': return '#F59E0B';
      case 'offline': return '#EF4444';
      default: return '#64748B';
    }
  };

  const selectedPerson = selectedDQTV ? dqtvLocations.find(d => d.id === selectedDQTV) : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] relative">
      {/* Map Area */}
      <div className="w-full h-screen bg-gradient-to-br from-[#E8F4F8] to-[#D0E8F0] relative">
        {/* Simulated Map Background */}
        <div className="absolute inset-0 opacity-30">
          <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMCIgb3BhY2l0eT0iMC4xIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')]"></div>
        </div>

        {/* DQTV Markers */}
        {dqtvLocations.map((dqtv, index) => (
          <button
            key={dqtv.id}
            onClick={() => setSelectedDQTV(dqtv.id)}
            className="absolute transition-transform hover:scale-110"
            style={{
              left: `${30 + index * 15}%`,
              top: `${35 + (index % 3) * 15}%`,
            }}
          >
            <div className="relative">
              <div
                className="w-10 h-10 rounded-full border-4 flex items-center justify-center bg-white"
                style={{ borderColor: getStatusColor(dqtv.status) }}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                  {dqtv.name.split(' ').pop()?.charAt(0)}
                </div>
              </div>
              {dqtv.status === 'online' && (
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#10B981] rounded-full border-2 border-white animate-pulse"></div>
              )}
            </div>
          </button>
        ))}

        {/* Floating Header */}
        <div className="absolute top-0 left-0 right-0 px-4 pt-12 pb-4">
          <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] rounded-xl p-3 shadow-lg border-2 border-[#DC2626]">
            <div className="flex items-center justify-between">
              <button onClick={() => onNavigate('dashboard')} className="p-1">
                <ArrowLeft className="text-[#DC2626]" size={24} />
              </button>
              <div className="flex-1 text-center">
                <h1 className="text-lg font-extrabold text-[#DC2626]">GPS Tracking</h1>
                <p className="text-xs text-[#0F172A] font-semibold">Cập nhật: 14:25</p>
              </div>
              <button className="p-1">
                <RefreshCw className="text-[#DC2626]" size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Map Controls */}
        <div className="absolute right-4 top-32 flex flex-col gap-2">
          <button className="w-10 h-10 bg-white rounded-lg shadow-md flex items-center justify-center hover:bg-[#F8FAFC]">
            <MapPin className="text-[#366092]" size={20} />
          </button>
          <button className="w-10 h-10 bg-white rounded-lg shadow-md flex items-center justify-center hover:bg-[#F8FAFC]">
            <ZoomIn className="text-[#366092]" size={20} />
          </button>
          <button className="w-10 h-10 bg-white rounded-lg shadow-md flex items-center justify-center hover:bg-[#F8FAFC]">
            <ZoomOut className="text-[#366092]" size={20} />
          </button>
          <button className="w-10 h-10 bg-white rounded-lg shadow-md flex items-center justify-center hover:bg-[#F8FAFC]">
            <Layers className="text-[#366092]" size={20} />
          </button>
        </div>

        {/* Filter Chips */}
        <div className="absolute top-28 left-4 right-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shadow-md ${
              filter === 'all'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B]'
            }`}
          >
            All (28)
          </button>
          <button
            onClick={() => setFilter('online')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shadow-md flex items-center gap-2 ${
              filter === 'online'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B]'
            }`}
          >
            <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
            On Duty (20)
          </button>
          <button
            onClick={() => setFilter('moving')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shadow-md flex items-center gap-2 ${
              filter === 'moving'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B]'
            }`}
          >
            <div className="w-2 h-2 bg-[#3B82F6] rounded-full animate-pulse"></div>
            Moving (12)
          </button>
          <button
            onClick={() => setFilter('offline')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shadow-md flex items-center gap-2 ${
              filter === 'offline'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B]'
            }`}
          >
            <div className="w-2 h-2 bg-[#EF4444] rounded-full"></div>
            Offline (5)
          </button>
        </div>

        {/* Info Popup */}
        {selectedPerson && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 max-w-[calc(100%-2rem)]">
            <div className="bg-white rounded-xl shadow-2xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                    {selectedPerson.name.split(' ').pop()?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#0F172A]">{selectedPerson.name}</h3>
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs text-white font-medium"
                      style={{ backgroundColor: getStatusColor(selectedPerson.status) }}
                    >
                      {selectedPerson.status === 'online' ? 'Online' : selectedPerson.status === 'stationary' ? 'Dừng' : 'Offline'}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedDQTV(null)} className="p-1">
                  <X className="text-[#64748B]" size={20} />
                </button>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="text-[#64748B]" size={16} />
                  <span className="text-[#0F172A]">{selectedPerson.location}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[#64748B]">
                  <span>Cập nhật: {selectedPerson.updated}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-[#64748B]">Tốc độ:</span>
                    <span className="font-medium text-[#0F172A]">{selectedPerson.speed}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[#64748B]">Pin:</span>
                    <span className="font-medium text-[#0F172A]">{selectedPerson.battery}%</span>
                  </div>
                </div>
                {selectedPerson.task && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[#64748B]">Nhiệm vụ:</span>
                    <span className="px-2 py-1 bg-[#EFF6FF] text-[#366092] rounded text-xs font-medium">
                      {selectedPerson.task}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button className="flex flex-col items-center justify-center py-2 bg-[#366092] text-white rounded-lg text-xs font-medium">
                  <Phone size={18} className="mb-1" />
                  Gọi
                </button>
                <button className="flex flex-col items-center justify-center py-2 border border-[#366092] text-[#366092] rounded-lg text-xs font-medium">
                  <MessageCircle size={18} className="mb-1" />
                  Nhắn tin
                </button>
                <button className="flex flex-col items-center justify-center py-2 border border-[#366092] text-[#366092] rounded-lg text-xs font-medium">
                  <ChevronRight size={18} className="mb-1" />
                  Chi tiết
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Sheet */}
        <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-3xl shadow-2xl p-4">
          <div className="w-12 h-1 bg-[#CBD5E1] rounded-full mx-auto mb-3"></div>
          <h3 className="font-semibold text-[#0F172A] mb-3">DQTV đang hoạt động: 20/28</h3>
          <div className="space-y-2 max-h-24 overflow-y-auto">
            {dqtvLocations.filter(d => d.status === 'online').slice(0, 3).map((dqtv) => (
              <button
                key={dqtv.id}
                onClick={() => setSelectedDQTV(dqtv.id)}
                className="w-full flex items-center gap-3 p-2 hover:bg-[#F8FAFC] rounded-lg"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {dqtv.name.split(' ').pop()?.charAt(0)}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-[#0F172A]">{dqtv.name}</p>
                  <p className="text-xs text-[#64748B]">{dqtv.speed}</p>
                </div>
                <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}