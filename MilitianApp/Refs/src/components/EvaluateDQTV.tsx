import { useState } from 'react';
import { ChevronRight, Star, CheckCircle2, Send } from 'lucide-react';

interface EvaluateDQTVProps {
  onClose: () => void;
}

export function EvaluateDQTV({ onClose }: EvaluateDQTVProps) {
  const [selectedDQTV, setSelectedDQTV] = useState('');
  const [taskId, setTaskId] = useState('');
  const [ratings, setRatings] = useState({
    professional: 0,
    responsibility: 0,
    teamwork: 0,
    creativity: 0,
  });
  const [feedback, setFeedback] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const dqtvList = [
    { id: '1', name: 'Nguyễn Văn An', code: 'HCM-PHD-T12-0001', area: 'Khu phố 1', lastEval: '15/12/2024' },
    { id: '2', name: 'Trần Văn Bình', code: 'HCM-PHD-T12-0002', area: 'Khu phố 1', lastEval: '10/12/2024' },
    { id: '3', name: 'Lê Thị Cẩm', code: 'HCM-PHD-T12-0003', area: 'Khu phố 2', lastEval: '12/12/2024' },
  ];

  const recentTasks = [
    { id: '1', code: 'NV-2024-001', title: 'Tuần tra khu vực chợ Bến Thành' },
    { id: '2', code: 'NV-2024-002', title: 'Tuyên truyền phòng cháy chữa cháy' },
    { id: '3', code: 'NV-2024-003', title: 'Xử lý tranh chấp dân sự' },
  ];

  const criteria = [
    { key: 'professional', label: 'Kỹ năng chuyên môn', desc: 'Hiểu biết và thực thi công việc' },
    { key: 'responsibility', label: 'Tinh thần trách nhiệm', desc: 'Cam kết và hoàn thành nhiệm vụ' },
    { key: 'teamwork', label: 'Khả năng làm việc nhóm', desc: 'Phối hợp và hỗ trợ đồng đội' },
    { key: 'creativity', label: 'Sáng tạo', desc: 'Chủ động và đưa ra giải pháp' },
  ];

  const handleRating = (criterionKey: string, stars: number) => {
    setRatings({ ...ratings, [criterionKey]: stars });
  };

  const handleSubmit = () => {
    setShowSuccess(true);
    setTimeout(() => {
      onClose();
    }, 2500);
  };

  const overallRating = Object.values(ratings).reduce((a, b) => a + b, 0) / Object.keys(ratings).length;
  const isValid = selectedDQTV && taskId && Object.values(ratings).every((r) => r > 0) && feedback.length >= 20;

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-[#F8FAFC] z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg text-center max-w-sm w-full animate-[scaleIn_0.5s_ease-out]">
          <div className="w-20 h-20 bg-[#10B981] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-[#10B981] mb-2">Đã gửi đánh giá!</h2>
          <p className="text-[#64748B]">Đánh giá đã được lưu thành công</p>
          <div className="mt-4 flex items-center justify-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-6 h-6 ${star <= overallRating ? 'fill-[#F59E0B] text-[#F59E0B]' : 'text-gray-300'}`}
              />
            ))}
          </div>
          <p className="text-sm text-[#64748B] mt-2">Điểm trung bình: {overallRating.toFixed(1)}/5</p>
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
          <h1 className="text-xl font-bold text-[#0F172A]">Đánh Giá DQTV</h1>
          <div className="w-16"></div>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Select DQTV */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Chọn DQTV cần đánh giá</h3>
          <div className="space-y-2">
            {dqtvList.map((dqtv) => (
              <button
                key={dqtv.id}
                onClick={() => setSelectedDQTV(dqtv.id)}
                className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                  selectedDQTV === dqtv.id
                    ? 'border-[#366092] bg-[#EFF6FF]'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${selectedDQTV === dqtv.id ? 'bg-[#366092]' : 'bg-[#64748B]'} text-white flex items-center justify-center font-semibold`}>
                    {dqtv.name.split(' ').pop()?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-[#0F172A] text-sm">{dqtv.name}</p>
                    <p className="text-xs text-[#64748B]">{dqtv.code} • {dqtv.area}</p>
                    <p className="text-xs text-[#64748B]">Đánh giá gần nhất: {dqtv.lastEval}</p>
                  </div>
                  {selectedDQTV === dqtv.id && (
                    <CheckCircle2 className="w-5 h-5 text-[#366092]" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Select Task */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Nhiệm vụ đánh giá</h3>
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092]"
          >
            <option value="">Chọn nhiệm vụ</option>
            {recentTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.code} - {task.title}
              </option>
            ))}
          </select>
        </div>

        {/* Rating Criteria */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Tiêu chí đánh giá</h3>
          <div className="space-y-4">
            {criteria.map((criterion) => (
              <div key={criterion.key} className="pb-4 border-b border-gray-100 last:border-b-0">
                <div className="mb-2">
                  <p className="font-medium text-sm text-[#0F172A]">{criterion.label}</p>
                  <p className="text-xs text-[#64748B]">{criterion.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => handleRating(criterion.key, star)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-8 h-8 ${
                          star <= ratings[criterion.key as keyof typeof ratings]
                            ? 'fill-[#F59E0B] text-[#F59E0B]'
                            : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm font-semibold text-[#0F172A]">
                    {ratings[criterion.key as keyof typeof ratings]}/5
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Overall Rating */}
          {Object.values(ratings).some((r) => r > 0) && (
            <div className="mt-4 pt-4 border-t-2 border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[#0F172A]">Điểm trung bình</p>
                  <div className="flex items-center gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-5 h-5 ${star <= overallRating ? 'fill-[#F59E0B] text-[#F59E0B]' : 'text-gray-300'}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-[#366092]">{overallRating.toFixed(1)}</p>
                  <p className="text-xs text-[#64748B]">/ 5.0</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Feedback */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Nhận xét *</h3>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Nhận xét về hiệu quả công việc, thái độ, điểm mạnh và điểm cần cải thiện..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092] min-h-32"
            maxLength={1000}
          />
          <div className="flex items-center justify-between mt-2">
            <p className={`text-xs ${feedback.length < 20 ? 'text-[#EF4444]' : 'text-[#64748B]'}`}>
              {feedback.length < 20 ? `Tối thiểu 20 ký tự (còn ${20 - feedback.length})` : 'Đủ ký tự'}
            </p>
            <p className="text-xs text-[#64748B]">{feedback.length}/1000</p>
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#0F172A] mb-3">Đề xuất cải thiện (nếu có)</h3>
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            placeholder="Đề xuất các điểm cần cải thiện hoặc phát triển thêm..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092] min-h-24"
            maxLength={500}
          />
          <p className="text-xs text-[#64748B] mt-2">{recommendations.length}/500</p>
        </div>

        {/* Preview */}
        <div className="bg-gradient-to-br from-[#366092]/5 to-[#4A90E2]/5 rounded-xl p-4 border border-[#366092]/20">
          <h3 className="font-semibold text-[#0F172A] mb-3">Tóm tắt đánh giá</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#64748B]">DQTV:</span>
              <span className="font-medium text-[#0F172A]">
                {selectedDQTV ? dqtvList.find((d) => d.id === selectedDQTV)?.name : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Nhiệm vụ:</span>
              <span className="font-medium text-[#0F172A]">
                {taskId ? recentTasks.find((t) => t.id === taskId)?.code : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Điểm TB:</span>
              <span className="font-medium text-[#366092]">
                {overallRating > 0 ? `${overallRating.toFixed(1)}/5.0` : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Xếp loại:</span>
              <span className={`font-medium ${
                overallRating >= 4.5 ? 'text-[#10B981]' :
                overallRating >= 4 ? 'text-[#3B82F6]' :
                overallRating >= 3 ? 'text-[#F59E0B]' :
                'text-[#64748B]'
              }`}>
                {overallRating >= 4.5 ? 'Xuất sắc' :
                 overallRating >= 4 ? 'Tốt' :
                 overallRating >= 3 ? 'Khá' :
                 overallRating > 0 ? 'Trung bình' : '-'}
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
          className={`w-full py-3 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 ${
            isValid
              ? 'bg-[#366092] active:scale-98'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          <Send className="w-5 h-5" />
          GỬI ĐÁNH GIÁ
        </button>
        {!isValid && (
          <p className="text-xs text-center text-[#EF4444] mt-2">
            Vui lòng chọn DQTV, nhiệm vụ và đánh giá đầy đủ các tiêu chí
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
