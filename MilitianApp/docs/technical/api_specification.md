# API SPECIFICATION — MilitianApp (Flutter Native)
Task ID: TASK-2026-001
Version: v2.0
Date: 2026-03-08

## Standards
- Base URL (BFF proxy): `/api/v1/mms_core` (port 3003 → 3001)
- Auth: Bearer JWT (header `Authorization: Bearer {token}`) cho mọi endpoint trừ auth public
- Content-Type: `application/json`
- Error envelope: `{ "success": false, "error": { "code", "message", "details?" } }`
- Success envelope: `{ "success": true, "data": {...} }`

---

## AUTH ENDPOINTS

### 1) Login
- Method: `POST`
- URL: `/api/v1/mms_core/auth/login`
- Auth: Public
- Request:
```json
{
  "username": "dqtv001",
  "password": "123456",
  "device": {
    "name": "Samsung Galaxy S21",
    "fingerprint": "sha256:abc123...",
    "platform": "android"
  }
}
```
- 200 (MFA not yet setup — first time):
```json
{
  "success": true,
  "data": {
    "mfa_required": true,
    "mfa_setup_required": true,
    "mfa_session_token": "sess_xyz...",
    "expires_in": 300
  }
}
```
- 200 (MFA already setup):
```json
{
  "success": true,
  "data": {
    "mfa_required": true,
    "mfa_setup_required": false,
    "mfa_session_token": "sess_xyz...",
    "expires_in": 300
  }
}
```
- 401: `{ "success": false, "error": { "code": "E003", "message": "Tên đăng nhập hoặc mật khẩu không đúng" } }`
- 423: `{ "success": false, "error": { "code": "E003", "message": "Tài khoản tạm khóa 15 phút do nhập sai quá nhiều lần" } }`

---

### 2) Setup MFA (first time) — NEW
- Method: `POST`
- URL: `/api/v1/mms_core/auth/setup-mfa`
- Auth: mfa_session_token trong header `X-MFA-Session-Token`
- Request: `{}` (empty body)
- 200:
```json
{
  "success": true,
  "data": {
    "otpauth_uri": "otpauth://totp/MMS:dqtv001?secret=BASE32SECRET&issuer=MMS",
    "secret": "BASE32SECRET",
    "qr_code_base64": "data:image/png;base64,..."
  }
}
```
- 401: `{ "success": false, "error": { "code": "E003", "message": "Phiên xác thực không hợp lệ hoặc đã hết hạn" } }`

---

### 3) Verify MFA — NEW
- Method: `POST`
- URL: `/api/v1/mms_core/auth/verify-mfa`
- Auth: mfa_session_token trong header `X-MFA-Session-Token`
- Request:
```json
{ "otp": "123456" }
```
- 200:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "recovery_codes": ["abc-def-ghi", "..."],
    "user": { "id": "u1", "username": "dqtv001", "role": "dqtv", "fullName": "Nguyễn Văn An" }
  }
}
```
  - `recovery_codes` chỉ trả về lần đầu setup; null cho các lần login sau
- 401: `{ "success": false, "error": { "code": "E008", "message": "Mã OTP không đúng" } }`
- 429: `{ "success": false, "error": { "code": "E009", "message": "Nhập sai quá số lần. Vui lòng đăng nhập lại" } }`

---

### 4) Verify Recovery Code — NEW
- Method: `POST`
- URL: `/api/v1/mms_core/auth/verify-recovery`
- Auth: mfa_session_token trong header `X-MFA-Session-Token`
- Request:
```json
{ "recovery_code": "abc-def-ghi" }
```
- 200: same as verify-mfa response (no recovery_codes in response)
- 401: `{ "success": false, "error": { "code": "E010", "message": "Mã khôi phục không hợp lệ hoặc đã sử dụng" } }`
- 410: `{ "success": false, "error": { "code": "E011", "message": "Đã hết mã khôi phục. Vui lòng liên hệ admin" } }`

---

### 5) Refresh Token
- Method: `POST`
- URL: `/api/v1/mms_core/auth/refresh`
- Auth: Refresh token trong body
- Request: `{ "refreshToken": "eyJ..." }`
- 200: `{ "success": true, "data": { "accessToken": "...", "refreshToken": "..." } }`
- 401: Refresh hết hạn → force logout

---

### 6) Logout
- Method: `POST`
- URL: `/api/v1/mms_core/auth/logout`
- Auth: Bearer JWT
- Request: `{ "refreshToken": "eyJ..." }`
- 200: `{ "success": true }`

---

## USER ENDPOINTS

### 7) Get Current User
- Method: `GET`
- URL: `/api/v1/mms_core/users/me`
- Auth: Bearer JWT
- 200:
```json
{
  "success": true,
  "data": {
    "id": "u1",
    "username": "dqtv001",
    "fullName": "Nguyễn Văn An",
    "email": "dqtv001@dqtv.com",
    "role": "dqtv",
    "mfa_enabled": true
  }
}
```

---

### 8) Get Militia Profile
- Method: `GET`
- URL: `/api/v1/mms_core/users/me/militia-profile`
- Auth: Bearer JWT
- 200:
```json
{
  "success": true,
  "data": {
    "id": "mp1",
    "militiaCode": "HCM-PHD-T12-0001",
    "fullName": "Nguyễn Văn An",
    "dob": "1995-05-15",
    "cccd": "079095xxxxxx",
    "phone": "0909123456",
    "address": "123 Đường ABC, Phú Định, TP.HCM",
    "unitId": "unit_kp1",
    "district": "Khu phố 1",
    "supervisor": { "id": "u_police", "fullName": "Trung úy Võ Văn Tân" },
    "position": "Dân quân thường trực",
    "startDate": "2022-10-01",
    "emergencyContact": { "name": "Nguyễn Thị Bích", "relationship": "Vợ", "phone": "0916789012" }
  }
}
```

---

### 9) Change Password
- Method: `POST`
- URL: `/api/v1/mms_core/users/me/change-password`
- Auth: Bearer JWT
- Request: `{ "currentPassword": "...", "newPassword": "..." }`
- 200: `{ "success": true, "data": { "message": "Đã đổi mật khẩu thành công" } }`
- 400: `{ "success": false, "error": { "code": "E001", "message": "Mật khẩu hiện tại không đúng" } }`

---

## TASK ENDPOINTS

### 10) Get Tasks
- Method: `GET`
- URL: `/api/v1/mms_core/tasks`
- Auth: Bearer JWT
- Query: `status? (pending|in-progress|completed|overdue)`, `page?`, `limit?`
- 200:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "t1", "code": "NV-2026-001", "title": "Tuần tra chợ",
        "type": "patrol", "priority": "high", "status": "in-progress",
        "deadline": "2026-03-10T18:00:00Z",
        "location": { "name": "Chợ Bến Thành", "lat": 10.77, "lng": 106.70 },
        "assignedBy": { "id": "u_police", "fullName": "Đại úy Phạm Tuấn" }
      }
    ],
    "total": 5, "page": 1, "limit": 20
  }
}
```

---

### 11) Get Task Detail
- Method: `GET`
- URL: `/api/v1/mms_core/tasks/:id`
- Auth: Bearer JWT
- 200: Task object đầy đủ + `updates` (history array)

---

### 12) Accept Task
- Method: `POST`
- URL: `/api/v1/mms_core/tasks/:id/accept`
- Auth: Bearer JWT
- 200: `{ "success": true, "data": { "status": "in-progress" } }`
- 400: Task không phải pending hoặc không assign cho user

---

### 13) Update Task Progress
- Method: `POST`
- URL: `/api/v1/mms_core/tasks/:id/progress`
- Auth: Bearer JWT
- Request:
```json
{
  "progress": 60,
  "note": "Đã tuần tra sector A, đang sector B",
  "location": { "lat": 10.77, "lng": 106.70 }
}
```
- 200: `{ "success": true, "data": { "taskUpdateId": "tu1", "progress": 60 } }`

---

## ATTENDANCE ENDPOINTS

### 14) Check-in
- Method: `POST`
- URL: `/api/v1/mms_core/attendance/check-in`
- Auth: Bearer JWT
- Request:
```json
{
  "timestamp": "2026-03-08T08:05:00Z",
  "location": { "lat": 10.7769, "lng": 106.7009, "accuracy": 8.5 },
  "source": "mobile"
}
```
- 200: `{ "success": true, "data": { "id": "att1", "checkinAt": "2026-03-08T08:05:00Z", "status": "on_time" } }`
- 400 (GPS inaccurate): `{ "success": false, "error": { "code": "E001", "message": "GPS accuracy is not acceptable" } }`
- 409 (Already checked in): `{ "success": false, "error": { "code": "E001", "message": "Bạn đã điểm danh hôm nay" } }`

---

### 15) Check-out
- Method: `POST`
- URL: `/api/v1/mms_core/attendance/check-out`
- Auth: Bearer JWT
- Request: `{ "location": { "lat": 10.77, "lng": 106.70, "accuracy": 10 } }`
- 200: `{ "success": true, "data": { "checkoutAt": "...", "totalHours": 9.1 } }`

---

### 16) Get Today's Attendance
- Method: `GET`
- URL: `/api/v1/mms_core/attendance/today`
- Auth: Bearer JWT
- 200: `{ "success": true, "data": { "checkinAt": "...", "checkoutAt": null, "status": "checked_in" } }`

---

### 17) Get Attendance History
- Method: `GET`
- URL: `/api/v1/mms_core/attendance/history`
- Auth: Bearer JWT
- Query: `from?`, `to?`, `page?`, `limit?`
- 200: `{ "success": true, "data": { "items": [...], "total": 20 } }`

---

### 18) Get Attendance Stats
- Method: `GET`
- URL: `/api/v1/mms_core/attendance/stats`
- Auth: Bearer JWT
- Query: `year?`, `month?`
- 200: `{ "success": true, "data": { "workDays": 18, "totalDays": 22, "lateCount": 2, "absentCount": 0 } }`

---

## LEAVE ENDPOINTS

### 19) Get Leave Types
- Method: `GET`
- URL: `/api/v1/mms_core/leave-requests/types`
- Auth: Bearer JWT
- 200: `{ "success": true, "data": [{ "id": "lt1", "name": "Nghỉ phép có lương", "maxDays": 12, "remainingDays": 12 }] }`

---

### 20) Submit Leave Request
- Method: `POST`
- URL: `/api/v1/mms_core/leave-requests`
- Auth: Bearer JWT
- Request:
```json
{
  "leaveTypeId": "lt1",
  "fromDate": "2026-03-20",
  "toDate": "2026-03-21",
  "reason": "Việc gia đình cần giải quyết",
  "replacementUserId": "u2",
  "isHalfDay": false
}
```
- 201: `{ "success": true, "data": { "id": "lr1", "status": "pending", "code": "NP-2026-001" } }`
- 400: `{ "success": false, "error": { "code": "E001", "message": "Không đủ ngày phép còn lại" } }`

---

### 21) Get My Leave Requests
- Method: `GET`
- URL: `/api/v1/mms_core/leave-requests`
- Auth: Bearer JWT
- Query: `status?`, `page?`, `limit?`
- 200: `{ "success": true, "data": { "items": [...], "total": 5 } }`

---

## INCIDENT ENDPOINTS

### 22) Submit SOS
- Method: `POST`
- URL: `/api/v1/mms_core/incidents/sos`
- Auth: Bearer JWT
- Request:
```json
{
  "severity": "urgent",
  "message": "Cần hỗ trợ khẩn cấp tại chợ Bến Thành",
  "location": { "lat": 10.7769, "lng": 106.7009, "name": "Chợ Bến Thành" }
}
```
- 201: `{ "success": true, "data": { "id": "inc1", "status": "open", "alertsSent": 3 } }`

---

### 23) Submit Incident Report
- Method: `POST`
- URL: `/api/v1/mms_core/incidents/report`
- Auth: Bearer JWT
- Request:
```json
{
  "incidentType": "security",
  "severity": "high",
  "title": "Đối tượng nghi vấn",
  "description": "Phát hiện 2 đối tượng khả nghi tại khu vực chợ",
  "location": { "lat": 10.7769, "lng": 106.7009 },
  "peopleInvolved": 2,
  "hasInjury": false,
  "actionsToken": ["called_115", "notified_police"]
}
```
- 201: `{ "success": true, "data": { "id": "rpt1", "code": "BC-2026-001", "status": "open" } }`

---

## NOTIFICATION ENDPOINTS

### 24) Get Notifications
- Method: `GET`
- URL: `/api/v1/mms_core/notifications`
- Auth: Bearer JWT
- Query: `unreadOnly?`, `type?`, `page?`, `limit?`
- 200: `{ "success": true, "data": { "items": [...], "unreadCount": 3 } }`

---

### 25) Mark Notification Read
- Method: `POST`
- URL: `/api/v1/mms_core/notifications/:id/read`
- Auth: Bearer JWT
- 200: `{ "success": true }`

---

### 26) Mark All Notifications Read
- Method: `POST`
- URL: `/api/v1/mms_core/notifications/read-all`
- Auth: Bearer JWT
- 200: `{ "success": true, "data": { "markedCount": 5 } }`

---

## CHAT ENDPOINTS

### 27) Get Conversations
- Method: `GET`
- URL: `/api/v1/mms_core/chat/conversations`
- Auth: Bearer JWT
- 200:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "conv1",
        "participant": { "id": "u_police", "fullName": "Trung úy Võ Văn Tân", "role": "police" },
        "lastMessage": { "content": "Nhớ họp lúc 14h", "sentAt": "2026-03-08T10:00:00Z" },
        "unreadCount": 2
      }
    ]
  }
}
```

---

### 28) Get Messages
- Method: `GET`
- URL: `/api/v1/mms_core/chat/conversations/:id/messages`
- Auth: Bearer JWT
- Query: `page?`, `limit?`
- 200: `{ "success": true, "data": { "items": [...], "total": 50 } }`

---

### 29) Send Message
- Method: `POST`
- URL: `/api/v1/mms_core/chat/conversations/:id/messages`
- Auth: Bearer JWT
- Request: `{ "content": "Tôi đã hiểu, sẽ thực hiện ngay", "attachments": [] }`
- 201: `{ "success": true, "data": { "id": "msg1", "sentAt": "..." } }`

---

## WEBSOCKET EVENTS (chat real-time)

URL: `ws://localhost:3001` with Bearer JWT auth header

### Client → Server
```json
{ "event": "join_conversation", "data": { "conversationId": "conv1" } }
{ "event": "send_message", "data": { "conversationId": "conv1", "content": "..." } }
{ "event": "leave_conversation", "data": { "conversationId": "conv1" } }
```

### Server → Client
```json
{ "event": "new_message", "data": { "id": "msg1", "content": "...", "sentBy": {...}, "sentAt": "..." } }
{ "event": "message_read", "data": { "messageId": "msg1", "readBy": "u_police" } }
```

---

## FIREBASE PUSH NOTIFICATION PAYLOADS

### Task assigned
```json
{
  "notification": { "title": "Nhiệm vụ mới", "body": "Bạn được giao: Tuần tra chợ Bến Thành" },
  "data": { "type": "task", "taskId": "t1", "action": "/tasks/t1" }
}
```

### Leave approved
```json
{
  "notification": { "title": "Đơn nghỉ phép", "body": "Đơn nghỉ từ 20/03 đến 21/03 đã được duyệt" },
  "data": { "type": "leave", "leaveId": "lr1", "action": "/my-requests" }
}
```

### SOS alert (from same unit)
```json
{
  "notification": { "title": "⚠️ Cảnh báo SOS", "body": "DQTV Nguyễn Văn An cần hỗ trợ khẩn cấp" },
  "data": { "type": "sos", "incidentId": "inc1", "action": "/incident-report" }
}
```

### New message
```json
{
  "notification": { "title": "Trung úy Võ Văn Tân", "body": "Nhớ họp lúc 14h hôm nay" },
  "data": { "type": "chat", "conversationId": "conv1", "action": "/chat/conv1" }
}
```
