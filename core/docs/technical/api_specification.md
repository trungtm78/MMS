# API SPECIFICATION
Task ID: TASK-2026-001
Version: v1.0
Base URL: `/api/v1/mms_core`

## Standards
- Auth: Bearer JWT unless endpoint is Public.
- Content-Type: `application/json`.
- Error envelope:
  - `code`: error code (`E001..E005`)
  - `message`: human-readable text
  - `details`: optional field-level info

## Endpoints

### 1) Login
- Method: `POST`
- URL: `/api/v1/mms_core/auth/login`
- Auth: Public
- Request:
```json
{
  "username": "string",
  "password": "string",
  "device": {"name": "string", "fingerprint": "string", "platform": "android"}
}
```
- 200:
```json
{
  "access_token": "jwt",
  "refresh_token": "jwt",
  "user": {"id": "u1", "role": "dqtv", "scope": ["unit:kp1"]}
}
```
- 400/401/403/500: standard error envelope

### 2) Refresh token
- Method: `POST`
- URL: `/api/v1/mms_core/auth/refresh`
- Auth: Refresh token
- 200: new access/refresh pair
- 401: invalid or revoked refresh token

### 3) Users management
- Method: `GET|POST|PATCH`
- URL: `/api/v1/mms_core/users` and `/api/v1/mms_core/users/:id`
- Auth: Admin
- Request (POST sample):
```json
{
  "username": "string",
  "full_name": "string",
  "email": "string",
  "roles": ["police_area"],
  "unit_scopes": ["unit:kp2"]
}
```
- 200/201: user payload
- 400/401/403/404/500: standard error envelope

### 4) Militia profiles
- Method: `GET|POST|PATCH`
- URL: `/api/v1/mms_core/militias` and `/api/v1/mms_core/militias/:id`
- Auth: Admin/Police/Office (scoped)
- Request (POST sample):
```json
{
  "full_name": "string",
  "cccd": "012345678901",
  "dob": "1998-01-01",
  "unit_id": "kp1",
  "status": "active"
}
```

### 5) Tasks
- Method: `POST|GET|PATCH`
- URL: `/api/v1/mms_core/tasks`, `/api/v1/mms_core/tasks/:id`
- Auth: Admin/Police (create/update), scoped read for authorized roles
- Request (POST sample):
```json
{
  "title": "Patrol night shift",
  "type": "patrol",
  "priority": "high",
  "deadline": "2026-03-05T20:00:00Z",
  "assignees": ["u_dqtv_001", "u_dqtv_002"],
  "location": {"lat": 10.77, "lng": 106.70}
}
```

### 6) Task progress update
- Method: `POST`
- URL: `/api/v1/mms_core/tasks/:id/progress`
- Auth: Assigned militia user
- Request:
```json
{
  "progress": 60,
  "note": "Patrol completed sector A",
  "evidence_files": ["file_123"]
}
```

### 7) Attendance check-in/check-out
- Method: `POST`
- URL: `/api/v1/mms_core/attendance/check-in`, `/api/v1/mms_core/attendance/check-out`
- Auth: Militia user
- Request:
```json
{
  "task_id": "t_001",
  "timestamp": "2026-03-04T06:45:00Z",
  "location": {"lat": 10.77, "lng": 106.70, "accuracy": 12.4},
  "source": "mobile"
}
```

### 8) Leave requests
- Method: `POST|GET|PATCH`
- URL: `/api/v1/mms_core/leave-requests`, `/api/v1/mms_core/leave-requests/:id/decision`
- Auth: Militia submit; Police/Admin approve
- Request (submit):
```json
{
  "from_date": "2026-03-20",
  "to_date": "2026-03-21",
  "reason": "Family issue"
}
```

### 9) SOS incidents
- Method: `POST`
- URL: `/api/v1/mms_core/incidents/sos`
- Auth: Militia user
- Request:
```json
{
  "severity": "high",
  "message": "Emergency support needed",
  "location": {"lat": 10.77, "lng": 106.70}
}
```

### 10) Device enrollment
- Method: `POST`
- URL: `/api/v1/mms_core/devices/enroll`
- Auth: JWT
- Request:
```json
{
  "device_name": "Samsung A55",
  "fingerprint": "sha256:...",
  "platform": "android",
  "app_version": "1.0.0",
  "os_version": "14"
}
```

### 11) Session revoke
- Method: `DELETE`
- URL: `/api/v1/mms_core/sessions/:id`
- Auth: JWT (owner) or Admin

### 12) Audit logs
- Method: `GET`
- URL: `/api/v1/mms_core/audit-logs`
- Auth: Admin/Auditor
- Query: `actor`, `action`, `entity_type`, `from`, `to`, `page`, `size`
