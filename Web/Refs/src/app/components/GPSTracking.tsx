import { MapPin, Users, Radio, Battery, Signal, Search, AlertCircle, Phone, MessageSquare, Navigation } from 'lucide-react';
import { useState } from 'react';

interface Personnel {
  id: string;
  name: string;
  district: string;
  status: 'active' | 'stationary' | 'offline' | 'alert';
  lat: number;
  lng: number;
  task?: string;
  lastUpdate: string;
  battery: number;
  signal: number;
}

export function GPSTracking() {
  const [selectedPersonnel, setSelectedPersonnel] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useState(false);

  const personnel: Personnel[] = [
    { id: '1', name: 'Nguyễn Văn A', district: 'KP 1', status: 'active', lat: 10.7769, lng: 106.7009, task: 'Tuần tra khu vực chợ', lastUpdate: '2 phút trước', battery: 85, signal: 4 },
    { id: '2', name: 'Trần Văn B', district: 'KP 2', status: 'stationary', lat: 10.7789, lng: 106.7029, lastUpdate: '5 phút trước', battery: 60, signal: 3 },
    { id: '3', name: 'Lê Văn C', district: 'KP 1', status: 'active', lat: 10.7749, lng: 106.6989, task: 'Xử lý sự vụ', lastUpdate: '1 phút trước', battery: 92, signal: 4 },
    { id: '4', name: 'Phạm Văn D', district: 'KP 3', status: 'alert', lat: 10.7799, lng: 106.7049, task: 'Hỗ trợ dân sinh', lastUpdate: '15 phút trước', battery: 15, signal: 2 },
    { id: '5', name: 'Hoàng Văn E', district: 'KP 2', status: 'offline', lat: 10.7759, lng: 106.6999, lastUpdate: '35 phút trước', battery: 5, signal: 0 },
  ];

  const getStatusColor = (status: Personnel['status']) => {
    const colors = {
      'active': { bg: '#E8F5E9', text: '#2E7D32', border: '#2E7D32' },
      'stationary': { bg: '#E3F2FD', text: '#1976D2', border: '#1976D2' },
      'offline': { bg: '#F5F5F5', text: '#757575', border: '#757575' },
      'alert': { bg: '#FFEBEE', text: '#C62828', border: '#C62828' },
    };
    return colors[status];
  };

  const getStatusLabel = (status: Personnel['status']) => {
    const labels = {
      'active': 'Đang hoạt động',
      'stationary': 'Đang dừng',
      'offline': 'Offline',
      'alert': 'Cảnh báo',
    };
    return labels[status];
  };

  const activeCount = personnel.filter(p => p.status === 'active').length;
  const alertCount = personnel.filter(p => p.status === 'alert').length;

  return (
    <div className="h-[calc(100vh-200px)] flex gap-6">
      {/* Left Sidebar - Personnel List */}
      <div className="w-96 bg-white rounded-xl border border-[#E2E8F0] flex flex-col overflow-hidden shadow-sm">
        {/* Header */}
        <div className="p-4 border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[#0F172A]">DQTV Đang Hoạt Động</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#2E7D32] rounded-full animate-pulse"></span>
              <span className="text-xs font-medium text-[#2E7D32]">LIVE</span>
            </div>
          </div>
          <p className="text-sm text-[#64748B]">
            <span className="font-semibold text-[#0F172A]">{activeCount}</span>/{personnel.length} đang hoạt động
          </p>
        </div>

        {/* Search & Filters */}
        <div className="p-4 border-b border-[#E2E8F0] space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              placeholder="Tìm DQTV..."
              className="w-full h-10 pl-10 pr-4 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="px-3 py-1.5 text-xs font-medium bg-[#1F3A5F] text-white rounded-full">Tất cả</button>
            <button className="px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] rounded-full transition-all">Đang hoạt động</button>
            <button className="px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] rounded-full transition-all">Có vấn đề</button>
          </div>
        </div>

        {/* Personnel List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {personnel.map(person => {
            const statusColor = getStatusColor(person.status);
            return (
              <div
                key={person.id}
                onClick={() => setSelectedPersonnel(person.id)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedPersonnel === person.id
                    ? 'border-[#1F3A5F] bg-[#E3F2FD] shadow-md'
                    : 'border-[#E2E8F0] hover:border-[#1F3A5F] hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold relative"
                      style={{ background: `linear-gradient(135deg, #1F3A5F, #2E7D32)` }}
                    >
                      {person.name.substring(0, 2)}
                      <span 
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
                        style={{ backgroundColor: statusColor.border }}
                      ></span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">{person.name}</p>
                      <p className="text-xs text-[#64748B]">{person.district}</p>
                    </div>
                  </div>
                  <span 
                    className="px-2 py-1 text-xs font-semibold rounded"
                    style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                  >
                    {getStatusLabel(person.status)}
                  </span>
                </div>

                {person.task && (
                  <p className="text-xs text-[#64748B] mb-2">🎯 {person.task}</p>
                )}

                <div className="flex items-center justify-between text-xs text-[#64748B]">
                  <span>{person.lastUpdate}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Battery size={12} className={person.battery < 20 ? 'text-[#C62828]' : 'text-[#64748B]'} />
                      <span className={person.battery < 20 ? 'text-[#C62828] font-semibold' : ''}>{person.battery}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Signal size={12} />
                      <span>{person.signal}/4</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-[#E2E8F0] space-y-2">
          <label className="flex items-center gap-2 text-sm text-[#64748B] cursor-pointer">
            <input 
              type="checkbox" 
              checked={showRoutes}
              onChange={(e) => setShowRoutes(e.target.checked)}
              className="w-4 h-4 rounded border-[#E2E8F0]"
            />
            Hiển thị tuyến đường
          </label>
        </div>
      </div>

      {/* Main Map Area */}
      <div className="flex-1 bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm relative">
        {/* Map Header */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
          <div className="bg-white/95 backdrop-blur-sm px-4 py-3 rounded-lg shadow-lg border border-[#E2E8F0]">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-1">GPS Tracking - Live</h2>
            <p className="text-xs text-[#64748B]">Cập nhật: 2 phút trước</p>
          </div>

          {alertCount > 0 && (
            <div className="bg-[#FFEBEE] px-4 py-3 rounded-lg shadow-lg border border-[#C62828]">
              <div className="flex items-center gap-2">
                <AlertCircle size={20} className="text-[#C62828]" />
                <div>
                  <p className="text-sm font-semibold text-[#C62828]">{alertCount} Cảnh báo</p>
                  <p className="text-xs text-[#64748B]">Cần xử lý ngay</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Map Placeholder */}
        <div className="w-full h-full bg-gradient-to-br from-[#E3F2FD] to-[#BBDEFB] relative">
          {/* Simulated Map Grid */}
          <div className="absolute inset-0 opacity-20">
            <div className="grid grid-cols-12 grid-rows-12 h-full">
              {[...Array(144)].map((_, i) => (
                <div key={i} className="border border-[#1976D2]"></div>
              ))}
            </div>
          </div>

          {/* Simulated Markers */}
          {personnel.map((person, index) => {
            const statusColor = getStatusColor(person.status);
            return (
              <div
                key={person.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
                style={{
                  left: `${30 + index * 15}%`,
                  top: `${40 + (index % 3) * 10}%`,
                }}
                onClick={() => setSelectedPersonnel(person.id)}
              >
                {/* Marker */}
                <div className="relative">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold shadow-lg border-4 border-white transform transition-transform group-hover:scale-110"
                    style={{ background: `linear-gradient(135deg, #1F3A5F, #2E7D32)` }}
                  >
                    {person.name.substring(0, 2)}
                  </div>
                  <span 
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white animate-pulse"
                    style={{ backgroundColor: statusColor.border }}
                  ></span>
                  {person.status === 'active' && (
                    <div className="absolute inset-0 rounded-full border-4 border-[#2E7D32] animate-ping opacity-75"></div>
                  )}
                </div>

                {/* Info Card on Hover */}
                <div className="absolute left-1/2 -translate-x-1/2 top-14 bg-white rounded-lg shadow-xl border border-[#E2E8F0] p-3 opacity-0 group-hover:opacity-100 transition-opacity w-48 pointer-events-none z-20">
                  <p className="text-sm font-semibold text-[#0F172A] mb-1">{person.name}</p>
                  <p className="text-xs text-[#64748B] mb-2">{person.district}</p>
                  {person.task && (
                    <p className="text-xs text-[#64748B] mb-2">🎯 {person.task}</p>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span 
                      className="px-2 py-1 text-xs font-semibold rounded"
                      style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                    >
                      {getStatusLabel(person.status)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#64748B] mb-2">
                    <span>⏱ {person.lastUpdate}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 px-2 py-1.5 text-xs font-medium text-white bg-[#1976D2] hover:bg-[#0D47A1] rounded transition-all flex items-center justify-center gap-1">
                      <Phone size={12} />
                      Gọi
                    </button>
                    <button className="flex-1 px-2 py-1.5 text-xs font-medium text-[#1976D2] bg-[#E3F2FD] hover:bg-[#BBDEFB] rounded transition-all flex items-center justify-center gap-1">
                      <MessageSquare size={12} />
                      Nhắn
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Map Center Text */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <MapPin size={64} className="text-[#1F3A5F] opacity-10 mx-auto mb-4" />
              <p className="text-sm text-[#64748B] opacity-50">Bản đồ GPS Tracking</p>
              <p className="text-xs text-[#94A3B8] opacity-50 mt-1">UBND Phường Phú Định - TP.HCM</p>
            </div>
          </div>
        </div>

        {/* Map Controls */}
        <div className="absolute bottom-6 right-6 flex flex-col gap-2">
          <button className="w-10 h-10 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg shadow-lg flex items-center justify-center transition-all">
            <Navigation size={20} className="text-[#1F3A5F]" />
          </button>
          <button className="w-10 h-10 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg shadow-lg flex items-center justify-center text-lg font-bold text-[#1F3A5F] transition-all">
            +
          </button>
          <button className="w-10 h-10 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg shadow-lg flex items-center justify-center text-lg font-bold text-[#1F3A5F] transition-all">
            −
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-6 left-6 bg-white/95 backdrop-blur-sm px-4 py-3 rounded-lg shadow-lg border border-[#E2E8F0]">
          <p className="text-xs font-semibold text-[#0F172A] mb-2">Chú giải:</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#2E7D32] rounded-full"></span>
              <span className="text-xs text-[#64748B]">Đang hoạt động</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#1976D2] rounded-full"></span>
              <span className="text-xs text-[#64748B]">Đang dừng</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#C62828] rounded-full"></span>
              <span className="text-xs text-[#64748B]">Cảnh báo</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#757575] rounded-full"></span>
              <span className="text-xs text-[#64748B]">Offline</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
