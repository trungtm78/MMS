import { ArrowLeft, Filter, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, X as XIcon, User } from 'lucide-react';
import { useState } from 'react';

interface AttendanceProps {
  onNavigate: (screen: string) => void;
}

export default function Attendance({ onNavigate }: AttendanceProps) {
  const [selectedDate, setSelectedDate] = useState(20);
  const [selectedFilter, setSelectedFilter] = useState('all');

  const attendanceData = [
    { id: 1, name: 'Nguyễn Văn An', checkIn: '08:05', checkOut: '17:10', total: '9h 5 phút', status: 'ontime', avatar: 'photo-1763735134462-aca6bfd76573' },
    { id: 2, name: 'Trần Thị Bình', checkIn: '08:15', checkOut: '17:05', total: '8h 50 phút', status: 'late', lateMinutes: 15, avatar: 'photo-1581065178026-390bc4e78dad' },
    { id: 3, name: 'Lê Văn Cường', checkIn: '08:00', checkOut: '17:00', total: '9h 0 phút', status: 'ontime', avatar: 'photo-1734864489622-0406baee014f' },
    { id: 4, name: 'Phạm Thị Dung', checkIn: null, checkOut: null, total: null, status: 'absent', avatar: 'photo-1581065178026-390bc4e78dad' },
  ];

  const filteredData = attendanceData.filter(item => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'ontime') return item.status === 'ontime';
    if (selectedFilter === 'late') return item.status === 'late';
    if (selectedFilter === 'absent') return item.status === 'absent';
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Chấm công</h1>
          </div>
          <button className="p-2">
            <Filter className="text-[#64748B]" size={20} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-4 pt-4">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-[#10B981] mb-1">85%</p>
            <p className="text-xs text-[#64748B] mb-1">Đúng giờ</p>
            <p className="text-xs text-[#64748B]">17/20 người</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-[#F59E0B] mb-1">10%</p>
            <p className="text-xs text-[#64748B] mb-1">Trễ giờ</p>
            <p className="text-xs text-[#64748B]">2/20 người</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-2xl font-bold text-[#EF4444] mb-1">5%</p>
            <p className="text-xs text-[#64748B] mb-1">Vắng</p>
            <p className="text-xs text-[#64748B]">1/20 người</p>
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => (
              <div key={day} className="text-center text-xs font-medium text-[#64748B] py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 31 }, (_, i) => {
              const date = i + 1;
              let bgColor = 'bg-white';
              let textColor = 'text-[#0F172A]';
              let borderColor = '';
              
              if (date <= 20) {
                if (date % 7 === 0 || date % 7 === 6) {
                  bgColor = 'bg-[#F1F5F9]';
                  textColor = 'text-[#94A3B8]';
                } else if (date % 8 === 0) {
                  bgColor = 'bg-[#EF4444] bg-opacity-20';
                } else if (date % 11 === 0) {
                  bgColor = 'bg-[#F59E0B] bg-opacity-20';
                } else {
                  bgColor = 'bg-[#10B981] bg-opacity-20';
                }
              } else {
                bgColor = 'bg-[#F1F5F9]';
                textColor = 'text-[#CBD5E1]';
              }
              
              if (date === selectedDate) {
                borderColor = 'ring-2 ring-[#366092]';
              }

              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`aspect-square rounded-lg ${bgColor} ${textColor} ${borderColor} flex items-center justify-center text-sm font-medium hover:ring-2 hover:ring-[#366092] transition-all`}
                >
                  {date}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Detail */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-2">Thứ Hai, 20/12/2024</h3>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <CheckCircle className="text-[#10B981]" size={16} />
              <span className="text-[#64748B]">Điểm danh đủ: <span className="font-semibold text-[#0F172A]">18/20</span></span>
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle className="text-[#F59E0B]" size={16} />
              <span className="text-[#64748B]">Trễ: <span className="font-semibold text-[#F59E0B]">2</span></span>
            </div>
            <div className="flex items-center gap-1">
              <XIcon className="text-[#EF4444]" size={16} />
              <span className="text-[#64748B]">Vắng: <span className="font-semibold text-[#EF4444]">0</span></span>
            </div>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedFilter === 'all'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B] border border-[#E2E8F0]'
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setSelectedFilter('ontime')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedFilter === 'ontime'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B] border border-[#E2E8F0]'
            }`}
          >
            Đúng giờ
          </button>
          <button
            onClick={() => setSelectedFilter('late')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedFilter === 'late'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B] border border-[#E2E8F0]'
            }`}
          >
            Trễ
          </button>
          <button
            onClick={() => setSelectedFilter('absent')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedFilter === 'absent'
                ? 'bg-[#366092] text-white'
                : 'bg-white text-[#64748B] border border-[#E2E8F0]'
            }`}
          >
            Vắng
          </button>
        </div>

        {/* Attendance List */}
        <div className="space-y-3 pb-4">
          {filteredData.map((person) => (
            <div
              key={person.id}
              className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${
                person.status === 'ontime' ? 'border-[#10B981]' :
                person.status === 'late' ? 'border-[#F59E0B]' :
                'border-[#EF4444]'
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#366092] bg-opacity-10 flex items-center justify-center flex-shrink-0">
                  <User className="text-[#366092]" size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-[#0F172A]">{person.name}</h4>
                  {person.status === 'ontime' && (
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <div>
                        <p className="text-xs text-[#64748B]">Check-in</p>
                        <p className="font-medium text-[#0F172A] flex items-center gap-1">
                          {person.checkIn} <CheckCircle className="text-[#10B981]" size={14} />
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748B]">Check-out</p>
                        <p className="font-medium text-[#0F172A] flex items-center gap-1">
                          {person.checkOut} <CheckCircle className="text-[#10B981]" size={14} />
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748B]">Tổng</p>
                        <p className="font-medium text-[#0F172A]">{person.total}</p>
                      </div>
                    </div>
                  )}
                  {person.status === 'late' && (
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <div>
                        <p className="text-xs text-[#64748B]">Check-in</p>
                        <p className="font-medium text-[#0F172A] flex items-center gap-1">
                          {person.checkIn} <AlertTriangle className="text-[#F59E0B]" size={14} />
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748B]">Check-out</p>
                        <p className="font-medium text-[#0F172A] flex items-center gap-1">
                          {person.checkOut} <CheckCircle className="text-[#10B981]" size={14} />
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#64748B]">Tổng</p>
                        <p className="font-medium text-[#0F172A]">{person.total}</p>
                      </div>
                    </div>
                  )}
                  {person.status === 'absent' && (
                    <p className="text-sm text-[#64748B] mt-1">Không có dữ liệu chấm công</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  person.status === 'ontime' ? 'bg-[#D1FAE5] text-[#10B981]' :
                  person.status === 'late' ? 'bg-[#FFF7ED] text-[#F59E0B]' :
                  'bg-[#FEE2E2] text-[#EF4444]'
                }`}>
                  {person.status === 'ontime' ? 'Đúng giờ' :
                   person.status === 'late' ? `Trễ ${person.lateMinutes} phút` :
                   'Vắng không phép'}
                </span>
                {person.status !== 'ontime' && (
                  <button className="px-4 py-1.5 border border-[#366092] text-[#366092] rounded-lg text-xs font-medium">
                    {person.status === 'late' ? 'Sửa' : 'Thêm thủ công'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Buttons */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-[#E2E8F0] p-4 shadow-lg">
        <div className="flex gap-3">
          <button className="flex-1 h-12 bg-[#366092] text-white rounded-lg text-sm font-medium">
            Đề xuất chốt công
          </button>
          <button className="flex-1 h-12 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium">
            Xuất báo cáo
          </button>
        </div>
      </div>
    </div>
  );
}