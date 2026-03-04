import { CheckSquare, Clock, User, Filter, Search, Download, Eye, Edit, Trash2, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { TaskDetailModal } from '@/app/components/modals/TaskDetailModal';
import { ConfirmDialog } from '@/app/components/modals/ConfirmDialog';

type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'overdue' | 'rejected';
type ViewMode = 'table' | 'kanban';

interface Task {
  id: string;
  code: string;
  title: string;
  assignee: string;
  type: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  deadline: string;
  status: TaskStatus;
  district: string;
}

export function TaskList() {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedTab, setSelectedTab] = useState<'all' | TaskStatus>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const tasks: Task[] = [
    { id: '1', code: 'NV-2024-001', title: 'Tuần tra khu vực chợ Bến Thành', assignee: 'Nguyễn Văn A', type: 'Tuần tra', priority: 'high', deadline: '25/01/2026', status: 'in-progress', district: 'KP 1' },
    { id: '2', code: 'NV-2024-002', title: 'Xử lý mâu thuẫn dân sự', assignee: 'Trần Văn B', type: 'Xử lý sự vụ', priority: 'urgent', deadline: '23/01/2026', status: 'overdue', district: 'KP 2' },
    { id: '3', code: 'NV-2024-003', title: 'Hỗ trợ người dân cấp cứu', assignee: 'Lê Văn C', type: 'Hỗ trợ', priority: 'urgent', deadline: '22/01/2026', status: 'completed', district: 'KP 1' },
    { id: '4', code: 'NV-2024-004', title: 'Tuyên truyền phòng cháy chữa cháy', assignee: 'Phạm Văn D', type: 'Tuyên truyền', priority: 'medium', deadline: '28/01/2026', status: 'pending', district: 'KP 3' },
    { id: '5', code: 'NV-2024-005', title: 'Tuần tra đêm khu công nghiệp', assignee: 'Hoàng Văn E', type: 'Tuần tra', priority: 'high', deadline: '24/01/2026', status: 'in-progress', district: 'KP 2' },
  ];

  const statusTabs = [
    { id: 'all', label: 'Tất cả', count: tasks.length },
    { id: 'pending', label: 'Chờ tiếp nhận', count: tasks.filter(t => t.status === 'pending').length },
    { id: 'in-progress', label: 'Đang thực hiện', count: tasks.filter(t => t.status === 'in-progress').length },
    { id: 'completed', label: 'Đã hoàn thành', count: tasks.filter(t => t.status === 'completed').length },
    { id: 'overdue', label: 'Quá hạn', count: tasks.filter(t => t.status === 'overdue').length },
    { id: 'rejected', label: 'Bị từ chối', count: tasks.filter(t => t.status === 'rejected').length },
  ];

  const getStatusColor = (status: TaskStatus) => {
    const colors = {
      'pending': { bg: '#F5F5F5', text: '#757575', border: '#E0E0E0' },
      'in-progress': { bg: '#E3F2FD', text: '#1976D2', border: '#90CAF9' },
      'completed': { bg: '#E8F5E9', text: '#2E7D32', border: '#81C784' },
      'overdue': { bg: '#FFEBEE', text: '#C62828', border: '#EF9A9A' },
      'rejected': { bg: '#FFF3E0', text: '#F57C00', border: '#FFB74D' },
    };
    return colors[status];
  };

  const getStatusLabel = (status: TaskStatus) => {
    const labels = {
      'pending': 'Chờ tiếp nhận',
      'in-progress': 'Đang thực hiện',
      'completed': 'Đã hoàn thành',
      'overdue': 'Quá hạn',
      'rejected': 'Bị từ chối',
    };
    return labels[status];
  };

  const getPriorityColor = (priority: Task['priority']) => {
    const colors = {
      'urgent': { bg: '#FFEBEE', text: '#C62828' },
      'high': { bg: '#FFF3E0', text: '#F57C00' },
      'medium': { bg: '#FFFDE7', text: '#FBC02D' },
      'low': { bg: '#F5F5F5', text: '#757575' },
    };
    return colors[priority];
  };

  const getPriorityLabel = (priority: Task['priority']) => {
    const labels = {
      'urgent': 'Khẩn cấp',
      'high': 'Cao',
      'medium': 'Trung bình',
      'low': 'Thấp',
    };
    return labels[priority];
  };

  const filteredTasks = selectedTab === 'all' ? tasks : tasks.filter(t => t.status === selectedTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Danh Sách Nhiệm Vụ</h1>
          <p className="text-sm text-[#64748B] mt-1">Quản lý và theo dõi tất cả nhiệm vụ đã giao</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center bg-white border border-[#E2E8F0] rounded-lg p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-all ${
                viewMode === 'table'
                  ? 'bg-[#1F3A5F] text-white'
                  : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              Bảng
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-all ${
                viewMode === 'kanban'
                  ? 'bg-[#1F3A5F] text-white'
                  : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              Kanban
            </button>
          </div>
          <button className="px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] rounded-lg border border-[#E2E8F0] transition-all flex items-center gap-2">
            <Download size={16} />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-1 flex items-center gap-1 overflow-x-auto">
        {statusTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSelectedTab(tab.id as any)}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
              selectedTab === tab.id
                ? 'bg-[#1F3A5F] text-white'
                : 'text-[#64748B] hover:bg-[#F8FAFC]'
            }`}
          >
            {tab.label} <span className={`ml-1.5 px-2 py-0.5 text-xs rounded-full ${
              selectedTab === tab.id ? 'bg-white/20' : 'bg-[#F1F5F9]'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            placeholder="Tìm theo mã nhiệm vụ, tiêu đề..."
            className="w-full h-10 pl-10 pr-4 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
          />
        </div>
        <select className="px-4 py-2 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#64748B] bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]">
          <option>Tất cả loại</option>
          <option>Tuần tra</option>
          <option>Xử lý sự vụ</option>
          <option>Hỗ trợ</option>
          <option>Tuyên truyền</option>
        </select>
        <select className="px-4 py-2 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#64748B] bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]">
          <option>Tất cả khu phố</option>
          <option>Khu phố 1</option>
          <option>Khu phố 2</option>
          <option>Khu phố 3</option>
        </select>
        <button className="px-4 py-2 text-sm font-medium text-[#1F3A5F] hover:bg-[#F1F5F9] rounded-lg transition-all flex items-center gap-2">
          <Filter size={16} />
          Bộ lọc
        </button>
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input type="checkbox" className="w-4 h-4 rounded border-[#E2E8F0]" />
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Mã NV</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Tiêu đề</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">DQTV</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Loại</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Ưu tiên</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Deadline</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Trạng thái</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-[#64748B] uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const statusColor = getStatusColor(task.status);
                  const priorityColor = getPriorityColor(task.priority);
                  
                  return (
                    <tr key={task.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-6 py-4">
                        <input type="checkbox" className="w-4 h-4 rounded border-[#E2E8F0]" />
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono text-[#1F3A5F] font-medium">{task.code}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-[#0F172A] max-w-xs truncate">{task.title}</p>
                        <p className="text-xs text-[#64748B] mt-0.5">{task.district}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-xs font-semibold">
                            {task.assignee.substring(0, 2)}
                          </div>
                          <span className="text-sm text-[#0F172A]">{task.assignee}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-[#64748B]">{task.type}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span 
                          className="px-2.5 py-1 text-xs font-semibold rounded-full"
                          style={{ backgroundColor: priorityColor.bg, color: priorityColor.text }}
                        >
                          {getPriorityLabel(task.priority)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} className={task.status === 'overdue' ? 'text-[#C62828]' : 'text-[#64748B]'} />
                          <span className={`text-sm ${task.status === 'overdue' ? 'text-[#C62828] font-semibold' : 'text-[#0F172A]'}`}>
                            {task.deadline}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span 
                          className="px-3 py-1.5 text-xs font-semibold rounded-full inline-flex items-center gap-1.5"
                          style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor.text }}></span>
                          {getStatusLabel(task.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            className="w-8 h-8 flex items-center justify-center hover:bg-[#E3F2FD] rounded transition-colors group"
                            onClick={() => {
                              setSelectedTask(task);
                              setShowDetailModal(true);
                            }}
                          >
                            <Eye size={16} className="text-[#64748B] group-hover:text-[#1976D2]" />
                          </button>
                          <button className="w-8 h-8 flex items-center justify-center hover:bg-[#E3F2FD] rounded transition-colors group">
                            <Edit size={16} className="text-[#64748B] group-hover:text-[#1976D2]" />
                          </button>
                          <button
                            className="w-8 h-8 flex items-center justify-center hover:bg-[#FFEBEE] rounded transition-colors group"
                            onClick={() => {
                              setTaskToDelete(task);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 size={16} className="text-[#64748B] group-hover:text-[#C62828]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0]">
            <p className="text-sm text-[#64748B]">Hiển thị <span className="font-semibold text-[#0F172A]">1-5</span> trong <span className="font-semibold text-[#0F172A]">{filteredTasks.length}</span> kết quả</p>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F8FAFC] rounded border border-[#E2E8F0] transition-all">Trước</button>
              <button className="px-3 py-1.5 text-sm bg-[#1F3A5F] text-white rounded">1</button>
              <button className="px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F8FAFC] rounded transition-all">2</button>
              <button className="px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F8FAFC] rounded transition-all">3</button>
              <button className="px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F8FAFC] rounded border border-[#E2E8F0] transition-all">Sau</button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {statusTabs.filter(tab => tab.id !== 'all').map(tab => {
            const columnTasks = tasks.filter(t => t.status === tab.id);
            const statusColor = getStatusColor(tab.id as TaskStatus);
            
            return (
              <div key={tab.id} className="flex-shrink-0 w-80">
                <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
                  {/* Column Header */}
                  <div className="p-4 border-b border-[#E2E8F0]" style={{ backgroundColor: `${statusColor.bg}80` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor.text }}></span>
                        <h3 className="font-semibold text-[#0F172A]">{tab.label}</h3>
                      </div>
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-white text-[#64748B]">
                        {columnTasks.length}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="p-3 space-y-3 max-h-[600px] overflow-y-auto">
                    {columnTasks.map(task => {
                      const priorityColor = getPriorityColor(task.priority);
                      return (
                        <div key={task.id} className="bg-white border border-[#E2E8F0] rounded-lg p-4 hover:shadow-md transition-all cursor-pointer">
                          <div className="flex items-start justify-between mb-2">
                            <span 
                              className="px-2 py-1 text-xs font-semibold rounded"
                              style={{ backgroundColor: priorityColor.bg, color: priorityColor.text }}
                            >
                              {getPriorityLabel(task.priority)}
                            </span>
                            <button className="text-[#64748B] hover:text-[#1F3A5F]">
                              <MoreVertical size={16} />
                            </button>
                          </div>
                          <h4 className="text-sm font-semibold text-[#0F172A] mb-2 line-clamp-2">{task.title}</h4>
                          <p className="text-xs text-[#64748B] mb-3">{task.code}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Clock size={12} className="text-[#64748B]" />
                              <span className="text-xs text-[#64748B]">{task.deadline}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-[10px] font-semibold">
                                {task.assignee.substring(0, 2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {columnTasks.length === 0 && (
                      <div className="text-center py-8">
                        <CheckSquare size={32} className="text-[#E2E8F0] mx-auto mb-2" />
                        <p className="text-sm text-[#94A3B8]">Chưa có nhiệm vụ</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Detail Modal */}
      {showDetailModal && selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setShowDetailModal(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && taskToDelete && (
        <ConfirmDialog
          title="Xóa nhiệm vụ"
          message={`Bạn có chắc chắn muốn xóa nhiệm vụ "${taskToDelete.title}" không?`}
          onConfirm={() => {
            // Handle task deletion here
            setShowDeleteDialog(false);
          }}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
    </div>
  );
}