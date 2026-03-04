import { X, MapPin, User, Calendar, Clock, Tag, CheckCircle, AlertCircle, MessageSquare, Paperclip, Edit, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  task: {
    id: string;
    code: string;
    title: string;
    description?: string;
    assignee: string;
    type: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    deadline: string;
    status: 'pending' | 'in-progress' | 'completed' | 'overdue' | 'rejected';
    district: string;
    location?: string;
    createdBy?: string;
    createdAt?: string;
  };
}

export function TaskDetailModal({ isOpen, onClose, onEdit, onDelete, task }: TaskDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'history' | 'comments'>('info');

  if (!isOpen) return null;

  const getPriorityColor = (priority: typeof task.priority) => {
    const colors = {
      'urgent': { bg: '#FFEBEE', text: '#C62828' },
      'high': { bg: '#FFF3E0', text: '#F57C00' },
      'medium': { bg: '#FFFDE7', text: '#FBC02D' },
      'low': { bg: '#F5F5F5', text: '#757575' },
    };
    return colors[priority];
  };

  const getStatusColor = (status: typeof task.status) => {
    const colors = {
      'pending': { bg: '#F5F5F5', text: '#757575' },
      'in-progress': { bg: '#E3F2FD', text: '#1976D2' },
      'completed': { bg: '#E8F5E9', text: '#2E7D32' },
      'overdue': { bg: '#FFEBEE', text: '#C62828' },
      'rejected': { bg: '#FFF3E0', text: '#F57C00' },
    };
    return colors[status];
  };

  const priorityColor = getPriorityColor(task.priority);
  const statusColor = getStatusColor(task.status);

  const activityLogs = [
    { id: '1', user: 'Hệ thống', action: 'đã tạo nhiệm vụ', time: '22/01/2026 08:30' },
    { id: '2', user: task.assignee, action: 'đã tiếp nhận nhiệm vụ', time: '22/01/2026 09:15' },
    { id: '3', user: task.assignee, action: 'đã cập nhật trạng thái: Đang thực hiện', time: '22/01/2026 10:00' },
  ];

  const comments = [
    { id: '1', user: task.assignee, avatar: 'NV', text: 'Đã bắt đầu thực hiện nhiệm vụ. Dự kiến hoàn thành đúng hạn.', time: '22/01/2026 10:05' },
    { id: '2', user: 'Đại úy Nguyễn Văn An', avatar: 'NA', text: 'Tốt, báo cáo định kỳ mỗi 2 giờ.', time: '22/01/2026 10:30' },
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
          {/* Header */}
          <div className="px-8 py-6 border-b border-[#E2E8F0] bg-gradient-to-r from-[#F8FAFC] to-white">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-3 py-1 text-xs font-mono font-semibold bg-[#1F3A5F] text-white rounded">
                    {task.code}
                  </span>
                  <span 
                    className="px-3 py-1 text-xs font-semibold rounded-full"
                    style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                  >
                    {task.status === 'pending' && 'Chờ tiếp nhận'}
                    {task.status === 'in-progress' && 'Đang thực hiện'}
                    {task.status === 'completed' && 'Đã hoàn thành'}
                    {task.status === 'overdue' && 'Quá hạn'}
                    {task.status === 'rejected' && 'Bị từ chối'}
                  </span>
                  <span 
                    className="px-3 py-1 text-xs font-semibold rounded-full"
                    style={{ backgroundColor: priorityColor.bg, color: priorityColor.text }}
                  >
                    {task.priority === 'urgent' && '🔥 Khẩn cấp'}
                    {task.priority === 'high' && 'Cao'}
                    {task.priority === 'medium' && 'Trung bình'}
                    {task.priority === 'low' && 'Thấp'}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-[#0F172A] mb-2">{task.title}</h2>
                <div className="flex items-center gap-6 text-sm text-[#64748B]">
                  <div className="flex items-center gap-2">
                    <User size={16} />
                    <span>{task.assignee}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag size={16} />
                    <span>{task.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={16} />
                    <span>{task.district}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onEdit && (
                  <button
                    onClick={onEdit}
                    className="w-10 h-10 flex items-center justify-center hover:bg-[#E3F2FD] rounded-lg transition-colors"
                  >
                    <Edit size={20} className="text-[#1976D2]" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="w-10 h-10 flex items-center justify-center hover:bg-[#FFEBEE] rounded-lg transition-colors"
                  >
                    <Trash2 size={20} className="text-[#C62828]" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-10 h-10 flex items-center justify-center hover:bg-[#F1F5F9] rounded-lg transition-colors"
                >
                  <X size={20} className="text-[#64748B]" />
                </button>
              </div>
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
                onClick={() => setActiveTab('history')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'history'
                    ? 'border-[#1F3A5F] text-[#1F3A5F]'
                    : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Lịch sử
              </button>
              <button
                onClick={() => setActiveTab('comments')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'comments'
                    ? 'border-[#1F3A5F] text-[#1F3A5F]'
                    : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Bình luận ({comments.length})
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {activeTab === 'info' && (
              <div className="space-y-6">
                {/* Description */}
                {task.description && (
                  <div>
                    <h4 className="text-sm font-semibold text-[#0F172A] mb-2">Mô tả chi tiết</h4>
                    <p className="text-sm text-[#64748B] leading-relaxed">{task.description}</p>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar size={16} className="text-[#64748B]" />
                      <span className="text-xs font-semibold text-[#64748B] uppercase">Thời hạn</span>
                    </div>
                    <p className={`text-base font-semibold ${task.status === 'overdue' ? 'text-[#C62828]' : 'text-[#0F172A]'}`}>
                      {task.deadline}
                    </p>
                  </div>

                  <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                    <div className="flex items-center gap-2 mb-2">
                      <User size={16} className="text-[#64748B]" />
                      <span className="text-xs font-semibold text-[#64748B] uppercase">Người thực hiện</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-xs font-semibold">
                        {task.assignee.substring(0, 2)}
                      </div>
                      <p className="text-base font-semibold text-[#0F172A]">{task.assignee}</p>
                    </div>
                  </div>

                  {task.location && (
                    <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin size={16} className="text-[#64748B]" />
                        <span className="text-xs font-semibold text-[#64748B] uppercase">Địa điểm</span>
                      </div>
                      <p className="text-sm text-[#0F172A]">{task.location}</p>
                    </div>
                  )}

                  {task.createdBy && (
                    <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock size={16} className="text-[#64748B]" />
                        <span className="text-xs font-semibold text-[#64748B] uppercase">Người tạo</span>
                      </div>
                      <p className="text-sm text-[#0F172A] mb-1">{task.createdBy}</p>
                      <p className="text-xs text-[#64748B]">{task.createdAt}</p>
                    </div>
                  )}
                </div>

                {/* Attachments */}
                <div>
                  <h4 className="text-sm font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                    <Paperclip size={16} />
                    Tài liệu đính kèm
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-[#F8FAFC] rounded-lg hover:bg-[#F1F5F9] cursor-pointer transition-colors">
                      <div className="w-10 h-10 bg-[#E3F2FD] rounded flex items-center justify-center">
                        <Paperclip size={20} className="text-[#1976D2]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#0F172A]">Bản đồ khu vực.pdf</p>
                        <p className="text-xs text-[#64748B]">256 KB</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-3">
                {activityLogs.map((log) => (
                  <div key={log.id} className="flex gap-4">
                    <div className="w-8 h-8 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                      {log.user.substring(0, 2)}
                    </div>
                    <div className="flex-1 pb-4 border-b border-[#F1F5F9] last:border-0">
                      <p className="text-sm text-[#0F172A]">
                        <span className="font-semibold">{log.user}</span> {log.action}
                      </p>
                      <p className="text-xs text-[#64748B] mt-1">{log.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'comments' && (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {comment.avatar}
                    </div>
                    <div className="flex-1">
                      <div className="bg-[#F8FAFC] rounded-lg p-4 border border-[#E2E8F0]">
                        <p className="text-sm font-semibold text-[#0F172A] mb-1">{comment.user}</p>
                        <p className="text-sm text-[#64748B] leading-relaxed">{comment.text}</p>
                      </div>
                      <p className="text-xs text-[#64748B] mt-2 ml-4">{comment.time}</p>
                    </div>
                  </div>
                ))}

                {/* Comment Input */}
                <div className="flex gap-3 pt-4 border-t border-[#E2E8F0]">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    NA
                  </div>
                  <div className="flex-1">
                    <textarea
                      placeholder="Nhập bình luận..."
                      className="w-full px-4 py-3 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] resize-none"
                      rows={3}
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <button className="px-4 py-2 text-sm font-medium text-white bg-[#1F3A5F] hover:bg-[#152A45] rounded-lg transition-all">
                        Gửi
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-8 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
            <div className="text-sm text-[#64748B]">
              Cập nhật lần cuối: <span className="font-medium text-[#0F172A]">22/01/2026 10:30</span>
            </div>
            <div className="flex items-center gap-3">
              {task.status === 'in-progress' && (
                <button className="px-6 py-2.5 text-sm font-medium text-white bg-[#2E7D32] hover:bg-[#1B5E20] rounded-lg transition-all flex items-center gap-2">
                  <CheckCircle size={16} />
                  Hoàn thành
                </button>
              )}
              {task.status === 'pending' && (
                <button className="px-6 py-2.5 text-sm font-medium text-white bg-[#1976D2] hover:bg-[#0D47A1] rounded-lg transition-all">
                  Tiếp nhận
                </button>
              )}
            </div>
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