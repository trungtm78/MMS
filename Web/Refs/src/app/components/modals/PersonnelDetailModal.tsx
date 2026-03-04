import { X, User, Phone, Mail, MapPin, Calendar, Award, Clock, Edit, Trash2, History, FileText } from 'lucide-react';
import { useState } from 'react';

interface PersonnelDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  personnel: {
    id: string;
    code: string;
    name: string;
    rank?: string;
    position?: string;
    phone: string;
    email?: string;
    address: string;
    district: string;
    dateOfBirth?: string;
    joinDate?: string;
    workingDays?: number;
    chiTieu?: number;
    status: 'active' | 'leave' | 'inactive';
  };
}

export function PersonnelDetailModal({ isOpen, onClose, onEdit, onDelete, personnel }: PersonnelDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'tasks' | 'attendance' | 'history'>('info');

  if (!isOpen) return null;

  const getStatusColor = (status: typeof personnel.status) => {
    const colors = {
      'active': { bg: '#E8F5E9', text: '#2E7D32' },
      'leave': { bg: '#FFF3E0', text: '#F57C00' },
      'inactive': { bg: '#F5F5F5', text: '#757575' },
    };
    return colors[status];
  };

  const statusColor = getStatusColor(personnel.status);

  const recentTasks = [
    { id: '1', title: 'Tuần tra khu vực chợ', status: 'completed', date: '20/01/2026' },
    { id: '2', title: 'Xử lý mâu thuẫn dân sự', status: 'in-progress', date: '22/01/2026' },
    { id: '3', title: 'Hỗ trợ người dân', status: 'completed', date: '19/01/2026' },
  ];

  const attendanceRecords = [
    { date: '22/01/2026', checkIn: '07:58', checkOut: '17:05', status: 'on-time' },
    { date: '21/01/2026', checkIn: '08:15', checkOut: '17:00', status: 'late' },
    { date: '20/01/2026', checkIn: '07:55', checkOut: '17:10', status: 'on-time' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden pointer-events-auto animate-slideUp flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Avatar */}
          <div className="relative">
            <div className="h-32 bg-gradient-to-r from-[#1F3A5F] to-[#2E7D32]"></div>
            <div className="absolute bottom-0 left-8 transform translate-y-1/2">
              <div className="w-24 h-24 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow-lg">
                {personnel.name.substring(0, 2)}
              </div>
            </div>
            <div className="absolute top-4 right-4 flex items-center gap-2">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="w-10 h-10 bg-white/20 backdrop-blur-sm hover:bg-white/30 rounded-lg transition-colors flex items-center justify-center"
                >
                  <Edit size={20} className="text-white" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="w-10 h-10 bg-white/20 backdrop-blur-sm hover:bg-white/30 rounded-lg transition-colors flex items-center justify-center"
                >
                  <Trash2 size={20} className="text-white" />
                </button>
              )}
              <button
                onClick={onClose}
                className="w-10 h-10 bg-white/20 backdrop-blur-sm hover:bg-white/30 rounded-lg transition-colors flex items-center justify-center"
              >
                <X size={20} className="text-white" />
              </button>
            </div>
          </div>

          {/* Info Header */}
          <div className="px-8 pt-16 pb-6 border-b border-[#E2E8F0]">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-[#0F172A]">{personnel.name}</h2>
                  <span 
                    className="px-3 py-1 text-xs font-semibold rounded-full"
                    style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                  >
                    {personnel.status === 'active' && 'Đang hoạt động'}
                    {personnel.status === 'leave' && 'Nghỉ phép'}
                    {personnel.status === 'inactive' && 'Không hoạt động'}
                  </span>
                </div>
                <p className="text-sm font-mono text-[#64748B] mb-3">Mã DQTV: {personnel.code}</p>
                {personnel.rank && (
                  <p className="text-base text-[#0F172A]">
                    <span className="font-semibold">{personnel.rank}</span>
                    {personnel.position && ` - ${personnel.position}`}
                  </p>
                )}
              </div>
              {personnel.chiTieu !== undefined && (
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center mb-2"
                    style={{ 
                      borderColor: personnel.chiTieu >= 90 ? '#2E7D32' : personnel.chiTieu >= 70 ? '#FBC02D' : '#C62828',
                      backgroundColor: personnel.chiTieu >= 90 ? '#E8F5E9' : personnel.chiTieu >= 70 ? '#FFFDE7' : '#FFEBEE'
                    }}
                  >
                    <span className="text-2xl font-bold" 
                      style={{ color: personnel.chiTieu >= 90 ? '#2E7D32' : personnel.chiTieu >= 70 ? '#FBC02D' : '#C62828' }}
                    >
                      {personnel.chiTieu}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#64748B]">Chỉ tiêu</p>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="px-8 border-b border-[#E2E8F0] bg-white">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'info'
                    ? 'border-[#1F3A5F] text-[#1F3A5F]'
                    : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Thông tin
              </button>
              <button
                onClick={() => setActiveTab('tasks')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'tasks'
                    ? 'border-[#1F3A5F] text-[#1F3A5F]'
                    : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Nhiệm vụ
              </button>
              <button
                onClick={() => setActiveTab('attendance')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'attendance'
                    ? 'border-[#1F3A5F] text-[#1F3A5F]'
                    : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Chấm công
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'history'
                    ? 'border-[#1F3A5F] text-[#1F3A5F]'
                    : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Lịch sử
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {activeTab === 'info' && (
              <div className="space-y-6">
                {/* Contact Info */}
                <div>
                  <h4 className="text-sm font-semibold text-[#0F172A] mb-4">Thông tin liên hệ</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                      <div className="w-10 h-10 bg-[#E3F2FD] rounded-lg flex items-center justify-center flex-shrink-0">
                        <Phone size={20} className="text-[#1976D2]" />
                      </div>
                      <div>
                        <p className="text-xs text-[#64748B] mb-1">Số điện thoại</p>
                        <p className="text-sm font-semibold text-[#0F172A]">{personnel.phone}</p>
                      </div>
                    </div>
                    {personnel.email && (
                      <div className="flex items-center gap-3 p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                        <div className="w-10 h-10 bg-[#E8F5E9] rounded-lg flex items-center justify-center flex-shrink-0">
                          <Mail size={20} className="text-[#2E7D32]" />
                        </div>
                        <div>
                          <p className="text-xs text-[#64748B] mb-1">Email</p>
                          <p className="text-sm font-semibold text-[#0F172A]">{personnel.email}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] col-span-2">
                      <div className="w-10 h-10 bg-[#FFF3E0] rounded-lg flex items-center justify-center flex-shrink-0">
                        <MapPin size={20} className="text-[#F57C00]" />
                      </div>
                      <div>
                        <p className="text-xs text-[#64748B] mb-1">Địa chỉ</p>
                        <p className="text-sm font-semibold text-[#0F172A]">{personnel.address}</p>
                        <p className="text-xs text-[#64748B] mt-1">{personnel.district}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Personal Info */}
                <div>
                  <h4 className="text-sm font-semibold text-[#0F172A] mb-4">Thông tin cá nhân</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {personnel.dateOfBirth && (
                      <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar size={16} className="text-[#64748B]" />
                          <span className="text-xs font-semibold text-[#64748B] uppercase">Ngày sinh</span>
                        </div>
                        <p className="text-sm font-semibold text-[#0F172A]">{personnel.dateOfBirth}</p>
                      </div>
                    )}
                    {personnel.joinDate && (
                      <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                        <div className="flex items-center gap-2 mb-2">
                          <Award size={16} className="text-[#64748B]" />
                          <span className="text-xs font-semibold text-[#64748B] uppercase">Ngày gia nhập</span>
                        </div>
                        <p className="text-sm font-semibold text-[#0F172A]">{personnel.joinDate}</p>
                      </div>
                    )}
                    {personnel.workingDays !== undefined && (
                      <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock size={16} className="text-[#64748B]" />
                          <span className="text-xs font-semibold text-[#64748B] uppercase">Ngày công</span>
                        </div>
                        <p className="text-sm font-semibold text-[#0F172A]">{personnel.workingDays} ngày</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-[#0F172A]">Nhiệm vụ gần đây</h4>
                  <button className="text-sm text-[#1F3A5F] hover:underline">Xem tất cả</button>
                </div>
                {recentTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] hover:shadow-md transition-all cursor-pointer">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[#0F172A] mb-1">{task.title}</p>
                      <p className="text-xs text-[#64748B]">{task.date}</p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      task.status === 'completed' 
                        ? 'bg-[#E8F5E9] text-[#2E7D32]'
                        : 'bg-[#E3F2FD] text-[#1976D2]'
                    }`}>
                      {task.status === 'completed' ? 'Hoàn thành' : 'Đang làm'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'attendance' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-[#0F172A]">Chấm công gần đây</h4>
                  <button className="text-sm text-[#1F3A5F] hover:underline">Xem tất cả</button>
                </div>
                {attendanceRecords.map((record, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-xs text-[#64748B] mb-1">Ngày</p>
                        <p className="text-sm font-semibold text-[#0F172A]">{record.date}</p>
                      </div>
                      <div className="h-8 w-px bg-[#E2E8F0]"></div>
                      <div className="text-center">
                        <p className="text-xs text-[#64748B] mb-1">Vào</p>
                        <p className="text-sm font-semibold text-[#0F172A]">{record.checkIn}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-[#64748B] mb-1">Ra</p>
                        <p className="text-sm font-semibold text-[#0F172A]">{record.checkOut}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      record.status === 'on-time' 
                        ? 'bg-[#E8F5E9] text-[#2E7D32]'
                        : 'bg-[#FFF3E0] text-[#F57C00]'
                    }`}>
                      {record.status === 'on-time' ? 'Đúng giờ' : 'Trễ'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[#0F172A] mb-4">Lịch sử hoạt động</h4>
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                    HT
                  </div>
                  <div className="flex-1 pb-4 border-b border-[#F1F5F9]">
                    <p className="text-sm text-[#0F172A]">
                      <span className="font-semibold">Hệ thống</span> đã tạo hồ sơ DQTV
                    </p>
                    <p className="text-xs text-[#64748B] mt-1">15/05/2024 08:30</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 200ms ease-out;
        }
        .animate-slideUp {
          animation: slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </>
  );
}