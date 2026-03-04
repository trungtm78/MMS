import { useState } from 'react';
import { ChevronRight, Filter, Calendar, MapPin, User, MessageSquare } from 'lucide-react';

interface Request {
  id: string;
  code: string;
  type: string;
  typeIcon: string;
  dateRange: string;
  days: number;
  submittedDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approver?: string;
  approvedDate?: string;
  rejectReason?: string;
}

const mockRequests: Request[] = [
  {
    id: '1',
    code: 'NP-2024-003',
    type: 'Nghỉ phép có lương',
    typeIcon: '🏖️',
    dateRange: '28/01/2026 - 30/01/2026',
    days: 3,
    submittedDate: '22/01/2026 14:30',
    reason: 'Nghỉ về quê chăm sóc cha mẹ ốm',
    status: 'pending',
  },
  {
    id: '2',
    code: 'NP-2024-002',
    type: 'Nghỉ việc gia đình',
    typeIcon: '👨‍👩‍👧',
    dateRange: '15/01/2026 - 16/01/2026',
    days: 2,
    submittedDate: '10/01/2026 09:15',
    reason: 'Tham dự đám cưới em gái',
    status: 'approved',
    approver: 'Trung úy Võ Văn Tân',
    approvedDate: '11/01/2026 10:30',
  },
  {
    id: '3',
    code: 'NP-2024-001',
    type: 'Nghỉ ốm',
    typeIcon: '🏥',
    dateRange: '05/01/2026',
    days: 1,
    submittedDate: '04/01/2026 16:20',
    reason: 'Bị sốt và ho, cần nghỉ dưỡng',
    status: 'rejected',
    approver: 'Đại úy Phạm Minh Tuấn',
    rejectReason: 'Chưa có giấy xác nhận của bác sĩ',
  },
];

interface MyRequestsProps {
  onClose: () => void;
}

export function MyRequests({ onClose }: MyRequestsProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);

  const getStatusBadge = (status: Request['status']) => {
    const badges = {
      pending: { text: 'Chờ duyệt', class: 'bg-[#3B82F6]/10 text-[#3B82F6]', border: 'border-[#3B82F6]' },
      approved: { text: 'Đã duyệt', class: 'bg-[#10B981]/10 text-[#10B981]', border: 'border-[#10B981]' },
      rejected: { text: 'Bị từ chối', class: 'bg-[#EF4444]/10 text-[#EF4444]', border: 'border-[#EF4444]' },
    };
    return badges[status];
  };

  const getRequestCounts = () => {
    return {
      pending: mockRequests.filter((r) => r.status === 'pending').length,
      approved: mockRequests.filter((r) => r.status === 'approved').length,
      rejected: mockRequests.filter((r) => r.status === 'rejected').length,
    };
  };

  const counts = getRequestCounts();

  if (selectedRequest) {
    return <RequestDetail request={selectedRequest} onClose={() => setSelectedRequest(null)} />;
  }

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] z-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white pt-12 pb-4 px-4 border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onClose} className="text-[#366092] font-medium flex items-center gap-1">
            <ChevronRight className="w-5 h-5 rotate-180" />
            Quay lại
          </button>
          <h1 className="text-xl font-bold text-[#0F172A]">Đơn Của Tôi</h1>
          <button className="p-2">
            <Filter className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'pending'
                ? 'border-[#366092] text-[#366092]'
                : 'border-transparent text-[#64748B]'
            }`}
          >
            Chờ duyệt {counts.pending > 0 && `(${counts.pending})`}
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'approved'
                ? 'border-[#366092] text-[#366092]'
                : 'border-transparent text-[#64748B]'
            }`}
          >
            Đã duyệt
          </button>
          <button
            onClick={() => setActiveTab('rejected')}
            className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'rejected'
                ? 'border-[#366092] text-[#366092]'
                : 'border-transparent text-[#64748B]'
            }`}
          >
            Bị từ chối
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'all'
                ? 'border-[#366092] text-[#366092]'
                : 'border-transparent text-[#64748B]'
            }`}
          >
            Tất cả
          </button>
        </div>
      </div>

      {/* Request List */}
      <div className="p-4 space-y-3 pb-20">
        {mockRequests
          .filter((request) => activeTab === 'all' || request.status === activeTab)
          .map((request) => {
            const statusBadge = getStatusBadge(request.status);

            return (
              <button
                key={request.id}
                onClick={() => setSelectedRequest(request)}
                className={`w-full bg-white rounded-xl p-4 shadow-sm text-left active:scale-98 transition-transform border-l-4 ${statusBadge.border}`}
              >
                {/* Top Row */}
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-[#64748B] font-mono">{request.code}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.class}`}>
                    {statusBadge.text}
                  </span>
                </div>

                {/* Type */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{request.typeIcon}</span>
                  <span className="font-semibold text-[#0F172A]">{request.type}</span>
                </div>

                {/* Date Range */}
                <div className="flex items-center gap-1 text-sm font-medium text-[#0F172A] mb-1">
                  <Calendar className="w-4 h-4 text-[#64748B]" />
                  <span>{request.dateRange}</span>
                </div>

                {/* Duration */}
                <p className="text-sm text-[#64748B] mb-2">{request.days} ngày</p>

                {/* Submitted Date */}
                <p className="text-xs text-[#64748B] mb-3">Gửi: {request.submittedDate}</p>

                {/* Reason Preview */}
                <p className="text-sm text-[#64748B] line-clamp-1 mb-3">{request.reason}</p>

                {/* Status Details */}
                {request.status === 'pending' && (
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <div className="w-6 h-6 rounded-full bg-[#366092] text-white flex items-center justify-center text-xs font-bold">
                      CA
                    </div>
                    <span className="text-xs text-[#64748B]">Đang chờ: Công An Khu Vực</span>
                  </div>
                )}

                {request.status === 'approved' && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center text-xs">
                        ✓
                      </div>
                      <span className="text-xs text-[#64748B]">{request.approver}</span>
                    </div>
                    <span className="text-xs text-[#64748B]">{request.approvedDate}</span>
                  </div>
                )}

                {request.status === 'rejected' && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs text-[#EF4444] mb-2">Lý do từ chối: {request.rejectReason}</p>
                    <button className="text-xs text-[#366092] font-medium">Gửi lại</button>
                  </div>
                )}
              </button>
            );
          })}

        {mockRequests.filter((request) => activeTab === 'all' || request.status === activeTab).length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-lg font-semibold text-[#0F172A] mb-2">Chưa có đơn nào</h3>
            <p className="text-sm text-[#64748B]">Các đơn xin nghỉ sẽ xuất hiện ở đây</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RequestDetail({ request, onClose }: { request: Request; onClose: () => void }) {
  const statusBadge = getStatusBadge(request.status);

  const approvalTimeline = [
    { step: 'Đã gửi', status: 'completed', date: request.submittedDate, person: 'Bạn' },
    {
      step: 'CA Khu vực',
      status: request.status === 'pending' ? 'pending' : 'completed',
      date: request.approvedDate || '',
      person: 'Trung úy Võ Văn Tân',
    },
    {
      step: 'CA Phường',
      status: request.status === 'approved' ? 'completed' : 'pending',
      date: request.approvedDate || '',
      person: 'Đại úy Phạm Minh Tuấn',
    },
  ];

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] z-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white pt-12 pb-4 px-4 border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-[#366092] font-medium flex items-center gap-1">
            <ChevronRight className="w-5 h-5 rotate-180" />
            Quay lại
          </button>
          <span className="text-sm font-mono text-[#64748B]">{request.code}</span>
          <button className="text-[#366092] text-sm font-medium">Chia sẻ</button>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Status */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className={`px-4 py-2 rounded-full text-sm font-medium ${statusBadge.class} inline-block mb-4`}>
            {statusBadge.text}
          </span>

          {/* Approval Timeline */}
          <h3 className="font-semibold text-[#0F172A] mb-4">Quy trình phê duyệt</h3>
          <div className="space-y-3">
            {approvalTimeline.map((item, index) => (
              <div key={index} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      item.status === 'completed'
                        ? 'bg-[#10B981] text-white'
                        : item.status === 'pending'
                        ? 'bg-gray-200 text-[#64748B]'
                        : 'bg-gray-100 text-[#94A3B8]'
                    }`}
                  >
                    {item.status === 'completed' ? '✓' : index + 1}
                  </div>
                  {index < approvalTimeline.length - 1 && (
                    <div className={`w-0.5 h-8 ${item.status === 'completed' ? 'bg-[#10B981]' : 'bg-gray-200'}`}></div>
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <p className={`text-sm font-medium ${item.status === 'completed' ? 'text-[#0F172A]' : 'text-[#64748B]'}`}>
                    {item.step}
                  </p>
                  <p className="text-xs text-[#64748B]">{item.person}</p>
                  {item.date && <p className="text-xs text-[#64748B]">{item.date}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-4">Chi tiết đơn</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <span className="text-2xl">{request.typeIcon}</span>
              <div className="flex-1">
                <p className="text-xs text-[#64748B]">Loại nghỉ</p>
                <p className="text-sm font-medium text-[#0F172A]">{request.type}</p>
              </div>
            </div>

            <div className="pb-3 border-b border-gray-100">
              <p className="text-xs text-[#64748B] mb-1">Thời gian nghỉ</p>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#366092]" />
                <p className="text-sm font-medium text-[#0F172A]">{request.dateRange}</p>
              </div>
              <p className="text-xs text-[#64748B] mt-1">{request.days} ngày</p>
            </div>

            <div className="pb-3 border-b border-gray-100">
              <p className="text-xs text-[#64748B] mb-1">Lý do</p>
              <p className="text-sm text-[#0F172A]">{request.reason}</p>
            </div>

            <div className="pb-3 border-b border-gray-100">
              <p className="text-xs text-[#64748B] mb-1">Người thay thế</p>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#64748B]" />
                <p className="text-sm font-medium text-[#0F172A]">Trần Văn Bình</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-[#64748B] mb-1">Liên hệ khẩn cấp</p>
              <p className="text-sm font-medium text-[#0F172A]">0916789012</p>
            </div>
          </div>
        </div>

        {/* Reject Reason */}
        {request.status === 'rejected' && request.rejectReason && (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl p-4">
            <h3 className="font-semibold text-[#EF4444] mb-2">Lý do từ chối</h3>
            <p className="text-sm text-[#0F172A]">{request.rejectReason}</p>
            <p className="text-xs text-[#64748B] mt-2">Đề xuất: Bổ sung giấy tờ và gửi lại đơn</p>
          </div>
        )}

        {/* Comments */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#0F172A]">Nhận xét</h3>
            <MessageSquare className="w-5 h-5 text-[#64748B]" />
          </div>
          <div className="text-center py-6">
            <p className="text-sm text-[#64748B]">Chưa có nhận xét nào</p>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      {request.status === 'pending' && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 p-4">
          <button className="w-full py-3 bg-[#EF4444] text-white rounded-xl font-medium">
            Hủy đơn
          </button>
        </div>
      )}

      {request.status === 'rejected' && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 p-4">
          <button className="w-full py-3 bg-[#366092] text-white rounded-xl font-medium">
            Sửa & gửi lại
          </button>
        </div>
      )}
    </div>
  );
}

function getStatusBadge(status: Request['status']) {
  const badges = {
    pending: { text: 'Chờ duyệt', class: 'bg-[#3B82F6]/10 text-[#3B82F6]', border: 'border-[#3B82F6]' },
    approved: { text: 'Đã duyệt', class: 'bg-[#10B981]/10 text-[#10B981]', border: 'border-[#10B981]' },
    rejected: { text: 'Bị từ chối', class: 'bg-[#EF4444]/10 text-[#EF4444]', border: 'border-[#EF4444]' },
  };
  return badges[status];
}
