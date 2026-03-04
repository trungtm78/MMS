import { ArrowLeft, Search, Filter, Phone, MessageCircle, MapPin, User, Plus } from 'lucide-react';
import { useState } from 'react';

interface DQTVListProps {
  onNavigate: (screen: string) => void;
}

const dqtvData = [
  { id: 1, name: 'Nguyễn Văn An', code: 'HCM-PHD-T12-0001', phone: '0915678901', status: 'online', chitieu: 92.4, tasks: 3, attendance: 18, avatar: 'photo-1763735134462-aca6bfd76573' },
  { id: 2, name: 'Trần Thị Bình', code: 'HCM-PHD-T12-0002', phone: '0915678902', status: 'online', chitieu: 88.5, tasks: 2, attendance: 20, avatar: 'photo-1581065178026-390bc4e78dad' },
  { id: 3, name: 'Lê Văn Cường', code: 'HCM-PHD-T12-0003', phone: '0915678903', status: 'offline', chitieu: 85.2, tasks: 1, attendance: 17, avatar: 'photo-1734864489622-0406baee014f' },
  { id: 4, name: 'Phạm Thị Dung', code: 'HCM-PHD-T12-0004', phone: '0915678904', status: 'online', chitieu: 91.0, tasks: 4, attendance: 19, avatar: 'photo-1581065178026-390bc4e78dad' },
  { id: 5, name: 'Hoàng Văn Hải', code: 'HCM-PHD-T12-0005', phone: '0915678905', status: 'online', chitieu: 76.3, tasks: 2, attendance: 15, avatar: 'photo-1661588156316-cdcbe2e0c8ad' },
  { id: 6, name: 'Võ Thị Kim', code: 'HCM-PHD-T12-0006', phone: '0915678906', status: 'away', chitieu: 89.8, tasks: 3, attendance: 18, avatar: 'photo-1543270123-5b5c73132cdf' },
];

export default function DQTVList({ onNavigate }: DQTVListProps) {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getChiTieuColor = (chitieu: number) => {
    if (chitieu >= 90) return 'text-[#10B981] bg-[#10B981]';
    if (chitieu >= 80) return 'text-[#3B82F6] bg-[#3B82F6]';
    if (chitieu >= 70) return 'text-[#F59E0B] bg-[#F59E0B]';
    return 'text-[#EF4444] bg-[#EF4444]';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-[#10B981]';
      case 'offline': return 'bg-[#EF4444]';
      case 'away': return 'bg-[#F59E0B]';
      default: return 'bg-[#64748B]';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'away': return 'Away';
      default: return 'Unknown';
    }
  };

  const filteredData = dqtvData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.phone.includes(searchQuery);
    
    if (selectedFilter === 'all') return matchesSearch;
    if (selectedFilter === 'online') return matchesSearch && item.status === 'online';
    if (selectedFilter === 'away') return matchesSearch && item.status === 'away';
    if (selectedFilter === 'offline') return matchesSearch && item.status === 'offline';
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Quản lý DQTV</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2">
              <Search className="text-[#DC2626]" size={20} />
            </button>
            <button className="p-2">
              <Filter className="text-[#DC2626]" size={20} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#94A3B8]" size={20} />
          <input
            type="text"
            placeholder="Tìm tên, mã số, SĐT..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 pl-10 pr-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedFilter === 'all'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B] border border-[#E2E8F0]'
            }`}
          >
            Tổng: 28
          </button>
          <button
            onClick={() => setSelectedFilter('online')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex items-center gap-2 ${
              selectedFilter === 'online'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B] border border-[#E2E8F0]'
            }`}
          >
            <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
            Hoạt động: 20
          </button>
          <button
            onClick={() => setSelectedFilter('away')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex items-center gap-2 ${
              selectedFilter === 'away'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B] border border-[#E2E8F0]'
            }`}
          >
            <div className="w-2 h-2 bg-[#F59E0B] rounded-full"></div>
            Nghỉ phép: 3
          </button>
          <button
            onClick={() => setSelectedFilter('offline')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex items-center gap-2 ${
              selectedFilter === 'offline'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B] border border-[#E2E8F0]'
            }`}
          >
            <div className="w-2 h-2 bg-[#EF4444] rounded-full"></div>
            Offline: 5
          </button>
        </div>
      </div>

      {/* DQTV Cards */}
      <div className="px-4 pt-4 space-y-3">
        {filteredData.map((dqtv) => (
          <div key={dqtv.id} className="bg-white rounded-xl p-4 shadow-sm">
            {/* Header Row */}
            <div className="flex items-start gap-3 mb-3">
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-[#366092] bg-opacity-10 flex items-center justify-center">
                  <User className="text-[#366092]" size={24} />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-[#0F172A]">{dqtv.name}</h3>
                    <p className="text-xs text-[#64748B]">{dqtv.code}</p>
                    <p className="text-sm text-[#64748B] mt-0.5">{dqtv.phone}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(dqtv.status)}`}></div>
                    <span className="text-xs text-[#64748B]">{getStatusText(dqtv.status)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1">
                <span className={`text-sm font-bold ${getChiTieuColor(dqtv.chitieu)}`}>
                  {dqtv.chitieu}
                </span>
                <span className="text-xs text-[#64748B]">Chỉ tiêu</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-[#F8FAFC] rounded">
                <span className="text-sm font-medium text-[#0F172A]">{dqtv.tasks}</span>
                <span className="text-xs text-[#64748B]">việc</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-[#F8FAFC] rounded">
                <span className="text-sm font-medium text-[#0F172A]">{dqtv.attendance}</span>
                <span className="text-xs text-[#64748B]">ngày</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-4 gap-2">
              <button className="flex flex-col items-center justify-center py-2 px-2 bg-[#F8FAFC] rounded-lg hover:bg-[#EFF6FF] transition-colors">
                <Phone className="text-[#366092]" size={20} />
                <span className="text-xs text-[#64748B] mt-1">Gọi</span>
              </button>
              <button className="flex flex-col items-center justify-center py-2 px-2 bg-[#F8FAFC] rounded-lg hover:bg-[#EFF6FF] transition-colors">
                <MessageCircle className="text-[#366092]" size={20} />
                <span className="text-xs text-[#64748B] mt-1">Nhắn</span>
              </button>
              <button className="flex flex-col items-center justify-center py-2 px-2 bg-[#F8FAFC] rounded-lg hover:bg-[#EFF6FF] transition-colors">
                <MapPin className="text-[#366092]" size={20} />
                <span className="text-xs text-[#64748B] mt-1">GPS</span>
              </button>
              <button className="flex flex-col items-center justify-center py-2 px-2 bg-[#F8FAFC] rounded-lg hover:bg-[#EFF6FF] transition-colors">
                <User className="text-[#366092]" size={20} />
                <span className="text-xs text-[#64748B] mt-1">Hồ sơ</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <Search className="text-[#CBD5E1] mb-4" size={64} />
          <p className="text-lg font-semibold text-[#0F172A] mb-1">Không tìm thấy DQTV</p>
          <p className="text-sm text-[#64748B]">Thử điều chỉnh bộ lọc</p>
        </div>
      )}

      {/* FAB */}
      <button className="fixed bottom-20 right-4 w-14 h-14 bg-[#366092] rounded-full shadow-lg flex items-center justify-center hover:shadow-xl transition-shadow">
        <Plus className="text-white" size={28} />
      </button>
    </div>
  );
}