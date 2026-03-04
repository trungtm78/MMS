import { useState } from 'react';
import { TrendingUp, Award, Star, ChevronRight, ArrowLeft } from 'lucide-react';

export function KPI({ onBack }: { onBack?: () => void }) {
  const [period, setPeriod] = useState<'current' | 'last' | 'six'>('current');

  const chitieuData = {
    overall: 92.4,
    change: 2.3,
    rank: 3,
    total: 28,
    categories: [
      {
        name: 'Chấm công',
        icon: '✓',
        score: 95.0,
        max: 100,
        color: '#10B981',
        details: {
          workDays: '22/22',
          onTime: '20/22',
          late: '2 lần',
          early: '0 lần',
        },
      },
      {
        name: 'Hoàn thành nhiệm vụ',
        icon: '📋',
        score: 92.0,
        max: 100,
        color: '#3B82F6',
        details: {
          completed: '15/16',
          onTime: '14/16',
          overdue: '1',
          avgRating: '4.5⭐',
        },
      },
      {
        name: 'Kỷ luật',
        icon: '🛡️',
        score: 100,
        max: 100,
        color: '#10B981',
        details: {
          violations: '0',
          warnings: '0',
          awards: '2',
        },
      },
      {
        name: 'Đánh giá từ cấp trên',
        icon: '⭐',
        score: 90.0,
        max: 100,
        color: '#3B82F6',
        details: {
          avgRating: '4.5/5',
          reviews: '3 đánh giá',
        },
      },
      {
        name: 'Thái độ làm việc',
        icon: '😊',
        score: 95.0,
        max: 100,
        color: '#10B981',
        details: {
          keywords: 'Tích cực, Hợp tác, Trách nhiệm',
        },
      },
    ],
  };

  const leaderboard = [
    { rank: 1, name: 'Trần Văn Bình', score: 95.2, avatar: 'TB', trend: 'up' },
    { rank: 2, name: 'Lê Thị Cẩm', score: 93.8, avatar: 'LC', trend: 'up' },
    { rank: 3, name: 'Nguyễn Văn An', score: 92.4, avatar: 'NA', trend: 'up', isMe: true },
    { rank: 4, name: 'Phạm Minh Đức', score: 91.5, avatar: 'PD', trend: 'down' },
    { rank: 5, name: 'Hoàng Thị Ế', score: 90.2, avatar: 'HE', trend: 'up' },
  ];

  const achievements = [
    { icon: '🏆', title: 'Nhân viên xuất sắc tháng 11', date: '15/11/2024', earned: true },
    { icon: '⏰', title: '100% chấm công đúng giờ', date: '01/12/2024', earned: true },
    { icon: '📋', title: 'Hoàn thành 50 nhiệm vụ', date: '10/12/2024', earned: true },
    { icon: '🌟', title: 'Chỉ tiêu trên 95 điểm', date: '', earned: false },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <h1 className="text-xl font-extrabold text-[#DC2626]">Chỉ Tiêu</h1>
      </div>

      {/* Overall KPI Hero Card */}
      <div className="px-4 pt-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border-2 border-[#15803D]">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#15803D] to-[#166534] flex items-center justify-center mb-4 mx-auto">
            <Award className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-gray-500 text-sm mb-1">Điểm chỉ tiêu tổng thể</p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold">{chitieuData.overall}</span>
                <span className="text-xl">/100</span>
              </div>
            </div>
            <div className="relative">
              <svg className="w-32 h-32 -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="gray"
                  strokeOpacity="0.2"
                  strokeWidth="8"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="gray"
                  strokeWidth="8"
                  strokeDasharray={`${(chitieuData.overall / 100) * 352} 352`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold">{chitieuData.overall}%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
            <div className="px-3 py-2 bg-gray-100 rounded-lg backdrop-blur-sm">
              <span className="text-xl font-bold text-[#10B981]">Xuất sắc</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#10B981]" />
              <span className="text-sm">+{chitieuData.change} so với tháng trước</span>
            </div>
          </div>

          <div className="mt-3 text-sm">
            <span className="text-gray-500">Cao hơn TB khu phố: </span>
            <span className="font-semibold">+5.1 điểm</span>
          </div>
        </div>
      </div>

      {/* KPI Breakdown */}
      <div className="px-4 mt-4 space-y-3">
        {chitieuData.categories.map((category, index) => (
          <div key={index} className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{category.icon}</span>
                <span className="font-semibold text-[#0F172A]">{category.name}</span>
              </div>
              <span className="text-lg font-bold" style={{ color: category.color }}>
                {category.score}/{category.max}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${(category.score / category.max) * 100}%`,
                  backgroundColor: category.color,
                }}
              ></div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(category.details).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[#64748B] capitalize">
                    {key === 'workDays' && 'Ngày công'}
                    {key === 'onTime' && 'Đúng hạn'}
                    {key === 'late' && 'Trễ'}
                    {key === 'early' && 'Sớm'}
                    {key === 'completed' && 'Hoàn thành'}
                    {key === 'overdue' && 'Quá hạn'}
                    {key === 'avgRating' && 'Chất lượng TB'}
                    {key === 'violations' && 'Vi phạm'}
                    {key === 'warnings' && 'Cảnh cáo'}
                    {key === 'awards' && 'Khen thưởng'}
                    {key === 'reviews' && 'Số đánh giá'}
                    {key === 'keywords' && 'Đặc điểm'}
                  </span>
                  <span className="font-medium text-[#0F172A]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Ranking */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-[#0F172A] mb-4">Xếp hạng trong Khu phố 1</h2>
          <div className="text-center mb-6">
            <div className="inline-flex items-baseline gap-1">
              <span className="text-4xl font-bold text-[#366092]">#{chitieuData.rank}</span>
              <span className="text-lg text-[#64748B]">/{chitieuData.total}</span>
            </div>
          </div>

          {/* Podium */}
          <div className="flex items-end justify-center gap-2 mb-6 pb-6 border-b border-gray-100">
            {leaderboard.slice(0, 3).map((person, index) => {
              const heights = ['h-20', 'h-24', 'h-16'];
              const colors = ['bg-[#C0C0C0]', 'bg-[#FFD700]', 'bg-[#CD7F32]'];
              const order = [1, 0, 2];
              const actualIndex = order[index];
              const actualPerson = leaderboard[actualIndex];

              return (
                <div key={actualPerson.rank} className="flex-1 flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full ${
                      actualPerson.isMe ? 'bg-[#366092]' : 'bg-[#64748B]'
                    } text-white flex items-center justify-center font-bold mb-2 ${
                      actualPerson.isMe ? 'ring-4 ring-[#366092]/20' : ''
                    }`}
                  >
                    {actualPerson.avatar}
                  </div>
                  <p className={`text-xs font-medium text-center mb-2 ${actualPerson.isMe ? 'text-[#366092]' : 'text-[#0F172A]'}`}>
                    {actualPerson.name.split(' ').slice(-2).join(' ')}
                  </p>
                  <div className={`w-full ${heights[actualIndex]} ${colors[actualIndex]} rounded-t-lg flex items-center justify-center`}>
                    <div className="text-center">
                      <div className="text-2xl mb-1">{actualIndex === 0 ? '🥇' : actualIndex === 1 ? '🥈' : '🥉'}</div>
                      <div className="text-sm font-bold text-white">{actualPerson.score}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Leaderboard List */}
          <div className="space-y-2">
            {leaderboard.map((person) => (
              <div
                key={person.rank}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  person.isMe ? 'bg-[#EFF6FF] border border-[#366092]' : 'bg-gray-50'
                }`}
              >
                <span className={`text-sm font-bold w-6 ${person.isMe ? 'text-[#366092]' : 'text-[#64748B]'}`}>
                  #{person.rank}
                </span>
                <div
                  className={`w-10 h-10 rounded-full ${
                    person.isMe ? 'bg-[#366092]' : 'bg-[#64748B]'
                  } text-white flex items-center justify-center font-semibold text-sm`}
                >
                  {person.avatar}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${person.isMe ? 'text-[#366092]' : 'text-[#0F172A]'}`}>
                    {person.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${person.isMe ? 'text-[#366092]' : 'text-[#0F172A]'}`}>
                    {person.score}
                  </span>
                  {person.trend === 'up' ? (
                    <TrendingUp className="w-4 h-4 text-[#10B981]" />
                  ) : (
                    <TrendingUp className="w-4 h-4 text-[#EF4444] rotate-180" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div className="px-4 mt-4 mb-20">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#0F172A]">Thành tích</h2>
            <button className="text-sm text-[#366092] font-medium flex items-center gap-1">
              Xem tất cả
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {achievements.map((achievement, index) => (
              <div
                key={index}
                className={`p-3 rounded-xl border-2 ${
                  achievement.earned
                    ? 'bg-gradient-to-br from-[#FFD700]/10 to-[#FFA500]/10 border-[#FFD700]'
                    : 'bg-gray-50 border-gray-200 opacity-50'
                }`}
              >
                <div className="text-3xl mb-2 text-center">{achievement.icon}</div>
                <p className="text-xs font-medium text-center text-[#0F172A] mb-1 line-clamp-2">
                  {achievement.title}
                </p>
                {achievement.earned && (
                  <p className="text-[10px] text-center text-[#64748B]">{achievement.date}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="px-4 mb-20">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-[#0F172A] mb-4">Xu hướng 6 tháng</h2>
          <div className="h-48 flex items-end justify-between gap-2">
            {[85, 88, 87, 90, 89, 92.4].map((value, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div className="relative flex-1 w-full flex items-end">
                  <div
                    className="w-full bg-gradient-to-t from-[#366092] to-[#4A90E2] rounded-t-lg transition-all"
                    style={{ height: `${(value / 100) * 100}%` }}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-[#366092]">
                      {value}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-[#64748B] mt-2">T{index + 7}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#366092] rounded-full"></div>
              <span className="text-xs text-[#64748B]">Chỉ tiêu của bạn</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-1 bg-[#94A3B8] border-dashed border-t-2 border-[#94A3B8]"></div>
              <span className="text-xs text-[#64748B]">Trung bình</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}