import { Clock, Calendar, Download, Edit, Save, X } from 'lucide-react';
import { useState } from 'react';

interface AttendanceDay {
  day: number;
  status: 'present' | 'late' | 'absent' | 'leave' | 'off';
  checkIn?: string;
  checkOut?: string;
}

interface PersonnelAttendance {
  id: string;
  code: string;
  name: string;
  district: string;
  totalDays: number;
  late: number;
  early: number;
  leave: number;
  absent: number;
  percentage: number;
}

export function Timesheet() {
  const [selectedMonth, setSelectedMonth] = useState('12/2024');
  const [editMode, setEditMode] = useState(false);

  const personnel: PersonnelAttendance[] = [
    { id: '1', code: 'HCM-PHD-T12-0001', name: 'Nguyễn Văn A', district: 'KP 1', totalDays: 22, late: 1, early: 0, leave: 2, absent: 0, percentage: 95.7 },
    { id: '2', code: 'HCM-PHD-T12-0002', name: 'Trần Văn B', district: 'KP 2', totalDays: 23, late: 0, early: 1, leave: 1, absent: 0, percentage: 97.8 },
    { id: '3', code: 'HCM-PHD-T12-0003', name: 'Lê Văn C', district: 'KP 1', totalDays: 21, late: 2, early: 1, leave: 3, absent: 1, percentage: 89.1 },
    { id: '4', code: 'HCM-PHD-T12-0004', name: 'Phạm Văn D', district: 'KP 3', totalDays: 24, late: 0, early: 0, leave: 0, absent: 0, percentage: 100 },
    { id: '5', code: 'HCM-PHD-T12-0005', name: 'Hoàng Văn E', district: 'KP 2', totalDays: 22.5, late: 1, early: 2, leave: 1, absent: 0, percentage: 95.7 },
  ];

  const getDaysColor = (days: number) => {
    if (days >= 22) return 'text-[#2E7D32]';
    if (days >= 20) return 'text-[#FBC02D]';
    if (days >= 18) return 'text-[#F57C00]';
    return 'text-[#C62828]';
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 95) return '#2E7D32';
    if (percentage >= 85) return '#FBC02D';
    if (percentage >= 75) return '#F57C00';
    return '#C62828';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Bảng Chấm Công</h1>
          <p className="text-sm text-[#64748B] mt-1">Quản lý chấm công và theo dõi giờ làm việc của DQTV</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
          >
            <option value="12/2024">Tháng 12/2024</option>
            <option value="11/2024">Tháng 11/2024</option>
            <option value="10/2024">Tháng 10/2024</option>
          </select>
          <span className="px-3 py-2 bg-[#E8F5E9] text-[#2E7D32] rounded-lg text-sm font-semibold">
            Đã chốt
          </span>
          {!editMode ? (
            <>
              <button 
                onClick={() => setEditMode(true)}
                className="px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] rounded-lg border border-[#E2E8F0] transition-all flex items-center gap-2"
              >
                <Edit size={16} />
                Chỉnh sửa
              </button>
              <button className="px-4 py-2 text-sm font-medium text-white bg-[#1F3A5F] hover:bg-[#152A45] rounded-lg transition-all flex items-center gap-2">
                <Download size={16} />
                Xuất Excel
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setEditMode(false)}
                className="px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] rounded-lg border border-[#E2E8F0] transition-all flex items-center gap-2"
              >
                <X size={16} />
                Hủy
              </button>
              <button className="px-4 py-2 text-sm font-medium text-white bg-[#2E7D32] hover:bg-[#1B5E20] rounded-lg transition-all flex items-center gap-2">
                <Save size={16} />
                Lưu thay đổi
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#E3F2FD] rounded-lg flex items-center justify-center">
              <Calendar size={20} className="text-[#1976D2]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Tổng ngày công TB</p>
              <p className="text-2xl font-bold text-[#0F172A]">22.5</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[#2E7D32] font-semibold">+0.5</span>
            <span className="text-[#64748B]">vs tháng trước</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
              <Clock size={20} className="text-[#2E7D32]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Tỷ lệ đi làm</p>
              <p className="text-2xl font-bold text-[#0F172A]">95.3%</p>
            </div>
          </div>
          <div className="w-full bg-[#F1F5F9] rounded-full h-2 mt-2">
            <div className="bg-[#2E7D32] h-2 rounded-full" style={{ width: '95.3%' }}></div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#FFF3E0] rounded-lg flex items-center justify-center">
              <Clock size={20} className="text-[#F57C00]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Tổng trễ/sớm</p>
              <p className="text-2xl font-bold text-[#0F172A]">48</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[#EF4444] font-semibold">+8</span>
            <span className="text-[#64748B]">lần so với trước</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
              <X size={20} className="text-[#C62828]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Nghỉ không phép</p>
              <p className="text-2xl font-bold text-[#0F172A]">12</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[#C62828] font-semibold">Cần xử lý</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select className="px-4 py-2 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#64748B] bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]">
          <option>Tất cả khu phố</option>
          <option>Khu phố 1</option>
          <option>Khu phố 2</option>
          <option>Khu phố 3</option>
        </select>
        <select className="px-4 py-2 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#64748B] bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]">
          <option>Tất cả trạng thái</option>
          <option>Đúng giờ</option>
          <option>Trễ/Sớm</option>
          <option>Vắng</option>
        </select>
        <input
          type="text"
          placeholder="Tìm DQTV..."
          className="flex-1 px-4 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
        />
        <button className="px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] rounded-lg transition-all">
          Reset
        </button>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase sticky left-0 bg-[#F8FAFC] z-10">STT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase sticky left-12 bg-[#F8FAFC] z-10">Mã DQTV</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase sticky left-40 bg-[#F8FAFC] z-10">Họ tên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase">Khu phố</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Ngày công</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Trễ</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Sớm</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Nghỉ phép</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Nghỉ k/phép</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Tỷ lệ (%)</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {personnel.map((person, index) => (
                <tr key={person.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-4 py-4 text-sm text-[#64748B] sticky left-0 bg-white z-10">{index + 1}</td>
                  <td className="px-4 py-4 sticky left-12 bg-white z-10">
                    <span className="text-xs font-mono text-[#1F3A5F] font-medium">{person.code}</span>
                  </td>
                  <td className="px-4 py-4 sticky left-40 bg-white z-10">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-xs font-semibold">
                        {person.name.substring(0, 2)}
                      </div>
                      <span className="text-sm font-semibold text-[#0F172A]">{person.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="px-2.5 py-1 text-xs font-medium bg-[#F1F5F9] text-[#64748B] rounded">{person.district}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`text-lg font-bold ${getDaysColor(person.totalDays)}`}>
                      {person.totalDays}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`text-sm font-semibold ${person.late > 0 ? 'text-[#F57C00]' : 'text-[#64748B]'}`}>
                      {person.late}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`text-sm font-semibold ${person.early > 0 ? 'text-[#F57C00]' : 'text-[#64748B]'}`}>
                      {person.early}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-sm font-semibold text-[#1976D2]">{person.leave}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`text-sm font-semibold ${person.absent > 0 ? 'text-[#C62828]' : 'text-[#64748B]'}`}>
                      {person.absent}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-[#F1F5F9] rounded-full h-2">
                        <div 
                          className="h-2 rounded-full" 
                          style={{ 
                            width: `${person.percentage}%`,
                            backgroundColor: getPercentageColor(person.percentage)
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-semibold text-[#0F172A] min-w-[45px] text-right">
                        {person.percentage}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button className="px-3 py-1.5 text-xs font-medium text-[#1F3A5F] hover:bg-[#E3F2FD] rounded transition-all">
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 text-sm font-medium text-white bg-[#2E7D32] hover:bg-[#1B5E20] rounded-lg transition-all">
              Chốt công tháng này
            </button>
            <button className="px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-white rounded-lg border border-[#E2E8F0] transition-all">
              Tính lương
            </button>
          </div>
          <p className="text-sm text-[#64748B]">
            Hiển thị <span className="font-semibold text-[#0F172A]">{personnel.length}</span> nhân sự
          </p>
        </div>
      </div>
    </div>
  );
}
