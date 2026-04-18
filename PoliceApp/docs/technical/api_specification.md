# API SPECIFICATION — PoliceApp
Task ID: TASK-2026-002 | Version: v1.0 | Date: 2026-03-10

Base URL (BFF): `http://localhost:3004/api/v1/mms_core`
Core URL: `http://localhost:3001/api/v1/mms_core`
Auth: Bearer JWT (access token) trong header `Authorization: Bearer <token>`

---

## AUTH — DÙNG NGUYÊN CORE (không thêm mới)

### POST /auth/login
Đăng nhập bằng username/password.

**Request:**
```json
{ "username": "ca001", "password": "123456" }
```

**Response 200 — Không có MFA:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": { "id": "uuid", "username": "ca001", "fullName": "Trung úy Võ Văn Tân", "email": "ca001@mms.vn" }
  }
}
```

**Response 200 — MFA bắt buộc:**
```json
{ "success": true, "data": { "requiresMfa": true, "tempToken": "eyJ...", "user": {...} } }
```

**Response 200 — Cần setup MFA:**
```json
{ "success": true, "data": { "requiresMfaSetup": true, "tempToken": "eyJ...", "user": {...} } }
```

**Response 400:** `{ "message": "Sai tên đăng nhập hoặc mật khẩu" }`

---

### POST /auth/verify-mfa
Xác thực OTP 6 số sau khi login.

**Request:**
```json
{ "tempToken": "eyJ...", "code": "123456" }
```

**Response 200:**
```json
{ "success": true, "data": { "accessToken": "eyJ...", "refreshToken": "eyJ...", "user": {...} } }
```

**Response 401:** `{ "message": "Mã OTP không hợp lệ hoặc đã hết hạn" }`

---

### POST /auth/setup-mfa
Khởi tạo MFA — lấy QR code và recovery codes.
Auth: `Bearer <tempToken>`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "secret": "BASE32SECRET",
    "otpauthUrl": "otpauth://totp/PoliceApp:ca001?secret=...",
    "recoveryCodes": ["abc123", "def456", "..."]
  }
}
```

---

### POST /auth/setup-mfa/confirm
Xác nhận OTP đầu tiên sau khi scan QR.

**Request:**
```json
{ "tempToken": "eyJ...", "code": "123456" }
```

**Response 200:** (same as verify-mfa)

---

### POST /auth/verify-recovery
Xác thực bằng recovery code.

**Request:**
```json
{ "tempToken": "eyJ...", "recoveryCode": "abc123def" }
```

**Response 200:** (same as verify-mfa)
**Response 401:** `{ "message": "Mã khôi phục không hợp lệ hoặc đã được sử dụng" }`

---

### POST /auth/refresh
Refresh access token.

**Request:**
```json
{ "refreshToken": "eyJ..." }
```

**Response 200:**
```json
{ "success": true, "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." } }
```

**Response 401:** `{ "message": "Token không hợp lệ hoặc đã hết hạn" }`

---

### POST /auth/logout
Auth: Bearer

**Response 200:** `{ "success": true, "data": { "message": "Đăng xuất thành công" } }`

---

## USERS

### GET /users/me
Lấy thông tin user hiện tại. Auth: Bearer

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "ca001",
    "fullName": "Trung úy Võ Văn Tân",
    "email": "ca001@mms.vn",
    "phone": "0901234567",
    "avatarUrl": null,
    "status": "active",
    "roles": ["police_area"],
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-03-10T00:00:00Z"
  }
}
```

---

### PATCH /users/me
Cập nhật thông tin. Auth: Bearer

**Request:**
```json
{ "fullName": "Tên mới", "email": "new@mms.vn", "phone": "0901234567" }
```

**Response 200:** (same as GET /users/me)

---

### GET /users/me/militia-profile
Lấy profile DQTV của user hiện tại. Auth: Bearer + role militia

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "militiaCode": "HCM-PHD-T12-0001",
    "fullName": "Nguyễn Văn An",
    "cccd": "079095001001",
    "dob": "1995-05-15",
    "gender": "male",
    "phone": "0909123456",
    "address": "123 Đường ABC, KP1",
    "unitId": "uuid",
    "unitName": "Khu phố 1 - Phú Định",
    "position": "Dân quân thường trực",
    "rank": null,
    "joinDate": "2022-10-01",
    "status": "active"
  }
}
```

---

### GET /users/me/police-profile
Lấy profile CA của user hiện tại. Auth: Bearer + role police_area
**[CẦN THÊM VÀO CORE]**

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "badgeNo": "CA-KV-001",
    "fullName": "Trung úy Võ Văn Tân",
    "rank": "Trung úy",
    "position": "Công an khu vực",
    "unitId": "uuid",
    "unitName": "Phường Phú Định",
    "appointmentDate": "2020-06-01",
    "status": "active"
  }
}
```

---

### GET /users?role=militia&unitId=:unitId&search=:q&status=:status
Danh sách DQTV cho CA xem. Auth: Bearer + permission militia:view
**[CẦN THÊM VÀO CORE]**

**Query params:**
| Param | Type | Required | Description |
|---|---|---|---|
| role | string | optional | filter='militia' |
| unitId | UUID | optional | filter by unit |
| search | string | optional | tìm theo tên/mã |
| status | string | optional | 'active','inactive' |
| page | int | optional | default=1 |
| limit | int | optional | default=20 |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "fullName": "Nguyễn Văn An",
      "militiaCode": "HCM-PHD-T12-0001",
      "phone": "0909123456",
      "status": "active",
      "unitName": "Khu phố 1",
      "position": "Dân quân thường trực",
      "kpiScore": 87.5,
      "gpsStatus": "online",
      "lastSeenAt": "2026-03-10T08:30:00Z"
    }
  ],
  "meta": { "total": 15, "page": 1, "limit": 20 }
}
```

---

### GET /users/:id/militia-profile
Profile chi tiết 1 DQTV. Auth: Bearer + permission militia:view
**[CẦN THÊM VÀO CORE]**

**Response 200:** (same as GET /users/me/militia-profile)

---

## TASKS

### GET /tasks
Danh sách tasks. Auth: Bearer
- CA: xem tất cả task trong unit
- DQTV: chỉ xem task được giao (Core filter by assignee_id tự động theo role)

**Query params:**
| Param | Type | Description |
|---|---|---|
| status | string | pending/assigned/in_progress/completed/cancelled/overdue |
| type | string | patrol/guard/inspection/support/training/admin/other |
| priority | string | urgent/high/medium/low |
| from | ISO date | filter deadline từ |
| to | ISO date | filter deadline đến |
| page | int | default=1 |
| limit | int | default=20 |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "code": "NV-202603-0001",
      "title": "Tuần tra khu phố 1",
      "description": "...",
      "type": "patrol",
      "priority": "high",
      "status": "assigned",
      "deadline": "2026-03-11T17:00:00Z",
      "locationName": "Khu phố 1, Phú Định",
      "locationLat": 10.8231,
      "locationLng": 106.6297,
      "createdBy": "uuid",
      "assignments": [
        {
          "id": "uuid",
          "assigneeId": "uuid",
          "assigneeName": "Nguyễn Văn An",
          "assignedByName": "Trung úy Võ Văn Tân",
          "status": "assigned",
          "progress": 0,
          "assignedAt": "2026-03-10T08:00:00Z"
        }
      ]
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 20 }
}
```

---

### POST /tasks
Tạo nhiệm vụ mới. Auth: Bearer + permission tasks:create (CA only)

**Request:**
```json
{
  "title": "Tuần tra khu phố 1",
  "description": "Tuần tra từ 18h-22h",
  "type": "patrol",
  "priority": "high",
  "deadline": "2026-03-11T22:00:00Z",
  "location": {
    "name": "Khu phố 1, Phú Định",
    "lat": 10.8231,
    "lng": 106.6297
  },
  "assigneeIds": ["uuid1", "uuid2"]
}
```

**Response 201:** (Task object đầy đủ)
**Response 403:** `{ "message": "Không có quyền thực hiện thao tác này" }`
**Response 400:** `{ "message": "Validation error", "details": {...} }`

---

### GET /tasks/:id
Chi tiết 1 task. Auth: Bearer

**Response 200:** (Task object đầy đủ như trên)
**Response 404:** `{ "message": "Không tìm thấy nhiệm vụ" }`

---

### POST /tasks/:id/accept
DQTV tiếp nhận task. Auth: Bearer

**Response 200:** (Task object updated)
**Response 404:** `{ "message": "Không tìm thấy nhiệm vụ hoặc bạn không được phân công" }`

---

### POST /tasks/:id/progress
DQTV cập nhật tiến độ. Auth: Bearer

**Request:**
```json
{ "progress": 50, "note": "Đã hoàn thành nửa tuyến đường", "location": {"lat": 10.8231, "lng": 106.6297} }
```

**Response 200:** (Task object updated)

---

### POST /tasks/:id/report
DQTV nộp báo cáo hoàn thành task. Auth: Bearer

**Request:**
```json
{ "content": "Đã hoàn thành tuần tra, không phát hiện bất thường" }
```

**Response 200:** (Task object, status=completed)

---

## ATTENDANCE

### POST /attendance/check-in
DQTV check-in GPS. Auth: Bearer + role militia

**Request:**
```json
{
  "location": { "lat": 10.8231, "lng": 106.6297, "accuracy": 5.2 },
  "source": "mobile",
  "taskId": "uuid (optional)"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "workDate": "2026-03-10",
    "checkinAt": "2026-03-10T07:45:00Z",
    "checkinLat": 10.8231,
    "checkinLng": 106.6297,
    "status": "checked_in",
    "source": "mobile"
  }
}
```

**Response 400:** `{ "message": "Bạn đã điểm danh hôm nay rồi" }`

---

### POST /attendance/check-out
DQTV check-out. Auth: Bearer + role militia

**Request:**
```json
{ "location": { "lat": 10.8231, "lng": 106.6297, "accuracy": 4.5 } }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "checkoutAt": "2026-03-10T17:30:00Z",
    "workHours": 9.75,
    "status": "checked_out"
  }
}
```

---

### GET /attendance/today
Lấy bản ghi chấm công hôm nay. Auth: Bearer + role militia

**Response 200:** (AttendanceRecord hoặc null nếu chưa check-in)

---

### GET /attendance/history
Lịch sử chấm công. Auth: Bearer + role militia

**Query:** `page`, `limit`, `from` (date), `to` (date)

**Response 200:** `{ "data": [AttendanceRecord], "meta": { "total", "page", "limit" } }`

---

### GET /attendance/stats
Thống kê chấm công tháng. Auth: Bearer + role militia

**Query:** `year`, `month`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalDays": 20,
    "presentDays": 18,
    "lateDays": 2,
    "earlyLeaveDays": 0,
    "absentDays": 2,
    "workHours": 162.5,
    "onTimeRate": 88.9
  }
}
```

---

## LEAVE REQUESTS

### GET /leave-requests
Danh sách đơn nghỉ. Auth: Bearer
- CA (có leave:approve): xem đơn của tất cả DQTV trong unit
- DQTV: xem đơn của mình

**Query:** `status` (pending/approved/rejected/cancelled), `page`, `limit`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "code": "LEAVE-202603-001",
      "requesterId": "uuid",
      "requesterName": "Nguyễn Văn An",
      "leaveType": { "code": "PAID", "name": "Nghỉ phép có lương" },
      "fromDate": "2026-03-15",
      "toDate": "2026-03-16",
      "totalDays": 2,
      "reason": "Việc gia đình",
      "status": "pending",
      "createdAt": "2026-03-10T08:00:00Z"
    }
  ]
}
```

---

### POST /leave-requests/:id/decision
CA duyệt/từ chối đơn. Auth: Bearer + permission leave:approve

**Request:**
```json
{ "action": "approved", "reason": "Đồng ý cho nghỉ" }
```
hoặc
```json
{ "action": "rejected", "reason": "Đang trong đợt cao điểm tuần tra" }
```

**Response 200:** (LeaveRequest object updated)
**Response 400:** `{ "message": "Không thể xử lý đơn này" }`
**Response 403:** `{ "message": "Không có quyền thực hiện thao tác này" }`

---

## GPS / LOCATION

### POST /gps/update
DQTV gửi vị trí GPS. Auth: Bearer + role militia
**[CẦN THÊM VÀO CORE]**

**Request:**
```json
{
  "lat": 10.8231,
  "lng": 106.6297,
  "accuracy": 5.2,
  "speed": 1.4,
  "heading": 270.0,
  "battery": 85
}
```

**Response 200:**
```json
{ "success": true, "data": { "updated": true, "timestamp": "2026-03-10T08:30:00Z" } }
```

Core sau khi upsert `gps_latest` sẽ emit Socket.IO event `location_update` đến tất cả CA đang connect.

---

### GET /gps/team
CA xem snapshot vị trí tất cả DQTV. Auth: Bearer + permission gps:view
**[CẦN THÊM VÀO CORE]**

**Query:** `unitId` (optional), `status` (online/offline/all, default=all)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "userId": "uuid",
      "fullName": "Nguyễn Văn An",
      "militiaCode": "HCM-PHD-T12-0001",
      "lat": 10.8231,
      "lng": 106.6297,
      "accuracy": 5.2,
      "speed": 1.4,
      "battery": 85,
      "status": "online",
      "lastSeenAt": "2026-03-10T08:30:00Z",
      "currentTask": {
        "id": "uuid",
        "title": "Tuần tra khu phố 1",
        "type": "patrol"
      }
    }
  ]
}
```

---

## ALERTS

### GET /alerts
CA xem danh sách cảnh báo. Auth: Bearer + permission alerts:manage
**[CẦN THÊM VÀO CORE — dùng bảng alerts đã có trong migration 007]**

**Query:** `status` (active/acknowledged/resolved/all), `category`, `severity`, `page`, `limit`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "category": "attendance",
      "severity": "urgent",
      "title": "Vắng mặt không phép",
      "message": "Nguyễn Văn An chưa check-in lúc 09:00",
      "targetUserId": "uuid",
      "targetUserName": "Nguyễn Văn An",
      "status": "active",
      "isRead": false,
      "createdAt": "2026-03-10T09:00:00Z"
    }
  ],
  "meta": { "total": 5, "unreadCount": 3, "page": 1, "limit": 20 }
}
```

---

### POST /alerts/:id/resolve
CA xử lý cảnh báo. Auth: Bearer + permission alerts:manage
**[CẦN THÊM VÀO CORE]**

**Request:**
```json
{ "note": "Đã liên hệ DQTV, xác nhận có lý do" }
```

**Response 200:**
```json
{ "success": true, "data": { "id": "uuid", "status": "resolved", "resolvedAt": "2026-03-10T09:30:00Z" } }
```

---

## REPORTS

### GET /reports/team
CA xem báo cáo tổng hợp đội. Auth: Bearer + permission reports:team
**[CẦN THÊM VÀO CORE]**

**Query:** `year`, `month`, `unitId`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "period": { "year": 2026, "month": 3 },
    "taskStats": {
      "totalAssigned": 45,
      "completed": 38,
      "onTime": 35,
      "overdue": 3,
      "completionRate": 84.4,
      "trend": [
        { "week": 1, "assigned": 12, "completed": 10, "overdue": 1 },
        { "week": 2, "assigned": 11, "completed": 9, "overdue": 1 },
        { "week": 3, "assigned": 13, "completed": 11, "overdue": 1 },
        { "week": 4, "assigned": 9, "completed": 8, "overdue": 0 }
      ]
    },
    "attendanceStats": {
      "totalWorkdays": 22,
      "avgPresentRate": 91.2,
      "avgOnTimeRate": 88.5,
      "breakdown": [
        { "week": 1, "onTime": 8, "late": 1, "absent": 1 },
        { "week": 2, "onTime": 7, "late": 2, "absent": 1 }
      ]
    },
    "kpiStats": {
      "avgScore": 83.7,
      "distribution": [
        { "range": "90-100", "count": 3 },
        { "range": "80-89", "count": 7 },
        { "range": "70-79", "count": 3 },
        { "range": "0-69", "count": 2 }
      ],
      "top5": [
        { "rank": 1, "fullName": "Nguyễn Văn An", "militiaCode": "HCM-PHD-T12-0001", "score": 94.5 },
        { "rank": 2, "fullName": "Trần Thị Bình", "militiaCode": "HCM-PHD-T12-0002", "score": 91.2 }
      ],
      "needsAttention": [
        { "fullName": "Lê Văn C", "militiaCode": "HCM-PHD-T12-0003", "score": 65.0, "reason": "Vắng mặt nhiều" }
      ]
    }
  }
}
```

---

### POST /reports
DQTV gửi báo cáo công việc. Auth: Bearer + role militia
**[CẦN THÊM VÀO CORE + migration 010]**

**Request:**
```json
{
  "reportType": "daily",
  "content": "Hôm nay tuần tra khu phố 1 từ 18h-22h, không có bất thường.",
  "location": "Khu phố 1, Phường Phú Định",
  "images": ["data:image/jpeg;base64,...", "data:image/jpeg;base64,..."]
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "reportType": "daily",
    "content": "...",
    "location": "Khu phố 1",
    "images": [],
    "status": "pending",
    "createdAt": "2026-03-10T22:30:00Z"
  }
}
```

---

### GET /reports/my
DQTV xem báo cáo của mình. Auth: Bearer + role militia
**[CẦN THÊM VÀO CORE]**

**Query:** `reportType`, `page`, `limit`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "reportType": "daily",
      "content": "...",
      "location": "Khu phố 1",
      "status": "pending",
      "createdAt": "2026-03-10T22:30:00Z"
    }
  ]
}
```

---

## KPI

### GET /kpi/current
DQTV xem KPI hiện tại. Auth: Bearer + role militia

**Response 200:**
```json
{
  "success": true,
  "data": {
    "periodYear": 2026,
    "periodMonth": 3,
    "attendanceScore": 90.0,
    "taskScore": 85.0,
    "disciplineScore": 100.0,
    "attitudeScore": 95.0,
    "supervisorScore": 90.0,
    "totalScore": 91.5,
    "rank": 2,
    "rankInUnit": 2
  }
}
```

---

## NOTIFICATIONS

### GET /notifications
Danh sách thông báo. Auth: Bearer

**Query:** `unreadOnly` (bool), `type`, `page`, `limit`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "task",
      "title": "Nhiệm vụ mới",
      "body": "Bạn được giao nhiệm vụ: Tuần tra khu phố 1",
      "readAt": null,
      "createdAt": "2026-03-10T08:00:00Z"
    }
  ]
}
```

---

### POST /notifications/:id/read
Đánh dấu đã đọc. Auth: Bearer

**Response 200:** `{ "success": true, "data": { "read": true } }`

---

### POST /notifications/read-all
Đánh dấu tất cả đã đọc. Auth: Bearer

**Response 200:** `{ "success": true, "data": { "count": 5 } }`

---

### POST /notifications/fcm-token
Đăng ký FCM token. Auth: Bearer

**Request:**
```json
{ "token": "fcm_token_string", "platform": "android" }
```

**Response 200:** `{ "success": true, "data": { "registered": true } }`

---

## WEBSOCKET (Socket.IO)

**URL:** `ws://localhost:3001/socket.io`
**Auth:** `{ auth: { token: accessToken } }`

### Events

| Event | Direction | Payload |
|---|---|---|
| `connection` | Client → Server | — |
| `location_update` | Server → CA clients | `{ userId, fullName, lat, lng, speed, battery, status, timestamp }` |
| `disconnect` | bidirectional | — |

### Flutter Usage:
```dart
// DQTV: gửi vị trí qua HTTP POST /gps/update (Core emit đến CA)
// CA: listen Socket.IO event 'location_update' để cập nhật markers
```

---

## CORE CHANGES CẦN THỰC HIỆN

### 1. Migration 010_police_app.sql
```sql
-- Bảng work_reports (DQTV gửi báo cáo)
CREATE TABLE IF NOT EXISTS work_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type VARCHAR(30) NOT NULL CHECK (report_type IN ('daily','incident','monthly')),
  content TEXT NOT NULL,
  location VARCHAR(255),
  images JSONB DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_work_reports_user ON work_reports(user_id);
CREATE INDEX idx_work_reports_type ON work_reports(report_type);
CREATE INDEX idx_work_reports_status ON work_reports(status);
CREATE INDEX idx_work_reports_created ON work_reports(created_at);
```

### 2. Seed thêm (001_initial_data.sql)
```sql
-- Permissions mới
INSERT INTO permissions (code, name, description, module) VALUES
  ('militia:view', 'Xem danh sách DQTV', 'Xem hồ sơ DQTV', 'users'),
  ('alerts:manage', 'Quản lý cảnh báo', 'Xem và xử lý cảnh báo', 'alerts'),
  ('reports:team', 'Xem báo cáo đội', 'Báo cáo thống kê toàn đội', 'reports'),
  ('gps:view', 'Xem GPS đội', 'Theo dõi vị trí GPS DQTV', 'gps'),
  ('leave:approve', 'Duyệt đơn nghỉ', 'Phê duyệt đơn xin nghỉ', 'leave')
ON CONFLICT (code) DO NOTHING;

-- Role police_area permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'police_area'
AND p.code IN ('tasks:read','tasks:create','leave:read','leave:approve',
               'militia:view','alerts:manage','reports:team','gps:view','users:read')
ON CONFLICT DO NOTHING;

-- User test ca001 (password: 123456)
INSERT INTO users (username, password_hash, full_name, email, phone, status) VALUES
  ('ca001','$2a$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm',
   'Trung úy Võ Văn Tân','ca001@mms.vn','0901234567','active')
ON CONFLICT (username) DO NOTHING;

-- Assign role
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'ca001' AND r.code = 'police_area'
ON CONFLICT DO NOTHING;

-- Police profile
INSERT INTO police_profiles (user_id, badge_no, full_name, cccd, dob, gender, phone, unit_id, position, rank, appointment_date)
SELECT u.id,'CA-KV-001','Trung úy Võ Văn Tân','079095000001','1990-01-15','male',
       '0901234567',(SELECT id FROM units WHERE code='PHU_DINH'),
       'Công an khu vực','Trung úy','2020-06-01'
FROM users u WHERE u.username='ca001'
ON CONFLICT (badge_no) DO NOTHING;

-- Unit scope
INSERT INTO user_unit_scopes (user_id, unit_id, scope_type)
SELECT u.id, un.id, 'subordinate' FROM users u, units un
WHERE u.username='ca001' AND un.code='PHU_DINH'
ON CONFLICT DO NOTHING;
```

### 3. New routes cần thêm vào Core index.ts
```typescript
import gpsRoutes from './routes/gps.routes';
import alertsRoutes from './routes/alerts.routes';
import reportsRoutes from './routes/reports.routes';

app.use(`${API_PREFIX}/gps`, gpsRoutes);
app.use(`${API_PREFIX}/alerts`, alertsRoutes);
app.use(`${API_PREFIX}/reports`, reportsRoutes);
// users.routes.ts cần thêm GET / và GET /:id/militia-profile
// users.routes.ts cần thêm GET /me/police-profile
```
