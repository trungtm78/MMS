import { useState } from 'react';
import { MapPin, Camera, RefreshCw, CheckCircle2, AlertCircle, Calendar, ChevronRight, ArrowLeft } from 'lucide-react';

export function CheckIn({ onBack }: { onBack?: () => void }) {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleCheckIn = () => {
    setShowCamera(true);
    setTimeout(() => {
      setShowCamera(false);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setIsCheckedIn(true);
      }, 2000);
    }, 2000);
  };

  const attendanceHistory = [
    { date: 'Thứ Hai, 21/01', checkIn: '08:00', checkOut: '17:05', status: 'Đúng giờ', hours: '9h 5 phút' },
    { date: 'Thứ Sáu, 18/01', checkIn: '08:00', checkOut: '17:00', status: 'Đúng giờ', hours: '9h 0 phút' },
    { date: 'Thứ Năm, 17/01', checkIn: '08:15', checkOut: '17:05', status: 'Trễ 15 phút', hours: '8h 50 phút' },
    { date: 'Thứ Tư, 16/01', checkIn: '08:00', checkOut: '17:10', status: 'Đúng giờ', hours: '9h 10 phút' },
    { date: 'Thứ Ba, 15/01', checkIn: '08:05', checkOut: '17:00', status: 'Trễ 5 phút', hours: '8h 55 phút' },
  ];

  if (showCamera) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="text-white text-center mb-8">
          <Camera className="w-16 h-16 mx-auto mb-4 animate-pulse" />
          <p className="text-lg">Đang xác thực GPS...</p>
          <p className="text-sm text-gray-400 mt-2">Vui lòng đợi</p>
        </div>
        <div className="w-64 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-[#366092] animate-[progress_2s_ease-in-out]"></div>
        </div>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg text-center max-w-sm w-full animate-[scaleIn_0.5s_ease-out]">
          <div className="w-20 h-20 bg-[#10B981] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-12 h-12 text-white animate-[checkmark_0.5s_ease-out]" />
          </div>
          <h2 className="text-2xl font-bold text-[#10B981] mb-2">Điểm danh thành công!</h2>
          <p className="text-[#64748B] mb-4">08:05 AM</p>
          <p className="text-sm text-[#64748B]">Bốt gác Khu phố 1</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <h1 className="text-xl font-extrabold text-[#DC2626]">Điểm Danh</h1>
      </div>
      {/* Status Header */}
      <div className="px-4 pt-6">
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <div className="w-20 h-20 rounded-full bg-[#F59E0B]/10 flex items-center justify-center mx-auto mb-4">
            {isCheckedIn ? (
              <CheckCircle2 className="w-12 h-12 text-[#10B981]" />
            ) : (
              <AlertCircle className="w-12 h-12 text-[#F59E0B]" />
            )}
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isCheckedIn ? 'text-[#10B981]' : 'text-[#F59E0B]'}`}>
            {isCheckedIn ? 'Đã điểm danh' : 'Chưa điểm danh'}
          </h2>
          <p className="text-[#64748B] text-sm">Hôm nay, 22/01/2026</p>
        </div>
      </div>

      {/* Attendance Info */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          {!isCheckedIn ? (
            <>
              <div className="text-center mb-4">
                <div className="text-4xl font-bold text-[#366092] mb-2">08:24 AM</div>
                <p className="text-sm text-[#64748B]">Ca sáng: 08:00 - 17:00</p>
                <p className="text-sm text-[#F59E0B] mt-2">Vui lòng điểm danh trước 08:30</p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div className="bg-[#F59E0B] h-2 rounded-full" style={{ width: '80%' }}></div>
              </div>
              <p className="text-xs text-center text-[#64748B]">Còn 6 phút</p>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-[#64748B]">Điểm danh vào</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#0F172A]">08:05 AM</span>
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-[#64748B]">Địa điểm</span>
                <span className="text-sm font-medium text-[#0F172A]">Bốt gác Khu phố 1</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-[#64748B]">Trạng thái</span>
                <span className="text-sm font-medium text-[#10B981]">Đúng giờ</span>
              </div>
              <div className="bg-[#F59E0B]/10 rounded-lg p-3 mt-4">
                <p className="text-sm text-[#F59E0B] text-center">Chưa điểm danh ra</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GPS Status */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Vị trí hiện tại</h3>
          <div className="bg-gray-200 h-32 rounded-lg mb-3 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="w-8 h-8 mx-auto mb-2 text-[#366092]" />
              <p className="text-sm text-[#64748B]">🗺️ Bản đồ GPS</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#64748B]">Khoảng cách</span>
              <span className="text-sm font-medium text-[#10B981]">12m từ khu vực ✓</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#64748B]">Độ chính xác GPS</span>
              <span className="text-sm font-medium text-[#0F172A]">±5m</span>
            </div>
          </div>
          <button className="w-full mt-3 py-2 border border-[#366092] text-[#366092] rounded-lg font-medium text-sm flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Làm mới vị trí
          </button>
        </div>
      </div>

      {/* Check-in Button */}
      {!isCheckedIn && (
        <div className="px-4 mt-4">
          <button
            onClick={handleCheckIn}
            className="w-full h-14 bg-gradient-to-r from-[#366092] to-[#4A90E2] text-white rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            <Camera className="w-6 h-6" />
            ĐIỂM DANH NGAY
          </button>
        </div>
      )}

      {isCheckedIn && (
        <div className="px-4 mt-4">
          <button className="w-full h-14 bg-gradient-to-r from-[#EF4444] to-[#F59E0B] text-white rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform">
            ĐIỂM DANH RA
          </button>
        </div>
      )}

      {/* Secondary Actions */}
      <div className="px-4 mt-3 flex gap-3 mb-4">
        <button className="flex-1 py-2 border border-[#64748B] text-[#64748B] rounded-lg text-sm font-medium">
          Đăng ký nghỉ
        </button>
        <button className="flex-1 py-2 border border-[#64748B] text-[#64748B] rounded-lg text-sm font-medium">
          Báo cáo sự cố
        </button>
        <button className="flex-1 py-2 text-[#366092] text-sm font-medium">
          Lịch sử
        </button>
      </div>

      {/* Attendance History */}
      <div className="px-4 mt-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#0F172A]">Lịch sử điểm danh</h3>
            <button className="text-sm text-[#366092] font-medium flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Xem lịch
            </button>
          </div>
          <div className="space-y-3">
            {attendanceHistory.map((record, index) => (
              <div key={index} className="border-b border-gray-100 pb-3 last:border-b-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[#0F172A]">{record.date}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      record.status === 'Đúng giờ'
                        ? 'bg-[#10B981]/10 text-[#10B981]'
                        : 'bg-[#F59E0B]/10 text-[#F59E0B]'
                    }`}
                  >
                    {record.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#64748B]">
                  <div>
                    <span>Vào: {record.checkIn}</span>
                    <span className="mx-2">•</span>
                    <span>Ra: {record.checkOut}</span>
                  </div>
                  <span>{record.hours}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="px-4 mb-20">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-4">Thống kê tháng này</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#64748B]">Ngày công</span>
                <span className="text-sm font-semibold text-[#0F172A]">18/22 ngày</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-[#10B981] h-2 rounded-full" style={{ width: '82%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#64748B]">Đúng giờ</span>
                <span className="text-sm font-semibold text-[#0F172A]">16 lần</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-[#3B82F6] h-2 rounded-full" style={{ width: '89%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#64748B]">Trễ</span>
                <span className="text-sm font-semibold text-[#0F172A]">2 lần</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-[#F59E0B] h-2 rounded-full" style={{ width: '11%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes checkmark {
          0% { transform: scale(0); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}