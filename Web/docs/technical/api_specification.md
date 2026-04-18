# API SPECIFICATION — Smart Select Feature
Task ID: TASK-SS-2026-001 | Version: v1.0 | Date: 2026-03-08

Base URL: `http://localhost:3000/api/v1/mms_core`
Auth: `Authorization: Bearer <access_token>` (JWT, 15m expiry)
Content-Type: `application/json`

---

## MILITIA ENDPOINTS

### GET /militia/search
Search militia profiles for SmartSelect dropdown.

**Auth:** JWT required (any authenticated role)
**RBAC:** Results filtered by requester's unitScope (backend enforces)

**Query Parameters:**

| Param | Type | Required | Default | Constraint | Description |
|---|---|---|---|---|---|
| `q` | string | No | `""` | Max 100 chars | Search keyword (unaccent, ILIKE) |
| `unitScope` | string | No | null | Max 50 chars | Filter by unit.code (e.g. PHU_DINH_KP1) |
| `limit` | number | No | 20 | 1–50 | Max results to return |
| `page` | number | No | 1 | ≥ 1 | Page number |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid-militia-001",
      "militiaCode": "HCM-PHD-T12-0001",
      "fullName": "Nguyễn Văn An",
      "phone": "0909123456",
      "rank": "Dân quân thường trực",
      "status": "active",
      "unitCode": "PHU_DINH_KP1",
      "unitName": "Khu phố 1 - Phú Định"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

**Response 400 (limit > 50):**
```json
{ "code": "E001", "message": "limit must not be greater than 50", "statusCode": 400 }
```

**Response 401:**
```json
{ "code": "E004", "message": "missing_token", "statusCode": 401 }
```

---

### GET /militia/:id
Fetch single militia profile (used to load label for existing SmartSelect value).

**Auth:** JWT required
**Path Param:** `id` — UUID of militia profile

**Response 200:**
```json
{
  "id": "uuid-militia-001",
  "militiaCode": "HCM-PHD-T12-0001",
  "fullName": "Nguyễn Văn An",
  "phone": "0909123456",
  "rank": "Dân quân thường trực",
  "status": "active",
  "unitCode": "PHU_DINH_KP1",
  "unitName": "Khu phố 1 - Phú Định"
}
```

**Response 404:**
```json
{ "code": "E003", "message": "militia_not_found", "statusCode": 404 }
```

---

### POST /militia
Create a new militia profile (Quick-Create from SmartSelect).

**Auth:** JWT required | **RBAC:** role ≥ `office_staff`

**Request Body:**
```json
{
  "militiaCode": "HCM-PHD-T12-0004",
  "fullName": "Phạm Thị Dung",
  "cccd": "079095001004",
  "dob": "1999-04-12",
  "gender": "female",
  "phone": "0909123460",
  "address": "123 Đường ABC, KP1",
  "unitCode": "PHU_DINH_KP1",
  "position": "Dân quân thường trực",
  "rank": "Chiến sĩ",
  "joinDate": "2026-03-08",
  "status": "active"
}
```

**Validation:**
| Field | Required | Rules |
|---|---|---|
| `militiaCode` | Yes | Unique, max 50 chars |
| `fullName` | Yes | Max 255 chars |
| `cccd` | Yes | Unique, exactly 12 digits |
| `dob` | Yes | ISO date, must be in past |
| `gender` | No | enum: male/female/other |
| `phone` | No | Max 20 chars |
| `unitCode` | Yes | Must exist in units table |
| `joinDate` | Yes | ISO date |
| `status` | No | Default: active |

**Response 201:**
```json
{
  "id": "uuid-new-militia",
  "militiaCode": "HCM-PHD-T12-0004",
  "fullName": "Phạm Thị Dung",
  "phone": "0909123460",
  "rank": "Chiến sĩ",
  "status": "active",
  "unitCode": "PHU_DINH_KP1",
  "unitName": "Khu phố 1 - Phú Định"
}
```

**Response 409 (conflict):**
```json
{ "code": "E002", "message": "militia_code_or_cccd_exists", "statusCode": 409 }
```

**Response 403:**
```json
{ "code": "E004", "message": "insufficient_role", "statusCode": 403 }
```

---

## USERS ENDPOINTS

### GET /users/search
Search users for SmartSelect in admin screens.

**Auth:** JWT required | **RBAC:** `system_admin` only

**Query Parameters:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | string | No | `""` | Search username or full_name |
| `role` | string | No | null | Filter by role code |
| `limit` | number | No | 20 | Max 50 |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid-user-001",
      "username": "admin",
      "fullName": "Quản trị viên",
      "email": "admin@mms.vn",
      "phone": "0900000001",
      "role": "system_admin",
      "status": "active"
    }
  ],
  "total": 1
}
```

---

## TASKS ENDPOINTS

### POST /tasks
Create and assign a task to a militia member.

**Auth:** JWT required | **RBAC:** role ≥ `police_area`

**Request Body:**
```json
{
  "title": "Tuần tra khu vực KP1",
  "description": "Tuần tra từ 20h đến 22h",
  "assigneeId": "uuid-militia-profile",
  "priority": "high",
  "deadline": "2026-03-10T22:00:00.000Z"
}
```

**Validation:**
| Field | Required | Rules |
|---|---|---|
| `title` | Yes | 1–255 chars |
| `description` | No | Max 2000 chars |
| `assigneeId` | Yes | UUID of militia_profiles; militia must have user_id |
| `priority` | Yes | enum: urgent/high/medium/low |
| `deadline` | Yes | ISO datetime, must be ≥ now + 1 hour |

**Response 201:**
```json
{
  "id": "uuid-task-001",
  "code": "TASK-2026-001",
  "title": "Tuần tra khu vực KP1",
  "description": "Tuần tra từ 20h đến 22h",
  "assigneeId": "uuid-militia-profile",
  "assigneeName": "Nguyễn Văn An",
  "priority": "high",
  "status": "assigned",
  "deadline": "2026-03-10T22:00:00.000Z",
  "createdAt": "2026-03-08T10:00:00.000Z"
}
```

**Response 400 (militia has no user account):**
```json
{ "code": "E001", "message": "militia_no_user_account", "statusCode": 400 }
```

---

### GET /tasks
List tasks for current user scope.

**Auth:** JWT required
**Query:** `status?`, `assigneeId?`, `page?=1`, `limit?=20`

**Response 200:** `PaginatedResponse<Task>`

---

## ATTENDANCE ENDPOINTS

### GET /attendance/periods
List all attendance periods (preloaded for SmartSelect).

**Auth:** JWT required (office_staff minimum)

**Response 200:**
```json
[
  {
    "id": "uuid-period-001",
    "month": 3,
    "year": 2026,
    "status": "open",
    "closedBy": null,
    "closedAt": null,
    "createdAt": "2026-03-01T00:00:00.000Z"
  }
]
```

---

### POST /attendance
Create an attendance record.

**Auth:** JWT required | **RBAC:** role ≥ `office_staff`

**Request Body:**
```json
{
  "militiaId": "uuid-militia-profile",
  "periodId": "uuid-period-001",
  "date": "2026-03-08",
  "status": "checked_in",
  "checkIn": "08:00",
  "checkOut": "17:30"
}
```

**Response 201:**
```json
{
  "id": "uuid-attendance-001",
  "militiaId": "uuid-militia-profile",
  "militiaName": "Nguyễn Văn An",
  "date": "2026-03-08",
  "status": "checked_in",
  "checkIn": "08:00",
  "checkOut": "17:30",
  "createdAt": "2026-03-08T08:05:00.000Z"
}
```

**Response 409 (duplicate date):**
```json
{ "code": "E002", "message": "attendance_record_exists", "statusCode": 409 }
```

---

## AUTH ENDPOINTS (existing — reference)

### POST /auth/login
**No auth required**
```json
Request:  { "username": "admin", "password": "123456", "rememberMe": false }
Response: { "user": { "id", "username", "fullName", "role", "unitScope", ... }, "tokens": { "accessToken", "refreshToken", "expiresIn" } }
```

### POST /auth/refresh
```json
Request:  { "refreshToken": "..." }
Response: { "accessToken", "refreshToken", "expiresIn" }
```

### POST /auth/logout
**Auth required**
Response: `204 No Content`

### GET /auth/me
**Auth required**
Response: `User object with role + unitScope`

---

## COMMON ERROR RESPONSES

All errors follow `HttpExceptionFilter` envelope:

```json
{
  "code": "E001",
  "message": "human-readable error",
  "statusCode": 400,
  "timestamp": "2026-03-08T10:00:00.000Z",
  "path": "/api/v1/mms_core/militia/search"
}
```

| HTTP | code | Scenario |
|---|---|---|
| 400 | E001 | Validation fail, invalid params |
| 401 | E004 | Missing or invalid JWT |
| 403 | E004 | Insufficient role |
| 404 | E003 | Resource not found |
| 409 | E002 | Unique constraint violation |
| 500 | E005 | Unhandled server error |
