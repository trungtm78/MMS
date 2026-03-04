import { Bell, Plus, Users, MapPin, CheckCircle, BarChart3, AlertTriangle, TrendingUp, Shield, User } from 'lucide-react';

interface DashboardProps {
  onNavigate: (screen: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header with Gradient */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-6 rounded-b-3xl border-b-4 border-[#DC2626]">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white border-2 border-[#DC2626] flex items-center justify-center flex-shrink-0">
              <User className="text-[#DC2626]" size={32} />
            </div>
            <div>
              <p className="text-[#0F172A] text-sm font-semibold">Chào buổi sáng,</p>
              <h1 className="text-[#DC2626] text-xl font-extrabold">Trung úy Võ Văn Tân</h1>
              <span className="inline-block bg-[#DC2626] text-white text-xs px-3 py-1.5 rounded-full mt-2 font-bold shadow-sm">
                CA Khu vực 1 • Quản lý 28 DQTV
              </span>
            </div>
          </div>
          <div className="relative">
            <Bell className="text-[#DC2626]" size={24} />
            <span className="absolute -top-1 -right-1 bg-[#EF4444] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-semibold">3</span>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border-2 border-[#15803D]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#15803D] to-[#166534] flex items-center justify-center mb-3">
              <Users className="text-white" size={24} />
            </div>
            <p className="text-[#64748B] text-xs mb-1">Đang làm việc</p>
            <p className="text-[#0F172A] text-2xl font-bold mb-2">20<span className="text-base text-[#64748B]">/28</span></p>
            <div className="bg-[#F1F5F9] rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-[#15803D] to-[#166534] h-full rounded-full" style={{ width: '71%' }}></div>
            </div>
            <p className="text-[#15803D] text-xs mt-2 font-semibold">71% hoạt động</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-2 border-[#DC2626]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#DC2626] to-[#B91C1C] flex items-center justify-center mb-3">
              <BarChart3 className="text-white" size={24} />
            </div>
            <p className="text-[#64748B] text-xs mb-1">Chỉ tiêu Trung bình</p>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[#0F172A] text-2xl font-bold">89.2</p>
              <div className="flex items-center gap-1 bg-[#15803D] bg-opacity-10 px-2 py-1 rounded-full">
                <TrendingUp size={12} className="text-[#15803D]" />
                <span className="text-[#15803D] text-xs font-bold">+3.2%</span>
              </div>
            </div>
            <div className="bg-[#F1F5F9] rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-[#DC2626] to-[#B91C1C] h-full rounded-full" style={{ width: '89%' }}></div>
            </div>
            <p className="text-[#64748B] text-xs mt-2">Tăng so với tuần trước</p>
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="px-4 mt-6">
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => onNavigate('tasks')} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#FDE047]">
            <div className="w-12 h-12 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-2">
              <Plus className="text-white" size={24} />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Giao việc mới</p>
            <p className="text-xs text-[#64748B] text-center mt-1">Tạo nhiệm vụ</p>
          </button>

          <button onClick={() => onNavigate('dqtv')} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative border-2 border-[#FDE047]">
            <div className="w-12 h-12 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-2">
              <Users className="text-white" size={24} />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Quản lý DQTV</p>
            <p className="text-xs text-[#64748B] text-center mt-1">28 thành viên</p>
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#10B981] rounded-full"></span>
          </button>

          <button onClick={() => onNavigate('map')} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#FDE047]">
            <div className="w-12 h-12 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-2">
              <MapPin className="text-white" size={24} />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Xem GPS</p>
            <p className="text-xs text-[#64748B] text-center mt-1">Theo dõi vị trí</p>
          </button>

          <button onClick={() => onNavigate('approvals')} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative border-2 border-[#FDE047]">
            <div className="w-12 h-12 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-2">
              <CheckCircle className="text-white" size={24} />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Duyệt đơn</p>
            <p className="text-xs text-[#64748B] text-center mt-1">3 chờ duyệt</p>
            <span className="absolute top-2 right-2 bg-[#F59E0B] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-semibold">3</span>
          </button>

          <button onClick={() => onNavigate('reports')} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-2 border-[#FDE047]">
            <div className="w-12 h-12 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-2">
              <BarChart3 className="text-white" size={24} />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Báo cáo</p>
            <p className="text-xs text-[#64748B] text-center mt-1">Thống kê Chỉ tiêu</p>
          </button>

          <button onClick={() => onNavigate('alerts')} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative border-2 border-[#FDE047]">
            <div className="w-12 h-12 rounded-full bg-[#DC2626] flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="text-white" size={24} />
            </div>
            <p className="text-sm font-semibold text-[#0F172A] text-center">Cảnh báo</p>
            <p className="text-xs text-[#64748B] text-center mt-1">2 cần xử lý</p>
            <span className="absolute top-2 right-2 bg-[#EF4444] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-semibold">2</span>
          </button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="px-4 mt-6">
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          <div className="bg-white rounded-xl p-4 shadow-sm min-w-[140px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
              <p className="text-xs text-[#64748B]">Đang hoạt động</p>
            </div>
            <p className="text-3xl font-bold text-[#10B981]">20</p>
            <p className="text-xs text-[#64748B] mt-1">71% DQTV</p>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm min-w-[140px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-[#F59E0B] rounded-full"></div>
              <p className="text-xs text-[#64748B]">Nghỉ phép</p>
            </div>
            <p className="text-3xl font-bold text-[#F59E0B]">3</p>
            <p className="text-xs text-[#64748B] mt-1">10.7%</p>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm min-w-[140px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-[#EF4444] rounded-full"></div>
              <p className="text-xs text-[#64748B]">Offline</p>
            </div>
            <p className="text-3xl font-bold text-[#EF4444]">5</p>
            <p className="text-xs text-[#64748B] mt-1">17.9%</p>
          </div>
        </div>
      </div>

      {/* Tasks Summary */}
      <div className="px-4 mt-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-[#0F172A] mb-4">Nhiệm vụ hôm nay</h2>
          <div className="flex items-center justify-center">
            <div className="relative w-44 h-44">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="88" cy="88" r="70" stroke="#F1F5F9" strokeWidth="16" fill="none" />
                <circle cx="88" cy="88" r="70" stroke="#10B981" strokeWidth="16" fill="none" 
                  strokeDasharray="440" strokeDashoffset="167" strokeLinecap="round" />
                <circle cx="88" cy="88" r="70" stroke="#3B82F6" strokeWidth="16" fill="none" 
                  strokeDasharray="440" strokeDashoffset="57" strokeLinecap="round" />
                <circle cx="88" cy="88" r="70" stroke="#EF4444" strokeWidth="16" fill="none" 
                  strokeDasharray="440" strokeDashoffset="0" strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-bold text-[#0F172A]">8</p>
                <p className="text-xs text-[#64748B]">Tổng số</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
                <p className="text-xs text-[#64748B]">Hoàn thành</p>
              </div>
              <p className="text-lg font-bold text-[#10B981]">5</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <div className="w-2 h-2 bg-[#3B82F6] rounded-full"></div>
                <p className="text-xs text-[#64748B]">Đang làm</p>
              </div>
              <p className="text-lg font-bold text-[#3B82F6]">2</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <div className="w-2 h-2 bg-[#EF4444] rounded-full"></div>
                <p className="text-xs text-[#64748B]">Quá hạn</p>
              </div>
              <p className="text-lg font-bold text-[#EF4444]">1</p>
            </div>
          </div>
        </div>
      </div>

      {/* Urgent Alerts */}
      <div className="px-4 mt-6">
        <h2 className="text-lg font-semibold text-[#0F172A] mb-3">Cảnh báo khẩn</h2>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-[#EF4444]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#EF4444] bg-opacity-10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="text-[#EF4444]" size={20} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#EF4444]">Nhiệm vụ quá hạn</p>
              <p className="text-sm text-[#0F172A] mt-1">NV-2024-001 - Nguyễn Văn An</p>
              <p className="text-xs text-[#64748B] mt-1">Quá hạn: 12 giờ</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button 
              onClick={() => onNavigate('alerts')}
              className="flex-1 bg-[#366092] text-white text-sm font-medium py-2 rounded-lg hover:bg-[#2A4A6F] transition-colors"
            >
              Xem
            </button>
            <button 
              onClick={() => {
                // In production, this would trigger phone call
                window.alert('Đang gọi cho Nguyễn Văn An...\n📞 0901234567');
              }}
              className="flex-1 border border-[#366092] text-[#366092] text-sm font-medium py-2 rounded-lg hover:bg-[#EFF6FF] transition-colors"
            >
              Gọi
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="px-4 mt-6 pb-6">
        <h2 className="text-lg font-semibold text-[#0F172A] mb-3">Hoạt động gần đây</h2>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
                <div className="w-0.5 h-full bg-[#E2E8F0] mt-1"></div>
              </div>
              <div className="flex-1">
                <p className="text-xs text-[#64748B]">14:30</p>
                <p className="text-sm text-[#0F172A]">Nguyễn Văn An hoàn thành NV-001</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-2 h-2 bg-[#3B82F6] rounded-full"></div>
                <div className="w-0.5 h-full bg-[#E2E8F0] mt-1"></div>
              </div>
              <div className="flex-1">
                <p className="text-xs text-[#64748B]">13:15</p>
                <p className="text-sm text-[#0F172A]">Trần Thị Bình cập nhật tiến độ</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-2 h-2 bg-[#F59E0B] rounded-full"></div>
              </div>
              <div className="flex-1">
                <p className="text-xs text-[#64748B]">12:00</p>
                <p className="text-sm text-[#0F172A]">Đơn nghỉ phép từ Lê Văn C</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAB */}
      <button onClick={() => onNavigate('tasks')} className="fixed bottom-20 right-4 w-14 h-14 bg-[#366092] rounded-full shadow-lg flex items-center justify-center hover:shadow-xl transition-shadow">
        <Plus className="text-white" size={28} />
      </button>
    </div>
  );
}