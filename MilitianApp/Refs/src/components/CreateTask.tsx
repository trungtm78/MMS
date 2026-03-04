import { useState } from 'react';
import { ChevronRight, MapPin, Calendar, Clock, User, Users, FileText, AlertCircle, CheckCircle2, Upload, X } from 'lucide-react';

interface CreateTaskProps {
  onClose: () => void;
}

export function CreateTask({ onClose }: CreateTaskProps) {
  const [taskType, setTaskType] = useState('');
  const [priority, setPriority] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [deadline, setDeadline] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [relatedPerson, setRelatedPerson] = useState({
    name: '',
    phone: '',
    address: '',
  });
  const [showSuccess, setShowSuccess] = useState(false);

  const taskTypes = [
    { id: 'patrol', icon: '👮', name: 'Tuần tra', color: 'bg-[#3B82F6]' },
    { id: 'incident', icon: '🚨', name: 'Xử lý sự vụ', color: 'bg-[#EF4444]' },
    { id: 'propaganda', icon: '📢', name: 'Tuyên truyền', color: 'bg-[#10B981]' },
    { id: 'support', icon: '🤝', name: 'Hỗ trợ', color: 'bg-[#F59E0B]' },
    { id: 'inspection', icon: '🔍', name: 'Kiểm tra', color: 'bg-[#8B5CF6]' },
    { id: 'other', icon: '📝', name: 'Khác', color: 'bg-[#64748B]' },
  ];

  const priorityLevels = [
    { id: 'urgent', icon: '🔴', name: 'Khẩn cấp', desc: 'Cần xử lý ngay lập tức', color: 'border-[#EF4444] bg-[#EF4444]/5' },
    { id: 'high', icon: '🟠', name: 'Cao', desc: 'Ưu tiên cao', color: 'border-[#F59E0B] bg-[#F59E0B]/5' },
    { id: 'medium', icon: '🟡', name: 'Trung bình', desc: 'Xử lý bình thường', color: 'border-[#F59E0B]/50 bg-[#F59E0B]/5' },
    { id: 'low', icon: '🟢', name: 'Thấp', desc: 'Không gấp', color: 'border-[#10B981] bg-[#10B981]/5' },
  ];

  const dqtvMembers = [
    { id: '1', name: 'Nguyễn Văn An', code: 'HCM-PHD-T12-0001', area: 'Khu phố 1', workload: 3, avatar: 'NA' },
    { id: '2', name: 'Trần Văn Bình', code: 'HCM-PHD-T12-0002', area: 'Khu phố 1', workload: 2, avatar: 'TB' },
    { id: '3', name: 'Lê Thị Cẩm', code: 'HCM-PHD-T12-0003', area: 'Khu phố 1', workload: 4, avatar: 'LC' },
    { id: '4', name: 'Phạm Minh Đức', code: 'HCM-PHD-T12-0004', area: 'Khu phố 2', workload: 5, avatar: 'PD' },
    { id: '5', name: 'Hoàng Thị Ế', code: 'HCM-PHD-T12-0005', area: 'Khu phố 2', workload: 1, avatar: 'HE' },
  ];

  const handleToggleAssignee = (id: string) => {
    if (assignedTo.includes(id)) {
      setAssignedTo(assignedTo.filter((memberId) => memberId !== id));
    } else {
      setAssignedTo([...assignedTo, id]);
    }
  };

  const handleSubmit = () => {
    setShowSuccess(true);
    setTimeout(() => {
      onClose();
    }, 2500);
  };

  const isValid = taskType && priority && title && description.length >= 20 && location && deadline && assignedTo.length > 0;

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-[#F8FAFC] z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg text-center max-w-sm w-full animate-[scaleIn_0.5s_ease-out]">
          <div className="w-20 h-20 bg-[#10B981] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-[#10B981] mb-2">Đã giao nhiệm vụ!</h2>
          <p className="text-[#64748B] mb-1">Mã nhiệm vụ: NV-2024-{String(Math.floor(Math.random() * 100)).padStart(3, '0')}</p>
          <p className="text-sm text-[#64748B]">
            Đã giao cho {assignedTo.length} DQTV
          </p>
          <p className="text-xs text-[#64748B] mt-2">Thông báo đã được gửi đến DQTV</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] z-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white pt-12 pb-4 px-4 border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-[#366092] font-medium flex items-center gap-1">
            <ChevronRight className="w-5 h-5 rotate-180" />
            Quay lại
          </button>
          <h1 className="text-xl font-bold text-[#0F172A]">Giao Nhiệm Vụ Mới</h1>
          <div className="w-16"></div>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Task Type */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Loại nhiệm vụ</h3>
          <div className="grid grid-cols-3 gap-2">
            {taskTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setTaskType(type.id)}
                className={`p-3 rounded-xl border-2 transition-all ${
                  taskType === type.id
                    ? 'border-[#366092] bg-[#EFF6FF]'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="text-2xl mb-1">{type.icon}</div>
                <p className="text-xs font-medium text-[#0F172A]">{type.name}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Mức độ ưu tiên</h3>
          <div className="space-y-2">
            {priorityLevels.map((level) => (
              <button
                key={level.id}
                onClick={() => setPriority(level.id)}
                className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                  priority === level.id
                    ? level.color
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{level.icon}</span>
                  <div className="flex-1">
                    <p className="font-medium text-[#0F172A] text-sm">{level.name}</p>
                    <p className="text-xs text-[#64748B]">{level.desc}</p>
                  </div>
                  {priority === level.id && (
                    <CheckCircle2 className="w-5 h-5 text-[#366092]" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Task Info */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Thông tin nhiệm vụ</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[#64748B] mb-1 block">Tiêu đề nhiệm vụ *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Tuần tra khu vực chợ Bến Thành"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
              />
            </div>

            <div>
              <label className="text-sm text-[#64748B] mb-1 block">Mô tả chi tiết *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả chi tiết nhiệm vụ cần thực hiện..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092] min-h-24"
                maxLength={1000}
              />
              <div className="flex items-center justify-between mt-1">
                <p className={`text-xs ${description.length < 20 ? 'text-[#EF4444]' : 'text-[#64748B]'}`}>
                  {description.length < 20 ? `Tối thiểu 20 ký tự (còn ${20 - description.length})` : 'Đủ ký tự'}
                </p>
                <p className="text-xs text-[#64748B]">{description.length}/1000</p>
              </div>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Địa điểm *</h3>
          <div className="relative mb-3">
            <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-[#64748B]" />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Nhập địa chỉ cụ thể"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
            />
          </div>
          <button className="w-full py-2 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium">
            📍 Chọn trên bản đồ
          </button>
        </div>

        {/* Deadline */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Thời hạn hoàn thành *</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-[#64748B] mb-1 block">Ngày</label>
              <div className="relative">
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
                />
                <Calendar className="absolute right-3 top-2.5 w-4 h-4 text-[#64748B] pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-sm text-[#64748B] mb-1 block">Giờ</label>
              <div className="relative">
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
                />
                <Clock className="absolute right-3 top-2.5 w-4 h-4 text-[#64748B] pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Assign to DQTV */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[#0F172A]">Giao cho DQTV *</h3>
            <span className="text-sm text-[#366092] font-medium">
              Đã chọn: {assignedTo.length}
            </span>
          </div>

          <div className="space-y-2 mb-3">
            {dqtvMembers.map((member) => {
              const isSelected = assignedTo.includes(member.id);
              return (
                <button
                  key={member.id}
                  onClick={() => handleToggleAssignee(member.id)}
                  className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                    isSelected
                      ? 'border-[#366092] bg-[#EFF6FF]'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${isSelected ? 'bg-[#366092]' : 'bg-[#64748B]'} text-white flex items-center justify-center font-semibold`}>
                      {member.avatar}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-[#0F172A] text-sm">{member.name}</p>
                      <p className="text-xs text-[#64748B]">{member.code} • {member.area}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          member.workload <= 2 ? 'bg-[#10B981]/10 text-[#10B981]' : 
                          member.workload <= 4 ? 'bg-[#F59E0B]/10 text-[#F59E0B]' : 
                          'bg-[#EF4444]/10 text-[#EF4444]'
                        }`}>
                          {member.workload} nhiệm vụ
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-[#366092]" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-[#EFF6FF] rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#3B82F6] mt-0.5" />
            <p className="text-xs text-[#3B82F6]">
              Có thể chọn nhiều DQTV cùng thực hiện một nhiệm vụ
            </p>
          </div>
        </div>

        {/* Related Person (Optional) */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Đối tượng liên quan (nếu có)</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={relatedPerson.name}
              onChange={(e) => setRelatedPerson({ ...relatedPerson, name: e.target.value })}
              placeholder="Họ tên"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
            />
            <input
              type="tel"
              value={relatedPerson.phone}
              onChange={(e) => setRelatedPerson({ ...relatedPerson, phone: e.target.value })}
              placeholder="Số điện thoại"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
            />
            <input
              type="text"
              value={relatedPerson.address}
              onChange={(e) => setRelatedPerson({ ...relatedPerson, address: e.target.value })}
              placeholder="Địa chỉ"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
            />
          </div>
        </div>

        {/* Attachments */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Tài liệu đính kèm</h3>
          <button className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#366092] transition-colors">
            <Upload className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
            <p className="text-sm text-[#64748B]">Tải lên tài liệu, hình ảnh</p>
            <p className="text-xs text-[#64748B] mt-1">PDF, DOC, JPG, PNG • Tối đa 10MB</p>
          </button>
        </div>

        {/* Preview Summary */}
        <div className="bg-gradient-to-br from-[#366092]/5 to-[#4A90E2]/5 rounded-xl p-4 border border-[#366092]/20">
          <h3 className="font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Tóm tắt nhiệm vụ
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#64748B]">Loại:</span>
              <span className="font-medium text-[#0F172A]">
                {taskType ? taskTypes.find((t) => t.id === taskType)?.name : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Ưu tiên:</span>
              <span className="font-medium text-[#0F172A]">
                {priority ? priorityLevels.find((p) => p.id === priority)?.name : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Hạn chót:</span>
              <span className="font-medium text-[#0F172A]">
                {deadline && deadlineTime ? `${deadline} ${deadlineTime}` : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Số DQTV:</span>
              <span className="font-medium text-[#366092]">
                {assignedTo.length} người
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
              ? priority === 'urgent'
                ? 'bg-[#EF4444] active:scale-98'
                : 'bg-[#366092] active:scale-98'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {priority === 'urgent' ? 'GIAO NHIỆM VỤ KHẨN CẤP' : 'GIAO NHIỆM VỤ'}
        </button>
        {!isValid && (
          <p className="text-xs text-center text-[#EF4444] mt-2">
            Vui lòng điền đầy đủ thông tin bắt buộc (*)
          </p>
        )}
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
