// Centralized navigation types
// NOTE: This file only defines types/constants to avoid duplicated string literals.
// Logic remains unchanged.

export type ScreenId =
  'activity-log' | 'approvals' | 'attendance-report' | 'chitieu-dashboard' | 'custom-report' | 'dashboard' | 'documentation' | 'gps-tracking' | 'militia-list' | 'militia-profile' | 'militia-search' | 'new-task' | 'payroll' | 'payroll-calculate' | 'payroll-list' | 'recruitment' | 'reports' | 'settings-chitieu' | 'settings-notifications' | 'settings-password' | 'settings-profile' | 'settings-system' | 'system-config' | 'task-list' | 'task-report' | 'timesheet' | 'user-management';

export const DEFAULT_SCREEN: ScreenId = 'dashboard';
