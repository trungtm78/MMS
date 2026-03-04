// Permission & Access Control Utilities
// Hệ Thống Quản Lý Dân Quân Tự Vệ - UBND Phường Phú Định

import { UserRole, hasMenuAccess, getAccessibleScreens } from '@/config/menuConfig';
import { User } from '@/data/mockData';

// =========================================
// PERMISSION CHECKS
// =========================================

/**
 * Check if user can access a specific screen
 */
export function canAccessScreen(user: User | null, screen: string): boolean {
  if (!user) return false;
  
  const accessibleScreens = getAccessibleScreens(user.role);
  return accessibleScreens.includes(screen);
}

/**
 * Check if user can perform specific action
 */
export function canPerformAction(user: User | null, action: string): boolean {
  if (!user) return false;
  
  const permissions: Record<UserRole, string[]> = {
    system_admin: [
      'create_user',
      'edit_user',
      'delete_user',
      'view_all_data',
      'edit_all_data',
      'configure_system',
      'view_logs',
      'assign_tasks',
      'approve_requests',
      'manage_permissions',
      'export_data',
      'import_data',
    ],
    ubnd_leader: [
      'view_all_data',
      'assign_tasks',
      'approve_requests',
      'export_data',
      'view_reports',
    ],
    police_ward: [
      'create_personnel',
      'edit_personnel',
      'view_all_data',
      'assign_tasks',
      'approve_requests',
      'export_data',
      'import_data',
      'calculate_salary',
      'configure_chitieu',
    ],
    police_area: [
      'view_district_data',
      'assign_district_tasks',
      'approve_district_requests',
      'view_district_reports',
    ],
    office_staff: [
      'create_personnel',
      'edit_personnel',
      'view_all_data',
      'export_data',
      'import_data',
      'calculate_salary',
      'input_attendance',
    ],
    dqtv: [
      'view_own_data',
      'create_request',
      'update_task_progress',
      'checkin_checkout',
    ],
  };
  
  return permissions[user.role]?.includes(action) || false;
}

// =========================================
// DATA SCOPE FILTERS
// =========================================

/**
 * Filter data based on user's scope
 * CA Khu vực chỉ thấy data của khu phố mình quản lý
 */
export function filterDataByScope<T extends { districtId?: number }>(
  user: User | null,
  data: T[]
): T[] {
  if (!user) return [];
  
  // DQTV only sees their own data (filtered elsewhere)
  if (user.role === 'dqtv') {
    return [];
  }
  
  // CA Khu vực only sees data from their district
  if (user.role === 'police_area' && user.districtId) {
    return data.filter(item => item.districtId === user.districtId);
  }
  
  // All other roles see all data
  return data;
}

/**
 * Check if user can view specific DQTV
 */
export function canViewDQTV(user: User | null, dqtvDistrictId: number): boolean {
  if (!user) return false;
  
  // System admin, leaders, ward police, staff can view all
  if (['system_admin', 'ubnd_leader', 'police_ward', 'office_staff'].includes(user.role)) {
    return true;
  }
  
  // Area police can only view their district
  if (user.role === 'police_area') {
    return user.districtId === dqtvDistrictId;
  }
  
  return false;
}

/**
 * Check if user can edit specific DQTV
 */
export function canEditDQTV(user: User | null, dqtvDistrictId: number): boolean {
  if (!user) return false;
  
  // Only specific roles can edit
  if (!['system_admin', 'police_ward', 'office_staff'].includes(user.role)) {
    return false;
  }
  
  return true;
}

/**
 * Check if user can delete specific DQTV
 */
export function canDeleteDQTV(user: User | null): boolean {
  if (!user) return false;
  
  // Only system admin and ward police can delete
  return ['system_admin', 'police_ward'].includes(user.role);
}

// =========================================
// TASK ASSIGNMENT PERMISSIONS
// =========================================

/**
 * Get list of districts user can assign tasks to
 */
export function getAssignableDistricts(user: User | null): number[] {
  if (!user) return [];
  
  // Ward police and leaders can assign to all districts
  if (['system_admin', 'ubnd_leader', 'police_ward'].includes(user.role)) {
    return [1, 2, 3, 4, 5, 6]; // All 6 districts
  }
  
  // Area police can only assign to their district
  if (user.role === 'police_area' && user.districtId) {
    return [user.districtId];
  }
  
  return [];
}

/**
 * Check if user can assign task to specific district
 */
export function canAssignToDistrict(user: User | null, districtId: number): boolean {
  const assignableDistricts = getAssignableDistricts(user);
  return assignableDistricts.includes(districtId);
}

// =========================================
// APPROVAL PERMISSIONS
// =========================================

/**
 * Check if user can approve leave requests
 */
export function canApproveLeaveRequest(user: User | null, requestDistrictId: number): boolean {
  if (!user) return false;
  
  // Ward police and leaders can approve all
  if (['system_admin', 'ubnd_leader', 'police_ward'].includes(user.role)) {
    return true;
  }
  
  // Area police can approve for their district
  if (user.role === 'police_area' && user.districtId) {
    return user.districtId === requestDistrictId;
  }
  
  return false;
}

/**
 * Check if user can approve salary
 */
export function canApproveSalary(user: User | null): boolean {
  if (!user) return false;
  
  return ['system_admin', 'ubnd_leader'].includes(user.role);
}

// =========================================
// REPORT PERMISSIONS
// =========================================

/**
 * Check if user can view custom reports
 */
export function canViewCustomReports(user: User | null): boolean {
  if (!user) return false;
  
  return ['system_admin', 'ubnd_leader', 'police_ward', 'office_staff'].includes(user.role);
}

/**
 * Check if user can export data
 */
export function canExportData(user: User | null): boolean {
  if (!user) return false;
  
  return ['system_admin', 'ubnd_leader', 'police_ward', 'office_staff'].includes(user.role);
}

// =========================================
// UI HELPERS
// =========================================

/**
 * Get allowed actions for a specific context
 */
export function getAllowedActions(user: User | null, context: string): string[] {
  if (!user) return [];
  
  const actionMap: Record<string, Record<UserRole, string[]>> = {
    personnel: {
      system_admin: ['view', 'create', 'edit', 'delete', 'export', 'import'],
      ubnd_leader: ['view', 'export'],
      police_ward: ['view', 'create', 'edit', 'export', 'import'],
      police_area: ['view', 'export'],
      office_staff: ['view', 'create', 'edit', 'export', 'import'],
      dqtv: [],
    },
    tasks: {
      system_admin: ['view', 'create', 'edit', 'delete', 'assign'],
      ubnd_leader: ['view', 'create', 'assign'],
      police_ward: ['view', 'create', 'edit', 'assign'],
      police_area: ['view', 'create', 'assign'],
      office_staff: [],
      dqtv: ['view', 'update_progress'],
    },
    approvals: {
      system_admin: ['view', 'approve', 'reject'],
      ubnd_leader: ['view', 'approve', 'reject'],
      police_ward: ['view', 'approve', 'reject'],
      police_area: ['view', 'approve', 'reject'],
      office_staff: ['view'],
      dqtv: ['create', 'view_own'],
    },
  };
  
  return actionMap[context]?.[user.role] || [];
}

/**
 * Check if button should be visible
 */
export function shouldShowButton(user: User | null, button: string): boolean {
  if (!user) return false;
  
  const buttonPermissions: Record<string, UserRole[]> = {
    'add-personnel': ['system_admin', 'police_ward', 'office_staff'],
    'delete-personnel': ['system_admin', 'police_ward'],
    'assign-task': ['system_admin', 'ubnd_leader', 'police_ward', 'police_area'],
    'approve-leave': ['system_admin', 'ubnd_leader', 'police_ward', 'police_area'],
    'calculate-salary': ['system_admin', 'police_ward', 'office_staff'],
    'configure-system': ['system_admin'],
    'manage-users': ['system_admin'],
    'view-logs': ['system_admin'],
  };
  
  return buttonPermissions[button]?.includes(user.role) || false;
}

// =========================================
// NAVIGATION GUARDS
// =========================================

/**
 * Get redirect path when user doesn't have permission
 */
export function getUnauthorizedRedirect(user: User | null): string {
  if (!user) return '/login';
  
  // DQTV sees different dashboard
  if (user.role === 'dqtv') {
    return '/my-tasks';
  }
  
  return '/dashboard';
}

/**
 * Validate navigation attempt
 */
export function validateNavigation(
  user: User | null,
  targetScreen: string
): { allowed: boolean; redirect?: string } {
  if (!user) {
    return { allowed: false, redirect: '/login' };
  }
  
  const canAccess = canAccessScreen(user, targetScreen);
  
  if (!canAccess) {
    return { allowed: false, redirect: getUnauthorizedRedirect(user) };
  }
  
  return { allowed: true };
}