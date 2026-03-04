import { useState } from 'react';
import { 
  Bell, 
  Shield, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  MapPin,
  Users,
  TrendingUp,
  ArrowUp,
  Calendar,
  FileText,
  Phone
} from 'lucide-react';
import { Notifications } from './Notifications';
import { EmergencySOS } from './EmergencySOS';
import { LeaveRequest } from './LeaveRequest';

interface HomeProps {
  onOpenReport?: () => void;
  onSwitchTab?: (tab: 'checkin') => void;
}

export function Home({ onOpenReport, onSwitchTab }: HomeProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [showLeaveRequest, setShowLeaveRequest] = useState(false);

  if (showNotifications) {
    return <Notifications onClose={() => setShowNotifications(false)} />;
  }

  if (showEmergency) {
    return <EmergencySOS onClose={() => setShowEmergency(false)} />;
  }

  if (showLeaveRequest) {
    return <LeaveRequest onClose={() => setShowLeaveRequest(false)} />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header with Yellow Gradient */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-6 rounded-b-3xl border-b-4 border-[#DC2626]">
        {/* Top Row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-white border-2 border-[#DC2626] flex items-center justify-center text-[#DC2626] font-bold text-xl shadow-sm">
                NA
              </div>
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#15803D] border-2 border-white rounded-full"></div>
            </div>
            <div>
              <p className="text-[#DC2626] text-xs font-bold uppercase">Chào buổi sáng,</p>
              <h1 className="text-[#DC2626] text-xl font-extrabold">Nguyễn Văn An</h1>
              <span className="inline-block mt-1 px-3 py-1 bg-[#DC2626] text-white text-xs font-bold rounded-full shadow-sm">
                DQTV - CA Khu vực 1
              </span>
            </div>
          </div>
          <button onClick={() => setShowNotifications(true)} className="relative p-2">
            <Bell className="w-6 h-6 text-[#DC2626]" />
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#DC2626] rounded-full border-2 border-white"></span>
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border-2 border-[#15803D]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[#64748B] text-xs font-semibold">Ngày công</p>
              <Calendar className="w-5 h-5 text-[#15803D]" />
            </div>
            <p className="text-[#0F172A] text-2xl font-bold">18/22</p>
            <div className="bg-[#F1F5F9] rounded-full h-2 overflow-hidden mt-2">
              <div className="bg-gradient-to-r from-[#15803D] to-[#166534] h-full" style={{width: '82%'}}></div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-2 border-[#15803D]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[#64748B] text-xs font-semibold">Chỉ tiêu</p>
              <TrendingUp className="w-5 h-5 text-[#15803D]" />
            </div>
            <p className="text-[#0F172A] text-2xl font-bold flex items-center gap-1">
              92%
              <ArrowUp className="w-5 h-5 text-[#15803D]" />
            </p>
            <div className="bg-[#F1F5F9] rounded-full h-2 overflow-hidden mt-2">
              <div className="bg-gradient-to-r from-[#15803D] to-[#166534] h-full" style={{width: '92%'}}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 pt-4">
        <h2 className="text-lg font-bold text-[#0F172A] mb-3">Hành động nhanh</h2>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={onOpenReport}
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#FDE047]"
          >
            <div className="w-12 h-12 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-2">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Báo cáo</p>
            <p className="text-xs text-[#64748B] text-center mt-1">Gửi báo cáo</p>
          </button>
          
          <button 
            onClick={() => onSwitchTab && onSwitchTab('checkin')}
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#FDE047]"
          >
            <div className="w-12 h-12 rounded-full bg-[#15803D] flex items-center justify-center mx-auto mb-2">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Điểm danh</p>
            <p className="text-xs text-[#64748B] text-center mt-1">Chấm công hôm nay</p>
          </button>
          
          <button 
            onClick={() => setShowLeaveRequest(true)}
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#FDE047]"
          >
            <div className="w-12 h-12 rounded-full bg-[#3B82F6] flex items-center justify-center mx-auto mb-2">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Nghỉ phép</p>
            <p className="text-xs text-[#64748B] text-center mt-1">Đăng ký nghỉ</p>
          </button>
          
          <button 
            onClick={() => setShowEmergency(true)}
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#DC2626]"
          >
            <div className="w-12 h-12 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-2 animate-pulse">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm font-semibold text-[#DC2626] text-center">Khẩn cấp</p>
            <p className="text-xs text-[#64748B] text-center mt-1">Báo động SOS</p>
          </button>
        </div>
      </div>

      {/* Today's Overview */}
      <div className="px-4 mt-6">
        <h2 className="text-lg font-bold text-[#0F172A] mb-3">Tổng quan hôm nay</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-3 shadow-sm text-center border-l-4 border-[#15803D]">
            <CheckCircle2 className="w-8 h-8 text-[#15803D] mx-auto mb-1" />
            <p className="text-xs text-[#64748B] mb-1">Hoàn thành</p>
            <p className="text-xl font-bold text-[#0F172A]">5</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center border-l-4 border-[#F59E0B]">
            <Clock className="w-8 h-8 text-[#F59E0B] mx-auto mb-1" />
            <p className="text-xs text-[#64748B] mb-1">Đang làm</p>
            <p className="text-xl font-bold text-[#0F172A]">2</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center border-l-4 border-[#DC2626]">
            <AlertCircle className="w-8 h-8 text-[#DC2626] mx-auto mb-1" />
            <p className="text-xs text-[#64748B] mb-1">Chưa làm</p>
            <p className="text-xl font-bold text-[#0F172A]">1</p>
          </div>
        </div>
      </div>

      {/* Today's Schedule */}
      <div className="px-4 mt-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Lịch trình hôm nay</h2>
              <p className="text-sm text-[#64748B]">Thứ Hai, 22/01/2026</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-14 h-8 rounded-lg bg-[#10B981]/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-[#10B981]">08:00</span>
                </div>
                <div className="w-0.5 h-8 bg-[#E2E8F0]"></div>
              </div>
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  <h3 className="font-semibold text-sm text-[#0F172A]">Điểm danh sáng</h3>
                </div>
                <span className="inline-block px-2 py-0.5 bg-[#10B981]/10 text-[#10B981] text-xs rounded-full">
                  Hoàn thành ✓
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-14 h-8 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-[#3B82F6]">09:00</span>
                </div>
                <div className="w-0.5 h-8 bg-[#E2E8F0]"></div>
              </div>
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-4 border-2 border-[#3B82F6] rounded-full animate-pulse"></div>
                  <h3 className="font-semibold text-sm text-[#0F172A]">Tuần tra khu vực chợ</h3>
                </div>
                <div className="flex items-center gap-1 text-xs text-[#64748B] mb-2">
                  <MapPin className="w-3 h-3" />
                  <span>Chợ Bến Thành, KP1</span>
                </div>
                <span className="inline-block px-2 py-0.5 bg-[#3B82F6]/10 text-[#3B82F6] text-xs rounded-full">
                  Đang thực hiện 🔄
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-14 h-8 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-[#F59E0B]">14:00</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-[#F59E0B]" />
                  <h3 className="font-semibold text-sm text-[#0F172A]">Họp định kỳ</h3>
                </div>
                <div className="flex items-center gap-1 text-xs text-[#64748B] mb-2">
                  <MapPin className="w-3 h-3" />
                  <span>Trụ sở CA Phường</span>
                </div>
                <span className="inline-block px-2 py-0.5 bg-[#F59E0B]/10 text-[#F59E0B] text-xs rounded-full">
                  Sắp diễn ra ⏰
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="px-4 mt-6 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#0F172A]">Thông báo mới</h2>
            <button className="text-sm text-[#366092] font-medium">Xem tất cả</button>
          </div>

          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <div className="w-2 h-2 bg-[#3B82F6] rounded-full mt-2 flex-shrink-0"></div>
              <div className="flex-1">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-4 h-4 text-[#3B82F6]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-[#0F172A] line-clamp-2">
                      Bạn được giao nhiệm vụ mới: Tuần tra khu vực chợ Bến Thành
                    </p>
                    <p className="text-xs text-[#64748B] mt-1">2 giờ trước</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <div className="flex-1 ml-5">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#10B981]/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-[#0F172A] line-clamp-2">
                      Đơn xin nghỉ phép của bạn đã được phê duyệt
                    </p>
                    <p className="text-xs text-[#64748B] mt-1">5 giờ trước</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <div className="flex-1 ml-5">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-[#F59E0B]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-[#0F172A] line-clamp-2">
                      Nhắc nhở: Họp định kỳ lúc 14:00 hôm nay
                    </p>
                    <p className="text-xs text-[#64748B] mt-1">Hôm qua, 20:30</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Weather Widget */}
      <div className="px-4 mb-6">
        <div className="bg-gradient-to-br from-[#3B82F6] to-[#60A5FA] rounded-xl p-4 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Phường Phú Định</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-4xl font-bold">32°C</span>
                <div className="text-5xl">☀️</div>
              </div>
              <p className="text-sm mt-1">Nắng, UV cao</p>
            </div>
            <div className="text-right">
              <div className="bg-white/20 rounded-lg px-3 py-2">
                <p className="text-xs opacity-90">Chỉ số UV</p>
                <p className="text-2xl font-bold">8</p>
                <p className="text-xs">Rất cao</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setShowEmergency(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-[#EF4444] text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform z-40"
      >
        <Phone className="w-6 h-6" />
      </button>
    </div>
  );
}