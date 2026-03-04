import { ClipboardList, Download, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export function TaskReport() {
  const tasksByType = [
    { type: 'Tuần tra', count: 45, color: '#1F3A5F' },
    { type: 'Xử lý sự vụ', count: 28, color: '#C62828' },
    { type: 'Hỗ trợ dân sinh', count: 32, color: '#2E7D32' },
    { type: 'Tuyên truyền', count: 18, color: '#1976D2' },
    { type: 'Khác', count: 12, color: '#F57C00' },
  ];

  const monthlyTasks = [
    { month: 'T7', completed: 78, overdue: 7, total: 85 },
    { month: 'T8', completed: 88, overdue: 4, total: 92 },
    { month: 'T9', completed: 82, overdue: 6, total: 88 },
    { month: 'T10', completed: 91, overdue: 4, total: 95 },
    { month: 'T11', completed: 103, overdue: 5, total: 108 },
    { month: 'T12', completed: 107, overdue: 5, total: 112 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Báo Cáo Nhiệm Vụ</h1>
          <p className="text-sm text-[#64748B] mt-1">Báo cáo thống kê tình hình thực hiện nhiệm vụ</p>
        </div>
        <button className="px-4 py-2 text-sm font-medium text-white bg-[#1F3A5F] rounded-lg flex items-center gap-2">
          <Download size={16} />
          Xuất báo cáo
        </button>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#E3F2FD] rounded-lg flex items-center justify-center">
              <ClipboardList size={24} className="text-[#1976D2]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Tổng NV</p>
              <p className="text-2xl font-bold text-[#0F172A]">135</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
              <CheckCircle size={24} className="text-[#2E7D32]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Hoàn thành</p>
              <p className="text-2xl font-bold text-[#2E7D32]">107</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FFF3E0] rounded-lg flex items-center justify-center">
              <Clock size={24} className="text-[#F57C00]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Đang làm</p>
              <p className="text-2xl font-bold text-[#F57C00]">23</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
              <AlertCircle size={24} className="text-[#C62828]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Quá hạn</p>
              <p className="text-2xl font-bold text-[#C62828]">5</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Nhiệm vụ theo tháng</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyTasks}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
              <Tooltip />
              <Bar dataKey="completed" fill="#2E7D32" radius={[8, 8, 0, 0]} name="Hoàn thành" />
              <Bar dataKey="overdue" fill="#C62828" radius={[8, 8, 0, 0]} name="Quá hạn" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Phân loại nhiệm vụ</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={tasksByType}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ type, percent }) => `${type}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                dataKey="count"
              >
                {tasksByType.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
