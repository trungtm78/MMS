import { useState } from 'react';
import { Search, Plus, FileDown, Eye, Edit, Filter, X, Save, Upload, AlertCircle } from 'lucide-react';

interface MilitiaListProps {
  onViewProfile: (id: string) => void;
}

const militiaData = [
  { id: 'DQTV001', name: 'Nguyễn Văn Minh', dob: '15/03/1995', unit: 'Khu phố 1', position: 'Phó chỉ huy', status: 'active' },
  { id: 'DQTV002', name: 'Trần Thanh Tùng', dob: '22/07/1993', unit: 'Khu phố 1', position: 'Chiến sĩ', status: 'active' },
  { id: 'DQTV003', name: 'Lê Hoàng Nam', dob: '10/11/1996', unit: 'Khu phố 2', position: 'Tổ trưởng', status: 'active' },
  { id: 'DQTV004', name: 'Phạm Minh Quân', dob: '05/01/1994', unit: 'Khu phố 2', position: 'Chiến sĩ', status: 'active' },
  { id: 'DQTV005', name: 'Hoàng Văn Đức', dob: '18/09/1995', unit: 'Khu phố 3', position: 'Tổ phó', status: 'active' },
  { id: 'DQTV006', name: 'Vũ Thanh Hải', dob: '25/04/1992', unit: 'Khu phố 3', position: 'Chiến sĩ', status: 'reserve' },
  { id: 'DQTV007', name: 'Đỗ Minh Tuấn', dob: '30/12/1997', unit: 'Khu phố 4', position: 'Chiến sĩ', status: 'active' },
  { id: 'DQTV008', name: 'Bùi Văn Long', dob: '08/06/1993', unit: 'Khu phố 4', position: 'Tổ trưởng', status: 'active' },
  { id: 'DQTV009', name: 'Ngô Thanh Bình', dob: '14/02/1996', unit: 'Khu phố 5', position: 'Chiến sĩ', status: 'active' },
  { id: 'DQTV010', name: 'Lý Văn Thành', dob: '20/08/1994', unit: 'Khu phố 5', position: 'Tổ phó', status: 'inactive' },
  { id: 'DQTV011', name: 'Trương Minh Khoa', dob: '12/05/1995', unit: 'Khu phố 6', position: 'Chiến sĩ', status: 'active' },
  { id: 'DQTV012', name: 'Phan Văn Hùng', dob: '27/10/1993', unit: 'Khu phố 6', position: 'Tổ trưởng', status: 'active' },
];

export function MilitiaList({ onViewProfile }: MilitiaListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('personal');
  const itemsPerPage = 10;

  const filteredData = militiaData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         item.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesUnit = unitFilter === 'all' || item.unit === unitFilter;
    return matchesSearch && matchesStatus && matchesUnit;
  });

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'active': return { label: 'Đang hoạt động', class: 'bg-green-100 text-green-700' };
      case 'reserve': return { label: 'Dự bị', class: 'bg-yellow-100 text-yellow-700' };
      case 'inactive': return { label: 'Đã xuất ngũ', class: 'bg-gray-100 text-gray-700' };
      default: return { label: status, class: 'bg-gray-100 text-gray-700' };
    }
  };

  const handleAddNew = () => {
    setEditingId(null);
    setActiveTab('personal');
    setShowModal(true);
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setActiveTab('personal');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
  };

  const tabs = [
    { id: 'personal', label: 'Thông tin cá nhân' },
    { id: 'military', label: 'Thông tin quân sự' },
    { id: 'documents', label: 'Hồ sơ - Giấy tờ' },
    { id: 'notes', label: 'Ghi chú' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Danh sách Dân Quân Tự Vệ</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý thông tin toàn bộ dân quân tự vệ</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm">
            <FileDown size={16} />
            Xuất Excel
          </button>
          <button 
            onClick={handleAddNew}
            className="px-4 py-2 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={16} />
            Thêm mới
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Bộ lọc tìm kiếm</h3>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Tìm kiếm</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Nhập tên hoặc mã DQTV..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Trạng thái</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
            >
              <option value="all">Tất cả</option>
              <option value="active">Đang hoạt động</option>
              <option value="reserve">Dự bị</option>
              <option value="inactive">Đã xuất ngũ</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Khu vực</label>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
            >
              <option value="all">Tất cả</option>
              <option value="Khu phố 1">Khu phố 1</option>
              <option value="Khu phố 2">Khu phố 2</option>
              <option value="Khu phố 3">Khu phố 3</option>
              <option value="Khu phố 4">Khu phố 4</option>
              <option value="Khu phố 5">Khu phố 5</option>
              <option value="Khu phố 6">Khu phố 6</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">STT</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Mã DQTV</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Họ và tên</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Ngày sinh</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Tổ / Khu phố</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Chức vụ</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Trạng thái</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedData.map((militia, index) => {
                const statusInfo = getStatusDisplay(militia.status);
                return (
                  <tr key={militia.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-700">{startIndex + index + 1}</td>
                    <td className="px-6 py-4 text-sm font-medium text-[#1F3A5F]">{militia.id}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{militia.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{militia.dob}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{militia.unit}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{militia.position}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.class}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => onViewProfile(militia.id)}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                          title="Xem chi tiết"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          onClick={() => handleEdit(militia.id)}
                          className="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-sm text-gray-700">
            Hiển thị <span className="font-medium">{startIndex + 1}</span> đến{' '}
            <span className="font-medium">{Math.min(startIndex + itemsPerPage, filteredData.length)}</span> trong tổng số{' '}
            <span className="font-medium">{filteredData.length}</span> bản ghi
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Trước
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === page
                    ? 'bg-[#1F3A5F] text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Sau
            </button>
          </div>
        </div>
      </div>

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingId ? 'Cập nhật thông tin Dân Quân Tự Vệ' : 'Thêm mới Dân Quân Tự Vệ'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {editingId ? 'Chỉnh sửa thông tin của dân quân hiện có' : 'Nhập đầy đủ thông tin để thêm dân quân mới'}
                </p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Help Banner */}
            <div className="mx-6 mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-blue-900 font-medium">Hướng dẫn điền thông tin</p>
                <p className="text-sm text-blue-700 mt-1">
                  Các trường có dấu <span className="text-red-600 font-semibold">*</span> là bắt buộc. 
                  Vui lòng điền đầy đủ và chính xác thông tin để tránh lỗi trong quá trình lưu.
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 flex px-6 mt-4">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                    activeTab === tab.id
                      ? 'text-[#1F3A5F] bg-gray-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1F3A5F]"></div>
                  )}
                </button>
              ))}
            </div>

            {/* Modal Body - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'personal' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Họ và tên <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Nhập họ và tên đầy đủ"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Ví dụ: Nguyễn Văn An</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Số CCCD <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Nhập số căn cước công dân (12 số)"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">12 chữ số, không có ký tự đặc biệt</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Ngày sinh <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="date"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Giới tính <span className="text-red-600">*</span>
                      </label>
                      <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm">
                        <option value="">Chọn giới tính</option>
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dân tộc
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Kinh"
                        defaultValue="Kinh"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Địa chỉ thường trú <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Nhập địa chỉ thường trú đầy đủ (số nhà, đường, phường/xã, tỉnh/thành phố)"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Số điện thoại
                      </label>
                      <input
                        type="tel"
                        placeholder="Nhập số điện thoại (10 số)"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Ví dụ: 0901234567</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        placeholder="Nhập địa chỉ email"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'military' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Mã DQTV <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Hệ thống tự động sinh mã"
                        disabled
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Mã sẽ được tự động tạo sau khi lưu</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tổ / Khu phố <span className="text-red-600">*</span>
                      </label>
                      <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm">
                        <option value="">Chọn khu phố</option>
                        <option value="1">Khu phố 1</option>
                        <option value="2">Khu phố 2</option>
                        <option value="3">Khu phố 3</option>
                        <option value="4">Khu phố 4</option>
                        <option value="5">Khu phố 5</option>
                        <option value="6">Khu phố 6</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Chức vụ <span className="text-red-600">*</span>
                      </label>
                      <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm">
                        <option value="">Chọn chức vụ</option>
                        <option value="commander">Chỉ huy trưởng</option>
                        <option value="deputy">Phó chỉ huy</option>
                        <option value="team-leader">Tổ trưởng</option>
                        <option value="team-deputy">Tổ phó</option>
                        <option value="soldier">Chiến sĩ</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Ngày tham gia <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="date"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tình trạng phục vụ <span className="text-red-600">*</span>
                      </label>
                      <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm">
                        <option value="">Chọn tình trạng</option>
                        <option value="active">Đang hoạt động</option>
                        <option value="reserve">Dự bị</option>
                        <option value="inactive">Đã xuất ngũ</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quân hàm
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Hạ sĩ"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Số năm phục vụ
                      </label>
                      <input
                        type="number"
                        placeholder="Nhập số năm"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'documents' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Ảnh thẻ căn cước (mặt trước)
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#1F3A5F] transition-colors cursor-pointer">
                      <Upload className="mx-auto mb-3 text-gray-400" size={40} />
                      <p className="text-sm text-gray-600 mb-1 font-medium">Kéo thả file hoặc click để chọn</p>
                      <p className="text-xs text-gray-500">Định dạng: JPG, PNG • Dung lượng tối đa: 5MB</p>
                      <button className="mt-4 px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                        Chọn file
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Ảnh thẻ căn cước (mặt sau)
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#1F3A5F] transition-colors cursor-pointer">
                      <Upload className="mx-auto mb-3 text-gray-400" size={40} />
                      <p className="text-sm text-gray-600 mb-1 font-medium">Kéo thả file hoặc click để chọn</p>
                      <p className="text-xs text-gray-500">Định dạng: JPG, PNG • Dung lượng tối đa: 5MB</p>
                      <button className="mt-4 px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                        Chọn file
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Quyết định liên quan
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#1F3A5F] transition-colors cursor-pointer">
                      <Upload className="mx-auto mb-3 text-gray-400" size={40} />
                      <p className="text-sm text-gray-600 mb-1 font-medium">Tải lên quyết định tuyển dụng, bổ nhiệm</p>
                      <p className="text-xs text-gray-500">Định dạng: PDF, JPG, PNG • Dung lượng tối đa: 10MB</p>
                      <button className="mt-4 px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                        Chọn file
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ghi chú nghiệp vụ
                    </label>
                    <textarea
                      rows={6}
                      placeholder="Nhập các ghi chú liên quan đến công tác, năng lực, thành tích..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                    ></textarea>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kỹ năng chuyên môn
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Ví dụ: Sơ cứu, phòng cháy chữa cháy, điều khiển xe..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                    ></textarea>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tình trạng sức khỏe
                    </label>
                    <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm">
                      <option value="">Chọn tình trạng sức khỏe</option>
                      <option value="excellent">Tốt</option>
                      <option value="good">Khá</option>
                      <option value="average">Trung bình</option>
                      <option value="weak">Yếu</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
              <button 
                onClick={handleCloseModal}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors font-medium"
              >
                <X size={18} />
                Hủy
              </button>
              <button className="px-6 py-2.5 bg-white border border-[#2E7D32] text-[#2E7D32] rounded-lg hover:bg-green-50 flex items-center gap-2 transition-colors font-medium">
                <Save size={18} />
                Lưu
              </button>
              <button 
                onClick={handleCloseModal}
                className="px-6 py-2.5 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] flex items-center gap-2 transition-colors shadow-sm font-medium"
              >
                <Save size={18} />
                Lưu & đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
