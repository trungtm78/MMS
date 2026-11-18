// Every user-visible text of the web app, Vietnamese only. One locale file per module
// (src/i18n/locales/vi/<module>.json) mounted under its module name, so a key reads
// module.screen.action.state (e.g. rewards.discipline.appeal.error). errors.json is the one
// table that turns backend error codes into texts (errors.<scope>.<code>).
import attendance from './locales/vi/attendance.json'
import audit from './locales/vi/audit.json'
import auth from './locales/vi/auth.json'
import chat from './locales/vi/chat.json'
import common from './locales/vi/common.json'
import dashboard from './locales/vi/dashboard.json'
import devices from './locales/vi/devices.json'
import docs from './locales/vi/docs.json'
import documents from './locales/vi/documents.json'
import errors from './locales/vi/errors.json'
import exemptions from './locales/vi/exemptions.json'
import gps from './locales/vi/gps.json'
import kpi from './locales/vi/kpi.json'
import layout from './locales/vi/layout.json'
import leave from './locales/vi/leave.json'
import militia from './locales/vi/militia.json'
import navigation from './locales/vi/navigation.json'
import notifications from './locales/vi/notifications.json'
import organization from './locales/vi/organization.json'
import payroll from './locales/vi/payroll.json'
import recruitment from './locales/vi/recruitment.json'
import reports from './locales/vi/reports.json'
import rewards from './locales/vi/rewards.json'
import roles from './locales/vi/roles.json'
import settings from './locales/vi/settings.json'
import sos from './locales/vi/sos.json'
import tasks from './locales/vi/tasks.json'
import training from './locales/vi/training.json'
import ui from './locales/vi/ui.json'
import users from './locales/vi/users.json'
import weapons from './locales/vi/weapons.json'

export const defaultNS = 'translation' as const

export const resources = {
  vi: {
    translation: {
      attendance,
      audit,
      auth,
      chat,
      common,
      dashboard,
      devices,
      docs,
      documents,
      errors,
      exemptions,
      gps,
      kpi,
      layout,
      leave,
      militia,
      navigation,
      notifications,
      organization,
      payroll,
      recruitment,
      reports,
      rewards,
      roles,
      settings,
      sos,
      tasks,
      training,
      ui,
      users,
      weapons,
    },
  },
} as const
