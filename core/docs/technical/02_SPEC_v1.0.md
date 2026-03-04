# TECHNICAL SPEC v1.0
Task ID: TASK-2026-001
Date: 2026-03-04

## Platform baseline
- Shared core path: `C:/MMS/core`
- Shared API namespace: `mms_core`
- Database: PostgreSQL 18 (`localhost:5433`, DB `MMS_Core`)

## INPUT SCHEMA + VALIDATION

### Auth
- `username`: required, length 3..50
- `password`: required, length >= 8 (phase 1)
- Error: `Username or password is invalid`

### Militia profile
- `full_name`: required, length 1..100
- `cccd`: required, regex `^[0-9]{12}$`
- `dob`: required, must be valid date
- Error: `CCCD is invalid`

### Task
- `title`: required, length 1..100
- `type`: required enum
- `priority`: required enum (`urgent|high|medium|low`)
- `deadline`: required, must be >= server time
- Error: `Task deadline is invalid`

### Attendance
- `checkin_at`: required timestamp
- `location.lat/lng`: required
- `accuracy`: required, must be <= policy threshold
- Error: `GPS accuracy is not acceptable`

### Leave request
- `from_date`: required date
- `to_date`: required date
- `reason`: required, length 1..500
- Rule: `from_date <= to_date`
- Error: `Leave date range is invalid`

### Device
- `device_name`: required, length <= 50
- `device_fingerprint`: required, unique per device
- `platform`: enum (`web|android|ios`)
- Error: `Device payload is invalid`

## BUSINESS RULES
| BR | Condition | Logic | Output |
|---|---|---|---|
| BR-001 | Shared assets needed by multiple subsystems | Use shared layer under `C:/MMS/core` | Single source for contracts/libs |
| BR-002 | Any CRUD/update from Web/App | Persist in central backend + DB | Cross-system consistency |
| BR-003 | Protected operation requested | Validate role + unit scope | Allow or return 403 |
| BR-004 | Login/session request | Enforce auth + device/session checks | Secure session lifecycle |
| BR-005 | Task status update requested | Validate allowed state transition | Controlled lifecycle |
| BR-006 | Attendance event submitted | Validate geo-time-accuracy policy | Accept or reject with reason |
| BR-007 | Leave decision made | Require approver + reason + timestamp | Traceable approval history |
| BR-008 | KPI/payroll processing | Use period-based versioned rules | Deterministic period results |
| BR-009 | Alert-worthy event emitted | Publish event to notification pipeline | Near real-time notifications |
| BR-010 | Payroll close requested | Require approved attendance + KPI data | Close period or block |
| BR-011 | Device/session management action | Enforce ownership and security policy | Enrollment/revoke/compliance |
| BR-012 | Search/export executed | Enforce scope filters | Return authorized dataset only |
| BR-013 | Sensitive action committed | Write immutable audit entry | Full traceability |
| BR-014 | Offline retry or repeated submit | Use idempotency keys | No duplicate side-effects |

## BOUNDARY VALUES (BUILD MUST TEST)
- `username.length = 3` accepted, `2` rejected
- `cccd.length = 12` accepted, non-12 rejected
- `task.title.length = 100` accepted, `101` rejected
- `device count = max limit` accepted, `max+1` blocked until replacement
- `attendance accuracy = threshold` accepted, `threshold+0.01` rejected
- `leave from_date == to_date` accepted (single-day leave)

## ERROR MATRIX
| Code | When | Action | User sees |
|---|---|---|---|
| E001 | Invalid format/schema | TERMINATE request | "Input data is invalid" |
| E002 | Missing required field | SKIP and return field error | "Please fill required field" |
| E003 | Auth/session invalid | TERMINATE and re-auth required | "Session expired, please sign in again" |
| E004 | Permission/scope denied | TERMINATE | "You do not have permission" |
| E005 | Conflict/system/offline error | RETRY policy or fail safely | "System is retrying, please wait" |
