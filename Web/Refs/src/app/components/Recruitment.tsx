import { UserPlus, FileText, CheckCircle, Clock, X, Eye, Download, Filter } from 'lucide-react';
import { useState } from 'react';

interface Application {
  id: string;
  name: string;
  age: number;
  address: string;
  phone: string;
  applyDate: string;
  status: 'new' | 'reviewing' | 'approved' | 'rejected';
  district: string;
}

export function Recruitment() {
  const [selectedTab, setSelectedTab] = useState<'all' | Application['status']>('all');

  const applications: Application[] = [
    { id: '1', name: 'Nguyễn Văn F', age: 28, address: '123 Đường ABC, KP1', phone: '0901234567', applyDate: '20/01/2026', status: 'new', district: 'KP 1' },
    { id: '2', name: 'Trần Văn G', age: 25, address: '456 Đường DEF, KP2', phone: '0907654321', applyDate: '19/01/2026', status: 'reviewing', district: 'KP 2' },
    { id: '3', name: 'Lê Văn H', age: 30, address: '789 Đường GHI, KP3', phone: '0909876543', applyDate: '18/01/2026', status: 'approved', district: 'KP 3' },
  ];

  const statusTabs = [
    { id: 'all', label: 'Tất cả', count: applications.length },
    { id: 'new', label: 'Mới', count: applications.filter(a => a.status === 'new').length },
    { id: 'reviewing', label: 'Đang xét duyệt', count: applications.filter(a => a.status === 'reviewing').length },
    { id: 'approved', label: 'Đã duyệt', count: applications.filter(a => a.status === 'approved').length },
    { id: 'rejected', label: 'Từ chối', count: applications.filter(a => a.status === 'rejected').length },
  ];

  const getStatusColor = (status: Application['status']) => {
    const colors = {
      'new': { bg: '#E3F2FD', text: '#1976D2' },
      'reviewing': { bg: '#FFF3E0', text: '#F57C00' },
      'approved': { bg: '#E8F5E9', text: '#2E7D32' },
      'rejected': { bg: '#FFEBEE', text: '#C62828' },
    };
    return colors[status];
  };

  const getStatusLabel = (status: Application['status']) => {
    const labels = {
      'new': 'Mới',
      'reviewing': 'Đang xét duyệt',
      'approved': 'Đã duyệt',
      'rejected': 'Từ chối',
    };
    return labels[status];
  };

  const filteredApplications = selectedTab === 'all' ? applications : applications.filter(a => a.status === selectedTab);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Tuyển Dụng</h1>
          <p className="text-sm text-[#64748B] mt-1">Quản lý tuyển dụng và tuyển chọn dân quân tự vệ mới</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 text-sm font-medium text-white bg-[#1F3A5F] hover:bg-[#152A45] rounded-lg transition-all flex items-center gap-2">
            <UserPlus size={16} />
            Thêm ứng viên
          </button>
          <button className="px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] rounded-lg border border-[#E2E8F0] transition-all flex items-center gap-2">
            <Download size={16} />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#E3F2FD] rounded-lg flex items-center justify-center">
              <FileText size={24} className="text-[#1976D2]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Tổng đơn</p>
              <p className="text-2xl font-bold text-[#0F172A]">{applications.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
              <CheckCircle size={24} className="text-[#2E7D32]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Đã duyệt</p>
              <p className="text-2xl font-bold text-[#2E7D32]">{applications.filter(a => a.status === 'approved').length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FFF3E0] rounded-lg flex items-center justify-center">
              <Clock size={24} className="text-[#F57C00]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Chờ xét duyệt</p>
              <p className="text-2xl font-bold text-[#F57C00]">{applications.filter(a => a.status === 'reviewing' || a.status === 'new').length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
              <X size={24} className="text-[#C62828]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Từ chối</p>
              <p className="text-2xl font-bold text-[#C62828]">{applications.filter(a => a.status === 'rejected').length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-1 flex items-center gap-1">
        {statusTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSelectedTab(tab.id as any)}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
              selectedTab === tab.id
                ? 'bg-[#1F3A5F] text-white'
                : 'text-[#64748B] hover:bg-[#F8FAFC]'
            }`}
          >
            {tab.label} <span className={`ml-1.5 px-2 py-0.5 text-xs rounded-full ${
              selectedTab === tab.id ? 'bg-white/20' : 'bg-[#F1F5F9]'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">STT</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Họ tên</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Tuổi</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Địa chỉ</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Số điện thoại</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Ngày nộp</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Trạng thái</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-[#64748B] uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredApplications.map((app, index) => {
                const statusColor = getStatusColor(app.status);
                return (
                  <tr key={app.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-6 py-4 text-sm text-[#64748B]">{index + 1}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-xs font-semibold">
                          {app.name.substring(0, 2)}
                        </div>
                        <span className="text-sm font-semibold text-[#0F172A]">{app.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#0F172A]">{app.age}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-[#0F172A]">{app.address}</p>
                      <p className="text-xs text-[#64748B]">{app.district}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#0F172A]">{app.phone}</td>
                    <td className="px-6 py-4 text-sm text-[#64748B]">{app.applyDate}</td>
                    <td className="px-6 py-4">
                      <span 
                        className="px-3 py-1.5 text-xs font-semibold rounded-full"
                        style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                      >
                        {getStatusLabel(app.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button className="w-8 h-8 flex items-center justify-center hover:bg-[#E3F2FD] rounded transition-colors">
                          <Eye size={16} className="text-[#64748B]" />
                        </button>
                        {app.status !== 'approved' && app.status !== 'rejected' && (
                          <>
                            <button className="w-8 h-8 flex items-center justify-center hover:bg-[#E8F5E9] rounded transition-colors">
                              <CheckCircle size={16} className="text-[#2E7D32]" />
                            </button>
                            <button className="w-8 h-8 flex items-center justify-center hover:bg-[#FFEBEE] rounded transition-colors">
                              <X size={16} className="text-[#C62828]" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
