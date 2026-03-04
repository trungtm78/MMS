import { useEffect, useState } from 'react';
import type { ScreenId } from '@/app/types/navigation';
import { Zap, X, Plus, UserPlus, FileText, MapPin, ArrowUpRight, Calendar, ClipboardList, UserCheck, BarChart3, Settings, Clock, FileCheck, Activity } from 'lucide-react';

interface QuickActionsProps {
  // Optional to keep backward-compatibility when QuickActions is rendered without props.
  onNavigate?: (screen: ScreenId) => void;
}

// Định nghĩa tất cả các chức năng có thể có
const allActions = [
  { 
    id: 'new-task', 
    label: 'Giao việc mới', 
    description: 'Tạo và giao nhiệm vụ mới', 
    icon: Plus, 
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    screen: 'new-task' 
  },
  { 
    id: 'militia-list', 
    label: 'Danh sách DQTV', 
    description: 'Quản lý nhân sự', 
    icon: UserPlus, 
    color: '#10B981',
    bgColor: '#ECFDF5',
    screen: 'militia-list' 
  },
  { 
    id: 'militia-search', 
    label: 'Tìm kiếm DQTV', 
    description: 'Tìm kiếm và lọc nhân sự', 
    icon: UserCheck, 
    color: '#06B6D4',
    bgColor: '#ECFEFF',
    screen: 'militia-search' 
  },
  { 
    id: 'task-list', 
    label: 'Danh sách công việc', 
    description: 'Xem và quản lý nhiệm vụ', 
    icon: ClipboardList, 
    color: '#6366F1',
    bgColor: '#EEF2FF',
    screen: 'task-list' 
  },
  { 
    id: 'reports', 
    label: 'Báo cáo & Thống kê', 
    description: 'Xuất báo cáo thống kê', 
    icon: BarChart3, 
    color: '#F59E0B',
    bgColor: '#FEF3C7',
    screen: 'reports' 
  },
  { 
    id: 'gps-tracking', 
    label: 'Tracking GPS', 
    description: 'Theo dõi vị trí real-time', 
    icon: MapPin, 
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
    screen: 'gps-tracking' 
  },
  { 
    id: 'timesheet', 
    label: 'Chấm công', 
    description: 'Quản lý chấm công', 
    icon: Clock, 
    color: '#14B8A6',
    bgColor: '#F0FDFA',
    screen: 'timesheet' 
  },
  { 
    id: 'approvals', 
    label: 'Duyệt đơn từ', 
    description: 'Phê duyệt đơn từ', 
    icon: FileCheck, 
    color: '#EC4899',
    bgColor: '#FCE7F3',
    screen: 'approvals' 
  },
  { 
    id: 'chitieu-dashboard', 
    label: 'Dashboard Chỉ tiêu', 
    description: 'Theo dõi Chỉ tiêu', 
    icon: Activity, 
    color: '#EF4444',
    bgColor: '#FEE2E2',
    screen: 'chitieu-dashboard' 
  },
  { 
    id: 'recruitment', 
    label: 'Tuyển dụng', 
    description: 'Quản lý tuyển dụng', 
    icon: UserPlus, 
    color: '#F97316',
    bgColor: '#FFEDD5',
    screen: 'recruitment' 
  },
];

export function QuickActions({ onNavigate }: QuickActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [quickActions, setQuickActions] = useState(allActions.slice(0, 4));

  // Load usage stats từ localStorage
  useEffect(() => {
    const loadTopActions = () => {
      try {
        const usageStats = JSON.parse(localStorage.getItem('screenUsageStats') || '{}');
        
        // Sắp xếp actions theo frequency
        const sortedActions = allActions
          .map(action => ({
            ...action,
            frequency: usageStats[action.screen] || 0
          }))
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 4);

        // Nếu chưa có data, dùng default
        if (Object.keys(usageStats).length === 0) {
          setQuickActions(allActions.slice(0, 4));
        } else {
          setQuickActions(sortedActions);
        }
      } catch (error) {
        console.error('Error loading usage stats:', error);
        setQuickActions(allActions.slice(0, 4));
      }
    };

    loadTopActions();
    
    // Reload khi mở panel để cập nhật realtime
    if (isOpen) {
      loadTopActions();
    }
  }, [isOpen]);

  const handleActionClick = (screen: ScreenId) => {
    onNavigate?.(screen);
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-4 left-4 md:bottom-6 md:left-6 z-40">
      {/* Quick Actions Panel */}
      {isOpen && (
        <div className="absolute bottom-16 md:bottom-20 left-0 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 mb-2 animate-slide-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#2E7D32] to-[#1B5E20] text-white px-5 py-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                <Zap size={20} className="text-[#2E7D32]" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Thao tác nhanh</h3>
                <p className="text-xs text-white/80">Truy cập nhanh các chức năng</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Actions List */}
          <div className="p-4 space-y-2">
            {quickActions.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => handleActionClick(action.screen)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-[#F8FAFC] rounded-xl transition-all hover:scale-[1.02] border border-transparent hover:border-[#E2E8F0] group"
                >
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: action.bgColor }}
                  >
                    <Icon size={22} style={{ color: action.color }} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-[#0F172A]">{action.label}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">{action.description}</p>
                  </div>
                  <ArrowUpRight size={18} className="text-[#64748B] group-hover:text-[#2E7D32] transition-colors" />
                </button>
              );
            })}
          </div>

          {/* Footer Tip */}
          <div className="px-5 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] rounded-b-2xl">
            <p className="text-xs text-[#64748B] text-center">
              💡 Tip: Sử dụng phím tắt <kbd className="px-1.5 py-0.5 bg-white border border-[#E2E8F0] rounded text-[10px] font-mono">Ctrl + K</kbd> để mở nhanh
            </p>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-[#2E7D32] to-[#1B5E20] text-white rounded-full shadow-xl hover:shadow-2xl flex items-center justify-center transition-all hover:scale-110 relative group"
        title="Thao tác nhanh"
      >
        {isOpen ? (
          <X size={24} className="md:w-7 md:h-7" />
        ) : (
          <Zap size={24} className="md:w-7 md:h-7" />
        )}
        
        {/* Tooltip */}
        <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-[#0F172A] text-white px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
          Thao tác nhanh
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]"></div>
        </div>
      </button>
    </div>
  );
}