import { FileSpreadsheet, Plus, Save, Eye, Play } from 'lucide-react';

export function CustomReport() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Tùy Chỉnh Báo Cáo</h1>
          <p className="text-sm text-[#64748B] mt-1">Tạo và tùy chỉnh báo cáo theo nhu cầu</p>
        </div>
        <button className="px-4 py-2 text-sm font-medium text-white bg-[#2E7D32] rounded-lg flex items-center gap-2">
          <Plus size={16} />
          Tạo báo cáo mới
        </button>
      </div>

      {/* Report Builder */}
      <div className="grid grid-cols-3 gap-6">
        {/* Data Source */}
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Nguồn dữ liệu</h3>
          <div className="space-y-3">
            <div className="border border-[#E2E8F0] rounded-lg p-3">
              <p className="text-sm font-semibold text-[#0F172A] mb-2">📊 Nhân sự</p>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-[#64748B]">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                  Tổng số DQTV
                </label>
                <label className="flex items-center gap-2 text-sm text-[#64748B]">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                  Tỷ lệ đi làm
                </label>
                <label className="flex items-center gap-2 text-sm text-[#64748B]">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                  KPI trung bình
                </label>
              </div>
            </div>
            <div className="border border-[#E2E8F0] rounded-lg p-3">
              <p className="text-sm font-semibold text-[#0F172A] mb-2">📋 Nhiệm vụ</p>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-[#64748B]">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                  Tổng nhiệm vụ
                </label>
                <label className="flex items-center gap-2 text-sm text-[#64748B]">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                  Hoàn thành (%)
                </label>
              </div>
            </div>
            <div className="border border-[#E2E8F0] rounded-lg p-3">
              <p className="text-sm font-semibold text-[#0F172A] mb-2">💰 Tài chính</p>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-[#64748B]">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                  Tổng quỹ lương
                </label>
                <label className="flex items-center gap-2 text-sm text-[#64748B]">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                  Lương TB/người
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="col-span-2 bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[#0F172A]">Vùng thiết kế</h3>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F8FAFC] rounded">
                <Eye size={16} />
              </button>
              <button className="px-3 py-1.5 text-sm text-[#64748B] hover:bg-[#F8FAFC] rounded">
                <Save size={16} />
              </button>
              <button className="px-3 py-1.5 text-sm text-white bg-[#1F3A5F] rounded flex items-center gap-1">
                <Play size={14} />
                Chạy
              </button>
            </div>
          </div>
          <div className="border-2 border-dashed border-[#E2E8F0] rounded-lg h-[500px] flex items-center justify-center">
            <div className="text-center">
              <FileSpreadsheet size={64} className="text-[#E2E8F0] mx-auto mb-4" />
              <p className="text-[#64748B]">Kéo thả các metrics vào đây để xây dựng báo cáo</p>
            </div>
          </div>
        </div>
      </div>

      {/* Saved Reports */}
      <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
        <h3 className="text-lg font-semibold text-[#0F172A] mb-4">Báo cáo đã lưu</h3>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="border border-[#E2E8F0] rounded-lg p-4 hover:shadow-md transition-all cursor-pointer">
              <div className="w-full h-32 bg-gradient-to-br from-[#F8FAFC] to-[#F1F5F9] rounded-lg mb-3 flex items-center justify-center">
                <FileSpreadsheet size={32} className="text-[#64748B]" />
              </div>
              <p className="text-sm font-semibold text-[#0F172A] mb-1">Báo cáo {i}</p>
              <p className="text-xs text-[#64748B]">Cập nhật: 2 ngày trước</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}