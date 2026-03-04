import { ArrowLeft, Filter, CheckCircle, X as XIcon, Calendar, AlertTriangle, Clock, User, FileText, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface ApproveRequestsProps {
  onNavigate: (screen: string) => void;
}

export default function ApproveRequests({ onNavigate }: ApproveRequestsProps) {
  const [selectedTab, setSelectedTab] = useState('pending');
  const [selectedRequest, setSelectedRequest] = useState<number | null>(null);

  const requests = [
    {
      id: 1,
      name: 'Nguyễn Văn An',
      code: 'HCM-PHD-T12-0001',
      type: 'Nghỉ phép có lương',
      dateRange: '25/12 - 27/12',
      days: 3,
      reason: 'Nghỉ việc gia đình cần giải quyết công việc cá nhân...',
      replacement: 'Trần Thị Bình',
      status: 'pending',
      sentDate: '20/12 14:30',
      avatar: 'photo-1763735134462-aca6bfd76573',
      balance: 10,
      impact: 'Ảnh hưởng đến 1 nhiệm vụ'
    },
    {
      id: 2,
      name: 'Lê Văn Cường',
      code: 'HCM-PHD-T12-0003',
      type: 'Nghỉ phép không lương',
      dateRange: '28/12 - 29/12',
      days: 2,
      reason: 'Đi du lịch cùng gia đình...',
      replacement: 'Phạm Thị Dung',
      status: 'pending',
      sentDate: '21/12 09:15',
      avatar: 'photo-1734864489622-0406baee014f',
      balance: 8,
      impact: 'Không ảnh hưởng công việc'
    },
    {
      id: 3,
      name: 'Hoàng Văn Hải',
      code: 'HCM-PHD-T12-0005',
      type: 'Nghỉ ốm',
      dateRange: '22/12',
      days: 1,
      reason: 'Bị cảm sốt, cần nghỉ ngơi...',
      replacement: 'Võ Văn Minh',
      status: 'pending',
      sentDate: '21/12 16:45',
      avatar: 'photo-1661588156316-cdcbe2e0c8ad',
      balance: 12,
      impact: 'Ảnh hưởng đến 2 nhiệm vụ'
    },
  ];

  const filteredRequests = requests.filter(r => {
    if (selectedTab === 'all') return true;
    return r.status === selectedTab;
  });

  const selectedReq = selectedRequest ? requests.find(r => r.id === selectedRequest) : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Duyệt đơn từ</h1>
          </div>
          <button className="p-2">
            <Filter className="text-[#64748B]" size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button
            onClick={() => setSelectedTab('pending')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedTab === 'pending'
                ? 'bg-[#F59E0B] text-white'
                : 'bg-[#F8FAFC] text-[#64748B]'
            }`}
          >
            Chờ duyệt (3)
          </button>
          <button
            onClick={() => setSelectedTab('approved')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedTab === 'approved'
                ? 'bg-[#10B981] text-white'
                : 'bg-[#F8FAFC] text-[#64748B]'
            }`}
          >
            Đã duyệt (15)
          </button>
          <button
            onClick={() => setSelectedTab('rejected')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
              selectedTab === 'rejected'
                ? 'bg-[#EF4444] text-white'
                : 'bg-[#F8FAFC] text-[#64748B]'
            }`}
          >
            Từ chối (2)
          </button>
        </div>
      </div>

      {/* Request Cards */}
      <div className="px-4 pt-4 space-y-3">
        {filteredRequests.map((request) => (
          <div
            key={request.id}
            className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${
              request.status === 'pending' ? 'border-[#F59E0B]' :
              request.status === 'approved' ? 'border-[#10B981]' :
              'border-[#EF4444]'
            }`}
          >
            {/* Header */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#366092] bg-opacity-10 flex items-center justify-center flex-shrink-0">
                <User className="text-[#366092]" size={20} />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-[#0F172A]">{request.name}</h4>
                <p className="text-xs text-[#64748B]">{request.code}</p>
              </div>
            </div>

            {/* Type */}
            <div className="flex items-center gap-2 mb-2">
              <FileText className="text-[#366092]" size={16} />
              <span className="text-sm font-medium text-[#0F172A]">{request.type}</span>
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="text-[#64748B]" size={16} />
              <span className="text-sm text-[#0F172A]">{request.dateRange} ({request.days} ngày)</span>
            </div>

            {/* Reason */}
            <p className="text-sm text-[#64748B] mb-2 line-clamp-2">
              Lý do: {request.reason}
            </p>

            {/* Replacement */}
            <div className="flex items-center gap-2 mb-3">
              <User className="text-[#64748B]" size={16} />
              <span className="text-sm text-[#64748B]">Người thay: <span className="text-[#0F172A] font-medium">{request.replacement}</span></span>
            </div>

            {/* Sent Date and Status */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#F1F5F9]">
              <span className="text-xs text-[#64748B]">Gửi: {request.sentDate}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                request.status === 'pending' ? 'bg-[#FFF7ED] text-[#F59E0B]' :
                request.status === 'approved' ? 'bg-[#D1FAE5] text-[#10B981]' :
                'bg-[#FEE2E2] text-[#EF4444]'
              }`}>
                {request.status === 'pending' ? 'Chờ duyệt' :
                 request.status === 'approved' ? 'Đã duyệt' :
                 'Từ chối'}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button 
                onClick={() => setSelectedRequest(request.id)}
                className="flex-1 h-9 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium hover:bg-[#EFF6FF] transition-colors"
              >
                Xem chi tiết
              </button>
              {request.status === 'pending' && (
                <>
                  <button className="flex-1 h-9 bg-[#10B981] text-white rounded-lg text-sm font-medium hover:bg-[#059669] transition-colors">
                    Duyệt
                  </button>
                  <button className="flex-1 h-9 bg-[#EF4444] text-white rounded-lg text-sm font-medium hover:bg-[#DC2626] transition-colors">
                    Từ chối
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      {selectedReq && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white px-4 pt-4 pb-3 border-b border-[#F1F5F9]">
              <div className="w-12 h-1 bg-[#CBD5E1] rounded-full mx-auto mb-3"></div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#0F172A]">Chi tiết đơn nghỉ phép</h2>
                <button onClick={() => setSelectedRequest(null)} className="p-2">
                  <XIcon className="text-[#64748B]" size={24} />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* DQTV Info */}
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0]">
                <div className="text-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-[#366092] bg-opacity-10 mx-auto mb-2 flex items-center justify-center">
                    <User className="text-[#366092]" size={40} />
                  </div>
                  <h3 className="text-lg font-bold text-[#0F172A]">{selectedReq.name}</h3>
                  <p className="text-sm text-[#64748B]">{selectedReq.code}</p>
                </div>
                <div className="bg-[#F8FAFC] rounded-lg p-3 text-center">
                  <p className="text-sm text-[#64748B] mb-1">Phép còn lại</p>
                  <p className="text-2xl font-bold text-[#366092]">{selectedReq.balance} ngày</p>
                  <div className="w-full bg-[#E2E8F0] rounded-full h-2 mt-2">
                    <div 
                      className="bg-[#366092] h-2 rounded-full"
                      style={{ width: `${(selectedReq.balance / 20) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Request Details */}
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0]">
                <h4 className="font-semibold text-[#0F172A] mb-3">Thông tin đơn</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#EFF6FF] rounded-lg">
                    <FileText className="text-[#366092]" size={18} />
                    <span className="text-sm font-medium text-[#366092]">{selectedReq.type}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-[#64748B]">Từ ngày:</span>
                      <span className="text-sm font-medium text-[#0F172A]">{selectedReq.dateRange.split(' - ')[0]}</span>
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-[#64748B]">Đến ngày:</span>
                      <span className="text-sm font-medium text-[#0F172A]">{selectedReq.dateRange.split(' - ')[1] || selectedReq.dateRange.split(' - ')[0]}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#64748B]">Thời gian:</span>
                      <span className="text-lg font-bold text-[#366092]">{selectedReq.days} ngày</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-[#64748B] mb-1">Lý do:</p>
                    <p className="text-sm text-[#0F172A] leading-relaxed">
                      {selectedReq.reason}
                    </p>
                  </div>
                </div>
              </div>

              {/* Replacement Info */}
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0]">
                <h4 className="font-semibold text-[#0F172A] mb-3">Người thay thế</h4>
                <div className="flex items-center gap-3 p-3 bg-[#F8FAFC] rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                    B
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#0F172A]">{selectedReq.replacement}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="px-2 py-0.5 bg-[#D1FAE5] text-[#10B981] text-xs font-medium rounded-full">
                        Sẵn sàng
                      </span>
                      <span className="text-xs text-[#64748B]">• 2 nhiệm vụ</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Impact */}
              <div className={`rounded-xl p-4 ${
                selectedReq.impact.includes('Không') ? 'bg-[#D1FAE5]' : 'bg-[#FEF3C7]'
              }`}>
                <div className="flex items-start gap-3">
                  {selectedReq.impact.includes('Không') ? (
                    <CheckCircle className="text-[#10B981] flex-shrink-0" size={20} />
                  ) : (
                    <AlertTriangle className="text-[#F59E0B] flex-shrink-0" size={20} />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${
                      selectedReq.impact.includes('Không') ? 'text-[#10B981]' : 'text-[#F59E0B]'
                    }`}>
                      {selectedReq.impact}
                    </p>
                    {!selectedReq.impact.includes('Không') && (
                      <button className="text-xs text-[#F59E0B] mt-1 flex items-center gap-1">
                        Xem chi tiết <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Action Buttons */}
            <div className="sticky bottom-0 bg-white border-t border-[#E2E8F0] p-4 shadow-lg">
              <div className="flex gap-3">
                <button className="flex-1 h-12 border border-[#EF4444] text-[#EF4444] rounded-lg text-sm font-medium hover:bg-[#FEE2E2] transition-colors">
                  Từ chối
                </button>
                <button className="flex-1 h-12 bg-[#10B981] text-white rounded-lg text-sm font-medium hover:bg-[#059669] transition-colors">
                  Phê duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}