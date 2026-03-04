import { useState } from 'react';
import { ChevronRight, Filter, CheckCircle2, Clock, AlertCircle, MessageSquare, FileText, TrendingUp, Bell, Trash2 } from 'lucide-react';

interface Notification {
  id: string;
  type: 'task' | 'attendance' | 'alert' | 'info' | 'message' | 'kpi' | 'leave';
  title: string;
  message: string;
  time: string;
  isRead: boolean;
  actionUrl?: string;
  urgent?: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'task',
    title: 'Nhiệm vụ mới',
    message: 'Bạn được giao nhiệm vụ mới: Tuần tra khu vực chợ Bến Thành',
    time: '2 giờ trước',
    isRead: false,
  },
  {
    id: '2',
    type: 'alert',
    title: 'Yêu cầu xác thực vị trí',
    message: 'Vui lòng xác thực vị trí trong 5 phút',
    time: '3 giờ trước',
    isRead: false,
    urgent: true,
  },
  {
    id: '3',
    type: 'leave',
    title: 'Đơn xin nghỉ đã được phê duyệt',
    message: 'Đơn xin nghỉ phép của bạn từ ngày 28/01 đến 30/01 đã được phê duyệt',
    time: '5 giờ trước',
    isRead: true,
  },
  {
    id: '4',
    type: 'attendance',
    title: 'Nhắc nhở điểm danh',
    message: 'Đã đến giờ điểm danh sáng',
    time: 'Hôm qua, 08:00',
    isRead: true,
  },
  {
    id: '5',
    type: 'kpi',
    title: 'Chỉ tiêu tháng mới',
    message: 'Điểm chỉ tiêu tháng 12: 92.4 (+2.3 so với tháng trước)',
    time: 'Hôm qua, 20:30',
    isRead: true,
  },
  {
    id: '6',
    type: 'info',
    title: 'Thông báo hệ thống',
    message: 'Hệ thống sẽ bảo trì từ 22:00 - 23:00 hôm nay',
    time: '2 ngày trước',
    isRead: true,
  },
  {
    id: '7',
    type: 'message',
    title: 'Tin nhắn từ Trung úy Võ Văn Tân',
    message: 'Nhớ tham gia họp định kỳ vào lúc 14:00 ngày mai',
    time: '3 ngày trước',
    isRead: true,
  },
];

interface NotificationsProps {
  onClose: () => void;
}

export function Notifications({ onClose }: NotificationsProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'task' | 'attendance' | 'system'>('all');
  const [notifications, setNotifications] = useState(mockNotifications);

  const getNotificationIcon = (type: Notification['type']) => {
    const icons = {
      task: { icon: FileText, color: 'text-[#3B82F6]', bg: 'bg-[#3B82F6]/10' },
      attendance: { icon: CheckCircle2, color: 'text-[#10B981]', bg: 'bg-[#10B981]/10' },
      alert: { icon: AlertCircle, color: 'text-[#EF4444]', bg: 'bg-[#EF4444]/10' },
      info: { icon: Bell, color: 'text-[#3B82F6]', bg: 'bg-[#3B82F6]/10' },
      message: { icon: MessageSquare, color: 'text-[#8B5CF6]', bg: 'bg-[#8B5CF6]/10' },
      kpi: { icon: TrendingUp, color: 'text-[#10B981]', bg: 'bg-[#10B981]/10' },
      leave: { icon: FileText, color: 'text-[#F59E0B]', bg: 'bg-[#F59E0B]/10' },
    };
    return icons[type];
  };

  const getFilteredNotifications = () => {
    if (activeTab === 'all') return notifications;
    if (activeTab === 'task') return notifications.filter((n) => n.type === 'task');
    if (activeTab === 'attendance') return notifications.filter((n) => n.type === 'attendance');
    if (activeTab === 'system') return notifications.filter((n) => ['info', 'alert'].includes(n.type));
    return notifications;
  };

  const getTabCount = (tab: typeof activeTab) => {
    if (tab === 'all') return notifications.filter((n) => !n.isRead).length;
    if (tab === 'task') return notifications.filter((n) => n.type === 'task' && !n.isRead).length;
    if (tab === 'attendance') return notifications.filter((n) => n.type === 'attendance' && !n.isRead).length;
    if (tab === 'system') return notifications.filter((n) => ['info', 'alert'].includes(n.type) && !n.isRead).length;
    return 0;
  };

  const markAsRead = (id: string) => {
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(notifications.filter((n) => n.id !== id));
  };

  const filteredNotifications = getFilteredNotifications();
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] z-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-[#366092] text-white px-4 py-3 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Thông Báo</h1>
            <p className="text-xs text-white/80">
              {unreadCount > 0 ? `${unreadCount} tin chưa đọc` : 'Không có tin mới'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs bg-white/20 px-3 py-1.5 rounded-lg hover:bg-white/30 transition-colors"
            >
              Đọc hết
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 overflow-x-auto px-4 mt-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'all' ? 'border-[#366092] text-[#366092]' : 'border-transparent text-[#64748B]'
          }`}
        >
          Tất cả {getTabCount('all') > 0 && `(${getTabCount('all')})`}
        </button>
        <button
          onClick={() => setActiveTab('task')}
          className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'task' ? 'border-[#366092] text-[#366092]' : 'border-transparent text-[#64748B]'
          }`}
        >
          Nhiệm vụ {getTabCount('task') > 0 && `(${getTabCount('task')})`}
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'attendance' ? 'border-[#366092] text-[#366092]' : 'border-transparent text-[#64748B]'
          }`}
        >
          Chấm công {getTabCount('attendance') > 0 && `(${getTabCount('attendance')})`}
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'system' ? 'border-[#366092] text-[#366092]' : 'border-transparent text-[#64748B]'
          }`}
        >
          Hệ thống {getTabCount('system') > 0 && `(${getTabCount('system')})`}
        </button>
      </div>

      {/* Notification List */}
      <div className="p-4 space-y-3 pb-20">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-16 h-16 text-[#64748B] mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-[#0F172A] mb-2">Không có thông báo</h3>
            <p className="text-sm text-[#64748B]">Bạn đã xem hết thông báo</p>
          </div>
        ) : (
          filteredNotifications.map((notification) => {
            const iconData = getNotificationIcon(notification.type);
            const Icon = iconData.icon;

            return (
              <div
                key={notification.id}
                className={`relative bg-white rounded-xl p-4 shadow-sm transition-all ${
                  !notification.isRead ? 'border-l-4 border-[#3B82F6]' : ''
                } ${notification.urgent ? 'ring-2 ring-[#EF4444] ring-opacity-50' : ''}`}
              >
                {/* Swipe indicator */}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-5 h-5 text-[#EF4444]" />
                </div>

                <button
                  onClick={() => markAsRead(notification.id)}
                  className="w-full text-left"
                >
                  <div className="flex gap-3 items-start">
                    {/* Unread Dot */}
                    {!notification.isRead && (
                      <div className="w-2 h-2 bg-[#3B82F6] rounded-full mt-2 flex-shrink-0"></div>
                    )}

                    {/* Icon */}
                    <div className={`w-10 h-10 ${iconData.bg} rounded-lg flex items-center justify-center flex-shrink-0 ${!notification.isRead ? '' : 'ml-5'}`}>
                      <Icon className={`w-5 h-5 ${iconData.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className={`font-semibold text-sm ${!notification.isRead ? 'text-[#0F172A]' : 'text-[#64748B]'}`}>
                          {notification.title}
                          {notification.urgent && (
                            <span className="ml-2 px-2 py-0.5 bg-[#EF4444] text-white text-xs rounded-full">
                              Khẩn cấp
                            </span>
                          )}
                        </h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-[#64748B]" />
                        </button>
                      </div>
                      <p className={`text-sm line-clamp-2 mb-2 ${!notification.isRead ? 'text-[#0F172A]' : 'text-[#64748B]'}`}>
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#64748B]">{notification.time}</span>
                        {notification.actionUrl && (
                          <button className="text-xs text-[#366092] font-medium">
                            Xem chi tiết →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}