import { Save, Building2, Settings, FileText, Database } from 'lucide-react';

export function SystemConfig() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Cài đặt hệ thống</h1>
          <p className="text-sm text-gray-500 mt-1">Cấu hình thông tin đơn vị và tham số hệ thống</p>
        </div>
      </div>

      {/* Unit Information */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <Building2 size={20} className="text-[#1F3A5F]" />
          <h3 className="text-base font-semibold text-gray-900">Thông tin đơn vị hành chính</h3>
        </div>
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tên đơn vị <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                defaultValue="UBND Phường/Xã Tân Phú"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mã đơn vị
              </label>
              <input
                type="text"
                defaultValue="UBND-TP-Q7"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quận/Huyện
              </label>
              <input
                type="text"
                defaultValue="Quận 7"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tỉnh/Thành phố
              </label>
              <input
                type="text"
                defaultValue="TP. Hồ Chí Minh"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Số điện thoại liên hệ
              </label>
              <input
                type="tel"
                defaultValue="028-3xxx-xxxx"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Địa chỉ trụ sở
            </label>
            <input
              type="text"
              defaultValue="Đường Nguyễn Thị Thập, Phường Tân Phú, Quận 7, TP.HCM"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Chỉ huy trưởng
              </label>
              <input
                type="text"
                defaultValue="Đại úy Nguyễn Văn An"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phó chỉ huy
              </label>
              <input
                type="text"
                defaultValue="Thượng úy Trần Văn B"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button className="px-6 py-2.5 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] flex items-center gap-2 transition-colors shadow-sm font-medium">
              <Save size={16} />
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>

      {/* System Parameters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <Settings size={20} className="text-[#1F3A5F]" />
          <h3 className="text-base font-semibold text-gray-900">Tham số hệ thống</h3>
        </div>
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Độ tuổi tối thiểu (năm)
              </label>
              <input
                type="number"
                defaultValue="18"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Độ tuổi tối đa (năm)
              </label>
              <input
                type="number"
                defaultValue="45"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Thời gian huấn luyện định kỳ (tháng)
              </label>
              <input
                type="number"
                defaultValue="6"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Thời gian kiểm tra sức khỏe (tháng)
              </label>
              <input
                type="number"
                defaultValue="12"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Số lượng khu phố/tổ
            </label>
            <input
              type="number"
              defaultValue="6"
              className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
            />
          </div>

          <div className="flex justify-end">
            <button className="px-6 py-2.5 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] flex items-center gap-2 transition-colors shadow-sm font-medium">
              <Save size={16} />
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>

      {/* Form Templates */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <FileText size={20} className="text-[#1F3A5F]" />
          <h3 className="text-base font-semibold text-gray-900">Cấu hình biểu mẫu</h3>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div>
                <div className="text-sm font-medium text-gray-900">Biểu mẫu đăng ký DQTV</div>
                <div className="text-xs text-gray-500 mt-1">Mẫu số 01-DQTV/ĐKMT</div>
              </div>
              <button className="text-sm text-[#2E7D32] hover:text-[#1B5E20] font-medium">
                Chỉnh sửa
              </button>
            </div>
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div>
                <div className="text-sm font-medium text-gray-900">Biểu mẫu báo cáo tháng</div>
                <div className="text-xs text-gray-500 mt-1">Mẫu số 02-DQTV/BCTH</div>
              </div>
              <button className="text-sm text-[#2E7D32] hover:text-[#1B5E20] font-medium">
                Chỉnh sửa
              </button>
            </div>
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div>
                <div className="text-sm font-medium text-gray-900">Biểu mẫu quyết định bổ nhiệm</div>
                <div className="text-xs text-gray-500 mt-1">Mẫu số 03-DQTV/QĐBN</div>
              </div>
              <button className="text-sm text-[#2E7D32] hover:text-[#1B5E20] font-medium">
                Chỉnh sửa
              </button>
            </div>
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div>
                <div className="text-sm font-medium text-gray-900">Biểu mẫu xuất ngũ</div>
                <div className="text-xs text-gray-500 mt-1">Mẫu số 04-DQTV/XN</div>
              </div>
              <button className="text-sm text-[#2E7D32] hover:text-[#1B5E20] font-medium">
                Chỉnh sửa
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Backup & Restore */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <Database size={20} className="text-[#1F3A5F]" />
          <h3 className="text-base font-semibold text-gray-900">Sao lưu & phục hồi dữ liệu</h3>
        </div>
        <div className="p-8">
          <div className="grid grid-cols-2 gap-6">
            <div className="border border-gray-200 rounded-lg p-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Sao lưu dữ liệu</h4>
              <p className="text-sm text-gray-600 mb-4">Tạo bản sao lưu toàn bộ dữ liệu hệ thống</p>
              <div className="space-y-2 mb-6">
                <div className="text-xs text-gray-600">
                  Lần sao lưu gần nhất: <span className="font-medium text-gray-900">20/01/2026 02:00</span>
                </div>
                <div className="text-xs text-gray-600">
                  Kích thước: <span className="font-medium text-gray-900">156 MB</span>
                </div>
              </div>
              <button className="w-full px-5 py-2.5 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] text-sm font-medium transition-colors shadow-sm">
                Sao lưu ngay
              </button>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Phục hồi dữ liệu</h4>
              <p className="text-sm text-gray-600 mb-4">Khôi phục dữ liệu từ bản sao lưu</p>
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-700 mb-2">Chọn bản sao lưu</label>
                <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm">
                  <option>20/01/2026 02:00 (156 MB)</option>
                  <option>15/01/2026 02:00 (152 MB)</option>
                  <option>10/01/2026 02:00 (148 MB)</option>
                </select>
              </div>
              <button className="w-full px-5 py-2.5 bg-white border border-red-600 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors">
                Phục hồi
              </button>
            </div>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-800">
              <strong>Lưu ý:</strong> Việc phục hồi dữ liệu sẽ ghi đè toàn bộ dữ liệu hiện tại. 
              Vui lòng thực hiện sao lưu trước khi phục hồi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}