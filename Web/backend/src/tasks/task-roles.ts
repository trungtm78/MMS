// Roles reading tasks beyond their own (GET /tasks, GET /tasks/report, task attachments): CA
// officers are limited to their assigned DQTV, other staff to their unit. Kept apart from
// TasksService so the files layer can apply the task read rule without importing the service.
export const TASK_STAFF_ROLES: ReadonlySet<string> = new Set([
  'system_admin',
  'office_staff',
  'ca_officer',
]);
