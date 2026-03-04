import { useState } from 'react';
import { Filter, MapPin, Clock, User, ChevronRight, Phone, ArrowLeft } from 'lucide-react';

type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'overdue';
type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

interface Task {
  id: string;
  code: string;
  title: string;
  location: string;
  deadline: string;
  assignedBy: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
}

const mockTasks: Task[] = [
  {
    id: '1',
    code: 'NV-2024-001',
    title: 'Tuần tra khu vực chợ Bến Thành',
    location: 'Chợ Bến Thành, KP1',
    deadline: '25/12/2024 18:00',
    assignedBy: 'Đại úy Phạm Minh Tuấn',
    description: 'Tuần tra và kiểm tra an ninh khu vực chợ Bến Thành, đặc biệt chú ý các điểm đông người...',
    status: 'in-progress',
    priority: 'high',
  },
  {
    id: '2',
    code: 'NV-2024-002',
    title: 'Tuyên truyền phòng cháy chữa cháy',
    location: 'Khu dân cư A, KP1',
    deadline: '26/12/2024 17:00',
    assignedBy: 'Trung úy Võ Văn Tân',
    description: 'Tuyên truyền về phòng cháy chữa cháy cho người dân trong khu vực...',
    status: 'pending',
    priority: 'medium',
  },
  {
    id: '3',
    code: 'NV-2024-003',
    title: 'Xử lý sự vụ tranh chấp dân sự',
    location: '123 Đường ABC, KP1',
    deadline: '24/12/2024 16:00',
    assignedBy: 'Đại úy Phạm Minh Tuấn',
    description: 'Hỗ trợ giải quyết tranh chấp giữa hai hộ dân về ranh giới đất...',
    status: 'overdue',
    priority: 'urgent',
  },
];

export function MyTasks() {
  const [selectedFilter, setSelectedFilter] = useState<TaskStatus | 'all'>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Show task detail view
  if (selectedTask) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pb-20">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 border-b-4 border-[#DC2626] sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedTask(null)}
              className="p-2 -ml-2"
            >
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Chi tiết nhiệm vụ</h1>
          </div>
        </div>
        
        <div className="px-4 py-6">
          {/* Task Detail */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex gap-2 mb-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(selectedTask.status).class}`}>
                {getStatusBadge(selectedTask.status).text}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPriorityBadge(selectedTask.priority).class}`}>
                {getPriorityBadge(selectedTask.priority).text}
              </span>
            </div>

            <h1 className="text-xl font-bold text-[#0F172A] mb-4">{selectedTask.title}</h1>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#366092] text-white flex items-center justify-center font-semibold">
                PT
              </div>
              <div>
                <p className="text-sm font-medium text-[#0F172A]">{selectedTask.assignedBy}</p>
                <p className="text-xs text-[#64748B]">Công An Khu vực 1</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="font-semibold text-[#0F172A] mb-3">Chi tiết nhiệm vụ</h2>
            <p className="text-sm text-[#64748B] leading-relaxed mb-4">{selectedTask.description}</p>

            <div className="space-y-2 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#64748B]">Loại nhiệm vụ</span>
                <span className="text-sm font-medium text-[#0F172A]">Tuần tra</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#64748B]">Ngày tạo</span>
                <span className="text-sm font-medium text-[#0F172A]">20/12/2024</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#64748B]">Thời hạn</span>
                <span className="text-sm font-medium text-[#EF4444]">{selectedTask.deadline}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="font-semibold text-[#0F172A] mb-3">Địa điểm</h2>
            <div className="bg-gray-200 h-40 rounded-lg mb-3 flex items-center justify-center text-[#64748B]">
              🗺️ Bản đồ
            </div>
            <p className="text-sm text-[#64748B] mb-2">{selectedTask.location}</p>
            <p className="text-xs text-[#64748B]">Khoảng cách: ~1.2 km</p>
            <button className="w-full mt-3 py-2 border border-[#366092] text-[#366092] rounded-lg font-medium text-sm">
              Chỉ đường
            </button>
          </div>

          {/* Progress */}
          {selectedTask.status === 'in-progress' && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h2 className="font-semibold text-[#0F172A] mb-3">Tiến độ</h2>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#10B981] text-white flex items-center justify-center text-sm font-bold">
                    ✓
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#0F172A]">Đã tiếp nhận</p>
                    <p className="text-xs text-[#64748B]">22/01/2026 08:00</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#3B82F6] text-white flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#0F172A]">Đang thực hiện</p>
                    <p className="text-xs text-[#64748B]">22/01/2026 09:00</p>
                    <p className="text-xs text-[#64748B] mt-1">Đã đến địa điểm, đang tuần tra</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 p-4">
          {selectedTask.status === 'pending' && (
            <div className="flex gap-3">
              <button className="flex-1 py-3 border border-[#EF4444] text-[#EF4444] rounded-lg font-medium">
                Từ chối
              </button>
              <button className="flex-1 py-3 bg-[#366092] text-white rounded-lg font-medium">
                Tiếp nhận
              </button>
            </div>
          )}
          {selectedTask.status === 'in-progress' && (
            <button className="w-full py-3 bg-[#366092] text-white rounded-lg font-medium">
              Cập nhật tiến độ
            </button>
          )}
          {selectedTask.status === 'overdue' && (
            <button className="w-full py-3 bg-[#F59E0B] text-white rounded-lg font-medium">
              Gửi giải trình
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-[#DC2626]">Nhiệm Vụ Của Tôi</h1>
          <button className="p-2">
            <Filter className="text-[#DC2626]" size={24} />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-white px-4 overflow-x-auto border-b border-gray-200">
        <div className="flex gap-6 min-w-max">
          <button
            onClick={() => setSelectedFilter('in-progress')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              selectedFilter === 'in-progress'
                ? 'border-[#366092] text-[#366092]'
                : 'border-transparent text-[#64748B]'
            }`}
          >
            Đang làm {getTaskCounts()['in-progress'] > 0 && `(${getTaskCounts()['in-progress']})`}
          </button>
          <button
            onClick={() => setSelectedFilter('pending')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              selectedFilter === 'pending'
                ? 'border-[#366092] text-[#366092]'
                : 'border-transparent text-[#64748B]'
            }`}
          >
            Chờ tiếp nhận {getTaskCounts().pending > 0 && `(${getTaskCounts().pending})`}
          </button>
          <button
            onClick={() => setSelectedFilter('completed')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              selectedFilter === 'completed'
                ? 'border-[#366092] text-[#366092]'
                : 'border-transparent text-[#64748B]'
            }`}
          >
            Đã hoàn thành
          </button>
          <button
            onClick={() => setSelectedFilter('overdue')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              selectedFilter === 'overdue'
                ? 'border-[#366092] text-[#366092]'
                : 'border-transparent text-[#64748B]'
            }`}
          >
            Quá hạn {getTaskCounts().overdue > 0 && `(${getTaskCounts().overdue})`}
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="p-4 space-y-3">
        {mockTasks
          .filter(task => selectedFilter === 'all' || task.status === selectedFilter)
          .map(task => {
            const statusBadge = getStatusBadge(task.status);
            const priorityBadge = getPriorityBadge(task.priority);
            const isOverdue = task.status === 'overdue';

            return (
              <div
                key={task.id}
                className={`w-full bg-white rounded-xl p-4 shadow-sm border-l-4 ${
                  isOverdue ? 'border-[#EF4444]' : task.status === 'in-progress' ? 'border-[#3B82F6]' : 'border-[#64748B]'
                }`}
              >
                <div
                  onClick={() => setSelectedTask(task)}
                  className="cursor-pointer"
                >
                  {/* Top Row */}
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs text-[#64748B] font-mono">{task.code}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityBadge.class}`}>
                      {priorityBadge.text}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-semibold text-[#0F172A] mb-2 line-clamp-2">{task.title}</h3>

                  {/* Meta Info */}
                  <div className="space-y-1 mb-3">
                    <div className="flex items-center gap-1 text-xs text-[#64748B]">
                      <MapPin className="w-3 h-3" />
                      <span>{task.location}</span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-[#EF4444]' : 'text-[#64748B]'}`}>
                      <Clock className="w-3 h-3" />
                      <span>{task.deadline}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[#64748B]">
                      <User className="w-3 h-3" />
                      <span>{task.assignedBy}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-[#64748B] mb-3 line-clamp-2">{task.description}</p>
                </div>

                {/* Status Row */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.class}`}>
                    {statusBadge.text}
                  </span>
                  {task.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Handle accept action
                        }}
                        className="px-3 py-1 border border-[#366092] text-[#366092] text-xs rounded-lg font-medium"
                      >
                        Tiếp nhận
                      </button>
                    </div>
                  )}
                  {task.status === 'in-progress' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Handle update action
                      }}
                      className="px-3 py-1 border border-[#64748B] text-[#64748B] text-xs rounded-lg font-medium"
                    >
                      Cập nhật
                    </button>
                  )}
                  {task.status === 'overdue' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Handle explain action
                      }}
                      className="px-3 py-1 bg-[#F59E0B] text-white text-xs rounded-lg font-medium"
                    >
                      Giải trình
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Floating Action Button */}
      <button className="fixed bottom-20 right-4 w-14 h-14 bg-[#10B981] text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform z-40">
        <Phone className="w-6 h-6" />
      </button>
    </div>
  );
}

function getStatusBadge(status: TaskStatus) {
  const badges = {
    pending: { text: 'Chờ tiếp nhận', class: 'bg-[#64748B]/10 text-[#64748B]' },
    'in-progress': { text: 'Đang làm', class: 'bg-[#3B82F6]/10 text-[#3B82F6]' },
    completed: { text: 'Đã hoàn thành', class: 'bg-[#10B981]/10 text-[#10B981]' },
    overdue: { text: 'Quá hạn', class: 'bg-[#EF4444]/10 text-[#EF4444]' },
  };
  return badges[status];
}

function getPriorityBadge(priority: TaskPriority) {
  const badges = {
    urgent: { text: 'Khẩn cấp', class: 'bg-[#EF4444] text-white' },
    high: { text: 'Cao', class: 'bg-[#F59E0B] text-white' },
    medium: { text: 'Trung bình', class: 'bg-[#F59E0B]/50 text-white' },
    low: { text: 'Thấp', class: 'bg-[#94A3B8] text-white' },
  };
  return badges[priority];
}

function getTaskCounts() {
  return {
    'in-progress': mockTasks.filter(t => t.status === 'in-progress').length,
    'pending': mockTasks.filter(t => t.status === 'pending').length,
    'completed': mockTasks.filter(t => t.status === 'completed').length,
    'overdue': mockTasks.filter(t => t.status === 'overdue').length,
  };
}