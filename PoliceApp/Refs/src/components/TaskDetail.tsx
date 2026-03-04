import { ArrowLeft, CheckCircle, Clock, MapPin, User, Phone, MessageCircle, Calendar, Camera, ChevronRight, AlertCircle, Share2, MoreVertical, Bell, Navigation } from 'lucide-react';
import { useState } from 'react';

interface TaskDetailProps {
  onNavigate: (screen: string) => void;
}

export default function TaskDetail({ onNavigate }: TaskDetailProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Chi tiết nhiệm vụ</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2">
              <Share2 className="text-[#64748B]" size={20} />
            </button>
            <button className="p-2">
              <MoreVertical className="text-[#64748B]" size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* Hero Section */}
        <div className="bg-white rounded-xl p-4 shadow-sm text-center relative">
          <span className="absolute top-4 right-4 px-3 py-1 bg-[#EF4444] text-white text-xs font-medium rounded-full">
            Khẩn cấp
          </span>
          <span className="inline-block px-6 py-2 bg-[#3B82F6] text-white text-base font-semibold rounded-full">
            Đang thực hiện
          </span>
        </div>

        {/* Overview Card */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-xl font-bold text-[#0F172A] mb-2">Tuần tra khu vực chợ Bến Thành</h2>
          <span className="inline-block px-3 py-1 bg-[#EFF6FF] text-[#366092] text-sm rounded-full mb-3">
            🚶 Tuần tra
          </span>
          <p className="text-sm text-[#64748B] mb-4 leading-relaxed">
            Thực hiện tuần tra khu vực chợ Bến Thành và các tuyến phố xung quanh. Kiểm tra an ninh trật tự, 
            hỗ trợ người dân khi cần thiết. Báo cáo ngay các tình huống bất thường.
          </p>
          <div className="flex items-center gap-2 pt-3 border-t border-[#F1F5F9]">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
              T
            </div>
            <div>
              <p className="text-xs text-[#64748B]">Giao bởi:</p>
              <p className="text-sm font-medium text-[#0F172A]">Trung úy Võ Tân</p>
            </div>
            <span className="ml-auto text-xs text-[#64748B]">20/12/2024 10:00</span>
          </div>
        </div>

        {/* Timeline Card */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-base font-semibold text-[#0F172A] mb-4">Tiến độ</h3>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-[#10B981] flex items-center justify-center">
                  <CheckCircle className="text-white" size={14} />
                </div>
                <div className="w-0.5 h-full bg-[#10B981] mt-1"></div>
              </div>
              <div className="flex-1 pb-4">
                <p className="text-sm font-medium text-[#0F172A]">Đã tạo</p>
                <p className="text-xs text-[#64748B]">20/12 10:00</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-[#10B981] flex items-center justify-center">
                  <CheckCircle className="text-white" size={14} />
                </div>
                <div className="w-0.5 h-full bg-[#10B981] mt-1"></div>
              </div>
              <div className="flex-1 pb-4">
                <p className="text-sm font-medium text-[#0F172A]">Đã gửi</p>
                <p className="text-xs text-[#64748B]">20/12 10:01</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-[#10B981] flex items-center justify-center">
                  <CheckCircle className="text-white" size={14} />
                </div>
                <div className="w-0.5 h-full bg-[#3B82F6] mt-1"></div>
              </div>
              <div className="flex-1 pb-4">
                <p className="text-sm font-medium text-[#0F172A]">Đã tiếp nhận</p>
                <p className="text-xs text-[#64748B]">20/12 10:20</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-[#3B82F6] flex items-center justify-center animate-pulse">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
                <div className="w-0.5 h-full bg-[#E2E8F0] mt-1"></div>
              </div>
              <div className="flex-1 pb-4">
                <p className="text-sm font-medium text-[#0F172A]">Đang thực hiện</p>
                <p className="text-xs text-[#64748B] mb-2">20/12 11:00</p>
                <div className="ml-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 bg-[#3B82F6] rounded-full mt-1.5"></div>
                    <div>
                      <p className="text-xs text-[#0F172A]">Đã đến địa điểm</p>
                      <p className="text-xs text-[#64748B]">11:30</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 bg-[#3B82F6] rounded-full mt-1.5"></div>
                    <div>
                      <p className="text-xs text-[#0F172A]">Đang tuần tra</p>
                      <p className="text-xs text-[#64748B]">12:00</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-[#F59E0B] flex items-center justify-center">
                  <Clock className="text-white" size={14} />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#0F172A]">Deadline</p>
                <p className="text-xs text-[#64748B] mb-1">25/12 18:00</p>
                <span className="inline-block px-2 py-1 bg-[#FFF7ED] text-[#F59E0B] text-xs font-medium rounded">
                  Còn 2 giờ
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* DQTV Assigned Card */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-base font-semibold text-[#0F172A] mb-4">Người thực hiện</h3>
          <div className="text-center mb-4">
            <div className="w-16 h-16 rounded-full bg-white border-2 border-[#366092] mx-auto mb-2 flex items-center justify-center">
              <User className="text-[#366092]" size={32} />
            </div>
            <h4 className="text-lg font-bold text-[#0F172A]">Nguyễn Văn An</h4>
            <div className="flex items-center justify-center gap-2 mt-1">
              <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
              <span className="text-sm text-[#64748B]">Online</span>
            </div>
            <p className="text-sm text-[#64748B] mt-1 flex items-center justify-center gap-1">
              <MapPin size={14} />
              2.5 km từ nhiệm vụ
            </p>
            <span className="inline-block mt-2 px-3 py-1 bg-[#D1FAE5] text-[#10B981] text-sm font-bold rounded-full">
              Chỉ tiêu: 92.4
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button className="flex flex-col items-center justify-center py-3 bg-[#366092] text-white rounded-lg">
              <Phone size={18} className="mb-1" />
              <span className="text-xs">Gọi</span>
            </button>
            <button className="flex flex-col items-center justify-center py-3 border border-[#366092] text-[#366092] rounded-lg">
              <MessageCircle size={18} className="mb-1" />
              <span className="text-xs">Nhắn</span>
            </button>
            <button className="flex flex-col items-center justify-center py-3 border border-[#366092] text-[#366092] rounded-lg">
              <MapPin size={18} className="mb-1" />
              <span className="text-xs">Vị trí</span>
            </button>
            <button className="flex flex-col items-center justify-center py-3 border border-[#366092] text-[#366092] rounded-lg">
              <Bell size={18} className="mb-1" />
              <span className="text-xs">Nhắc</span>
            </button>
          </div>
        </div>

        {/* Location Card */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-base font-semibold text-[#0F172A] mb-3">Địa điểm</h3>
          <div className="w-full h-48 bg-gradient-to-br from-[#E8F4F8] to-[#D0E8F0] rounded-xl mb-3 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMCIgb3BhY2l0eT0iMC4xIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')]"></div>
            <MapPin className="text-[#EF4444]" size={48} />
          </div>
          <p className="text-sm font-medium text-[#0F172A] mb-1">Chợ Bến Thành, Quận 1</p>
          <p className="text-sm text-[#64748B] mb-3">500m từ vị trí hiện tại</p>
          <button className="w-full h-12 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium hover:bg-[#EFF6FF] transition-colors flex items-center justify-center gap-2">
            <Navigation size={18} />
            Chỉ đường
          </button>
        </div>

        {/* Progress Updates */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-base font-semibold text-[#0F172A] mb-4">Cập nhật tiến độ</h3>
          <div className="space-y-4">
            <div className="border-l-2 border-[#3B82F6] pl-4">
              <p className="text-xs text-[#64748B] mb-1">12:30</p>
              <p className="text-sm font-medium text-[#0F172A] mb-2">Đã đến địa điểm</p>
              <div className="w-20 h-20 rounded-lg bg-gray-200 overflow-hidden">
                <img src="https://images.unsplash.com/photo-1555421689-d68471e189f2?w=200&h=200&fit=crop" alt="Update" className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center gap-1 mt-2">
                <CheckCircle className="text-[#10B981]" size={14} />
                <span className="text-xs text-[#10B981]">GPS đã xác nhận</span>
              </div>
            </div>

            <div className="border-l-2 border-[#3B82F6] pl-4">
              <p className="text-xs text-[#64748B] mb-1">13:00</p>
              <p className="text-sm font-medium text-[#0F172A] mb-2">Đang tuần tra</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="aspect-square rounded-lg bg-gray-200 overflow-hidden">
                  <img src="https://images.unsplash.com/photo-1555421689-d68471e189f2?w=200&h=200&fit=crop" alt="Photo 1" className="w-full h-full object-cover" />
                </div>
                <div className="aspect-square rounded-lg bg-gray-200 overflow-hidden">
                  <img src="https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=200&h=200&fit=crop" alt="Photo 2" className="w-full h-full object-cover" />
                </div>
                <div className="aspect-square rounded-lg bg-gray-200 overflow-hidden">
                  <img src="https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=200&h=200&fit=crop" alt="Photo 3" className="w-full h-full object-cover" />
                </div>
              </div>
              <p className="text-xs text-[#64748B] mt-2">Khu vực an toàn, không phát hiện vấn đề gì bất thường.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-[#E2E8F0] p-4 shadow-lg">
        <div className="flex gap-3">
          <button className="flex-1 h-12 bg-[#366092] text-white rounded-lg text-sm font-medium">
            Gọi DQTV
          </button>
          <button className="flex-1 h-12 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium">
            Xem vị trí
          </button>
        </div>
      </div>
    </div>
  );
}