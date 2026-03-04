import { DollarSign, Download, CheckCircle, Mail, Eye, Edit } from 'lucide-react';
import { useState } from 'react';

interface Payroll {
  id: string;
  code: string;
  name: string;
  baseSalary: number;
  allowance: number;
  workingDays: number;
  chiTieu: number;
  bonus: number;
  deduction: number;
  netSalary: number;
  status: 'pending' | 'approved';
}

export function Payroll() {
  const [selectedMonth, setSelectedMonth] = useState('12/2024');

  const payrolls: Payroll[] = [
    { id: '1', code: 'HCM-PHD-T12-0001', name: 'Nguyễn Văn A', baseSalary: 8000000, allowance: 1500000, workingDays: 22, chiTieu: 95, bonus: 800000, deduction: 50000, netSalary: 10250000, status: 'approved' },
    { id: '2', code: 'HCM-PHD-T12-0002', name: 'Trần Văn B', baseSalary: 7500000, allowance: 1200000, workingDays: 23, chiTieu: 98, bonus: 900000, deduction: 0, netSalary: 9600000, status: 'approved' },
    { id: '3', code: 'HCM-PHD-T12-0003', name: 'Lê Văn C', baseSalary: 7000000, allowance: 1000000, workingDays: 21, chiTieu: 89, bonus: 500000, deduction: 150000, netSalary: 8350000, status: 'pending' },
    { id: '4', code: 'HCM-PHD-T12-0004', name: 'Phạm Văn D', baseSalary: 8500000, allowance: 1800000, workingDays: 24, chiTieu: 100, bonus: 1200000, deduction: 0, netSalary: 11500000, status: 'approved' },
    { id: '5', code: 'HCM-PHD-T12-0005', name: 'Hoàng Văn E', baseSalary: 7800000, allowance: 1300000, workingDays: 22.5, chiTieu: 96, bonus: 850000, deduction: 75000, netSalary: 9875000, status: 'pending' },
  ];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const totalPayroll = payrolls.reduce((sum, p) => sum + p.netSalary, 0);
  const averageSalary = totalPayroll / payrolls.length;
  const totalBonus = payrolls.reduce((sum, p) => sum + p.bonus, 0);
  const totalDeduction = payrolls.reduce((sum, p) => sum + p.deduction, 0);

  const getKpiColor = (kpi: number) => {
    if (kpi >= 95) return '#2E7D32';
    if (kpi >= 80) return '#FBC02D';
    return '#C62828';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Bảng Lương</h1>
          <p className="text-sm text-[#64748B] mt-1">Quản lý lương và phụ cấp cho dân quân tự vệ</p>
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
          <span className="px-3 py-2 bg-[#FFF3E0] text-[#F57C00] rounded-lg text-sm font-semibold">
            Chờ phê duyệt
          </span>
          <button className="px-4 py-2 text-sm font-medium text-white bg-[#2E7D32] hover:bg-[#1B5E20] rounded-lg transition-all flex items-center gap-2">
            <CheckCircle size={16} />
            Phê duyệt tất cả
          </button>
          <button className="px-4 py-2 text-sm font-medium text-white bg-[#1F3A5F] hover:bg-[#152A45] rounded-lg transition-all flex items-center gap-2">
            <Download size={16} />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <DollarSign size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm text-white/80">Tổng quỹ lương</p>
              <p className="text-2xl font-bold">{formatCurrency(totalPayroll)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 bg-white/20 rounded">95.2% ngân sách</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#E3F2FD] rounded-lg flex items-center justify-center">
              <DollarSign size={20} className="text-[#1976D2]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Lương TB/người</p>
              <p className="text-2xl font-bold text-[#0F172A]">{formatCurrency(averageSalary)}</p>
            </div>
          </div>
          <p className="text-xs text-[#64748B]">Trung vị: {formatCurrency(9600000)}</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
              <CheckCircle size={20} className="text-[#2E7D32]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Tổng thưởng Chỉ tiêu</p>
              <p className="text-2xl font-bold text-[#2E7D32]">{formatCurrency(totalBonus)}</p>
            </div>
          </div>
          <p className="text-xs text-[#64748B]">TB: {formatCurrency(totalBonus / payrolls.length)}/người</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
              <DollarSign size={20} className="text-[#C62828]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Tổng khấu trừ</p>
              <p className="text-2xl font-bold text-[#C62828]">{formatCurrency(totalDeduction)}</p>
            </div>
          </div>
          <p className="text-xs text-[#64748B]">Trễ giờ, vi phạm</p>
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
          <option>Đã duyệt</option>
          <option>Chờ duyệt</option>
        </select>
        <input
          type="text"
          placeholder="Tìm DQTV..."
          className="flex-1 px-4 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
        />
        <button className="px-4 py-2 text-sm font-medium text-white bg-[#1976D2] hover:bg-[#0D47A1] rounded-lg transition-all flex items-center gap-2">
          <Mail size={16} />
          Gửi phiếu lương
        </button>
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input type="checkbox" className="w-4 h-4 rounded border-[#E2E8F0]" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase">Mã DQTV</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase">Họ tên</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#64748B] uppercase">Lương CB</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#64748B] uppercase">Phụ cấp</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Ngày công</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Chỉ tiêu (%)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#64748B] uppercase">Thưởng</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#64748B] uppercase">Trừ</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#64748B] uppercase">Thực lĩnh</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Trạng thái</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#64748B] uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {payrolls.map((payroll) => (
                <tr key={payroll.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-4 py-4">
                    <input type="checkbox" className="w-4 h-4 rounded border-[#E2E8F0]" />
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-mono text-[#1F3A5F] font-medium">{payroll.code}</span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-xs font-semibold">
                        {payroll.name.substring(0, 2)}
                      </div>
                      <span className="text-sm font-semibold text-[#0F172A]">{payroll.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-sm text-[#0F172A]">{formatCurrency(payroll.baseSalary)}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-sm text-[#0F172A]">{formatCurrency(payroll.allowance)}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="px-2.5 py-1 text-sm font-semibold bg-[#E3F2FD] text-[#1976D2] rounded">
                      {payroll.workingDays}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center border-2" style={{ borderColor: getKpiColor(payroll.chiTieu) }}>
                        <span className="text-xs font-bold" style={{ color: getKpiColor(payroll.chiTieu) }}>
                          {payroll.chiTieu}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-sm font-semibold text-[#2E7D32]">+{formatCurrency(payroll.bonus)}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={`text-sm font-semibold ${payroll.deduction > 0 ? 'text-[#C62828]' : 'text-[#64748B]'}`}>
                      {payroll.deduction > 0 ? `-${formatCurrency(payroll.deduction)}` : formatCurrency(0)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="inline-block px-3 py-1.5 bg-[#E8F5E9] rounded-lg">
                      <span className="text-base font-bold text-[#2E7D32]">{formatCurrency(payroll.netSalary)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {payroll.status === 'approved' ? (
                      <span className="px-3 py-1.5 text-xs font-semibold bg-[#E8F5E9] text-[#2E7D32] rounded-full inline-flex items-center gap-1">
                        <CheckCircle size={14} />
                        Đã duyệt
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 text-xs font-semibold bg-[#FFF3E0] text-[#F57C00] rounded-full">
                        Chờ duyệt
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-1">
                      <button className="w-8 h-8 flex items-center justify-center hover:bg-[#E3F2FD] rounded transition-colors group">
                        <Eye size={16} className="text-[#64748B] group-hover:text-[#1976D2]" />
                      </button>
                      {payroll.status === 'pending' && (
                        <>
                          <button className="w-8 h-8 flex items-center justify-center hover:bg-[#E3F2FD] rounded transition-colors group">
                            <Edit size={16} className="text-[#64748B] group-hover:text-[#1976D2]" />
                          </button>
                          <button className="w-8 h-8 flex items-center justify-center hover:bg-[#E8F5E9] rounded transition-colors group">
                            <CheckCircle size={16} className="text-[#64748B] group-hover:text-[#2E7D32]" />
                          </button>
                        </>
                      )}
                      <button className="w-8 h-8 flex items-center justify-center hover:bg-[#E3F2FD] rounded transition-colors group">
                        <Mail size={16} className="text-[#64748B] group-hover:text-[#1976D2]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="bg-gradient-to-r from-[#F8FAFC] to-[#F1F5F9] px-6 py-4 border-t-2 border-[#E2E8F0]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div>
                <p className="text-xs text-[#64748B] mb-1">Tổng cộng</p>
                <p className="text-xl font-bold text-[#0F172A]">{formatCurrency(totalPayroll)}</p>
              </div>
              <div>
                <p className="text-xs text-[#64748B] mb-1">Đã duyệt</p>
                <p className="text-base font-semibold text-[#2E7D32]">{payrolls.filter(p => p.status === 'approved').length}/{payrolls.length}</p>
              </div>
            </div>
            <p className="text-sm text-[#64748B]">
              Hiển thị <span className="font-semibold text-[#0F172A]">{payrolls.length}</span> nhân sự
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}