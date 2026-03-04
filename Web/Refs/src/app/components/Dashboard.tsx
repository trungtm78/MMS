import { Users, UserCheck, Calendar, AlertCircle, TrendingUp, ArrowUpRight, Clock, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

interface DashboardProps {
  onNavigate?: (screen: string) => void;
}

const statsCards = [
  { 
    label: 'Tổng số DQTV', 
    value: 168, 
    icon: Users, 
    trend: '+5',
    trendLabel: 'so với tháng trước',
    color: '#1F3A5F',
    bgColor: '#E3F2FD',
    percentage: null
  },
  { 
    label: 'Đang làm việc', 
    value: 142, 
    icon: UserCheck, 
    trend: null,
    trendLabel: null,
    color: '#2E7D32',
    bgColor: '#E8F5E9',
    percentage: '84.5%'
  },
  { 
    label: 'Nghỉ phép', 
    value: 18, 
    icon: Calendar, 
    trend: '-3',
    trendLabel: 'vs tuần trước',
    color: '#F57C00',
    bgColor: '#FFF3E0',
    percentage: null
  },
  { 
    label: 'Nhiệm vụ chờ xử lý', 
    value: 23, 
    icon: AlertCircle, 
    trend: null,
    trendLabel: null,
    color: '#C62828',
    bgColor: '#FFEBEE',
    badge: 'Khẩn cấp: 5'
  },
];

const taskCompletionData = [
  { month: 'T1', assigned: 85, completed: 78, overdue: 7 },
  { month: 'T2', assigned: 92, completed: 88, overdue: 4 },
  { month: 'T3', assigned: 88, completed: 82, overdue: 6 },
  { month: 'T4', assigned: 95, completed: 91, overdue: 4 },
  { month: 'T5', assigned: 90, completed: 85, overdue: 5 },
  { month: 'T6', assigned: 98, completed: 94, overdue: 4 },
  { month: 'T7', assigned: 102, completed: 98, overdue: 4 },
  { month: 'T8', assigned: 96, completed: 92, overdue: 4 },
  { month: 'T9', assigned: 100, completed: 95, overdue: 5 },
  { month: 'T10', assigned: 105, completed: 100, overdue: 5 },
  { month: 'T11', assigned: 108, completed: 103, overdue: 5 },
  { month: 'T12', assigned: 112, completed: 107, overdue: 5 },
];

const districtData = [
  { name: 'KP 1', personnel: 28 },
  { name: 'KP 2', personnel: 32 },
  { name: 'KP 3', personnel: 25 },
  { name: 'KP 4', personnel: 30 },
  { name: 'KP 5', personnel: 27 },
  { name: 'KP 6', personnel: 26 },
];

const alerts = [
  { id: 1, type: 'violation', icon: AlertCircle, color: '#EF4444', message: 'DQTV Nguyễn Văn A - Vi phạm kỷ luật', time: '10 phút trước' },
  { id: 2, type: 'overdue', icon: Clock, color: '#F59E0B', message: 'Nhiệm vụ "Tuần tra khu vực" đã quá hạn 2 ngày', time: '1 giờ trước' },
  { id: 3, type: 'gps', icon: AlertCircle, color: '#F59E0B', message: 'GPS mất tín hiệu - Trần Văn B', time: '2 giờ trước' },
  { id: 4, type: 'approval', icon: CheckCircle2, color: '#3B82F6', message: '8 đơn từ chờ phê duyệt', time: '3 giờ trước' },
];

const quickActions = [
  { id: 1, label: 'Giao việc mới', description: 'Tạo và giao nhiệm vụ mới', icon: '➕', color: '#3B82F6', screen: 'new-task' },
  { id: 2, label: 'Thêm DQTV', description: 'Thêm nhân sự mới vào hệ thống', icon: '👤', color: '#10B981', screen: 'militia-list' },
  { id: 3, label: 'Tạo báo cáo', description: 'Xuất báo cáo thống kê', icon: '📄', color: '#F59E0B', screen: 'reports' },
  { id: 4, label: 'Xem GPS', description: 'Theo dõi vị trí real-time', icon: '📍', color: '#8B5CF6', screen: 'gps-tracking' },
];

export function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Dashboard</h1>
          <p className="text-sm text-[#64748B] mt-1">Tổng quan hệ thống quản lý Dân Quân Tự Vệ - Phường Phú Định</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="px-4 py-2 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#64748B] bg-white hover:border-[#366092] focus:outline-none focus:ring-2 focus:ring-[#366092] transition-all">
            <option>30 ngày qua</option>
            <option>7 ngày qua</option>
            <option>90 ngày qua</option>
            <option>Tùy chỉnh</option>
          </select>
          <button className="px-4 py-2 text-sm font-medium text-[#64748B] hover:text-[#366092] hover:bg-[#F1F5F9] rounded-lg transition-all">
            Làm mới
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-6">
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div 
              key={stat.label} 
              className="bg-white rounded-xl p-6 border border-[#E2E8F0] hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div 
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: stat.bgColor }}
                >
                  <Icon size={24} style={{ color: stat.color }} />
                </div>
                {stat.percentage && (
                  <span 
                    className="px-2.5 py-1 text-xs font-semibold rounded-full"
                    style={{ backgroundColor: stat.bgColor, color: stat.color }}
                  >
                    {stat.percentage}
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-[#64748B] mb-2">{stat.label}</p>
                <p className="text-3xl font-bold text-[#0F172A] mb-2">{stat.value}</p>
                {stat.trend && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className={`font-semibold flex items-center gap-1 ${stat.trend.startsWith('+') ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                      {stat.trend.startsWith('+') ? <ArrowUpRight size={14} /> : <TrendingUp size={14} className="rotate-180" />}
                      {stat.trend}
                    </span>
                    <span className="text-[#94A3B8]">{stat.trendLabel}</span>
                  </div>
                )}
                {stat.badge && (
                  <div className="mt-2">
                    <span className="px-2 py-1 text-xs font-semibold bg-[#FEE2E2] text-[#EF4444] rounded-full">
                      {stat.badge}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-6">
        {/* Task Completion Trend - Takes 2 columns */}
        <div className="col-span-2 bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-[#0F172A]">Tỷ lệ hoàn thành công việc</h3>
              <p className="text-sm text-[#64748B] mt-1">12 tháng gần nhất</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[#1F3A5F] rounded-full"></div>
                <span className="text-[#64748B]">Đã giao</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[#2E7D32] rounded-full"></div>
                <span className="text-[#64748B]">Hoàn thành</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[#C62828] rounded-full"></div>
                <span className="text-[#64748B]">Quá hạn</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={taskCompletionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12, fill: '#64748B' }}
                axisLine={{ stroke: '#E2E8F0' }}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: '#64748B' }}
                axisLine={{ stroke: '#E2E8F0' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px rgba(0,0,0,0.1)'
                }}
                labelStyle={{ color: '#0F172A', fontWeight: 600 }}
              />
              <Line type="monotone" dataKey="assigned" stroke="#1F3A5F" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="completed" stroke="#2E7D32" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="overdue" stroke="#C62828" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* District Distribution */}
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-6">Phân bố DQTV theo Khu phố</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={districtData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} width={50} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px rgba(0,0,0,0.1)'
                }}
              />
              <Bar dataKey="personnel" fill="#1F3A5F" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alerts & Quick Actions Row */}
      <div className="grid grid-cols-3 gap-6">
        {/* Alerts */}
        <div className="col-span-2 bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertCircle size={20} className="text-[#F59E0B]" />
              <h3 className="text-lg font-semibold text-[#0F172A]">Cảnh báo & Thông báo</h3>
            </div>
            <button className="text-sm font-medium text-[#366092] hover:underline">
              Xem tất cả
            </button>
          </div>
          <div className="space-y-3">
            {alerts.map(alert => {
              const Icon = alert.icon;
              return (
                <div key={alert.id} className="flex items-center gap-4 p-4 bg-[#F8FAFC] hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer border border-transparent hover:border-[#E2E8F0]">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${alert.color}15` }}
                  >
                    <Icon size={20} style={{ color: alert.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0F172A] truncate">{alert.message}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">{alert.time}</p>
                  </div>
                  <button className="px-3 py-1.5 text-xs font-medium text-[#366092] hover:bg-[#EFF6FF] rounded-lg transition-colors">
                    Xử lý
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-xl p-6 text-white">
          <h3 className="text-lg font-semibold mb-6 text-white">Thao tác nhanh</h3>
          <div className="space-y-3">
            {quickActions.map(action => (
              <button 
                key={action.id}
                className="w-full flex items-center gap-3 p-4 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all hover:scale-105"
                onClick={() => onNavigate && onNavigate(action.screen)}
              >
                <div className="text-2xl">{action.icon}</div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-white">{action.label}</p>
                  <p className="text-xs text-white/90 mt-0.5">{action.description}</p>
                </div>
                <ArrowUpRight size={18} className="opacity-60" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}