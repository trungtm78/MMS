import { ArrowLeft, Camera, MapPin, Send, Image, Mic } from 'lucide-react';
import { useState } from 'react';

interface ReportWorkProps {
  onNavigate: (screen: string) => void;
}

export default function ReportWork({ onNavigate }: ReportWorkProps) {
  const [reportType, setReportType] = useState('daily');
  const [content, setContent] = useState('');
  const [location, setLocation] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const handleSubmit = () => {
    // Handle report submission
    alert('Báo cáo đã được gửi!');
    setContent('');
    setLocation('');
    setImages([]);
  };

  const recentReports = [
    {
      id: 1,
      type: 'Báo cáo hàng ngày',
      date: '24/02/2024',
      status: 'approved',
      content: 'Hoàn thành tuần tra khu vực 1, không phát hiện vấn đề bất thường.'
    },
    {
      id: 2,
      type: 'Báo cáo sự vụ',
      date: '23/02/2024',
      status: 'pending',
      content: 'Phát hiện xe đậu sai quy định tại đường Lê Lợi, đã nhắc nhở chủ xe.'
    },
    {
      id: 3,
      type: 'Báo cáo hàng ngày',
      date: '22/02/2024',
      status: 'approved',
      content: 'Hoàn thành tuyên truyền PCCC tại khu dân cư.'
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Báo cáo công việc</h1>
          </div>
        </div>
      </div>

      {/* Report Type Selection */}
      <div className="px-4 pt-4">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button
            onClick={() => setReportType('daily')}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              reportType === 'daily'
                ? 'bg-[#DC2626] text-white shadow-md'
                : 'bg-white text-[#64748B]'
            }`}
          >
            Báo cáo hàng ngày
          </button>
          <button
            onClick={() => setReportType('incident')}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              reportType === 'incident'
                ? 'bg-[#DC2626] text-white shadow-md'
                : 'bg-white text-[#64748B]'
            }`}
          >
            Báo cáo sự vụ
          </button>
          <button
            onClick={() => setReportType('monthly')}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              reportType === 'monthly'
                ? 'bg-[#DC2626] text-white shadow-md'
                : 'bg-white text-[#64748B]'
            }`}
          >
            Báo cáo tháng
          </button>
        </div>
      </div>

      {/* Report Form */}
      <div className="px-4 pt-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border-2 border-[#FDE047]">
          <h2 className="text-lg font-extrabold text-[#0F172A] mb-4">
            {reportType === 'daily' && 'Báo cáo hàng ngày'}
            {reportType === 'incident' && 'Báo cáo sự vụ'}
            {reportType === 'monthly' && 'Báo cáo tháng'}
          </h2>

          {/* Location */}
          <div className="mb-4">
            <label className="block text-sm font-bold text-[#0F172A] mb-2">
              Địa điểm
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-[#DC2626]" size={20} />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#DC2626] font-semibold"
                placeholder="Nhập địa điểm..."
              />
            </div>
          </div>

          {/* Content */}
          <div className="mb-4">
            <label className="block text-sm font-bold text-[#0F172A] mb-2">
              Nội dung báo cáo
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="w-full px-4 py-3 border-2 border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#DC2626] font-semibold resize-none"
              placeholder="Nhập nội dung báo cáo..."
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-[#64748B]">{content.length} ký tự</span>
              <button className="text-[#DC2626] p-2">
                <Mic size={20} />
              </button>
            </div>
          </div>

          {/* Image Upload */}
          <div className="mb-4">
            <label className="block text-sm font-bold text-[#0F172A] mb-2">
              Hình ảnh đính kèm
            </label>
            <div className="grid grid-cols-4 gap-2">
              {images.map((img, index) => (
                <div key={index} className="aspect-square bg-[#F1F5F9] rounded-lg overflow-hidden">
                  <img src={img} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
              <button className="aspect-square bg-[#F1F5F9] rounded-lg flex flex-col items-center justify-center text-[#DC2626] border-2 border-dashed border-[#DC2626]">
                <Camera size={24} className="mb-1" />
                <span className="text-xs font-bold">Thêm ảnh</span>
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            className="w-full bg-[#DC2626] text-white py-3 rounded-lg font-extrabold text-lg hover:bg-[#B91C1C] transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <Send size={20} />
            Gửi báo cáo
          </button>
        </div>
      </div>

      {/* Recent Reports */}
      <div className="px-4 pt-6 pb-4">
        <h2 className="text-lg font-extrabold text-[#0F172A] mb-3">Báo cáo gần đây</h2>
        <div className="space-y-3">
          {recentReports.map((report) => (
            <div
              key={report.id}
              className={`bg-white rounded-xl p-4 shadow-sm ${
                report.status === 'approved' ? 'border-l-4 border-[#15803D]' : 'border-l-4 border-[#F59E0B]'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-[#0F172A] mb-1">{report.type}</h3>
                  <p className="text-xs text-[#64748B]">{report.date}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-bold ${
                    report.status === 'approved'
                      ? 'bg-[#DCFCE7] text-[#15803D]'
                      : 'bg-[#FEF3C7] text-[#F59E0B]'
                  }`}
                >
                  {report.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'}
                </span>
              </div>
              <p className="text-sm text-[#0F172A] mt-2">{report.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
