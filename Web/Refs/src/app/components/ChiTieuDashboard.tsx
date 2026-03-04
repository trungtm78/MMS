import { BarChart3, TrendingUp, Target, Award, Users, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

export function ChiTieuDashboard() {
  const chiTieuData = [
    { month: 'T7', completion: 92, quality: 88, punctuality: 95 },
    { month: 'T8', completion: 94, quality: 90, punctuality: 93 },
    { month: 'T9', completion: 89, quality: 87, punctuality: 91 },
    { month: 'T10', completion: 96, quality: 92, punctuality: 97 },
    { month: 'T11', completion: 93, quality: 91, punctuality: 94 },
    { month: 'T12', completion: 97, quality: 95, punctuality: 98 },
  ];

  const districtPerformance = [
    { district: 'KP 1', score: 95 },
    { district: 'KP 2', score: 92 },
    { district: 'KP 3', score: 88 },
    { district: 'KP 4', score: 94 },
    { district: 'KP 5', score: 90 },
    { district: 'KP 6', score: 93 },
  ];

  const radarData = [
    { category: 'Hoàn thành nhiệm vụ', value: 97 },
    { category: 'Chất lượng công việc', value: 95 },
    { category: 'Đúng giờ', value: 98 },
    { category: 'Kỷ luật', value: 92 },
    { category: 'Hợp tác', value: 94 },
    { category: 'Sáng tạo', value: 88 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold text-[#0F172A]">Dashboard Chỉ tiêu</h1>
        <p className="text-sm text-[#64748B] mt-1">Bảng điều khiển hiệu suất và chỉ số chỉ tiêu</p>
      </div>

      {/* Chỉ tiêu Summary Cards */}
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <Target size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Chỉ tiêu TB</p>
              <p className="text-3xl font-bold">94.8%</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <TrendingUp size={16} />
            <span>+2.3% vs tháng trước</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
              <CheckCircle size={20} className="text-[#2E7D32]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Hoàn thành NV</p>
              <p className="text-2xl font-bold text-[#0F172A]">97%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#E3F2FD] rounded-lg flex items-center justify-center">
              <Award size={20} className="text-[#1976D2]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Chất lượng</p>
              <p className="text-2xl font-bold text-[#0F172A]">95%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#FFF3E0] rounded-lg flex items-center justify-center">
              <Users size={20} className="text-[#F57C00]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Đúng giờ</p>
              <p className="text-2xl font-bold text-[#0F172A]">98%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Chỉ tiêu Trend */}
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Xu hướng Chỉ tiêu 6 tháng</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chiTieuData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
              <Tooltip />
              <Line type="monotone" dataKey="completion" stroke="#1F3A5F" strokeWidth={2} name="Hoàn thành" />
              <Line type="monotone" dataKey="quality" stroke="#2E7D32" strokeWidth={2} name="Chất lượng" />
              <Line type="monotone" dataKey="punctuality" stroke="#1976D2" strokeWidth={2} name="Đúng giờ" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Radar */}
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Phân tích đa chiều</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#E2E8F0" />
              <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: '#64748B' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar name="Chỉ tiêu" dataKey="value" stroke="#1F3A5F" fill="#1F3A5F" fillOpacity={0.6} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* District Performance */}
      <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
        <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Hiệu suất theo Khu phố</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={districtPerformance}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="district" tick={{ fontSize: 12, fill: '#64748B' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} />
            <Tooltip />
            <Bar dataKey="score" fill="#1F3A5F" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
