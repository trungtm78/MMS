import { useState } from 'react';
import { Calendar, User, FileText, Filter } from 'lucide-react';

const activityData = [
  { id: 1, timestamp: '22/01/2026 14:30', user: 'Đại úy Nguyễn Văn An', action: 'Cập nhật thông tin', target: 'DQTV - Nguyễn Văn Minh (DQTV001)', type: 'update' },
  { id: 2, timestamp: '22/01/2026 10:15', user: 'Thượng úy Trần Văn B', action: 'Thêm mới', target: 'DQTV - Trần Thanh Tùng (DQTV012)', type: 'create' },
  { id: 3, timestamp: '21/01/2026 16:45', user: 'Đại úy Nguyễn Văn An', action: 'Xuất Excel', target: 'Danh sách DQTV - Khu phố 1', type: 'export' },
  { id: 4, timestamp: '21/01/2026 14:20', user: 'Trung úy Lê Thị C', action: 'Cập nhật trạng thái', target: 'DQTV - Lê Hoàng Nam (DQTV003)', type: 'update' },
  { id: 5, timestamp: '21/01/2026 09:30', user: 'Đại úy Nguyễn Văn An', action: 'Phân quyền', target: 'Người dùng - Thượng úy Phạm Văn D', type: 'permission' },
  { id: 6, timestamp: '20/01/2026 11:20', user: 'Thượng úy Phạm Văn D', action: 'Cập nhật thông tin', target: 'DQTV - Phạm Minh Quân (DQTV004)', type: 'update' },
  { id: 7, timestamp: '20/01/2026 08:45', user: 'Đại úy Nguyễn Văn An', action: 'Đăng nhập', target: 'Hệ thống', type: 'login' },
  { id: 8, timestamp: '19/01/2026 15:30', user: 'Trung úy Lê Thị C', action: 'Thêm mới', target: 'DQTV - Hoàng Văn Đức (DQTV005)', type: 'create' },
  { id: 9, timestamp: '19/01/2026 10:00', user: 'Đại úy Nguyễn Văn An', action: 'Cấu hình hệ thống', target: 'Thông tin đơn vị', type: 'config' },
  { id: 10, timestamp: '18/01/2026 14:15', user: 'Thượng úy Trần Văn B', action: 'Xóa', target: 'DQTV - Vũ Thanh Hải (DQTV006)', type: 'delete' },
  { id: 11, timestamp: '18/01/2026 11:30', user: 'Đại úy Nguyễn Văn An', action: 'Xuất báo cáo', target: 'Báo cáo tháng 01/2026', type: 'export' },
  { id: 12, timestamp: '17/01/2026 16:00', user: 'Trung úy Lê Thị C', action: 'Cập nhật thông tin', target: 'DQTV - Đỗ Minh Tuấn (DQTV007)', type: 'update' },
];

export function ActivityLog() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  const getActionColor = (type: string) => {
    switch (type) {
      case 'create': return 'bg-green-100 text-green-700';
      case 'update': return 'bg-blue-100 text-blue-700';
      case 'delete': return 'bg-red-100 text-red-700';
      case 'export': return 'bg-purple-100 text-purple-700';
      case 'login': return 'bg-gray-100 text-gray-700';
      case 'permission': return 'bg-orange-100 text-orange-700';
      case 'config': return 'bg-indigo-100 text-indigo-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Nhật ký hoạt động hệ thống</h1>
          <p className="text-sm text-gray-500 mt-1">Theo dõi tất cả các thao tác trên hệ thống</p>
        </div>
        <div className="text-sm text-gray-500">
          Tổng số: <span className="font-medium text-gray-700">{activityData.length}</span> bản ghi
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Bộ lọc</h3>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Từ ngày</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Đến ngày</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Người thực hiện</label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
            >
              <option value="all">Tất cả</option>
              <option value="nguyen.van.an">Đại úy Nguyễn Văn An</option>
              <option value="tran.van.b">Thượng úy Trần Văn B</option>
              <option value="le.thi.c">Trung úy Lê Thị C</option>
              <option value="pham.van.d">Thượng úy Phạm Văn D</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Loại hành động</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
            >
              <option value="all">Tất cả</option>
              <option value="create">Thêm mới</option>
              <option value="update">Cập nhật</option>
              <option value="delete">Xóa</option>
              <option value="export">Xuất dữ liệu</option>
              <option value="login">Đăng nhập</option>
              <option value="permission">Phân quyền</option>
              <option value="config">Cấu hình</option>
            </select>
          </div>
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">STT</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Thời gian</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Người thực hiện</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Hành động</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Đối tượng tác động</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activityData.map((activity, index) => (
                <tr key={activity.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-700">{index + 1}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 flex items-center gap-2">
                    <Calendar size={14} className="text-gray-500" />
                    {activity.timestamp}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 flex items-center gap-2">
                    <User size={14} className="text-gray-500" />
                    {activity.user}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(activity.type)}`}>
                      {activity.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 flex items-center gap-2">
                    <FileText size={14} className="text-gray-500" />
                    {activity.target}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-sm text-gray-700">
            Hiển thị <span className="font-medium">1</span> đến{' '}
            <span className="font-medium">{activityData.length}</span> trong tổng số{' '}
            <span className="font-medium">{activityData.length}</span> bản ghi
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors" disabled>
              Trước
            </button>
            <button className="px-4 py-2 bg-[#1F3A5F] text-white rounded-lg text-sm font-medium">
              1
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors" disabled>
              Sau
            </button>
          </div>
        </div>
      </div>

      {/* Timeline View Option */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-6">Xem theo dòng thời gian</h3>
        <div className="space-y-6">
          {activityData.slice(0, 5).map((activity) => (
            <div key={activity.id} className="flex gap-4">
              <div className="w-32 text-sm text-gray-600 flex-shrink-0 pt-1">{activity.timestamp}</div>
              <div className="relative flex-shrink-0">
                <div className="w-4 h-4 bg-[#2E7D32] rounded-full mt-1"></div>
                {activity.id !== activityData.slice(0, 5)[activityData.slice(0, 5).length - 1].id && (
                  <div className="absolute top-5 left-1.5 w-0.5 h-12 bg-gray-200"></div>
                )}
              </div>
              <div className="flex-1 pb-6">
                <div className="text-sm font-medium text-gray-900">{activity.user}</div>
                <div className="text-sm text-gray-700 mt-2 flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(activity.type)}`}>
                    {activity.action}
                  </span>
                  <span>{activity.target}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}