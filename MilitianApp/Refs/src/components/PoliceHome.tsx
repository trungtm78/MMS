import { useState } from 'react';
import { Bell, Users, ClipboardList, AlertTriangle, TrendingUp, Award, CheckCircle2, Clock, MapPin, Phone, Plus, Shield } from 'lucide-react';
import { Notifications } from './Notifications';
import { CreateTask } from './CreateTask';
import { EvaluateDQTV } from './EvaluateDQTV';

interface PoliceHomeProps {
  userData: {
    name: string;
    code: string;
    rank?: string;
  };
}

export function PoliceHome({ userData }: PoliceHomeProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showEvaluate, setShowEvaluate] = useState(false);

  const stats = {
    totalDQTV: 28,
    activeDQTV: 25,
    onDuty: 18,
    tasksTotal: 16,
    tasksPending: 3,
    tasksInProgress: 8,
    tasksOverdue: 1,
    avgKPI: 87.3,
    incidentsToday: 2,
  };

  const quickActions = [
    { id: 'create-task', icon: '➕', name: 'Giao nhiệm vụ', badge: '', color: 'bg-[#366092]' },
    { id: 'incidents', icon: '🚨', name: 'Sự cố mới', badge: '2', color: 'bg-[#EF4444]' },
    { id: 'evaluate', icon: '⭐', name: 'Đánh giá DQTV', badge: '', color: 'bg-[#F59E0B]' },
    { id: 'broadcast', icon: '📢', name: 'Gửi thông báo', badge: '', color: 'bg-[#10B981]' },
  ];

  const recentTasks = [
    { id: '1', code: 'NV-2024-001', title: 'Tuần tra khu vực chợ', assignee: 'Nguyễn Văn An', status: 'in-progress', priority: 'high' },
    { id: '2', code: 'NV-2024-002', title: 'Tuyên truyền PCCC', assignee: 'Lê Thị Cẩm', status: 'pending', priority: 'medium' },
    { id: '3', code: 'NV-2024-003', title: 'Xử lý tranh chấp', assignee: 'Trần Văn Bình', status: 'overdue', priority: 'urgent' },
  ];

  const dqtvOnDuty = [
    { id: '1', name: 'Nguyễn Văn An', area: 'KP1', status: 'active', lastCheckin: '08:05', task: 'Tuần tra chợ' },
    { id: '2', name: 'Trần Văn Bình', area: 'KP1', status: 'active', lastCheckin: '08:00', task: 'Sẵn sàng' },
    { id: '3', name: 'Lê Thị Cẩm', area: 'KP2', status: 'active', lastCheckin: '08:10', task: 'Tuyên truyền' },
  ];

  const recentIncidents = [
    { id: '1', code: 'BC-2024-015', type: 'Mất an ninh', reporter: 'Nguyễn Văn An', time: '1 giờ trước', status: 'handling' },
    { id: '2', code: 'BC-2024-016', type: 'Sự cố điện', reporter: 'Trần Văn Bình', time: '2 giờ trước', status: 'resolved' },
  ];

  if (showNotifications) {
    return <Notifications onClose={() => setShowNotifications(false)} />;
  }

  if (showCreateTask) {
    return <CreateTask onClose={() => setShowCreateTask(false)} />;
  }

  if (showEvaluate) {
    return <EvaluateDQTV onClose={() => setShowEvaluate(false)} />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header with Gradient */}
      <div className="bg-gradient-to-br from-[#EF4444] to-[#DC2626] pt-12 pb-6 px-4 rounded-b-3xl">
        {/* Top Row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
                <Shield className="w-7 h-7 text-[#EF4444]" />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#10B981] border-2 border-white rounded-full"></div>
            </div>
            <div>
              <p className="text-white/80 text-sm">Chào buổi sáng,</p>
              <h1 className="text-white text-xl font-bold">{userData.rank} {userData.name}</h1>
              <span className="inline-block mt-1 px-2 py-1 bg-white/20 text-white text-xs rounded-full">
                Công An Khu Vực 1
              </span>
            </div>
          </div>
          <button onClick={() => setShowNotifications(true)} className="relative p-2">
            <Bell className="w-6 h-6 text-white" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-[#FFF] rounded-full"></span>
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <p className="text-white/80 text-xs">DQTV trực</p>
            <p className="text-white text-lg font-bold">{stats.onDuty}/{stats.activeDQTV}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <p className="text-white/80 text-xs">Nhiệm vụ</p>
            <p className="text-white text-lg font-bold">{stats.tasksInProgress}/{stats.tasksTotal}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <p className="text-white/80 text-xs">KPI TB</p>
            <p className="text-white text-lg font-bold">{stats.avgKPI}%</p>
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="px-4 mt-6">
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={() => {
                if (action.id === 'create-task') setShowCreateTask(true);
                if (action.id === 'evaluate') setShowEvaluate(true);
              }}
              className={`${action.color} rounded-xl p-4 shadow-sm active:scale-98 transition-transform relative text-white`}
            >
              {action.badge && (
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-white text-[#EF4444] text-[10px] font-bold rounded-full">
                  {action.badge}
                </div>
              )}
              <div className="text-3xl mb-2">{action.icon}</div>
              <h3 className="font-semibold text-sm">{action.name}</h3>
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="px-4 mt-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#64748B]">Chờ tiếp nhận</span>
              <Clock className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <p className="text-2xl font-bold text-[#F59E0B]">{stats.tasksPending}</p>
            <p className="text-xs text-[#64748B] mt-1">nhiệm vụ</p>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#64748B]">Quá hạn</span>
              <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
            </div>
            <p className="text-2xl font-bold text-[#EF4444]">{stats.tasksOverdue}</p>
            <p className="text-xs text-[#64748B] mt-1">nhiệm vụ</p>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#64748B]">Sự cố hôm nay</span>
              <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
            </div>
            <p className="text-2xl font-bold text-[#EF4444]">{stats.incidentsToday}</p>
            <p className="text-xs text-[#64748B] mt-1">báo cáo</p>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#64748B]">KPI trung bình</span>
              <TrendingUp className="w-5 h-5 text-[#10B981]" />
            </div>
            <p className="text-2xl font-bold text-[#10B981]">{stats.avgKPI}%</p>
            <p className="text-xs text-[#64748B] mt-1">toàn lực lượng</p>
          </div>
        </div>
      </div>

      {/* Recent Tasks */}
      <div className="px-4 mt-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#0F172A]">Nhiệm vụ gần đây</h2>
            <button className="text-sm text-[#366092] font-medium">Xem tất cả</button>
          </div>

          <div className="space-y-3">
            {recentTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  task.status === 'overdue' ? 'bg-[#EF4444]/10' :
                  task.status === 'in-progress' ? 'bg-[#3B82F6]/10' :
                  'bg-[#64748B]/10'
                }`}>
                  {task.status === 'overdue' ? <AlertTriangle className="w-5 h-5 text-[#EF4444]" /> :
                   task.status === 'in-progress' ? <TrendingUp className="w-5 h-5 text-[#3B82F6]" /> :
                   <Clock className="w-5 h-5 text-[#64748B]" />}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-[#0F172A]">{task.title}</p>
                  <p className="text-xs text-[#64748B]">{task.assignee}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  task.priority === 'urgent' ? 'bg-[#EF4444]/10 text-[#EF4444]' :
                  task.priority === 'high' ? 'bg-[#F59E0B]/10 text-[#F59E0B]' :
                  'bg-[#64748B]/10 text-[#64748B]'
                }`}>
                  {task.priority === 'urgent' ? 'Khẩn' : task.priority === 'high' ? 'Cao' : 'TB'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DQTV On Duty */}
      <div className="px-4 mt-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#0F172A]">DQTV đang trực ({stats.onDuty})</h2>
            <button className="text-sm text-[#366092] font-medium">Xem tất cả</button>
          </div>

          <div className="space-y-3">
            {dqtvOnDuty.map((dqtv) => (
              <div key={dqtv.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-[#366092] text-white flex items-center justify-center font-semibold relative">
                  {dqtv.name.split(' ').pop()?.charAt(0)}
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#10B981] border-2 border-white rounded-full"></div>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-[#0F172A]">{dqtv.name}</p>
                  <div className="flex items-center gap-2 text-xs text-[#64748B]">
                    <span>{dqtv.area}</span>
                    <span>•</span>
                    <span>Điểm danh: {dqtv.lastCheckin}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#3B82F6] font-medium">{dqtv.task}</p>
                  <button className="text-xs text-[#10B981] mt-1">
                    <Phone className="w-3 h-3 inline" /> Gọi
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Incidents */}
      <div className="px-4 mt-6 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#0F172A]">Sự cố báo cáo</h2>
            <button className="text-sm text-[#366092] font-medium">Xem tất cả</button>
          </div>

          <div className="space-y-3">
            {recentIncidents.map((incident) => (
              <div key={incident.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  incident.status === 'handling' ? 'bg-[#F59E0B]/10' : 'bg-[#10B981]/10'
                }`}>
                  {incident.status === 'handling' ? 
                    <AlertTriangle className="w-5 h-5 text-[#F59E0B]" /> :
                    <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
                  }
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-[#0F172A]">{incident.type}</p>
                  <p className="text-xs text-[#64748B]">Báo cáo: {incident.reporter}</p>
                  <p className="text-xs text-[#64748B]">{incident.time}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  incident.status === 'handling' ? 'bg-[#F59E0B]/10 text-[#F59E0B]' : 'bg-[#10B981]/10 text-[#10B981]'
                }`}>
                  {incident.status === 'handling' ? 'Đang xử lý' : 'Đã xử lý'}
                </span>
              </div>
            ))}
          </div>
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