import { ArrowLeft, MapPin, Clock, Calendar, CheckCircle, Camera } from 'lucide-react';
import { useState } from 'react';

interface CheckInProps {
  onNavigate: (screen: string) => void;
}

export default function CheckIn({ onNavigate }: CheckInProps) {
  const [isCheckedIn, setIsCheckedIn] = useState(true);
  const [checkInTime, setCheckInTime] = useState('08:15');
  const [location, setLocation] = useState('Chợ Bến Thành, KP1');

  const handleCheckIn = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    setCheckInTime(`${hours}:${minutes}`);
    setIsCheckedIn(true);
  };

  const handleCheckOut = () => {
    setIsCheckedIn(false);
  };

  const attendanceHistory = [
    { date: '25/02/2024', checkIn: '08:15', checkOut: '17:30', status: 'present', hours: '9h 15m' },
    { date: '24/02/2024', checkIn: '08:10', checkOut: '17:25', status: 'present', hours: '9h 15m' },
    { date: '23/02/2024', checkIn: '08:20', checkOut: '17:40', status: 'present', hours: '9h 20m' },
    { date: '22/02/2024', checkIn: '08:05', checkOut: '17:20', status: 'present', hours: '9h 15m' },
    { date: '21/02/2024', checkIn: '-', checkOut: '-', status: 'absent', hours: '-' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Chấm công</h1>
          </div>
        </div>
      </div>

      {/* Current Date */}
      <div className="px-4 pt-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border-2 border-[#FDE047]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#DC2626] flex items-center justify-center">
                <Calendar className="text-white" size={24} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-[#0F172A]">Thứ 3, 25/02/2024</p>
                <p className="text-sm text-[#64748B]">Ca làm việc: 08:00 - 17:30</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Check In/Out Card */}
      <div className="px-4 pt-4">
        <div className="bg-gradient-to-br from-[#DC2626] to-[#B91C1C] rounded-2xl p-6 shadow-lg text-white">
          <div className="text-center mb-6">
            <div className="text-6xl font-extrabold mb-2">
              {new Date().getHours().toString().padStart(2, '0')}:{new Date().getMinutes().toString().padStart(2, '0')}
            </div>
            <p className="text-sm opacity-90">Thời gian hiện tại</p>
          </div>

          {isCheckedIn ? (
            <div className="space-y-4">
              <div className="bg-white bg-opacity-20 rounded-xl p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={20} />
                    <span className="font-bold">Đã check-in</span>
                  </div>
                  <span className="text-lg font-bold">{checkInTime}</span>
                </div>
                <div className="flex items-center gap-2 text-sm opacity-90">
                  <MapPin size={16} />
                  <span>{location}</span>
                </div>
              </div>

              <button
                onClick={handleCheckOut}
                className="w-full bg-white text-[#DC2626] py-4 rounded-xl font-extrabold text-lg hover:bg-opacity-90 transition-all shadow-lg"
              >
                Check-out
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={handleCheckIn}
                className="w-full bg-white text-[#DC2626] py-4 rounded-xl font-extrabold text-lg hover:bg-opacity-90 transition-all shadow-lg"
              >
                Check-in ngay
              </button>
              <button className="w-full bg-white bg-opacity-20 backdrop-blur-sm text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                <Camera size={20} />
                Chụp ảnh check-in
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 pt-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-3 shadow-sm text-center border-2 border-[#15803D]">
            <p className="text-2xl font-bold text-[#15803D]">18</p>
            <p className="text-xs text-[#64748B] mt-1">Ngày công</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center border-2 border-[#F59E0B]">
            <p className="text-2xl font-bold text-[#F59E0B]">2</p>
            <p className="text-xs text-[#64748B] mt-1">Đi muộn</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center border-2 border-[#DC2626]">
            <p className="text-2xl font-bold text-[#DC2626]">1</p>
            <p className="text-xs text-[#64748B] mt-1">Vắng mặt</p>
          </div>
        </div>
      </div>

      {/* Attendance History */}
      <div className="px-4 pt-6 pb-4">
        <h2 className="text-lg font-extrabold text-[#0F172A] mb-3">Lịch sử chấm công</h2>
        <div className="space-y-2">
          {attendanceHistory.map((record, index) => (
            <div
              key={index}
              className={`bg-white rounded-xl p-4 shadow-sm ${
                record.status === 'absent' ? 'border-l-4 border-[#DC2626]' : 'border-l-4 border-[#15803D]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="text-[#64748B]" size={16} />
                  <span className="font-semibold text-[#0F172A]">{record.date}</span>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-bold ${
                    record.status === 'present'
                      ? 'bg-[#DCFCE7] text-[#15803D]'
                      : 'bg-[#FEE2E2] text-[#DC2626]'
                  }`}
                >
                  {record.status === 'present' ? 'Có mặt' : 'Vắng mặt'}
                </span>
              </div>
              {record.status === 'present' && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Clock className="text-[#15803D]" size={14} />
                      <span className="text-[#64748B]">Vào:</span>
                      <span className="font-semibold text-[#0F172A]">{record.checkIn}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="text-[#DC2626]" size={14} />
                      <span className="text-[#64748B]">Ra:</span>
                      <span className="font-semibold text-[#0F172A]">{record.checkOut}</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#15803D]">{record.hours}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
