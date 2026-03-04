import { ArrowLeft, Save, Star, Trophy, ThumbsUp, Book, AlertTriangle, X as XIcon, User } from 'lucide-react';
import { useState } from 'react';

interface ChiTieuEvaluationProps {
  onNavigate: (screen: string) => void;
}

export default function ChiTieuEvaluation({ onNavigate }: ChiTieuEvaluationProps) {
  const [overallRating, setOverallRating] = useState(4.5);
  const [selectedRecommendation, setSelectedRecommendation] = useState('maintain');

  const StarRating = ({ rating, size = 'md', onChange }: { rating: number; size?: 'sm' | 'md' | 'lg'; onChange?: (rating: number) => void }) => {
    const sizes = { sm: 24, md: 32, lg: 48 };
    const starSize = sizes[size];
    
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onChange?.(star)}
            disabled={!onChange}
            className="transition-transform hover:scale-110"
          >
            <Star
              size={starSize}
              className={star <= Math.floor(rating) ? 'fill-[#FBBF24] text-[#FBBF24]' : 
                         star - 0.5 === rating ? 'fill-[#FBBF24] text-[#FBBF24] opacity-50' :
                         'text-[#E2E8F0]'}
            />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Đánh giá Chỉ tiêu</h1>
          </div>
          <button className="p-2">
            <Save className="text-[#64748B]" size={20} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* DQTV Info Card */}
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="w-20 h-20 rounded-full bg-white border-2 border-[#366092] mx-auto mb-3 flex items-center justify-center">
            <User className="text-[#366092]" size={40} />
          </div>
          <h2 className="text-xl font-bold text-[#0F172A] mb-1">Nguyễn Văn An</h2>
          <p className="text-xs text-[#64748B] mb-3">HCM-PHD-T12-0001</p>
          <div className="mb-2">
            <p className="text-xs text-[#64748B] mb-1">Chỉ tiêu hiện tại</p>
            <p className="text-3xl font-bold text-[#10B981]">92.4</p>
          </div>
          <span className="inline-block px-3 py-1 bg-[#EFF6FF] text-[#366092] text-xs font-medium rounded-full">
            Tháng 12/2024
          </span>
        </div>

        {/* Overall Rating */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4 text-center">Đánh giá chung</h3>
          <div className="flex justify-center mb-3">
            <StarRating rating={overallRating} size="lg" onChange={setOverallRating} />
          </div>
          <p className="text-center text-xl font-bold text-[#FBBF24]">{overallRating}/5</p>
        </div>

        {/* Criteria Sections */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-[#0F172A]">Kỹ năng chuyên môn</h3>
            <span className="px-2 py-1 bg-[#366092] text-white text-xs font-medium rounded-full">30%</span>
          </div>
          <div className="flex justify-center mb-3">
            <StarRating rating={4.5} size="sm" />
          </div>
          <textarea
            placeholder="Nhập ghi chú..."
            rows={3}
            className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent resize-none"
          />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-[#0F172A]">Tinh thần trách nhiệm</h3>
            <span className="px-2 py-1 bg-[#366092] text-white text-xs font-medium rounded-full">25%</span>
          </div>
          <div className="flex justify-center mb-3">
            <StarRating rating={5} size="sm" />
          </div>
          <textarea
            placeholder="Nhập ghi chú..."
            rows={3}
            className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent resize-none"
          />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-[#0F172A]">Làm việc nhóm</h3>
            <span className="px-2 py-1 bg-[#366092] text-white text-xs font-medium rounded-full">20%</span>
          </div>
          <div className="flex justify-center mb-3">
            <StarRating rating={4} size="sm" />
          </div>
          <textarea
            placeholder="Nhập ghi chú..."
            rows={3}
            className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent resize-none"
          />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-[#0F172A]">Sáng tạo</h3>
            <span className="px-2 py-1 bg-[#366092] text-white text-xs font-medium rounded-full">15%</span>
          </div>
          <div className="flex justify-center mb-3">
            <StarRating rating={4} size="sm" />
          </div>
          <textarea
            placeholder="Nhập ghi chú..."
            rows={3}
            className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent resize-none"
          />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-[#0F172A]">Thái độ</h3>
            <span className="px-2 py-1 bg-[#366092] text-white text-xs font-medium rounded-full">10%</span>
          </div>
          <div className="flex justify-center mb-3">
            <StarRating rating={5} size="sm" />
          </div>
          <textarea
            placeholder="Nhập ghi chú..."
            rows={3}
            className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent resize-none"
          />
        </div>

        {/* Strengths */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-base font-semibold text-[#0F172A] mb-3">Điểm mạnh</h3>
          <textarea
            placeholder="Nhập điểm mạnh..."
            rows={4}
            className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent resize-none mb-3"
          />
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button className="px-3 py-1.5 bg-[#EFF6FF] text-[#366092] rounded-full text-xs font-medium whitespace-nowrap">
              Tận tâm
            </button>
            <button className="px-3 py-1.5 bg-[#EFF6FF] text-[#366092] rounded-full text-xs font-medium whitespace-nowrap">
              Chuyên nghiệp
            </button>
            <button className="px-3 py-1.5 bg-[#EFF6FF] text-[#366092] rounded-full text-xs font-medium whitespace-nowrap">
              Kỹ năng tốt
            </button>
            <button className="px-3 py-1.5 bg-[#EFF6FF] text-[#366092] rounded-full text-xs font-medium whitespace-nowrap">
              Trách nhiệm
            </button>
          </div>
        </div>

        {/* Improvements */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-base font-semibold text-[#0F172A] mb-3">Cần cải thiện</h3>
          <textarea
            placeholder="Nhập điểm cần cải thiện..."
            rows={4}
            className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent resize-none mb-3"
          />
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button className="px-3 py-1.5 bg-[#FEF3C7] text-[#F59E0B] rounded-full text-xs font-medium whitespace-nowrap">
              Quản lý thời gian
            </button>
            <button className="px-3 py-1.5 bg-[#FEF3C7] text-[#F59E0B] rounded-full text-xs font-medium whitespace-nowrap">
              Giao tiếp
            </button>
          </div>
        </div>

        {/* Recommendation */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-base font-semibold text-[#0F172A] mb-3">Đề xuất</h3>
          <div className="space-y-2">
            <button
              onClick={() => setSelectedRecommendation('reward')}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                selectedRecommendation === 'reward'
                  ? 'border-[#10B981] bg-[#D1FAE5]'
                  : 'border-[#E2E8F0] bg-white'
              }`}
            >
              <Trophy className="text-[#10B981]" size={24} />
              <span className="text-sm font-medium text-[#0F172A]">Khen thưởng</span>
            </button>

            <button
              onClick={() => setSelectedRecommendation('maintain')}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                selectedRecommendation === 'maintain'
                  ? 'border-[#3B82F6] bg-[#DBEAFE]'
                  : 'border-[#E2E8F0] bg-white'
              }`}
            >
              <ThumbsUp className="text-[#3B82F6]" size={24} />
              <span className="text-sm font-medium text-[#0F172A]">Giữ nguyên</span>
            </button>

            <button
              onClick={() => setSelectedRecommendation('training')}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                selectedRecommendation === 'training'
                  ? 'border-[#F59E0B] bg-[#FFF7ED]'
                  : 'border-[#E2E8F0] bg-white'
              }`}
            >
              <Book className="text-[#F59E0B]" size={24} />
              <span className="text-sm font-medium text-[#0F172A]">Đào tạo thêm</span>
            </button>

            <button
              onClick={() => setSelectedRecommendation('warning')}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                selectedRecommendation === 'warning'
                  ? 'border-[#F59E0B] bg-[#FFF7ED]'
                  : 'border-[#E2E8F0] bg-white'
              }`}
            >
              <AlertTriangle className="text-[#F59E0B]" size={24} />
              <span className="text-sm font-medium text-[#0F172A]">Cảnh cáo</span>
            </button>

            <button
              onClick={() => setSelectedRecommendation('discipline')}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                selectedRecommendation === 'discipline'
                  ? 'border-[#EF4444] bg-[#FEE2E2]'
                  : 'border-[#E2E8F0] bg-white'
              }`}
            >
              <XIcon className="text-[#EF4444]" size={24} />
              <span className="text-sm font-medium text-[#0F172A]">Kỷ luật</span>
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-[#0F172A]">Xem trước</h3>
            <button className="text-sm text-[#366092]">Mở rộng</button>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-[#10B981] mb-1">92.4/100</p>
            <span className="inline-block px-4 py-2 bg-[#D1FAE5] text-[#10B981] text-sm font-bold rounded-full">
              Xuất sắc
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Buttons */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-[#E2E8F0] p-4 shadow-lg">
        <div className="flex gap-3">
          <button className="flex-1 h-12 border border-[#64748B] text-[#64748B] rounded-lg text-sm font-medium">
            Lưu nháp
          </button>
          <button className="flex-1 h-12 bg-[#366092] text-white rounded-lg text-sm font-medium">
            Gửi đánh giá
          </button>
        </div>
      </div>
    </div>
  );
}