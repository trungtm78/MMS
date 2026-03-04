import { useState } from 'react';
import { ChevronRight, Calendar, Upload, X, CheckCircle2, User, ArrowLeft } from 'lucide-react';

interface LeaveRequestProps {
  onClose: () => void;
}

export function LeaveRequest({ onClose }: LeaveRequestProps) {
  const [leaveType, setLeaveType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [replacement, setReplacement] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const leaveTypes = [
    { id: 'paid', icon: '🏖️', name: 'Nghỉ phép có lương', remaining: '12 ngày còn lại' },
    { id: 'sick', icon: '🏥', name: 'Nghỉ ốm', note: 'Cần giấy xác nhận bác sĩ' },
    { id: 'family', icon: '👨‍👩‍👧', name: 'Nghỉ việc gia đình', remaining: '3 ngày còn lại/năm' },
    { id: 'unpaid', icon: '💼', name: 'Nghỉ không lương', note: 'Không giới hạn' },
  ];

  const replacementOptions = [
    { id: '1', name: 'Trần Văn Bình', workload: '3 nhiệm vụ đang làm', status: 'available' },
    { id: '2', name: 'Lê Thị Cẩm', workload: '2 nhiệm vụ đang làm', status: 'available' },
    { id: '3', name: 'Phạm Minh Đức', workload: '5 nhiệm vụ đang làm', status: 'busy' },
  ];

  const calculateDays = () => {
    if (!fromDate || !toDate) return 0;
    const days = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return halfDay ? 0.5 : days;
  };

  const handleSubmit = () => {
    setShowSuccess(true);
    setTimeout(() => {
      onClose();
    }, 2500);
  };

  const isValid = leaveType && fromDate && toDate && reason.length >= 20 && replacement;

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-[#F8FAFC] z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg text-center max-w-sm w-full animate-[scaleIn_0.5s_ease-out]">
          <div className="w-20 h-20 bg-[#10B981] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-[#10B981] mb-2">Đã gửi đơn thành công!</h2>
          <p className="text-[#64748B] mb-1">Mã đơn: NP-2024-001</p>
          <p className="text-sm text-[#64748B]">Chờ phê duyệt</p>
          <p className="text-xs text-[#64748B] mt-2">Thời gian phản hồi: 1-2 ngày làm việc</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] z-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-[#366092] text-white px-4 py-3 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Đăng Ký Nghỉ Phép</h1>
            <p className="text-xs text-white/80">Gửi đơn xin nghỉ & chọn người thay thế</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Leave Type */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Loại nghỉ phép</h3>
          <div className="space-y-2">
            {leaveTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setLeaveType(type.id)}
                className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                  leaveType === type.id
                    ? 'border-[#366092] bg-[#EFF6FF]'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{type.icon}</span>
                  <div className="flex-1">
                    <p className="font-medium text-[#0F172A] text-sm">{type.name}</p>
                    <p className="text-xs text-[#64748B]">{type.remaining || type.note}</p>
                  </div>
                  {leaveType === type.id && (
                    <CheckCircle2 className="w-5 h-5 text-[#366092]" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Thời gian</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[#64748B] mb-1 block">Từ ngày</label>
              <div className="relative">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
                />
                <Calendar className="absolute right-3 top-2.5 w-4 h-4 text-[#64748B] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-sm text-[#64748B] mb-1 block">Đến ngày</label>
              <div className="relative">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
                />
                <Calendar className="absolute right-3 top-2.5 w-4 h-4 text-[#64748B] pointer-events-none" />
              </div>
            </div>

            {calculateDays() > 0 && (
              <div className="bg-[#EFF6FF] rounded-lg p-3">
                <p className="text-sm text-[#366092] font-semibold">
                  Tổng số ngày: {calculateDays()} ngày
                </p>
              </div>
            )}

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={halfDay}
                onChange={(e) => setHalfDay(e.target.checked)}
                className="w-4 h-4 text-[#366092]"
              />
              <span className="text-sm text-[#0F172A]">Nghỉ nửa ngày</span>
            </label>
          </div>
        </div>

        {/* Reason */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Lý do xin nghỉ</h3>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do xin nghỉ..."
            maxLength={500}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092] min-h-24"
          />
          <div className="flex items-center justify-between mt-2">
            <p className={`text-xs ${reason.length < 20 ? 'text-[#EF4444]' : 'text-[#64748B]'}`}>
              {reason.length < 20 ? `Tối thiểu 20 ký tự (còn ${20 - reason.length})` : 'Đủ ký tự'}
            </p>
            <p className="text-xs text-[#64748B]">{reason.length}/500</p>
          </div>
        </div>

        {/* Replacement Person */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Người thay thế</h3>
          <select
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092] mb-3"
          >
            <option value="">Chọn DQTV</option>
            {replacementOptions.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} - {person.workload}
              </option>
            ))}
          </select>

          {replacement && (
            <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#366092] text-white flex items-center justify-center font-semibold">
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#0F172A]">
                  {replacementOptions.find((p) => p.id === replacement)?.name}
                </p>
                <p className="text-xs text-[#64748B]">
                  {replacementOptions.find((p) => p.id === replacement)?.workload}
                </p>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full inline-block mt-1 ${
                    replacementOptions.find((p) => p.id === replacement)?.status === 'available'
                      ? 'bg-[#10B981]/10 text-[#10B981]'
                      : 'bg-[#F59E0B]/10 text-[#F59E0B]'
                  }`}
                >
                  {replacementOptions.find((p) => p.id === replacement)?.status === 'available'
                    ? 'Sẵn sàng'
                    : 'Bận'}
                </span>
              </div>
              <button onClick={() => setReplacement('')} className="p-1">
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>
          )}
        </div>

        {/* Attachments */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Giấy tờ đính kèm (nếu có)</h3>
          <button className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#366092] transition-colors">
            <Upload className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
            <p className="text-sm text-[#64748B]">Chọn file hoặc chụp ảnh</p>
            <p className="text-xs text-[#64748B] mt-1">PDF, JPG, PNG • Tối đa 5MB</p>
          </button>

          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 bg-[#366092]/10 rounded flex items-center justify-center">
                    📄
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#0F172A]">{file}</p>
                    <p className="text-xs text-[#64748B]">2.3 MB</p>
                  </div>
                  <button className="p-1">
                    <X className="w-4 h-4 text-[#64748B]" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview Summary */}
        <div className="bg-gradient-to-br from-[#366092]/5 to-[#4A90E2]/5 rounded-xl p-4 border border-[#366092]/20">
          <h3 className="font-semibold text-[#0F172A] mb-3">Tóm tắt đơn</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#64748B]">Loại nghỉ:</span>
              <span className="font-medium text-[#0F172A]">
                {leaveType ? leaveTypes.find((t) => t.id === leaveType)?.name : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Thời gian:</span>
              <span className="font-medium text-[#0F172A]">
                {fromDate && toDate ? `${calculateDays()} ngày` : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Người thay thế:</span>
              <span className="font-medium text-[#0F172A]">
                {replacement ? replacementOptions.find((p) => p.id === replacement)?.name : '-'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 p-4">
        <button
          onClick={handleSubmit}
          disabled={!isValid}
          className={`w-full py-3 rounded-xl font-bold text-white transition-all ${
            isValid
              ? 'bg-[#366092] active:scale-98'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          Gửi đơn xin nghỉ
        </button>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}