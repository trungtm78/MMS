// The caller's notification preferences: GET /settings/notifications, and PUT on every toggle
// with the whole nested body. The switch moves at once; a failed save puts it back.
import { useId } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bell, Send } from 'lucide-react'
import { toast } from 'sonner'
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  categoryPath,
  channelPath,
  settingsApi,
  settingsKeys,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferencesView,
} from '@/api/settings'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError } from '@/lib/api-error'
import { formatVietnamDateTime } from '@/lib/vietnamDateTime'

type PreferenceTexts = { label: TranslationKey; description: TranslationKey }

const CHANNEL_TEXTS = {
  inApp: { label: 'settings.notifications.channels.inApp.label', description: 'settings.notifications.channels.inApp.description' },
  push: { label: 'settings.notifications.channels.push.label', description: 'settings.notifications.channels.push.description' },
  email: { label: 'settings.notifications.channels.email.label', description: 'settings.notifications.channels.email.description' },
} as const satisfies Record<NotificationChannel, PreferenceTexts>

const CATEGORY_TEXTS = {
  taskAssigned: { label: 'settings.notifications.categories.taskAssigned.label', description: 'settings.notifications.categories.taskAssigned.description' },
  taskOverdue: { label: 'settings.notifications.categories.taskOverdue.label', description: 'settings.notifications.categories.taskOverdue.description' },
  attendanceReminder: { label: 'settings.notifications.categories.attendanceReminder.label', description: 'settings.notifications.categories.attendanceReminder.description' },
  leaveApproval: { label: 'settings.notifications.categories.leaveApproval.label', description: 'settings.notifications.categories.leaveApproval.description' },
  systemAnnouncements: { label: 'settings.notifications.categories.systemAnnouncements.label', description: 'settings.notifications.categories.systemAnnouncements.description' },
  sosAlerts: { label: 'settings.notifications.categories.sosAlerts.label', description: 'settings.notifications.categories.sosAlerts.description' },
} as const satisfies Record<NotificationCategory, PreferenceTexts>

// Saves run one after another (mutation scope), each carrying every change made before it
const SAVE_MUTATION_KEY = ['settings', 'notifications', 'save'] as const

interface SaveVariables {
  next: NotificationPreferencesView
  /** What was shown before this change, restored when it fails */
  previous: NotificationPreferencesView
}

export function SettingsNotificationsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const channelsHeadingId = useId()
  const categoriesHeadingId = useId()

  const query = useQuery({ queryKey: settingsKeys.notifications, queryFn: settingsApi.notificationPreferences })

  // Only the last save still running decides what the cache shows; earlier answers would
  // undo the changes queued after them
  const isLastSave = () => queryClient.isMutating({ mutationKey: SAVE_MUTATION_KEY }) <= 1

  const mutation = useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    scope: { id: SAVE_MUTATION_KEY.join('/') },
    mutationFn: ({ next }: SaveVariables) => settingsApi.updateNotificationPreferences(next, next.mandatory),
    onSuccess: (saved) => {
      if (isLastSave()) queryClient.setQueryData(settingsKeys.notifications, saved)
      toast.success(t('settings.notifications.save.success'))
    },
    onError: (err, { previous }) => {
      if (isLastSave()) {
        queryClient.setQueryData(settingsKeys.notifications, previous)
        void queryClient.invalidateQueries({ queryKey: settingsKeys.notifications })
      }
      toast.error(
        describeApiError(err, {
          // 400 notification_preference_mandatory is in errors.settings.notifications
          scope: 'settings.notifications',
          fallback: 'settings.notifications.save.error',
        }),
      )
    },
  })

  // The next state is built from what is shown now, including changes still being saved
  const save = (change: (view: NotificationPreferencesView) => NotificationPreferencesView) => {
    const previous = queryClient.getQueryData<NotificationPreferencesView>(settingsKeys.notifications)
    if (!previous) return
    const next = change(previous)
    queryClient.setQueryData(settingsKeys.notifications, next)
    mutation.mutate({ next, previous })
  }

  const toggleChannel = (channel: NotificationChannel) =>
    save((view) => ({ ...view, channels: { ...view.channels, [channel]: !view.channels[channel] } }))

  const toggleCategory = (category: NotificationCategory) =>
    save((view) => ({ ...view, categories: { ...view.categories, [category]: !view.categories[category] } }))

  const preferences = query.data

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="settings-notifications-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">{t('settings.notifications.page.heading')}</h1>
        <p className="text-sm text-[#64748B] mt-1">{t('settings.notifications.page.description')}</p>
        {preferences && (
          <p className="text-xs text-[#64748B] mt-1">
            {preferences.isDefault
              ? t('settings.notifications.page.defaults')
              : t('settings.notifications.page.updatedAt', { time: formatVietnamDateTime(preferences.updatedAt) })}
          </p>
        )}
      </div>

      {query.isLoading && <div className="text-center text-[#64748B] py-8 text-sm">{t('common.states.loading')}</div>}

      {query.isError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#C62828]">
          {t('settings.notifications.page.loadError')}
        </p>
      )}

      {preferences && (
        <>
          <div
            role="group"
            aria-labelledby={channelsHeadingId}
            className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden divide-y divide-[#E2E8F0]"
          >
            <div className="px-6 py-4 flex items-center gap-3 bg-[#F8FAFC]">
              <Send size={18} className="text-[#C62828]" aria-hidden="true" />
              <p id={channelsHeadingId} className="text-sm font-semibold text-[#0F172A]">
                {t('settings.notifications.channels.heading')}
              </p>
            </div>
            {NOTIFICATION_CHANNELS.map((channel) => (
              <PreferenceSwitch
                key={channel}
                testId={`toggle-${channel}`}
                label={t(CHANNEL_TEXTS[channel].label)}
                description={t(CHANNEL_TEXTS[channel].description)}
                checked={preferences.channels[channel]}
                mandatory={preferences.mandatory.includes(channelPath(channel))}
                onToggle={() => toggleChannel(channel)}
              />
            ))}
          </div>

          <div
            role="group"
            aria-labelledby={categoriesHeadingId}
            className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden divide-y divide-[#E2E8F0]"
          >
            <div className="px-6 py-4 flex items-center gap-3 bg-[#F8FAFC]">
              <Bell size={18} className="text-[#C62828]" aria-hidden="true" />
              <p id={categoriesHeadingId} className="text-sm font-semibold text-[#0F172A]">
                {t('settings.notifications.categories.heading')}
              </p>
            </div>
            {NOTIFICATION_CATEGORIES.map((category) => (
              <PreferenceSwitch
                key={category}
                testId={`toggle-${category}`}
                label={t(CATEGORY_TEXTS[category].label)}
                description={t(CATEGORY_TEXTS[category].description)}
                checked={preferences.categories[category]}
                mandatory={preferences.mandatory.includes(categoryPath(category))}
                onToggle={() => toggleCategory(category)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface PreferenceSwitchProps {
  testId: string
  label: string
  description: string
  checked: boolean
  /** Cannot be turned off: shown on and disabled */
  mandatory: boolean
  onToggle: () => void
}

function PreferenceSwitch({ testId, label, description, checked, mandatory, onToggle }: PreferenceSwitchProps) {
  const { t } = useTranslation()
  const on = mandatory || checked
  return (
    <div className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-[#F8FAFC] transition-colors">
      <div>
        <p className="text-sm font-medium text-[#0F172A] flex items-center gap-2">
          {label}
          {mandatory && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-[#475569]">
              {t('settings.notifications.mandatory.badge')}
            </span>
          )}
        </p>
        <p className="text-xs text-[#64748B] mt-0.5">{description}</p>
      </div>
      {/* Toggle styled with #C62828 when active */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={mandatory}
        onClick={onToggle}
        data-testid={testId}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${
          on ? 'bg-[#C62828]' : 'bg-[#E2E8F0]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
