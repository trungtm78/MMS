import { CheckSquare, FileText, Calendar, User, CheckCircle, X, Eye, Clock } from 'lucide-react';
import { useState } from 'react';

interface Request {
  id: string;
  type: 'leave' | 'overtime' | 'advance' | 'other';
  title: string;
  submitter: string;
  submitDate: string;
  fromDate?: string;
  toDate?: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

export function Approvals() {
  const [selectedTab, setSelectedTab] = useState<'all' | Request['status']>('all');

  const requests: Request[] = [
    { id: '1', type: 'leave', title: 'Đơn xin nghỉ phép', submitter: 'Nguyễn Văn A', submitDate: '20/01/2026', fromDate: '25/01/2026', toDate: '27/01/2026', status: 'pending', reason: 'Việc gia đình' },
    { id: '2', type: 'overtime', title: 'Đơn xin làm thêm giờ', submitter: 'Trần Văn B', submitDate: '19/01/2026', status: 'pending', reason: 'Nhiệm vụ đặc biệt' },
    { id: '3', type: 'advance', title: 'Đơn xin tạm ứng', submitter: 'Lê Văn C', submitDate: '18/01/2026', status: 'approved', reason: 'Chi phí đột xuất' },
    { id: '4', type: 'leave', title: 'Đơn xin nghỉ phép', submitter: 'Phạm Văn D', submitDate: '17/01/2026', fromDate: '22/01/2026', toDate: '24/01/2026', status: 'rejected', reason: 'Việc cá nhân' },
  ];

  const statusTabs = [
    { id: 'all', label: 'Tất cả', count: requests.length },
    { id: 'pending', label: 'Chờ duyệt', count: requests.filter(r => r.status === 'pending').length },
    { id: 'approved', label: 'Đã duyệt', count: requests.filter(r => r.status === 'approved').length },
    { id: 'rejected', label: 'Từ chối', count: requests.filter(r => r.status === 'rejected').length },
  ];

  const getTypeIcon = (type: Request['type']) => {
    const icons = {
      'leave': <Calendar size={20} className="text-[#1976D2]" />,
      'overtime': <Clock size={20} className="text-[#F57C00]" />,
      'advance': <FileText size={20} className="text-[#2E7D32]" />,
      'other': <FileText size={20} className="text-[#64748B]" />,
    };
    return icons[type];
  };

  const getTypeLabel = (type: Request['type']) => {
    const labels = {
      'leave': 'Nghỉ phép',
      'overtime': 'Làm thêm',
      'advance': 'Tạm ứng',
      'other': 'Khác',
    };
    return labels[type];
  };

  const getStatusColor = (status: Request['status']) => {
    const colors = {
      'pending': { bg: '#FFF3E0', text: '#F57C00' },
      'approved': { bg: '#E8F5E9', text: '#2E7D32' },
      'rejected': { bg: '#FFEBEE', text: '#C62828' },
    };
    return colors[status];
  };

  const getStatusLabel = (status: Request['status']) => {
    const labels = {
      'pending': 'Chờ duyệt',
      'approved': 'Đã duyệt',
      'rejected': 'Từ chối',
    };
    return labels[status];
  };

  const filteredRequests = selectedTab === 'all' ? requests : requests.filter(r => r.status === selectedTab);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Duyệt Đơn Từ</h1>
          <p className="text-sm text-[#64748B] mt-1">Quản lý và phê duyệt các đơn từ của DQTV</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-2 bg-[#FFF3E0] text-[#F57C00] rounded-lg text-sm font-semibold">
            {requests.filter(r => r.status === 'pending').length} đơn chờ duyệt
          </span>
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
              <p className="text-2xl font-bold text-[#0F172A]">{requests.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FFF3E0] rounded-lg flex items-center justify-center">
              <Clock size={24} className="text-[#F57C00]" />
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Chờ duyệt</p>
              <p className="text-2xl font-bold text-[#F57C00]">{requests.filter(r => r.status === 'pending').length}</p>
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
              <p className="text-2xl font-bold text-[#2E7D32]">{requests.filter(r => r.status === 'approved').length}</p>
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
              <p className="text-2xl font-bold text-[#C62828]">{requests.filter(r => r.status === 'rejected').length}</p>
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

      {/* Requests List */}
      <div className="space-y-3">
        {filteredRequests.map(request => {
          const statusColor = getStatusColor(request.status);
          return (
            <div key={request.id} className="bg-white rounded-xl p-6 border border-[#E2E8F0] hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 bg-[#F8FAFC] rounded-lg flex items-center justify-center flex-shrink-0">
                    {getTypeIcon(request.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-[#0F172A]">{request.title}</h3>
                      <span className="px-2.5 py-1 text-xs font-semibold bg-[#F1F5F9] text-[#64748B] rounded">
                        {getTypeLabel(request.type)}
                      </span>
                      <span 
                        className="px-2.5 py-1 text-xs font-semibold rounded"
                        style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                      >
                        {getStatusLabel(request.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-[#64748B] mb-3">
                      <div className="flex items-center gap-2">
                        <User size={16} />
                        <span>{request.submitter}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={16} />
                        <span>Nộp: {request.submitDate}</span>
                      </div>
                      {request.fromDate && request.toDate && (
                        <div className="flex items-center gap-2">
                          <Clock size={16} />
                          <span>{request.fromDate} - {request.toDate}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-[#64748B]">
                      <span className="font-medium text-[#0F172A]">Lý do:</span> {request.reason}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button className="px-3 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] rounded-lg transition-all flex items-center gap-1">
                    <Eye size={16} />
                    Xem
                  </button>
                  {request.status === 'pending' && (
                    <>
                      <button className="px-4 py-2 text-sm font-medium text-white bg-[#2E7D32] hover:bg-[#1B5E20] rounded-lg transition-all flex items-center gap-1">
                        <CheckCircle size={16} />
                        Duyệt
                      </button>
                      <button className="px-4 py-2 text-sm font-medium text-white bg-[#C62828] hover:bg-[#B71C1C] rounded-lg transition-all flex items-center gap-1">
                        <X size={16} />
                        Từ chối
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
