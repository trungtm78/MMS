import type { ScreenId } from '@/app/types/navigation';

// Menu Types & Configuration
// Hệ Thống Quản Lý Dân Quân Tự Vệ - UBND Phường Phú Định

export type UserRole = 
  | 'system_admin' 
  | 'ubnd_leader' 
  | 'police_ward' 
  | 'police_area' 
  | 'office_staff' 
  | 'dqtv';

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  screen?: ScreenId; // For navigation without path
  children?: MenuItem[];
  roles: UserRole[]; // Các roles được phép thấy menu này
  badge?: number; // Notification count
}

// =========================================
// FULL MENU CONFIGURATION
// =========================================

export const FULL_MENU: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    screen: 'dashboard',
    roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff', 'dqtv'],
  },
  
  // ========== QUẢN LÝ NHÂN SỰ ==========
  {
    id: 'personnel',
    label: 'Quản Lý Nhân Sự',
    icon: 'Users',
    roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff'],
    children: [
      {
        id: 'personnel-list',
        label: 'Danh sách DQTV',
        icon: 'List',
        screen: 'militia-list',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff'],
      },
      {
        id: 'personnel-search',
        label: 'Tìm kiếm DQTV',
        icon: 'Search',
        screen: 'militia-search',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff'],
      },
      {
        id: 'permissions',
        label: 'Quản lý người dùng',
        icon: 'Shield',
        screen: 'user-management',
        roles: ['system_admin'], // CHỈ ADMIN
      },
    ],
  },

  // ========== QUẢN LÝ GIAO VIỆC (Management) ==========
  {
    id: 'tasks',
    label: 'Quản Lý Giao Việc',
    icon: 'ClipboardList',
    roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area'],
    children: [
      {
        id: 'tasks-create',
        label: 'Giao việc mới',
        icon: 'Plus',
        screen: 'new-task',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area'],
      },
      {
        id: 'tasks-list',
        label: 'Danh sách nhiệm vụ',
        icon: 'List',
        screen: 'task-list',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area'],
      },
    ],
  },

  // ========== NHIỆM VỤ CỦA TÔI (DQTV only) ==========
  {
    id: 'my-tasks',
    label: 'Nhiệm Vụ Của Tôi',
    icon: 'ClipboardCheck',
    roles: ['dqtv'], // CHỈ DQTV
    children: [
      {
        id: 'my-tasks-active',
        label: 'Đang thực hiện',
        icon: 'Activity',
        screen: 'task-list',
        roles: ['dqtv'],
      },
      {
        id: 'my-tasks-history',
        label: 'Lịch sử nhiệm vụ',
        icon: 'History',
        screen: 'task-list',
        roles: ['dqtv'],
      },
    ],
  },

  // ========== TUYỂN DỤNG ==========
  {
    id: 'recruitment',
    label: 'Tuyển Dụng',
    icon: 'Target',
    screen: 'recruitment',
    roles: ['system_admin', 'ubnd_leader', 'police_ward', 'office_staff'],
  },

  // ========== CHẤM CÔNG & LƯƠNG ==========
  {
    id: 'attendance',
    label: 'Chấm Công & Lương',
    icon: 'DollarSign',
    roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff', 'dqtv'],
    children: [
      {
        id: 'attendance-sheet',
        label: 'Bảng chấm công',
        icon: 'Calendar',
        screen: 'timesheet',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff'],
      },
      {
        id: 'attendance-calculate',
        label: 'Tính lương',
        icon: 'Calculator',
        screen: 'payroll-calculate',
        roles: ['system_admin', 'police_ward', 'office_staff'],
      },
      {
        id: 'payroll',
        label: 'Bảng lương',
        icon: 'Receipt',
        screen: 'payroll-list',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff', 'dqtv'],
      },
      {
        id: 'attendance-my',
        label: 'Chấm công của tôi',
        icon: 'Clock',
        screen: 'timesheet',
        roles: ['dqtv'], // CHỈ DQTV
      },
    ],
  },

  // ========== TRACKING GPS ==========
  {
    id: 'gps',
    label: 'Tracking GPS',
    icon: 'MapPin',
    screen: 'gps-tracking',
    roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff'],
  },

  // ========== BÁO CÁO & THỐNG KÊ ==========
  {
    id: 'reports',
    label: 'Báo Cáo & Thống Kê',
    icon: 'BarChart3',
    roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff', 'dqtv'],
    children: [
      {
        id: 'reports-chitieu',
        label: 'Dashboard Chỉ tiêu',
        icon: 'TrendingUp',
        screen: 'chitieu-dashboard',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff'],
      },
      {
        id: 'reports-attendance',
        label: 'Báo cáo chấm công',
        icon: 'FileText',
        screen: 'attendance-report',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff'],
      },
      {
        id: 'reports-tasks',
        label: 'Báo cáo nhiệm vụ',
        icon: 'FileCheck',
        screen: 'task-report',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff'],
      },
      {
        id: 'reports-custom',
        label: 'Báo cáo tùy chỉnh',
        icon: 'FileSpreadsheet',
        screen: 'custom-report',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'office_staff'],
      },
      {
        id: 'reports-my-chitieu',
        label: 'Chỉ tiêu của tôi',
        icon: 'Award',
        screen: 'chitieu-dashboard',
        roles: ['dqtv'], // CHỈ DQTV
      },
    ],
  },

  // ========== DUYỆT ĐƠN TỪ (Management) ==========
  {
    id: 'approvals',
    label: 'Duyệt Đơn Từ',
    icon: 'CheckSquare',
    screen: 'approvals',
    roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff'],
  },

  // ========== ĐƠN CỦA TÔI (DQTV only) ==========
  {
    id: 'my-requests',
    label: 'Đơn Của Tôi',
    icon: 'FileText',
    roles: ['dqtv'], // CHỈ DQTV
    children: [
      {
        id: 'my-requests-create',
        label: 'Đăng ký nghỉ phép',
        icon: 'FilePlus',
        screen: 'approvals',
        roles: ['dqtv'],
      },
      {
        id: 'my-requests-history',
        label: 'Lịch sử đơn từ',
        icon: 'History',
        screen: 'approvals',
        roles: ['dqtv'],
      },
    ],
  },

  // ========== CÀI ĐẶT ==========
  {
    id: 'settings',
    label: 'Cài Đặt',
    icon: 'Settings',
    roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff', 'dqtv'],
    children: [
      {
        id: 'settings-profile',
        label: 'Thông tin cá nhân',
        icon: 'User',
        screen: 'settings-profile',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff', 'dqtv'],
      },
      {
        id: 'settings-password',
        label: 'Đổi mật khẩu',
        icon: 'Lock',
        screen: 'settings-password',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff', 'dqtv'],
      },
      {
        id: 'settings-system',
        label: 'Cấu hình hệ thống',
        icon: 'Wrench',
        screen: 'settings-system',
        roles: ['system_admin'], // CHỈ ADMIN
      },
      {
        id: 'settings-chitieu',
        label: 'Cấu hình Chỉ tiêu',
        icon: 'Target',
        screen: 'settings-chitieu',
        roles: ['system_admin', 'ubnd_leader', 'police_ward'],
      },
      {
        id: 'settings-notifications',
        label: 'Cấu hình thông báo',
        icon: 'Bell',
        screen: 'settings-notifications',
        roles: ['system_admin', 'ubnd_leader', 'police_ward', 'police_area', 'office_staff', 'dqtv'],
      },
      {
        id: 'settings-activity-log',
        label: 'Nhật ký hoạt động',
        icon: 'Activity',
        screen: 'activity-log',
        roles: ['system_admin'], // CHỈ ADMIN
      },
    ],
  },

  // ========== TÀI LIỆU HỆ THỐNG ==========
  {
    id: 'documentation',
    label: 'Tài Liệu Hệ Thống',
    icon: 'BookOpen',
    screen: 'documentation',
    roles: ['system_admin'], // CHỈ ADMIN
  },
];

// =========================================
// MENU FILTERING UTILITIES
// =========================================

/**
 * Filter menu items based on user role
 * CHỈ RENDER menu items mà user CÓ QUYỀN
 */
export function getMenuForRole(userRole: UserRole): MenuItem[] {
  return filterMenuByRole(FULL_MENU, userRole);
}

function filterMenuByRole(menu: MenuItem[], userRole: UserRole): MenuItem[] {
  return menu
    .filter(item => item.roles.includes(userRole))
    .map(item => {
      if (item.children && item.children.length > 0) {
        const filteredChildren = filterMenuByRole(item.children, userRole);
        return {
          ...item,
          children: filteredChildren.length > 0 ? filteredChildren : undefined,
        };
      }
      return item;
    })
    .filter(item => !item.children || item.children.length > 0); // Remove empty parents
}

/**
 * Get menu item by id
 */
export function getMenuItemById(id: string, menu: MenuItem[] = FULL_MENU): MenuItem | null {
  for (const item of menu) {
    if (item.id === id) return item;
    if (item.children) {
      const found = getMenuItemById(id, item.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Check if user has access to a specific menu item
 */
export function hasMenuAccess(userRole: UserRole, menuId: string): boolean {
  const menuItem = getMenuItemById(menuId);
  return menuItem ? menuItem.roles.includes(userRole) : false;
}

/**
 * Get all accessible screens for a role
 */
export function getAccessibleScreens(userRole: UserRole): string[] {
  const menu = getMenuForRole(userRole);
  const screens: string[] = [];
  
  function extractScreens(items: MenuItem[]) {
    for (const item of items) {
      if (item.screen) screens.push(item.screen);
      if (item.children) extractScreens(item.children);
    }
  }
  
  extractScreens(menu);
  return [...new Set(screens)]; // Remove duplicates
}

// =========================================
// PERMISSION HELPERS
// =========================================

export const ROLE_HIERARCHY = {
  system_admin: 100,
  ubnd_leader: 80,
  police_ward: 70,
  police_area: 50,
  office_staff: 40,
  dqtv: 10,
} as const;

export function getRoleLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role] || 0;
}

export function canAccessRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return getRoleLevel(userRole) >= getRoleLevel(requiredRole);
}

// =========================================
// ROLE LABELS
// =========================================

export const ROLE_LABELS: Record<UserRole, string> = {
  system_admin: 'Quản trị viên',
  ubnd_leader: 'Lãnh đạo UBND',
  police_ward: 'Công An Phường',
  police_area: 'Công An Khu Vực',
  office_staff: 'Nhân viên văn phòng',
  dqtv: 'Dân Quân Tự Vệ',
};

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role] || role;
}