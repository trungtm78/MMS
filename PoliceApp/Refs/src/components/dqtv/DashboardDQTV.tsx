import { Bell, ClipboardList, Clock, MapPin, CheckCircle, TrendingUp, User, AlertTriangle } from 'lucide-react';

interface DashboardDQTVProps {
  onNavigate: (screen: string) => void;
  currentUser: string;
}

export default function DashboardDQTV({ onNavigate, currentUser }: DashboardDQTVProps) {
  // Map username to display name
  const getUserName = (username: string) => {
    const userMap: { [key: string]: string } = {
      'dqtv001': 'Nguyễn Văn An',
      'dqtv002': 'Trần Thị Bình',
      'dqtv003': 'Lê Văn Cường',
    };
    return userMap[username] || 'DQTV';
  };

  const displayName = getUserName(currentUser);

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header with Gradient */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-6 rounded-b-3xl border-b-4 border-[#DC2626]">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white border-2 border-[#DC2626] flex items-center justify-center flex-shrink-0">
              <User className="text-[#DC2626]" size={32} />
            </div>
            <div>
              <p className="text-[#0F172A] text-sm font-semibold">Chào buổi sáng,</p>
              <h1 className="text-[#DC2626] text-xl font-extrabold">{displayName}</h1>
              <span className="inline-block bg-[#DC2626] text-white text-xs px-3 py-1.5 rounded-full mt-2 font-bold shadow-sm">
                DQTV - CA Khu vực 1
              </span>
            </div>
          </div>
          <div className="relative">
            <Bell className="text-[#DC2626]" size={24} />
            <span className="absolute -top-1 -right-1 bg-[#EF4444] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-semibold">2</span>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border-2 border-[#15803D]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#15803D] to-[#166534] flex items-center justify-center mb-3">
              <ClipboardList className="text-white" size={24} />
            </div>
            <p className="text-[#64748B] text-xs mb-1">Nhiệm vụ hôm nay</p>
            <p className="text-[#0F172A] text-2xl font-bold mb-2">3<span className="text-base text-[#64748B]">/5</span></p>
            <div className="bg-[#F1F5F9] rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-[#15803D] to-[#166534] h-full rounded-full" style={{ width: '60%' }}></div>
            </div>
            <p className="text-[#15803D] text-xs mt-2 font-semibold">60% hoàn thành</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-2 border-[#DC2626]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#DC2626] to-[#B91C1C] flex items-center justify-center mb-3">
              <TrendingUp className="text-white" size={24} />
            </div>
            <p className="text-[#64748B] text-xs mb-1">Chỉ tiêu tháng này</p>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[#0F172A] text-2xl font-bold">92.4</p>
              <div className="flex items-center gap-1 bg-[#15803D] bg-opacity-10 px-2 py-1 rounded-full">
                <TrendingUp size={12} className="text-[#15803D]" />
                <span className="text-[#15803D] text-xs font-bold">+5.2</span>
              </div>
            </div>
            <div className="bg-[#F1F5F9] rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-[#DC2626] to-[#B91C1C] h-full rounded-full" style={{ width: '92%' }}></div>
            </div>
            <p className="text-[#64748B] text-xs mt-2">Xuất sắc</p>
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="px-4 mt-6">
        <h2 className="text-lg font-extrabold text-[#0F172A] mb-3">Thao tác nhanh</h2>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('tasks')} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#FDE047]">
            <div className="w-12 h-12 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-2">
              <ClipboardList className="text-white" size={24} />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Nhiệm vụ</p>
            <p className="text-xs text-[#64748B] text-center mt-1">3 việc đang chờ</p>
          </button>

          <button onClick={() => onNavigate('checkin')} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#FDE047]">
            <div className="w-12 h-12 rounded-full bg-[#15803D] flex items-center justify-center mx-auto mb-2">
              <Clock className="text-white" size={24} />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Chấm công</p>
            <p className="text-xs text-[#64748B] text-center mt-1">Đã check-in</p>
          </button>

          <button onClick={() => onNavigate('report')} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#FDE047]">
            <div className="w-12 h-12 rounded-full bg-[#F59E0B] flex items-center justify-center mx-auto mb-2">
              <MapPin className="text-white" size={24} />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Báo cáo</p>
            <p className="text-xs text-[#64748B] text-center mt-1">Gửi báo cáo</p>
          </button>

          <button onClick={() => onNavigate('profile')} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#FDE047]">
            <div className="w-12 h-12 rounded-full bg-[#3B82F6] flex items-center justify-center mx-auto mb-2">
              <User className="text-white" size={24} />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Hồ sơ</p>
            <p className="text-xs text-[#64748B] text-center mt-1">Thông tin cá nhân</p>
          </button>
        </div>
      </div>

      {/* Today's Tasks */}
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-extrabold text-[#0F172A]">Nhiệm vụ hôm nay</h2>
          <button onClick={() => onNavigate('tasks')} className="text-sm text-[#DC2626] font-bold">
            Xem tất cả
          </button>
        </div>
        <div className="space-y-3">
          {/* Task 1 */}
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-[#15803D]">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-semibold text-[#0F172A] mb-1">Tuần tra khu vực 1</h3>
                <p className="text-xs text-[#64748B]">08:00 - 12:00 • Chợ Bến Thành, KP1</p>
              </div>
              <span className="px-2 py-1 bg-[#DCFCE7] text-[#15803D] rounded-full text-xs font-bold">
                Hoàn thành
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#64748B]">
              <CheckCircle size={14} className="text-[#15803D]" />
              <span>Đã hoàn thành lúc 11:45</span>
            </div>
          </div>

          {/* Task 2 */}
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-[#F59E0B]">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-semibold text-[#0F172A] mb-1">Tuyên truyền PCCC</h3>
                <p className="text-xs text-[#64748B]">14:00 - 16:00 • Đường Lê Lợi</p>
              </div>
              <span className="px-2 py-1 bg-[#FEF3C7] text-[#F59E0B] rounded-full text-xs font-bold">
                Đang thực hiện
              </span>
            </div>
            <div className="bg-[#F1F5F9] rounded-full h-2 overflow-hidden mt-2">
              <div className="bg-[#F59E0B] h-full rounded-full" style={{ width: '45%' }}></div>
            </div>
          </div>

          {/* Task 3 */}
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-[#64748B]">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-semibold text-[#0F172A] mb-1">Kiểm tra ANTT tại khu dân cư</h3>
                <p className="text-xs text-[#64748B]">18:00 - 20:00 • KP2</p>
              </div>
              <span className="px-2 py-1 bg-[#F1F5F9] text-[#64748B] rounded-full text-xs font-bold">
                Chưa bắt đầu
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="px-4 mt-6 mb-4">
        <h2 className="text-lg font-extrabold text-[#0F172A] mb-3">Thông báo</h2>
        <div className="space-y-2">
          <div className="bg-white rounded-xl p-3 shadow-sm flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#FEE2E2] flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="text-[#DC2626]" size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#0F172A]">Nhắc nhở: Chấm công ca chiều</p>
              <p className="text-xs text-[#64748B] mt-1">Vui lòng chấm công trước 18:00</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 shadow-sm flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
              <CheckCircle className="text-[#15803D]" size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#0F172A]">Báo cáo đã được duyệt</p>
              <p className="text-xs text-[#64748B] mt-1">Báo cáo ngày 24/02 đã được phê duyệt</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
