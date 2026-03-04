import { ArrowLeft, Download, ChevronDown, TrendingUp, Calendar, Users, Star, Trophy, AlertTriangle, User } from 'lucide-react';

interface ReportsProps {
  onNavigate: (screen: string) => void;
}

export default function Reports({ onNavigate }: ReportsProps) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Báo cáo</h1>
          </div>
          <button className="p-2">
            <Download className="text-[#64748B]" size={20} />
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="px-4 pt-4">
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar mb-4">
          {/* Nhiệm vụ Card */}
          <div className="bg-white rounded-xl p-4 shadow-sm min-w-[160px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-[#366092] bg-opacity-10 flex items-center justify-center">
                <Calendar className="text-[#366092]" size={18} />
              </div>
              <span className="text-xs text-[#64748B]">Nhiệm vụ</span>
            </div>
            <p className="text-2xl font-bold text-[#0F172A] mb-1">45</p>
            <p className="text-xs text-[#64748B] mb-2">Hoàn thành: 88.9%</p>
            <div className="h-8">
              <svg className="w-full h-full">
                <polyline
                  points="0,20 20,18 40,15 60,12 80,10 100,8 120,5"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="text-[#10B981]" size={12} />
              <span className="text-xs text-[#10B981] font-medium">+12%</span>
            </div>
          </div>

          {/* Chấm công Card */}
          <div className="bg-white rounded-xl p-4 shadow-sm min-w-[160px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-[#10B981] bg-opacity-10 flex items-center justify-center">
                <Users className="text-[#10B981]" size={18} />
              </div>
              <span className="text-xs text-[#64748B]">Chấm công</span>
            </div>
            <p className="text-2xl font-bold text-[#0F172A] mb-1">92%</p>
            <p className="text-xs text-[#64748B] mb-2">Đúng giờ: 85%</p>
            <div className="h-8">
              <svg className="w-full h-full">
                <polyline
                  points="0,22 20,20 40,18 60,16 80,14 100,12 120,10"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="text-[#10B981]" size={12} />
              <span className="text-xs text-[#10B981] font-medium">+5%</span>
            </div>
          </div>

          {/* Chỉ tiêu Card */}
          <div className="bg-white rounded-xl p-4 shadow-sm min-w-[160px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-[#FBBF24] bg-opacity-10 flex items-center justify-center">
                <Star className="text-[#FBBF24]" size={18} />
              </div>
              <span className="text-xs text-[#64748B]">Chỉ tiêu TB</span>
            </div>
            <p className="text-2xl font-bold text-[#0F172A] mb-1">89.2</p>
            <p className="text-xs text-[#64748B] mb-2">Rank: #2/6</p>
            <div className="h-8">
              <svg className="w-full h-full">
                <polyline
                  points="0,18 20,17 40,15 60,14 80,13 100,12 120,10"
                  fill="none"
                  stroke="#FBBF24"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="text-[#10B981]" size={12} />
              <span className="text-xs text-[#10B981] font-medium">+3.5</span>
            </div>
          </div>
        </div>

        {/* Task Completion Trend Chart */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Xu hướng hoàn thành nhiệm vụ</h3>
          <div className="h-48 relative">
            <svg className="w-full h-full">
              {/* Grid lines */}
              <line x1="0" y1="0" x2="100%" y2="0" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="0" y1="25%" x2="100%" y2="25%" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="0" y1="75%" x2="100%" y2="75%" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="0" y1="100%" x2="100%" y2="100%" stroke="#F1F5F9" strokeWidth="1" />
              
              {/* Lines */}
              <polyline
                points="0,150 50,140 100,135 150,130 200,125 250,120 300,115"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2"
              />
              <polyline
                points="0,160 50,150 100,145 150,140 200,135 250,130 300,125"
                fill="none"
                stroke="#10B981"
                strokeWidth="2"
              />
              <polyline
                points="0,180 50,178 100,175 150,173 200,170 250,168 300,165"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#3B82F6] rounded-full"></div>
              <span className="text-xs text-[#64748B]">Giao</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#10B981] rounded-full"></div>
              <span className="text-xs text-[#64748B]">Hoàn thành</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#EF4444] rounded-full"></div>
              <span className="text-xs text-[#64748B]">Quá hạn</span>
            </div>
          </div>
        </div>

        {/* Attendance Breakdown Chart */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Phân tích chấm công</h3>
          <div className="space-y-3">
            {[
              { week: 'Tuần 1', ontime: 85, late: 10, absent: 5 },
              { week: 'Tuần 2', ontime: 88, late: 8, absent: 4 },
              { week: 'Tuần 3', ontime: 90, late: 7, absent: 3 },
              { week: 'Tuần 4', ontime: 87, late: 9, absent: 4 },
            ].map((week) => (
              <div key={week.week}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-[#64748B]">{week.week}</span>
                  <span className="text-[#0F172A] font-medium">{week.ontime + week.late + week.absent}%</span>
                </div>
                <div className="h-8 flex rounded-lg overflow-hidden">
                  <div 
                    className="bg-[#10B981] flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${week.ontime}%` }}
                  >
                    {week.ontime > 15 ? `${week.ontime}%` : ''}
                  </div>
                  <div 
                    className="bg-[#F59E0B] flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${week.late}%` }}
                  >
                    {week.late > 5 ? `${week.late}%` : ''}
                  </div>
                  <div 
                    className="bg-[#EF4444] flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${week.absent}%` }}
                  >
                    {week.absent > 5 ? `${week.absent}%` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#10B981] rounded-full"></div>
              <span className="text-xs text-[#64748B]">Đúng giờ</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#F59E0B] rounded-full"></div>
              <span className="text-xs text-[#64748B]">Trễ</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#EF4444] rounded-full"></div>
              <span className="text-xs text-[#64748B]">Vắng</span>
            </div>
          </div>
        </div>

        {/* Phân bố Chỉ tiêu Team Chart */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Phân bố Chỉ tiêu team</h3>
          <div className="space-y-3">
            {[
              { range: '90-100', count: 8, color: '#10B981', width: 80 },
              { range: '80-89', count: 12, color: '#3B82F6', width: 100 },
              { range: '70-79', count: 6, color: '#F59E0B', width: 60 },
              { range: '60-69', count: 2, color: '#F59E0B', width: 20 },
              { range: '<60', count: 0, color: '#EF4444', width: 0 },
            ].map((range) => (
              <div key={range.range}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-[#64748B] w-16">{range.range}</span>
                  <div className="flex-1 mx-3">
                    <div 
                      className="h-8 rounded-lg flex items-center px-3 text-white text-xs font-medium"
                      style={{ 
                        width: `${range.width}%`, 
                        backgroundColor: range.color,
                        minWidth: range.count > 0 ? '60px' : '0'
                      }}
                    >
                      {range.count > 0 ? `${range.count} người` : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Performers */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Top 5 xuất sắc</h3>
          <div className="space-y-3">
            {[
              { rank: 1, name: 'Nguyễn Văn An', kpi: 95.2, medal: '🥇', avatar: 'photo-1763735134462-aca6bfd76573' },
              { rank: 2, name: 'Trần Thị Bình', kpi: 94.8, medal: '🥈', avatar: 'photo-1581065178026-390bc4e78dad' },
              { rank: 3, name: 'Lê Văn Cường', kpi: 93.5, medal: '🥉', avatar: 'photo-1734864489622-0406baee014f' },
              { rank: 4, name: 'Phạm Thị Dung', kpi: 92.1, medal: '', avatar: 'photo-1581065178026-390bc4e78dad' },
              { rank: 5, name: 'Hoàng Văn Hải', kpi: 91.7, medal: '', avatar: 'photo-1661588156316-cdcbe2e0c8ad' },
            ].map((person) => (
              <div key={person.rank} className="flex items-center gap-3 p-2 hover:bg-[#F8FAFC] rounded-lg transition-colors">
                <span className="text-lg font-bold text-[#64748B] w-6">{person.rank}</span>
                <div className="w-8 h-8 rounded-full bg-[#366092] bg-opacity-10 flex items-center justify-center">
                  <User className="text-[#366092]" size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#0F172A]">{person.name}</p>
                </div>
                <span className="text-lg font-bold text-[#10B981]">{person.kpi}</span>
                {person.medal && <span className="text-xl">{person.medal}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Need Attention */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="text-[#F59E0B]" size={20} />
            <h3 className="text-lg font-semibold text-[#F59E0B]">Cần chú ý</h3>
          </div>
          <div className="space-y-3">
            {[
              { name: 'Võ Văn Minh', chitieu: 68.5, issue: 'Chỉ tiêu thấp', avatar: 'photo-1661588156316-cdcbe2e0c8ad' },
              { name: 'Đặng Thị Nga', chitieu: 72.3, issue: 'Nhiều ngày trễ', avatar: 'photo-1581065178026-390bc4e78dad' },
            ].map((person, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-[#FFF7ED] rounded-lg">
                <div className="w-8 h-8 rounded-full bg-[#366092] bg-opacity-10 flex items-center justify-center">
                  <User className="text-[#366092]" size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#0F172A]">{person.name}</p>
                  <p className="text-xs text-[#64748B]">{person.issue}</p>
                </div>
                <span className="text-lg font-bold text-[#EF4444]">{person.chitieu}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Buttons */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-[#E2E8F0] p-4 shadow-lg">
        <div className="flex gap-3">
          <button className="flex-1 h-12 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium">
            Xuất PDF
          </button>
          <button className="flex-1 h-12 bg-[#366092] text-white rounded-lg text-sm font-medium">
            Gửi báo cáo
          </button>
        </div>
      </div>
    </div>
  );
}