import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Lock, Unlock, Key, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { listUsers, updateUserStatus, updateUserRole, resetPassword, createUser } from '@/api/admin'
import type { AdminUser } from '@/api/admin'

const ROLE_LABELS: Record<string, string> = {
  system_admin: 'Quản trị viên',
  office_staff: 'Văn phòng',
  police_area: 'CA khu vực',
  police_ward: 'CA phường',
  ubnd_leader: 'Lãnh đạo UBND',
  dqtv: 'Dân quân',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
  suspended: 'bg-red-100 text-red-700',
}

export function UserManagementPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [resetPasswordResult, setResetPasswordResult] = useState<{ userId: string; password: string } | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', fullName: '', role: 'dqtv', unitCode: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page],
    queryFn: () => listUsers({ page, limit: 20 }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateUserStatus(id, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('Cập nhật trạng thái thành công') },
    onError: () => toast.error('Cập nhật thất bại'),
  })

  const resetMutation = useMutation({
    mutationFn: (id: string) => resetPassword(id),
    onSuccess: (result, id) => setResetPasswordResult({ userId: id, password: result.temporaryPassword }),
    onError: () => toast.error('Đặt lại mật khẩu thất bại'),
  })

  const createMutation = useMutation({
    mutationFn: () => createUser({ username: newUser.username, fullName: newUser.fullName, role: newUser.role, unitCode: newUser.unitCode || undefined }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setResetPasswordResult({ userId: result.id, password: result.temporaryPassword })
      toast.success('Tạo tài khoản thành công')
      setShowAddUser(false)
      setNewUser({ username: '', fullName: '', role: 'dqtv', unitCode: '' })
    },
    onError: () => toast.error('Tạo tài khoản thất bại'),
  })

  const users = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  const filtered = users.filter(u =>
    !searchTerm ||
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6" data-testid="user-management-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Quản lý người dùng & phân quyền</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý tài khoản và phân quyền truy cập hệ thống</p>
        </div>
        <button
          onClick={() => setShowAddUser(true)}
          className="px-4 py-2.5 bg-[#15803D] text-white rounded-lg hover:bg-[#166534] flex items-center gap-2 text-sm font-medium transition-colors"
          data-testid="add-user-btn"
        >
          <Plus size={16} />
          Thêm người dùng
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Nhập tên hoặc tài khoản..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
              data-testid="user-search-input"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Đang tải...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="user-table">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">STT</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Tài khoản</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Họ và tên</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Vai trò</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Đơn vị</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Trạng thái</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filtered.map((user, idx) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors" data-testid={`user-row-${user.id}`}>
                      <td className="px-6 py-4 text-sm text-gray-700">{(page - 1) * 20 + idx + 1}</td>
                      <td className="px-6 py-4 text-sm font-medium text-[#1F3A5F]">{user.username}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.fullName}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{ROLE_LABELS[user.role ?? ''] ?? user.role ?? '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{user.unitScope ?? '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[user.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {user.status === 'active' ? 'Hoạt động' : user.status === 'suspended' ? 'Tạm khóa' : 'Không hoạt động'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => statusMutation.mutate({ id: user.id, status: user.status === 'active' ? 'inactive' : 'active' })}
                            className="p-2 hover:bg-yellow-50 text-yellow-600 rounded-lg transition-colors"
                            title={user.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                            data-testid={`toggle-status-${user.id}`}
                          >
                            {user.status === 'active' ? <Lock size={16} /> : <Unlock size={16} />}
                          </button>
                          <button
                            onClick={() => resetMutation.mutate(user.id)}
                            className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                            title="Đặt lại mật khẩu"
                            data-testid={`reset-password-${user.id}`}
                          >
                            <Key size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Hiển thị <span className="font-medium">{filtered.length}</span> / tổng <span className="font-medium">{total}</span> tài khoản
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  data-testid="prev-page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-gray-700">{page} / {totalPages || 1}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                  data-testid="next-page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Reset Password Modal */}
      {resetPasswordResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="reset-password-modal">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Mật khẩu tạm thời</h3>
            <p className="text-sm text-gray-600 mb-4">Hãy thông báo mật khẩu này cho người dùng và yêu cầu đổi ngay sau khi đăng nhập.</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <span className="text-2xl font-mono font-bold text-[#1F3A5F]" data-testid="temp-password">{resetPasswordResult.password}</span>
            </div>
            <button
              onClick={() => setResetPasswordResult(null)}
              className="w-full mt-4 px-4 py-2 bg-[#1F3A5F] text-white rounded-lg font-medium hover:bg-[#1a3254] transition-colors"
              data-testid="close-reset-modal"
            >
              Đã ghi nhận
            </button>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="add-user-modal">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Thêm người dùng mới</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản *</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
                  data-testid="new-username-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  value={newUser.fullName}
                  onChange={e => setNewUser(u => ({ ...u, fullName: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
                  data-testid="new-fullname-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vai trò</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
                  data-testid="new-role-select"
                >
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã đơn vị</label>
                <input
                  type="text"
                  value={newUser.unitCode}
                  onChange={e => setNewUser(u => ({ ...u, unitCode: e.target.value }))}
                  placeholder="VD: UNIT_001"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
                  data-testid="new-unit-input"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddUser(false)} className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">Hủy</button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!newUser.username || !newUser.fullName || createMutation.isPending}
                className="px-6 py-2.5 bg-[#15803D] text-white rounded-lg hover:bg-[#166534] text-sm font-medium disabled:opacity-60"
                data-testid="submit-add-user"
              >
                {createMutation.isPending ? 'Đang tạo...' : 'Tạo tài khoản'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
