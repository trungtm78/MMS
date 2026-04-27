import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, X, Plus, Users, ClipboardList, BarChart3,
  Clock, FileCheck, Activity, ArrowUpRight,
} from 'lucide-react'

interface Action {
  id: string
  label: string
  description: string
  icon: React.ElementType
  color: string
  bgColor: string
  path: string
}

const ACTIONS: Action[] = [
  { id: 'new-task',     label: 'Giao việc mới',        description: 'Tạo và giao nhiệm vụ mới',       icon: Plus,         color: '#C62828', bgColor: '#FEF2F2', path: '/tasks/new' },
  { id: 'militia-list', label: 'Danh sách DQTV',        description: 'Quản lý nhân sự',                icon: Users,        color: '#2E7D32', bgColor: '#F0FDF4', path: '/militia' },
  { id: 'task-list',    label: 'Danh sách công việc',   description: 'Xem và quản lý nhiệm vụ',        icon: ClipboardList, color: '#1F3A5F', bgColor: '#EFF6FF', path: '/tasks/list' },
  { id: 'reports',      label: 'Báo cáo & Thống kê',    description: 'Xuất báo cáo thống kê',          icon: BarChart3,    color: '#F57C00', bgColor: '#FFF7ED', path: '/reports/attendance' },
  { id: 'timesheet',    label: 'Chấm công',              description: 'Quản lý chấm công',              icon: Clock,        color: '#0F766E', bgColor: '#F0FDFA', path: '/timesheet' },
  { id: 'approvals',    label: 'Duyệt đơn từ',           description: 'Phê duyệt đơn từ',               icon: FileCheck,    color: '#7C3AED', bgColor: '#F5F3FF', path: '/approvals' },
  { id: 'kpi',          label: 'Dashboard Chỉ tiêu',    description: 'Theo dõi Chỉ tiêu KPI',          icon: Activity,     color: '#C62828', bgColor: '#FEF2F2', path: '/kpi/dashboard' },
  { id: 'payroll',      label: 'Bảng lương',             description: 'Lương và KPI',                   icon: BarChart3,    color: '#2E7D32', bgColor: '#F0FDF4', path: '/payroll' },
]

export function QuickActionsWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()

  const handleAction = (path: string) => {
    navigate(path)
    setIsOpen(false)
  }

  return (
    <div className="fixed bottom-6 right-6 z-40" data-testid="quick-actions-widget">
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-[#E2E8F0] mb-2">
          {/* Header: red/yellow branding */}
          <div className="bg-gradient-to-r from-[#C62828] to-[#A91D1D] text-white px-5 py-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
                <Zap size={18} className="text-[#F4F269]" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Thao tác nhanh</h3>
                <p className="text-xs text-white/70">Truy cập nhanh các chức năng</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors"
              data-testid="quick-actions-close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Actions list */}
          <div className="p-3 space-y-1 max-h-96 overflow-y-auto">
            {ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.id}
                  data-testid={`quick-action-${action.id}`}
                  onClick={() => handleAction(action.path)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-[#F8FAFC] rounded-xl transition-all group"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors group-hover:opacity-90"
                    style={{ backgroundColor: action.bgColor }}
                  >
                    <Icon size={18} style={{ color: action.color }} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-[#0F172A] group-hover:text-[#C62828] transition-colors">{action.label}</p>
                    <p className="text-xs text-[#64748B]">{action.description}</p>
                  </div>
                  <ArrowUpRight size={15} className="text-[#64748B] group-hover:text-[#C62828] transition-colors" />
                </button>
              )
            })}
          </div>

          <div className="px-4 py-2 bg-[#F8FAFC] border-t border-[#E2E8F0] rounded-b-2xl">
            <p className="text-xs text-[#64748B] text-center">
              Bấm vào để điều hướng nhanh
            </p>
          </div>
        </div>
      )}

      {/* FAB toggle button: red/green alternating with state */}
      <button
        data-testid="quick-actions-fab"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-xl hover:shadow-2xl flex items-center justify-center transition-all hover:scale-105 ${
          isOpen ? 'bg-[#64748B]' : 'bg-[#C62828]'
        } text-white`}
        title="Thao tác nhanh"
      >
        {isOpen ? <X size={22} /> : <Zap size={22} className="text-[#F4F269]" />}
      </button>
    </div>
  )
}
