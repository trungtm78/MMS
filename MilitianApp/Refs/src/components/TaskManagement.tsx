import { useState } from 'react';
import { ChevronRight, Plus, Search, Filter, Users, CheckCircle2, Clock, AlertCircle, TrendingUp } from 'lucide-react';
import { CreateTask } from './CreateTask';

interface Task {
  id: string;
  code: string;
  title: string;
  type: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'completed' | 'overdue';
  assignedTo: string[];
  assignedToNames: string;
  createdDate: string;
  deadline: string;
  completionRate: number;
}

const mockTasks: Task[] = [
  {
    id: '1',
    code: 'NV-2024-001',
    title: 'Tuần tra khu vực chợ Bến Thành',
    type: 'Tuần tra',
    priority: 'high',
    status: 'in-progress',
    assignedTo: ['1', '2'],
    assignedToNames: 'Nguyễn Văn An, Trần Văn Bình',
    createdDate: '20/01/2026',
    deadline: '25/01/2026 18:00',
    completionRate: 60,
  },
  {
    id: '2',
    code: 'NV-2024-002',
    title: 'Tuyên truyền phòng cháy chữa cháy',
    type: 'Tuyên truyền',
    priority: 'medium',
    status: 'pending',
    assignedTo: ['3'],
    assignedToNames: 'Lê Thị Cẩm',
    createdDate: '21/01/2026',
    deadline: '26/01/2026 17:00',
    completionRate: 0,
  },
  {
    id: '3',
    code: 'NV-2024-003',
    title: 'Xử lý sự vụ tranh chấp dân sự',
    type: 'Xử lý sự vụ',
    priority: 'urgent',
    status: 'overdue',
    assignedTo: ['1'],
    assignedToNames: 'Nguyễn Văn An',
    createdDate: '18/01/2026',
    deadline: '24/01/2026 16:00',
    completionRate: 80,
  },
  {
    id: '4',
    code: 'NV-2024-004',
    title: 'Kiểm tra an toàn PCCC tại khu dân cư',
    type: 'Kiểm tra',
    priority: 'high',
    status: 'completed',
    assignedTo: ['4', '5'],
    assignedToNames: 'Phạm Minh Đức, Hoàng Thị Ế',
    createdDate: '15/01/2026',
    deadline: '20/01/2026 17:00',
    completionRate: 100,
  },
];

interface TaskManagementProps {
  onClose: () => void;
}

export function TaskManagement({ onClose }: TaskManagementProps) {
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'in-progress' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getStatusBadge = (status: Task['status']) => {
    const badges = {
      pending: { text: 'Chờ tiếp nhận', class: 'bg-[#64748B]/10 text-[#64748B]', icon: Clock },
      'in-progress': { text: 'Đang thực hiện', class: 'bg-[#3B82F6]/10 text-[#3B82F6]', icon: TrendingUp },
      completed: { text: 'Hoàn thành', class: 'bg-[#10B981]/10 text-[#10B981]', icon: CheckCircle2 },
      overdue: { text: 'Quá hạn', class: 'bg-[#EF4444]/10 text-[#EF4444]', icon: AlertCircle },
    };
    return badges[status];
  };

  const getPriorityBadge = (priority: Task['priority']) => {
    const badges = {
      urgent: { text: 'Khẩn cấp', class: 'bg-[#EF4444] text-white' },
      high: { text: 'Cao', class: 'bg-[#F59E0B] text-white' },
      medium: { text: 'Trung bình', class: 'bg-[#F59E0B]/50 text-white' },
      low: { text: 'Thấp', class: 'bg-[#94A3B8] text-white' },
    };
    return badges[priority];
  };

  const getTaskStats = () => {
    return {
      total: mockTasks.length,
      pending: mockTasks.filter((t) => t.status === 'pending').length,
      inProgress: mockTasks.filter((t) => t.status === 'in-progress').length,
      completed: mockTasks.filter((t) => t.status === 'completed').length,
      overdue: mockTasks.filter((t) => t.status === 'overdue').length,
    };
  };

  const stats = getTaskStats();

  const filteredTasks = mockTasks
    .filter((task) => {
      if (activeTab === 'all') return true;
      return task.status === activeTab;
    })
    .filter((task) => {
      if (!searchQuery) return true;
      return (
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.assignedToNames.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });

  if (showCreateTask) {
    return <CreateTask onClose={() => setShowCreateTask(false)} />;
  }

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] z-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white pt-12 pb-4 px-4 border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onClose} className="text-[#366092] font-medium flex items-center gap-1">
            <ChevronRight className="w-5 h-5 rotate-180" />
            Quay lại
          </button>
          <h1 className="text-xl font-bold text-[#0F172A]">Quản Lý Nhiệm Vụ</h1>
          <button
            onClick={() => setShowCreateTask(true)}
            className="p-2 bg-[#366092] text-white rounded-lg"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm nhiệm vụ, mã, DQTV..."
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
          />
          <button className="absolute right-3 top-2.5">
            <Filter className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === 'all'
                ? 'bg-[#366092] text-white'
                : 'bg-gray-100 text-[#64748B]'
            }`}
          >
            Tất cả ({stats.total})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === 'pending'
                ? 'bg-[#366092] text-white'
                : 'bg-gray-100 text-[#64748B]'
            }`}
          >
            Chờ tiếp nhận ({stats.pending})
          </button>
          <button
            onClick={() => setActiveTab('in-progress')}
            className={`py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === 'in-progress'
                ? 'bg-[#366092] text-white'
                : 'bg-gray-100 text-[#64748B]'
            }`}
          >
            Đang làm ({stats.inProgress})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === 'completed'
                ? 'bg-[#366092] text-white'
                : 'bg-gray-100 text-[#64748B]'
            }`}
          >
            Hoàn thành ({stats.completed})
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#64748B]">Đang thực hiện</span>
              <TrendingUp className="w-5 h-5 text-[#3B82F6]" />
            </div>
            <p className="text-2xl font-bold text-[#3B82F6]">{stats.inProgress}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#64748B]">Quá hạn</span>
              <AlertCircle className="w-5 h-5 text-[#EF4444]" />
            </div>
            <p className="text-2xl font-bold text-[#EF4444]">{stats.overdue}</p>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="px-4 pb-20">
        <div className="space-y-3">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📋</div>
              <h3 className="text-lg font-semibold text-[#0F172A] mb-2">Không có nhiệm vụ</h3>
              <p className="text-sm text-[#64748B] mb-4">
                {searchQuery ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có nhiệm vụ nào'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowCreateTask(true)}
                  className="px-6 py-2 bg-[#366092] text-white rounded-lg font-medium"
                >
                  Tạo nhiệm vụ mới
                </button>
              )}
            </div>
          ) : (
            filteredTasks.map((task) => {
              const statusBadge = getStatusBadge(task.status);
              const priorityBadge = getPriorityBadge(task.priority);
              const StatusIcon = statusBadge.icon;

              return (
                <div
                  key={task.id}
                  className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${
                    task.status === 'overdue' ? 'border-[#EF4444]' :
                    task.status === 'in-progress' ? 'border-[#3B82F6]' :
                    task.status === 'completed' ? 'border-[#10B981]' :
                    'border-[#64748B]'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-[#64748B] font-mono">{task.code}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityBadge.class}`}>
                          {priorityBadge.text}
                        </span>
                      </div>
                      <h3 className="font-semibold text-[#0F172A] mb-1">{task.title}</h3>
                      <p className="text-xs text-[#64748B]">Loại: {task.type}</p>
                    </div>
                    <StatusIcon className={`w-5 h-5 ${
                      task.status === 'completed' ? 'text-[#10B981]' :
                      task.status === 'in-progress' ? 'text-[#3B82F6]' :
                      task.status === 'overdue' ? 'text-[#EF4444]' :
                      'text-[#64748B]'
                    }`} />
                  </div>

                  {/* Assignees */}
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
                    <Users className="w-4 h-4 text-[#64748B]" />
                    <p className="text-sm text-[#64748B]">{task.assignedToNames}</p>
                  </div>

                  {/* Progress */}
                  {task.status !== 'pending' && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#64748B]">Tiến độ</span>
                        <span className="text-xs font-semibold text-[#0F172A]">{task.completionRate}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            task.status === 'completed' ? 'bg-[#10B981]' :
                            task.status === 'overdue' ? 'bg-[#EF4444]' :
                            'bg-[#3B82F6]'
                          }`}
                          style={{ width: `${task.completionRate}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#64748B]">Tạo: {task.createdDate}</p>
                      <p className={`text-xs ${task.status === 'overdue' ? 'text-[#EF4444]' : 'text-[#64748B]'}`}>
                        Hạn: {task.deadline}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadge.class}`}>
                      {statusBadge.text}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setShowCreateTask(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-[#366092] text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform z-40"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}
