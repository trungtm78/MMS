import { ArrowLeft, Filter, Bell, AlertTriangle, AlertCircle, Info, Clock, MapPin, User, TrendingDown, WifiOff, Calendar, X as XIcon, Phone, MessageCircle, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface AlertsProps {
  onNavigate: (screen: string) => void;
}

export default function Alerts({ onNavigate }: AlertsProps) {
  const [selectedTab, setSelectedTab] = useState('all');
  const [selectedAlert, setSelectedAlert] = useState<number | null>(null);

  const alerts = [
    {
      id: 1,
      type: 'urgent',
      category: 'absence',
      title: 'DQTV vắng mặt không báo trước',
      dqtv: 'Võ Văn Minh',
      code: 'HCM-PHD-T12-0005',
      description: 'Không chấm công và không liên lạc được từ 8:00 sáng. Có 2 nhiệm vụ đang pending.',
      time: '5 phút trước',
      timestamp: '22/01 08:15',
      isRead: false,
      impact: 'Cao',
      tasks: ['NV-2024-045', 'NV-2024-048'],
      location: 'Không xác định',
      lastSeen: '21/01 18:30'
    },
    {
      id: 2,
      type: 'important',
      category: 'deadline',
      title: 'Nhiệm vụ sắp quá hạn',
      dqtv: 'Lê Văn Cường',
      code: 'HCM-PHD-T12-0003',
      description: 'Nhiệm vụ tuần tra khu vực chợ sẽ quá deadline trong 30 phút. Tiến độ hiện tại: 60%.',
      time: '15 phút trước',
      timestamp: '22/01 08:00',
      isRead: false,
      impact: 'Trung bình',
      tasks: ['NV-2024-042'],
      location: 'Chợ Bến Thành, Q1',
      progress: 60
    },
    {
      id: 3,
      type: 'urgent',
      category: 'kpi',
      title: 'Chỉ tiêu giảm mạnh',
      dqtv: 'Đặng Thị Nga',
      code: 'HCM-PHD-T12-0008',
      description: 'Chỉ tiêu giảm từ 78.5 xuống 65.2 trong 3 ngày. Có dấu hiệu bất thường.',
      time: '1 giờ trước',
      timestamp: '22/01 07:15',
      isRead: false,
      impact: 'Cao',
      kpiChange: -13.3,
      oldKpi: 78.5,
      newKpi: 65.2
    },
    {
      id: 4,
      type: 'important',
      category: 'gps',
      title: 'GPS bị tắt',
      dqtv: 'Hoàng Văn Hải',
      code: 'HCM-PHD-T12-0006',
      description: 'GPS đã bị tắt trong 45 phút. Không thể theo dõi vị trí.',
      time: '2 giờ trước',
      timestamp: '22/01 06:30',
      isRead: true,
      impact: 'Trung bình',
      location: 'Vị trí cuối: Phú Nhuận',
      lastSeen: '22/01 06:30'
    },
    {
      id: 5,
      type: 'normal',
      category: 'violation',
      title: 'Vi phạm quy định chấm công',
      dqtv: 'Phạm Thị Dung',
      code: 'HCM-PHD-T12-0004',
      description: 'Đi trễ 3 lần trong tuần (thứ 2, 4, 6). Cần nhắc nhở.',
      time: '3 giờ trước',
      timestamp: '22/01 05:30',
      isRead: true,
      impact: 'Thấp',
      violations: ['Trễ 15p - 20/01', 'Trễ 22p - 21/01', 'Trễ 18p - 22/01']
    },
    {
      id: 6,
      type: 'normal',
      category: 'task',
      title: 'Nhiệm vụ chưa cập nhật tiến độ',
      dqtv: 'Nguyễn Văn An',
      code: 'HCM-PHD-T12-0001',
      description: 'Nhiệm vụ NV-2024-040 chưa có cập nhật tiến độ sau 24 giờ.',
      time: '5 giờ trước',
      timestamp: '22/01 03:30',
      isRead: true,
      impact: 'Thấp',
      tasks: ['NV-2024-040'],
      lastUpdate: '21/01 08:30'
    },
  ];

  const filteredAlerts = alerts.filter(a => {
    if (selectedTab === 'all') return true;
    if (selectedTab === 'unread') return !a.isRead;
    if (selectedTab === 'read') return a.isRead;
    return true;
  });

  const selectedAlertData = selectedAlert ? alerts.find(a => a.id === selectedAlert) : null;

  const getAlertIcon = (category: string) => {
    switch (category) {
      case 'absence': return User;
      case 'deadline': return Clock;
      case 'kpi': return TrendingDown;
      case 'gps': return WifiOff;
      case 'violation': return AlertCircle;
      case 'task': return Calendar;
      default: return Info;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'urgent': return { bg: '#FEE2E2', border: '#EF4444', text: '#EF4444', badge: '#DC2626' };
      case 'important': return { bg: '#FFF7ED', border: '#F59E0B', text: '#F59E0B', badge: '#EA580C' };
      case 'normal': return { bg: '#EFF6FF', border: '#3B82F6', text: '#3B82F6', badge: '#2563EB' };
      default: return { bg: '#F8FAFC', border: '#64748B', text: '#64748B', badge: '#475569' };
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Cảnh báo</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bell className="text-[#EF4444]" size={22} />
              {alerts.filter(a => !a.isRead).length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#EF4444] text-white text-xs flex items-center justify-center rounded-full font-bold">
                  {alerts.filter(a => !a.isRead).length}
                </span>
              )}
            </div>
            <button className="p-2">
              <Filter className="text-[#64748B]" size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button
            onClick={() => setSelectedTab('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedTab === 'all'
                ? 'bg-[#366092] text-white'
                : 'bg-[#F8FAFC] text-[#64748B]'
            }`}
          >
            Tất cả ({alerts.length})
          </button>
          <button
            onClick={() => setSelectedTab('unread')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedTab === 'unread'
                ? 'bg-[#EF4444] text-white'
                : 'bg-[#F8FAFC] text-[#64748B]'
            }`}
          >
            Chưa đọc ({alerts.filter(a => !a.isRead).length})
          </button>
          <button
            onClick={() => setSelectedTab('read')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedTab === 'read'
                ? 'bg-[#10B981] text-white'
                : 'bg-[#F8FAFC] text-[#64748B]'
            }`}
          >
            Đã đọc ({alerts.filter(a => a.isRead).length})
          </button>
        </div>
      </div>

      {/* Alert Cards */}
      <div className="px-4 pt-4 space-y-3">
        {filteredAlerts.map((alert) => {
          const Icon = getAlertIcon(alert.category);
          const colors = getAlertColor(alert.type);
          
          return (
            <div
              key={alert.id}
              onClick={() => setSelectedAlert(alert.id)}
              className={`bg-white rounded-xl p-4 shadow-sm border-l-4 cursor-pointer transition-all ${
                !alert.isRead ? 'bg-opacity-100' : 'bg-opacity-60'
              }`}
              style={{ borderLeftColor: colors.border }}
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: colors.bg }}
                >
                  <Icon style={{ color: colors.text }} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className={`font-semibold text-[#0F172A] ${!alert.isRead ? 'font-bold' : ''}`}>
                      {alert.title}
                    </h4>
                    {!alert.isRead && (
                      <span className="w-2 h-2 bg-[#EF4444] rounded-full flex-shrink-0 mt-1.5"></span>
                    )}
                  </div>
                  <p className="text-xs text-[#64748B]">{alert.dqtv} • {alert.code}</p>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-[#64748B] mb-3 line-clamp-2 leading-relaxed">
                {alert.description}
              </p>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="text-[#64748B]" size={14} />
                  <span className="text-xs text-[#64748B]">{alert.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span 
                    className="px-2 py-1 rounded-full text-xs font-medium"
                    style={{ 
                      backgroundColor: colors.bg,
                      color: colors.badge
                    }}
                  >
                    {alert.type === 'urgent' ? 'Khẩn cấp' : 
                     alert.type === 'important' ? 'Quan trọng' : 
                     'Thông thường'}
                  </span>
                  <ChevronRight className="text-[#64748B]" size={16} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {selectedAlertData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white px-4 pt-4 pb-3 border-b border-[#F1F5F9]">
              <div className="w-12 h-1 bg-[#CBD5E1] rounded-full mx-auto mb-3"></div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#0F172A]">Chi tiết cảnh báo</h2>
                <button onClick={() => setSelectedAlert(null)} className="p-2">
                  <XIcon className="text-[#64748B]" size={24} />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Alert Type Badge */}
              <div className="text-center">
                {(() => {
                  const Icon = getAlertIcon(selectedAlertData.category);
                  const colors = getAlertColor(selectedAlertData.type);
                  return (
                    <>
                      <div 
                        className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
                        style={{ backgroundColor: colors.bg }}
                      >
                        <Icon style={{ color: colors.text }} size={32} />
                      </div>
                      <span 
                        className="inline-block px-4 py-2 rounded-full text-sm font-bold mb-2"
                        style={{ 
                          backgroundColor: colors.bg,
                          color: colors.badge
                        }}
                      >
                        {selectedAlertData.type === 'urgent' ? '🚨 KHẨN CẤP' : 
                         selectedAlertData.type === 'important' ? '⚠️ QUAN TRỌNG' : 
                         'ℹ️ THÔNG THƯỜNG'}
                      </span>
                    </>
                  );
                })()}
              </div>

              {/* Title */}
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0]">
                <h3 className="text-lg font-bold text-[#0F172A] mb-2">{selectedAlertData.title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  {selectedAlertData.description}
                </p>
              </div>

              {/* DQTV Info */}
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0]">
                <h4 className="font-semibold text-[#0F172A] mb-3">Dân quân</h4>
                <div className="flex items-center gap-3 p-3 bg-[#F8FAFC] rounded-lg mb-3">
                  <div className="w-12 h-12 rounded-full bg-[#366092] bg-opacity-10 flex items-center justify-center">
                    <User className="text-[#366092]" size={24} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#0F172A]">{selectedAlertData.dqtv}</p>
                    <p className="text-xs text-[#64748B]">{selectedAlertData.code}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="h-10 bg-[#366092] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                    <Phone size={16} />
                    Gọi
                  </button>
                  <button className="h-10 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                    <MessageCircle size={16} />
                    Nhắn tin
                  </button>
                </div>
              </div>

              {/* Details based on category */}
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0]">
                <h4 className="font-semibold text-[#0F172A] mb-3">Thông tin chi tiết</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-[#F1F5F9]">
                    <span className="text-sm text-[#64748B]">Thời gian:</span>
                    <span className="text-sm font-medium text-[#0F172A]">{selectedAlertData.timestamp}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[#F1F5F9]">
                    <span className="text-sm text-[#64748B]">Mức độ:</span>
                    <span className={`text-sm font-bold ${
                      selectedAlertData.impact === 'Cao' ? 'text-[#EF4444]' :
                      selectedAlertData.impact === 'Trung bình' ? 'text-[#F59E0B]' :
                      'text-[#10B981]'
                    }`}>
                      {selectedAlertData.impact}
                    </span>
                  </div>
                  
                  {selectedAlertData.location && (
                    <div className="flex items-start justify-between py-2 border-b border-[#F1F5F9]">
                      <span className="text-sm text-[#64748B]">Vị trí:</span>
                      <span className="text-sm font-medium text-[#0F172A] text-right flex-1 ml-3">
                        {selectedAlertData.location}
                      </span>
                    </div>
                  )}

                  {selectedAlertData.tasks && (
                    <div className="py-2 border-b border-[#F1F5F9]">
                      <span className="text-sm text-[#64748B] block mb-2">Nhiệm vụ liên quan:</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedAlertData.tasks.map((task, idx) => (
                          <span key={idx} className="px-3 py-1 bg-[#EFF6FF] text-[#366092] text-xs font-medium rounded-full">
                            {task}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedAlertData.kpiChange && (
                    <div className="py-2 border-b border-[#F1F5F9]">
                      <span className="text-sm text-[#64748B] block mb-2">Thay đổi Chỉ tiêu:</span>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-[#64748B]">{selectedAlertData.oldKpi}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-px bg-[#E2E8F0] flex-1 w-12"></div>
                          <TrendingDown className="text-[#EF4444]" size={20} />
                        </div>
                        <span className="text-2xl font-bold text-[#EF4444]">{selectedAlertData.newKpi}</span>
                      </div>
                      <p className="text-center mt-2">
                        <span className="text-lg font-bold text-[#EF4444]">{selectedAlertData.kpiChange}</span>
                        <span className="text-sm text-[#64748B] ml-1">điểm</span>
                      </p>
                    </div>
                  )}

                  {selectedAlertData.violations && (
                    <div className="py-2">
                      <span className="text-sm text-[#64748B] block mb-2">Lịch sử vi phạm:</span>
                      <div className="space-y-2">
                        {selectedAlertData.violations.map((v, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <AlertCircle className="text-[#F59E0B]" size={14} />
                            <span className="text-[#0F172A]">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedAlertData.progress !== undefined && (
                    <div className="py-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[#64748B]">Tiến độ hiện tại:</span>
                        <span className="text-sm font-bold text-[#366092]">{selectedAlertData.progress}%</span>
                      </div>
                      <div className="w-full bg-[#E2E8F0] rounded-full h-3">
                        <div 
                          className="bg-[#366092] h-3 rounded-full transition-all"
                          style={{ width: `${selectedAlertData.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {selectedAlertData.lastSeen && (
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-[#64748B]">Lần cuối online:</span>
                      <span className="text-sm font-medium text-[#0F172A]">{selectedAlertData.lastSeen}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Suggested Actions */}
              <div className="bg-[#FFF7ED] rounded-xl p-4 border border-[#F59E0B]">
                <div className="flex items-start gap-2 mb-3">
                  <Info className="text-[#F59E0B] flex-shrink-0 mt-0.5" size={18} />
                  <div>
                    <h4 className="font-semibold text-[#F59E0B] mb-1">Đề xuất hành động</h4>
                    <p className="text-sm text-[#64748B]">
                      {selectedAlertData.category === 'absence' && 'Liên hệ ngay với DQTV và người quản lý. Phân công lại nhiệm vụ cho người khác.'}
                      {selectedAlertData.category === 'deadline' && 'Nhắc nhở DQTV về deadline. Kiểm tra tiến độ và hỗ trợ nếu cần.'}
                      {selectedAlertData.category === 'kpi' && 'Trao đổi trực tiếp với DQTV để tìm hiểu nguyên nhân. Lập kế hoạch cải thiện.'}
                      {selectedAlertData.category === 'gps' && 'Yêu cầu DQTV bật GPS ngay. Kiểm tra thiết bị và ứng dụng.'}
                      {selectedAlertData.category === 'violation' && 'Gửi nhắc nhở chính thức. Ghi nhận vào hồ sơ và theo dõi.'}
                      {selectedAlertData.category === 'task' && 'Nhắc nhở cập nhật tiến độ. Kiểm tra xem có vướng mắc gì không.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Action Buttons */}
            <div className="sticky bottom-0 bg-white border-t border-[#E2E8F0] p-4 shadow-lg">
              <div className="flex gap-3">
                <button 
                  onClick={() => setSelectedAlert(null)}
                  className="flex-1 h-12 border border-[#64748B] text-[#64748B] rounded-lg text-sm font-medium"
                >
                  Đóng
                </button>
                <button className="flex-1 h-12 bg-[#366092] text-white rounded-lg text-sm font-medium">
                  Đánh dấu đã xử lý
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}