import { Clock, Download, Calendar, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

export function AttendanceReport() {
  const monthlyData = [
    { month: 'T7', attendance: 95, late: 5, absent: 2 },
    { month: 'T8', attendance: 94, late: 6, absent: 3 },
    { month: 'T9', attendance: 96, late: 4, absent: 2 },
    { month: 'T10', attendance: 97, late: 3, absent: 1 },
    { month: 'T11', attendance: 95, late: 5, absent: 2 },
    { month: 'T12', attendance: 98, late: 2, absent: 1 },
  ];

  const districtData = [
    { name: 'KP 1', value: 28, color: '#1F3A5F' },
    { name: 'KP 2', value: 32, color: '#2E7D32' },
    { name: 'KP 3', value: 25, color: '#1976D2' },
    { name: 'KP 4', value: 30, color: '#F57C00' },
    { name: 'KP 5', value: 27, color: '#7B1FA2' },
    { name: 'KP 6', value: 26, color: '#C62828' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Báo Cáo Chấm Công</h1>
          <p className="text-sm text-[#64748B] mt-1">Báo cáo thống kê chấm công và giờ làm việc</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="px-4 py-2 border border-[#E2E8F0] rounded-lg text-sm font-medium bg-white">
            <option>6 tháng gần nhất</option>
            <option>12 tháng</option>
            <option>Tùy chỉnh</option>
          </select>
          <button className="px-4 py-2 text-sm font-medium text-white bg-[#1F3A5F] rounded-lg flex items-center gap-2">
            <Download size={16} />
            Xuất báo cáo
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
              <Clock size={24} className="text-[#2E7D32]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Tỷ lệ TB</p>
              <p className="text-2xl font-bold text-[#0F172A]">95.8%</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FFF3E0] rounded-lg flex items-center justify-center">
              <TrendingUp size={24} className="text-[#F57C00]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Ngày công TB</p>
              <p className="text-2xl font-bold text-[#0F172A]">22.5</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#E3F2FD] rounded-lg flex items-center justify-center">
              <Calendar size={24} className="text-[#1976D2]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Tổng trễ</p>
              <p className="text-2xl font-bold text-[#F57C00]">48</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
              <Calendar size={24} className="text-[#C62828]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Vắng k/phép</p>
              <p className="text-2xl font-bold text-[#C62828]">12</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Xu hướng chấm công 6 tháng</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
              <Tooltip />
              <Line type="monotone" dataKey="attendance" stroke="#2E7D32" strokeWidth={2} name="Đi làm (%)" />
              <Line type="monotone" dataKey="late" stroke="#F57C00" strokeWidth={2} name="Trễ" />
              <Line type="monotone" dataKey="absent" stroke="#C62828" strokeWidth={2} name="Vắng" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Phân bố theo KP</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={districtData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {districtData.map((entry, index) => (
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
