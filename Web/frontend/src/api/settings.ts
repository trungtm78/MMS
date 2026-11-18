// Settings — Web/backend/src/settings/settings.controller.ts, settings.dto.ts,
// kpi-targets.service.ts and notification-preferences.service.ts
import client from './client'

// ─── KPI targets ──────────────────────────────────────────────────────────────

export const EVALUATION_PERIODS = ['monthly', 'quarterly', 'yearly'] as const
export type EvaluationPeriod = (typeof EVALUATION_PERIODS)[number]

/** The five targets: exactly the body of PUT /settings/kpi-targets (KpiTargetsDto) */
export interface KpiTargets {
  minAttendanceDays: number
  minTasksCompleted: number
  maxOverdueTasks: number
  minTrainingHours: number
  evaluationPeriod: EvaluationPeriod
}

export type NumericKpiTarget = Exclude<keyof KpiTargets, 'evaluationPeriod'>

/** Whole numbers within these bounds (KPI_TARGET_RANGES, KpiTargetsDto, migration 029) */
export const KPI_TARGET_RANGES: Readonly<Record<NumericKpiTarget, { min: number; max: number }>> = {
  minAttendanceDays: { min: 1, max: 31 },
  minTasksCompleted: { min: 0, max: 100 },
  maxOverdueTasks: { min: 0, max: 20 },
  minTrainingHours: { min: 0, max: 500 },
}

/** GET /settings/kpi-targets and the PUT answer (KpiTargetsView) */
export interface KpiTargetsView extends KpiTargets {
  /** First business day the version applies; null for the defaults */
  effectiveFrom: string | null
  updatedAt: string | null
  updatedBy: { id: string; fullName: string | null } | null
  isDefault: boolean
}

/** Only the five targets: the global ValidationPipe refuses any other property with 400 */
export function kpiTargetsBody(targets: KpiTargets): KpiTargets {
  return {
    minAttendanceDays: targets.minAttendanceDays,
    minTasksCompleted: targets.minTasksCompleted,
    maxOverdueTasks: targets.maxOverdueTasks,
    minTrainingHours: targets.minTrainingHours,
    evaluationPeriod: targets.evaluationPeriod,
  }
}

// ─── Notification preferences ─────────────────────────────────────────────────

export const NOTIFICATION_CHANNELS = ['inApp', 'push', 'email'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export const NOTIFICATION_CATEGORIES = [
  'taskAssigned',
  'taskOverdue',
  'attendanceReminder',
  'leaveApproval',
  'systemAnnouncements',
  'sosAlerts',
] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

/** Exactly the body of PUT /settings/notifications (NotificationPreferencesDto) */
export interface NotificationPreferences {
  channels: Record<NotificationChannel, boolean>
  categories: Record<NotificationCategory, boolean>
}

/** GET /settings/notifications and the PUT answer (NotificationPreferencesView) */
export interface NotificationPreferencesView extends NotificationPreferences {
  /** Preferences the caller cannot turn off, as "channels.inApp" / "categories.sosAlerts" */
  mandatory: string[]
  updatedAt: string | null
  isDefault: boolean
}

export const channelPath = (channel: NotificationChannel) => `channels.${channel}`
export const categoryPath = (category: NotificationCategory) => `categories.${category}`

/**
 * The nested body with every channel and category and nothing else, each mandatory preference on
 * (turning one off is a 400 notification_preference_mandatory)
 */
export function notificationPreferencesBody(
  preferences: NotificationPreferences,
  mandatory: readonly string[],
): NotificationPreferences {
  const channels = {} as Record<NotificationChannel, boolean>
  for (const channel of NOTIFICATION_CHANNELS) {
    channels[channel] = mandatory.includes(channelPath(channel)) || preferences.channels[channel] === true
  }
  const categories = {} as Record<NotificationCategory, boolean>
  for (const category of NOTIFICATION_CATEGORIES) {
    categories[category] = mandatory.includes(categoryPath(category)) || preferences.categories[category] === true
  }
  return { channels, categories }
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export const settingsKeys = {
  kpiTargets: ['settings', 'kpi-targets'] as const,
  notifications: ['settings', 'notifications'] as const,
}

export const settingsApi = {
  // @Roles(...KPI_TARGET_READER_ROLES)
  kpiTargets: async (): Promise<KpiTargetsView> => {
    const response = await client.get<KpiTargetsView>('/settings/kpi-targets')
    return response.data
  },

  // @Roles('system_admin'): a new version effective today; 400 invalid_kpi_targets
  updateKpiTargets: async (targets: KpiTargets): Promise<KpiTargetsView> => {
    const response = await client.put<KpiTargetsView>('/settings/kpi-targets', kpiTargetsBody(targets))
    return response.data
  },

  // Every role: the caller's own preferences
  notificationPreferences: async (): Promise<NotificationPreferencesView> => {
    const response = await client.get<NotificationPreferencesView>('/settings/notifications')
    return response.data
  },

  updateNotificationPreferences: async (
    preferences: NotificationPreferences,
    mandatory: readonly string[],
  ): Promise<NotificationPreferencesView> => {
    const response = await client.put<NotificationPreferencesView>(
      '/settings/notifications',
      notificationPreferencesBody(preferences, mandatory),
    )
    return response.data
  },
}
