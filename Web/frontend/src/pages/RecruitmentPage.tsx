import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import { UserPlus, FileText, CheckCircle, Clock, X, Eye, Download } from 'lucide-react'
import { toast } from 'sonner'

interface Application {
  id: string
  name: string
  age: number
  address: string
  phone: string
  applyDate: string
  status: 'new' | 'reviewing' | 'approved' | 'rejected'
  district?: string
  email?: string
  idNumber?: string
}

type StatusTab = 'all' | Application['status']

const STATUS_COLORS: Record<Application['status'], { bg: string; text: string }> = {
  new: { bg: '#E3F2FD', text: '#1976D2' },
  reviewing: { bg: '#FFF3E0', text: '#F57C00' },
  approved: { bg: '#E8F5E9', text: '#2E7D32' },
  rejected: { bg: '#FFEBEE', text: '#C62828' },
}

const STATUS_LABELS: Record<Application['status'], string> = {
  new: 'Mới',
  reviewing: 'Đang xét duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
}

interface CreateApplicationForm {
  name: string
  age: string
  address: string
  phone: string
  district: string
  idNumber: string
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CreateApplicationForm>({
    name: '',
    age: '',
    address: '',
    phone: '',
    district: '',
    idNumber: '',
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateApplicationForm) =>
      client.post('/recruitment/applications', {
        ...data,
        age: parseInt(data.age) || 0,
      }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã tạo đơn đăng ký')
      queryClient.invalidateQueries({ queryKey: ['recruitment'] })
      onClose()
    },
    onError: () => toast.error('Không thể tạo đơn đăng ký'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Vui lòng nhập họ tên')
    if (!form.phone.trim()) return toast.error('Vui lòng nhập số điện thoại')
    createMutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">Tạo đơn đăng ký</h2>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Họ tên <span className="text-[#C62828]">*</span></label>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nguyễn Văn A" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Tuổi</label>
              <input type="number" min="18" max="45" value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))} placeholder="25" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Số điện thoại <span className="text-[#C62828]">*</span></label>
              <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0901234567" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">CCCD/CMND</label>
              <input type="text" value={form.idNumber} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))} placeholder="0123456789" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Khu phố</label>
              <input type="text" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} placeholder="KP 1" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Địa chỉ</label>
              <input type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Đường ABC, KP1" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]">Hủy</button>
            <button type="submit" disabled={createMutation.isPending} className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              {createMutation.isPending ? 'Đang lưu...' : 'Tạo đơn'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function RecruitmentPage() {
  const { can } = useRbac()
  const queryClient = useQueryClient()
  const [selectedTab, setSelectedTab] = useState<StatusTab>('all')
  const [showModal, setShowModal] = useState(false)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)

  if (!can.manageMilitia) return <Navigate to="/forbidden" replace />

  const { data: applications = [], isLoading } = useQuery<Application[]>({
    queryKey: ['recruitment', selectedTab],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (selectedTab !== 'all') params.status = selectedTab
      return client.get('/recruitment/applications', { params }).then((r) => r.data)
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' | 'reviewing' }) =>
      client.patch(`/recruitment/${id}/status`, { status }).then((r) => r.data),
    onSuccess: (_, { status }) => {
      const msg = status === 'approved' ? 'Đã duyệt đơn' : status === 'rejected' ? 'Đã từ chối' : 'Đã chuyển sang xét duyệt'
      toast.success(msg)
      queryClient.invalidateQueries({ queryKey: ['recruitment'] })
    },
    onError: () => toast.error('Không thể cập nhật trạng thái'),
  })

  const statusTabs: { id: StatusTab; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'new', label: 'Mới' },
    { id: 'reviewing', label: 'Đang xét duyệt' },
    { id: 'approved', label: 'Đã duyệt' },
    { id: 'rejected', label: 'Từ chối' },
  ]

  const counts = {
    all: applications.length,
    new: applications.filter((a) => a.status === 'new').length,
    reviewing: applications.filter((a) => a.status === 'reviewing').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  }

  const exportCSV = () => {
    const headers = ['Họ tên', 'Tuổi', 'Điện thoại', 'Địa chỉ', 'Quận/Huyện', 'Trạng thái', 'Ngày nộp']
    const rows = applications.map((a) => [
      a.name,
      String(a.age),
      a.phone,
      a.address,
      a.district ?? '',
      STATUS_LABELS[a.status],
      a.applyDate,
    ])
    const csv = '﻿' + [headers, ...rows].map((r) => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tuyen-chon-dqtv.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="recruitment-page">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Tuyển dụng DQTV</h1>
            <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – Tuyển chọn dân quân tự vệ mới</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowModal(true)}
              data-testid="create-application-btn"
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <UserPlus size={16} />
              Tạo đơn đăng ký
            </button>
            <button onClick={exportCSV} className="px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] rounded-lg border border-[#E2E8F0] flex items-center gap-2 transition-colors">
              <Download size={16} />
              Xuất Excel
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#E3F2FD] rounded-lg flex items-center justify-center">
                <FileText size={24} className="text-[#1976D2]" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Tổng đơn</p>
                <p className="text-2xl font-bold text-[#0F172A]">{counts.all}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
                <CheckCircle size={24} className="text-[#2E7D32]" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Đã duyệt</p>
                <p className="text-2xl font-bold text-[#2E7D32]">{counts.approved}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#FFF3E0] rounded-lg flex items-center justify-center">
                <Clock size={24} className="text-[#F57C00]" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Chờ duyệt</p>
                <p className="text-2xl font-bold text-[#F57C00]">{counts.new + counts.reviewing}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
                <X size={24} className="text-[#C62828]" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Từ chối</p>
                <p className="text-2xl font-bold text-[#C62828]">{counts.rejected}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-1 flex items-center gap-1 flex-wrap">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              data-testid={`recruitment-tab-${tab.id}`}
              className={`px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                selectedTab === tab.id ? 'bg-[#1F3A5F] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 px-2 py-0.5 text-xs rounded-full ${
                selectedTab === tab.id ? 'bg-white/20' : 'bg-[#F1F5F9]'
              }`}>
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                <tr>
                  {['STT', 'Họ tên', 'Tuổi', 'Địa chỉ', 'Số điện thoại', 'Ngày nộp', 'Trạng thái', 'Thao tác'].map((h) => (
                    <th key={h} className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i} className="border-b border-[#F1F5F9]">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                        <td key={j} className="px-5 py-4"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : applications.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-[#64748B] text-sm">
                      Không có đơn đăng ký nào
                    </td>
                  </tr>
                ) : (
                  applications.map((app, index) => {
                    const color = STATUS_COLORS[app.status]
                    return (
                      <tr
                        key={app.id}
                        data-testid={`application-row-${app.id}`}
                        className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-[#64748B]">{index + 1}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-xs font-semibold">
                              {app.name.split(' ').filter(Boolean).slice(-1)[0]?.[0] ?? '?'}
                            </div>
                            <span className="text-sm font-semibold text-[#0F172A]">{app.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#0F172A]">{app.age}</td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-[#0F172A]">{app.address}</p>
                          {app.district && <p className="text-xs text-[#64748B]">{app.district}</p>}
                        </td>
                        <td className="px-6 py-4 text-sm text-[#0F172A]">{app.phone}</td>
                        <td className="px-6 py-4 text-sm text-[#64748B]">{app.applyDate}</td>
                        <td className="px-6 py-4">
                          <span
                            className="px-3 py-1.5 text-xs font-semibold rounded-full"
                            style={{ backgroundColor: color.bg, color: color.text }}
                          >
                            {STATUS_LABELS[app.status]}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSelectedApp(app)} className="w-8 h-8 flex items-center justify-center hover:bg-[#E3F2FD] rounded transition-colors" title="Xem chi tiết">
                              <Eye size={15} className="text-[#64748B]" />
                            </button>
                            {app.status === 'new' && (
                              <button
                                onClick={() => statusMutation.mutate({ id: app.id, status: 'reviewing' })}
                                disabled={statusMutation.isPending}
                                data-testid={`review-btn-${app.id}`}
                                className="w-8 h-8 flex items-center justify-center hover:bg-[#FFF3E0] rounded transition-colors"
                                title="Chuyển xét duyệt"
                              >
                                <Clock size={15} className="text-[#F57C00]" />
                              </button>
                            )}
                            {(app.status === 'new' || app.status === 'reviewing') && (
                              <>
                                <button
                                  onClick={() => statusMutation.mutate({ id: app.id, status: 'approved' })}
                                  disabled={statusMutation.isPending}
                                  data-testid={`approve-btn-${app.id}`}
                                  className="w-8 h-8 flex items-center justify-center hover:bg-[#E8F5E9] rounded transition-colors"
                                  title="Duyệt"
                                >
                                  <CheckCircle size={15} className="text-[#2E7D32]" />
                                </button>
                                <button
                                  onClick={() => statusMutation.mutate({ id: app.id, status: 'rejected' })}
                                  disabled={statusMutation.isPending}
                                  data-testid={`reject-btn-${app.id}`}
                                  className="w-8 h-8 flex items-center justify-center hover:bg-[#FFEBEE] rounded transition-colors"
                                  title="Từ chối"
                                >
                                  <X size={15} className="text-[#C62828]" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && <CreateModal onClose={() => setShowModal(false)} />}

      {selectedApp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedApp(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0F172A]">Chi tiết đơn đăng ký</h2>
              <button onClick={() => setSelectedApp(null)} className="text-[#64748B] hover:text-[#0F172A]">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-[#64748B]">Họ tên</p><p className="font-medium text-[#0F172A]">{selectedApp.name}</p></div>
              <div><p className="text-[#64748B]">Tuổi</p><p className="font-medium text-[#0F172A]">{selectedApp.age}</p></div>
              <div><p className="text-[#64748B]">Điện thoại</p><p className="font-medium text-[#0F172A]">{selectedApp.phone}</p></div>
              <div><p className="text-[#64748B]">Địa chỉ</p><p className="font-medium text-[#0F172A] col-span-2">{selectedApp.address}</p></div>
              {selectedApp.district && <div><p className="text-[#64748B]">Quận/Huyện</p><p className="font-medium text-[#0F172A]">{selectedApp.district}</p></div>}
              {selectedApp.email && <div><p className="text-[#64748B]">Email</p><p className="font-medium text-[#0F172A]">{selectedApp.email}</p></div>}
              {selectedApp.idNumber && <div><p className="text-[#64748B]">CCCD/CMND</p><p className="font-medium text-[#0F172A]">{selectedApp.idNumber}</p></div>}
              <div><p className="text-[#64748B]">Ngày nộp</p><p className="font-medium text-[#0F172A]">{selectedApp.applyDate}</p></div>
              <div>
                <p className="text-[#64748B]">Trạng thái</p>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-0.5"
                  style={{ backgroundColor: STATUS_COLORS[selectedApp.status].bg, color: STATUS_COLORS[selectedApp.status].text }}
                >
                  {STATUS_LABELS[selectedApp.status]}
                </span>
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-3">
              <button onClick={() => setSelectedApp(null)} className="border border-[#E2E8F0] text-[#64748B] rounded-lg px-4 py-2 text-sm hover:border-[#C62828] transition-colors">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
