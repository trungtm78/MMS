import { ArrowLeft, Search, Filter, MapPin, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface MyTasksProps {
  onNavigate: (screen: string) => void;
}

const tasksData = [
  { id: 1, title: 'Tuần tra khu vực 1', location: 'Chợ Bến Thành, KP1', time: '08:00 - 12:00', status: 'completed', priority: 'high', date: '25/02/2024' },
  { id: 2, title: 'Tuyên truyền PCCC', location: 'Đường Lê Lợi', time: '14:00 - 16:00', status: 'in-progress', priority: 'medium', date: '25/02/2024' },
  { id: 3, title: 'Kiểm tra ANTT tại khu dân cư', location: 'KP2', time: '18:00 - 20:00', status: 'pending', priority: 'medium', date: '25/02/2024' },
  { id: 4, title: 'Hỗ trợ giữ xe tại chợ', location: 'Chợ Tân Định', time: '06:00 - 09:00', status: 'pending', priority: 'low', date: '26/02/2024' },
  { id: 5, title: 'Kiểm tra phương tiện giao thông', location: 'Ngã 3 Lê Lợi', time: '07:00 - 11:00', status: 'pending', priority: 'high', date: '26/02/2024' },
];

export default function MyTasks({ onNavigate }: MyTasksProps) {
  const [selectedFilter, setSelectedFilter] = useState('all');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-[#DCFCE7] text-[#15803D]';
      case 'in-progress': return 'bg-[#FEF3C7] text-[#F59E0B]';
      case 'pending': return 'bg-[#F1F5F9] text-[#64748B]';
      default: return 'bg-[#F1F5F9] text-[#64748B]';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Hoàn thành';
      case 'in-progress': return 'Đang thực hiện';
      case 'pending': return 'Chưa bắt đầu';
      default: return 'Unknown';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={16} />;
      case 'in-progress': return <Clock size={16} />;
      case 'pending': return <AlertCircle size={16} />;
      default: return <AlertCircle size={16} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-[#DC2626]';
      case 'medium': return 'border-[#F59E0B]';
      case 'low': return 'border-[#64748B]';
      default: return 'border-[#64748B]';
    }
  };

  const filteredTasks = tasksData.filter(task => {
    if (selectedFilter === 'all') return true;
    return task.status === selectedFilter;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Nhiệm vụ của tôi</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2">
              <Search className="text-[#DC2626]" size={20} />
            </button>
            <button className="p-2">
              <Filter className="text-[#DC2626]" size={20} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              selectedFilter === 'all'
                ? 'bg-[#DC2626] text-white shadow-md'
                : 'bg-white text-[#64748B]'
            }`}
          >
            Tất cả ({tasksData.length})
          </button>
          <button
            onClick={() => setSelectedFilter('pending')}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              selectedFilter === 'pending'
                ? 'bg-[#DC2626] text-white shadow-md'
                : 'bg-white text-[#64748B]'
            }`}
          >
            Chưa bắt đầu ({tasksData.filter(t => t.status === 'pending').length})
          </button>
          <button
            onClick={() => setSelectedFilter('in-progress')}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              selectedFilter === 'in-progress'
                ? 'bg-[#DC2626] text-white shadow-md'
                : 'bg-white text-[#64748B]'
            }`}
          >
            Đang làm ({tasksData.filter(t => t.status === 'in-progress').length})
          </button>
          <button
            onClick={() => setSelectedFilter('completed')}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              selectedFilter === 'completed'
                ? 'bg-[#DC2626] text-white shadow-md'
                : 'bg-white text-[#64748B]'
            }`}
          >
            Hoàn thành ({tasksData.filter(t => t.status === 'completed').length})
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-4 pt-4">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl p-3 shadow-sm text-center border-2 border-[#15803D]">
            <p className="text-2xl font-bold text-[#15803D]">1</p>
            <p className="text-xs text-[#64748B] mt-1">Hoàn thành</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center border-2 border-[#F59E0B]">
            <p className="text-2xl font-bold text-[#F59E0B]">1</p>
            <p className="text-xs text-[#64748B] mt-1">Đang làm</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center border-2 border-[#64748B]">
            <p className="text-2xl font-bold text-[#64748B]">3</p>
            <p className="text-xs text-[#64748B] mt-1">Chưa làm</p>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="px-4 space-y-3">
        {filteredTasks.map((task) => (
          <div
            key={task.id}
            className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${getPriorityColor(task.priority)}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-[#0F172A] mb-1">{task.title}</h3>
                <p className="text-xs text-[#64748B]">{task.date}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${getStatusColor(task.status)}`}>
                {getStatusIcon(task.status)}
                {getStatusText(task.status)}
              </span>
            </div>

            {/* Details */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="text-[#DC2626]" size={16} />
                <span className="text-[#0F172A]">{task.location}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="text-[#F59E0B]" size={16} />
                <span className="text-[#0F172A]">{task.time}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-3 pt-3 border-t border-[#F1F5F9] flex gap-2">
              {task.status === 'pending' && (
                <button className="flex-1 bg-[#DC2626] text-white py-2 rounded-lg text-sm font-bold">
                  Bắt đầu
                </button>
              )}
              {task.status === 'in-progress' && (
                <button className="flex-1 bg-[#15803D] text-white py-2 rounded-lg text-sm font-bold">
                  Hoàn thành
                </button>
              )}
              <button className="flex-1 border-2 border-[#DC2626] text-[#DC2626] py-2 rounded-lg text-sm font-bold">
                Chi tiết
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <AlertCircle className="text-[#CBD5E1] mb-4" size={64} />
          <p className="text-lg font-semibold text-[#0F172A] mb-1">Không có nhiệm vụ</p>
          <p className="text-sm text-[#64748B]">Thử thay đổi bộ lọc</p>
        </div>
      )}
    </div>
  );
}
