import { useState } from 'react';
import { Search, Plus, Edit, Lock, Unlock } from 'lucide-react';

const userData = [
  { id: 1, username: 'nguyen.van.an', name: 'Đại úy Nguyễn Văn An', role: 'Quản trị viên', status: 'active', lastLogin: '22/01/2026 14:30' },
  { id: 2, username: 'tran.van.b', name: 'Thượng úy Trần Văn B', role: 'Người dùng', status: 'active', lastLogin: '22/01/2026 09:15' },
  { id: 3, username: 'le.thi.c', name: 'Trung úy Lê Thị C', role: 'Người dùng', status: 'active', lastLogin: '21/01/2026 16:45' },
  { id: 4, username: 'pham.van.d', name: 'Thượng úy Phạm Văn D', role: 'Biên tập viên', status: 'active', lastLogin: '20/01/2026 11:20' },
  { id: 5, username: 'hoang.thi.e', name: 'Đại úy Hoàng Thị E', role: 'Người dùng', status: 'inactive', lastLogin: '15/01/2026 08:30' },
];

const permissions = [
  { module: 'Dashboard', view: true, create: false, edit: false, delete: false },
  { module: 'Quản lý DQTV', view: true, create: true, edit: true, delete: false },
  { module: 'Quản lý người dùng', view: false, create: false, edit: false, delete: false },
  { module: 'Danh mục hệ thống', view: true, create: false, edit: false, delete: false },
  { module: 'Báo cáo - Thống kê', view: true, create: false, edit: false, delete: false },
  { module: 'Nhật ký hoạt động', view: false, create: false, edit: false, delete: false },
  { module: 'Cài đặt hệ thống', view: false, create: false, edit: false, delete: false },
];

export function UserManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showPermissions, setShowPermissions] = useState(false);

  const filteredUsers = userData.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Quản lý người dùng & phân quyền</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý tài khoản và phân quyền truy cập hệ thống</p>
        </div>
        <button className="px-4 py-2.5 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] flex items-center gap-2 text-sm font-medium transition-colors shadow-sm">
          <Plus size={16} />
          Thêm người dùng
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-2">Tìm kiếm người dùng</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Nhập tên hoặc tài khoản..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
            />
          </div>
        </div>
      </div>

      {/* User Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">STT</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Tài khoản</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Họ và tên</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Vai trò</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Trạng thái</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Đăng nhập cuối</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user, index) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-700">{index + 1}</td>
                  <td className="px-6 py-4 text-sm font-medium text-[#1F3A5F]">{user.username}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{user.role}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {user.status === 'active' ? 'Hoạt động' : 'Tạm khóa'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{user.lastLogin}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors" title="Chỉnh sửa">
                        <Edit size={16} />
                      </button>
                      <button className="p-2 hover:bg-yellow-50 text-yellow-600 rounded-lg transition-colors" title="Khóa tài khoản">
                        {user.status === 'active' ? <Lock size={16} /> : <Unlock size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permissions Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Phân quyền hệ thống</h3>
          <button
            onClick={() => setShowPermissions(!showPermissions)}
            className="text-sm text-[#2E7D32] hover:text-[#1B5E20] font-medium"
          >
            {showPermissions ? 'Ẩn' : 'Hiển thị'} phân quyền
          </button>
        </div>

        {showPermissions && (
          <div className="p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Chọn vai trò để xem/chỉnh sửa quyền</label>
              <select className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm">
                <option>Quản trị viên</option>
                <option>Biên tập viên</option>
                <option>Người dùng</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase rounded-tl-lg">Module</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Xem</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Tạo mới</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Chỉnh sửa</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase rounded-tr-lg">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {permissions.map((perm, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{perm.module}</td>
                      <td className="px-6 py-4 text-center">
                        <input type="checkbox" defaultChecked={perm.view} className="w-4 h-4 text-[#1F3A5F] border-gray-300 rounded focus:ring-[#1F3A5F]" />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input type="checkbox" defaultChecked={perm.create} className="w-4 h-4 text-[#1F3A5F] border-gray-300 rounded focus:ring-[#1F3A5F]" />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input type="checkbox" defaultChecked={perm.edit} className="w-4 h-4 text-[#1F3A5F] border-gray-300 rounded focus:ring-[#1F3A5F]" />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input type="checkbox" defaultChecked={perm.delete} className="w-4 h-4 text-[#1F3A5F] border-gray-300 rounded focus:ring-[#1F3A5F]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">
                Hủy
              </button>
              <button className="px-6 py-2.5 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] text-sm font-medium transition-colors shadow-sm">
                Lưu thay đổi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}