# UI SPEC
Task ID: TASK-2026-001
Version: v1.0

## Web forms

### Login form
- Fields: `username`, `password`
- Validation:
  - username required, 3..50
  - password required, min 8
- States:
  - `empty`: submit disabled
  - `valid`: submit enabled
  - `submitting`: button loading
  - `success`: redirect by role
  - `error`: show auth error message
- Disabled conditions:
  - while submitting

### User management form
- Fields: `username`, `full_name`, `email`, `roles[]`, `unit_scopes[]`, `status`
- Validation:
  - required: username, full_name, roles
  - uniqueness: username/email
- States: empty/valid/submitting/success/error
- Disabled:
  - `Save` disabled if required fields missing

### Task create form
- Fields: `title`, `description`, `type`, `priority`, `deadline`, `location`, `assignees[]`, `attachments[]`
- Validation:
  - required: title, type, priority, deadline, assignees
  - deadline must be future datetime
- States:
  - empty, valid, submitting, success toast, error toast
- Disabled:
  - submit disabled when required fields invalid

### Leave approval form
- Fields: `decision`, `reason`
- Validation:
  - reason required when reject
- States: pending/submitting/success/error

### Payroll close form
- Fields: `period`, `confirm_lock`
- Validation:
  - attendance and KPI must be closed
- States: draft/calculating/review/approved/locked/error

## MilitianApp forms

### Check-in/check-out form
- Fields: `timestamp`, `lat`, `lng`, `accuracy`, `task_id?`
- Validation: GPS accuracy <= policy threshold
- States: ready/submitting/success/queued_offline/error
- Disabled: submit while location unavailable

### Leave request form
- Fields: `from_date`, `to_date`, `reason`, `attachments[]?`
- Validation: from <= to, reason required
- States: draft/submitting/success/error

### SOS form
- Fields: `severity`, `message`, `lat`, `lng`, `attachments[]?`
- Validation: severity + message required
- States: ready/submitting/success/queued_offline/error

## PoliceApp forms

### Task dispatch form
- Fields: same as Web task create with scope-limited assignees
- Validation: assign only users in authorized units
- States: draft/submitting/success/error

### Alert resolution form
- Fields: `resolution_note`, `status`
- Validation: note required when status=resolved
- States: open/in_progress/resolved/error

## DATA-TESTID MAP
| Element | Component | data-testid |
|---|---|---|
| Login username input | LoginForm | login-username |
| Login password input | LoginForm | login-password |
| Login submit button | LoginForm | login-submit |
| Forbidden page container | ForbiddenPage | forbidden-page |
| User role selector | UserManagementForm | role-select |
| Unit scope selector | UserManagementForm | scope-select |
| Save user button | UserManagementForm | user-save-btn |
| Create task button | TaskForm | task-create-btn |
| Assignee selector | TaskForm | task-assign-select |
| Update progress button | TaskDetail | task-progress-update |
| Check-in button | AttendanceScreen | attendance-checkin-btn |
| GPS accuracy badge | AttendanceScreen | gps-accuracy |
| Attendance status pill | AttendanceScreen | attendance-status |
| Leave submit button | LeaveForm | leave-submit-btn |
| Leave approve button | LeaveApproval | leave-approve-btn |
| Leave reject reason input | LeaveApproval | leave-reject-reason |
| SOS trigger button | SOSScreen | sos-trigger-btn |
| Alert list table | AlertsPage | alert-list |
| Resolve alert button | AlertDetail | alert-resolve-btn |
| Device enroll button | DeviceScreen | device-enroll-btn |
| Device list table | DeviceScreen | device-list-table |
| Revoke all sessions button | SessionScreen | session-revoke-all |
| Audit table | AuditPage | audit-log-table |
| Audit actor filter | AuditPage | audit-filter-actor |
| Audit action filter | AuditPage | audit-filter-action |
