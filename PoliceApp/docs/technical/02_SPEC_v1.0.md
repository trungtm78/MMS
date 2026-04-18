# TECHNICAL SPEC v1.0 — PoliceApp
Task ID: TASK-2026-002 | Version: v1.0 | Date: 2026-03-10

---

## 1. TECH STACK

### Flutter Mobile
| Layer | Technology | Version |
|---|---|---|
| Framework | Flutter | ≥ 3.19.0 |
| Language | Dart | ≥ 3.3.0 |
| State Management | flutter_riverpod | ^2.5.1 |
| Routing | go_router | ^13.2.0 |
| HTTP Client | dio | ^5.4.3 |
| Secure Storage | flutter_secure_storage | ^9.0.0 |
| GPS | geolocator | ^11.0.0 |
| Map | flutter_map + latlong2 | ^6.1.0 + ^0.9.0 |
| WebSocket | socket_io_client | ^2.0.3+1 |
| Push Notification | firebase_messaging | ^14.7.19 |
| Local Notification | flutter_local_notifications | ^17.1.2 |
| Image Picker | image_picker | ^1.0.7 |
| Voice Input | speech_to_text | ^6.6.0 |
| Local Storage | shared_preferences | ^2.2.3 |
| Date Format | intl | ^0.19.0 |

### Backend BFF (PoliceApp/backend)
| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20 |
| Framework | Express.js |
| Language | TypeScript |
| Role | Proxy thuần → Core port 3001 |
| Port | 3004 |

### Core Backend (shared)
| Layer | Technology |
|---|---|
| DB | PostgreSQL |
| ORM | raw pg queries |
| Auth | JWT (access 15m / refresh 7d) + TOTP MFA |
| WebSocket | Socket.IO |
| Push | Firebase Admin SDK |

---

## 2. ARCHITECTURE

```
Flutter App (PoliceApp/mobile)
    │
    │ HTTP (Dio + AuthInterceptor)
    ▼
PoliceApp BFF (port 3004) — Express proxy
    │
    │ proxy 100% → /api/v1/mms_core/*
    ▼
Core Backend (port 3001)
    │
    ├── PostgreSQL (shared DB)
    └── Socket.IO (shared WS)
```

### Role Detection Flow
```
POST /auth/login → response.user.roles[]
  └── roles includes 'police_area' → save role='ca' → CA Shell (go_router)
  └── roles includes 'militia'     → save role='dqtv' → DQTV Shell (go_router)
  └── unknown role                 → logout + error
```

### Flutter Folder Structure
```
lib/
├── main.dart
├── app.dart                        ← ProviderScope + MaterialApp.router
├── core/
│   ├── constants/
│   │   ├── app_colors.dart         ← Police palette (16 tokens)
│   │   ├── api_constants.dart      ← baseUrl port 3004, all endpoints
│   │   └── app_strings.dart        ← i18n strings
│   ├── network/
│   │   ├── dio_client.dart         ← singleton Dio + interceptors
│   │   └── auth_interceptor.dart   ← auto token refresh
│   ├── router/
│   │   ├── app_router.dart         ← GoRouter + redirect logic
│   │   └── routes.dart             ← route name constants
│   └── storage/
│       └── secure_storage_service.dart
├── features/
│   ├── auth/
│   ├── home/           ← CA Dashboard
│   ├── dqtv/           ← CA: DQTV management
│   ├── gps/            ← CA: GPS tracking
│   ├── tasks/          ← CA: create + DQTV: my tasks
│   ├── approvals/      ← CA: leave approvals
│   ├── reports/        ← CA: team reports + DQTV: work report
│   ├── alerts/         ← CA: alerts
│   ├── attendance/     ← DQTV: check-in/out
│   ├── dqtv_home/      ← DQTV Dashboard
│   ├── profile/        ← CA + DQTV (separate screens)
│   └── notifications/
└── shared/
    ├── widgets/
    │   ├── main_shell_ca.dart      ← 5-tab bottom nav CA
    │   ├── main_shell_dqtv.dart    ← 5-tab bottom nav DQTV
    │   ├── app_header.dart         ← yellow gradient header widget
    │   └── status_badge.dart
    └── services/
        ├── websocket_service.dart
        └── push_notification_service.dart
```

---

## 3. COLOR PALETTE

| Token | Hex | Dùng cho |
|---|---|---|
| `primary` | `#DC2626` | Header border, tiêu đề, button CA, icon accent |
| `secondary` | `#FBBF24` | Gradient header start |
| `gradientMid` | `#FDE047` | Gradient header mid |
| `gradientEnd` | `#FEF08A` | Gradient header end |
| `tertiary` | `#15803D` | Submit button, completed state |
| `navy` | `#366092` | Active nav, action buttons, progress bars |
| `background` | `#F8FAFC` | Page background |
| `surface` | `#FFFFFF` | Cards |
| `success` | `#10B981` | Online, completed, approved |
| `warning` | `#F59E0B` | Pending, late, away |
| `error` | `#EF4444` | Offline, rejected, urgent |
| `blue` | `#3B82F6` | In-progress, notifications |
| `textPrimary` | `#0F172A` | Main text |
| `textSecondary` | `#64748B` | Sub text, labels |
| `textMuted` | `#94A3B8` | Placeholder, disabled |
| `divider` | `#E2E8F0` | Borders, separators |

**Header gradient pattern (tất cả screens):**
```dart
gradient: LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFFFBBF24), Color(0xFFFDE047), Color(0xFFFEF08A)],
)
// + border bottom: BorderSide(color: Color(0xFFDC2626), width: 4)
```

---

## 4. BUSINESS RULES CHI TIẾT

### BR-001 / BR-002: GPS Check-in Threshold
```
Boundary: distance = Geolocator.distanceBetween(unitLat, unitLng, userLat, userLng)

distance ≤ 15.0 meters  → locationOk = true  → check-in button ENABLED
distance > 15.0 meters  → locationOk = false → check-in button DISABLED
distance = 15.0 exactly → ENABLED (≤ là đúng biên)
distance = 15.1         → DISABLED

Unit coordinates: lấy từ militia_profile.unit → units(latitude, longitude)
Fallback: _unitLat = 10.8231, _unitLng = 106.6297 (Phú Định)
```

### BR-014: Late Check-in
```
Thời điểm check-in:
  Trước 08:30 → status = 'checked_in'
  Từ 08:30 trở đi → status = 'late'
  
08:30 = 8*60+30 = 510 minutes
checkinTime = now.hour * 60 + now.minute
isLate = checkinTime > 510   (strictly greater)
Exactly 08:30 → NOT late (510 > 510 = false)
08:31 → late (511 > 510 = true)
```

### BR-015: Early Check-out
```
Thời điểm check-out:
  Từ 17:00 trở đi → status = 'checked_out'
  Trước 17:00 → status = 'early_leave'

17:00 = 17*60 = 1020 minutes
checkoutTime = now.hour * 60 + now.minute
isEarlyLeave = checkoutTime < 1020
Exactly 17:00 → NOT early (1020 < 1020 = false)
16:59 → early (1019 < 1020 = true)
```

### BR-012: GPS Update Frequency
```
Điều kiện gửi: isCheckedIn = true AND hasLocationPermission = true
Foreground: Timer.periodic(Duration(seconds: 30)) → POST /gps/update
Background: BackgroundFetch interval = 300 seconds (5 phút)
Dừng: khi checkout hoặc app terminate
```

### BR-013: Image Upload Limits
```
Max images per report: 5
Max size per image: 5 * 1024 * 1024 bytes = 5,242,880 bytes
Allowed types: jpg, jpeg, png, heic
Validation: client-side trước khi upload
```

### BR-006: Task Creation
```
Required fields: title (non-empty), type (enum), priority (enum), assigneeIds (≥1)
Optional: description, deadline, location
Deadline validation: deadline > DateTime.now() (strictly after)
Task code format: NV-YYYYMM-NNNN (auto-generated by Core)
```

### BR-007: Leave Approval
```
Action values: 'approved' | 'rejected'
Reject requires: reason field non-empty
Approve: reason optional
Permission required: leave:approve
Double-approve: Core returns 400 (handled by EX-09 equivalent)
```

---

## 5. INPUT FIELDS & VALIDATION

### Login Screen (CA + DQTV)
| Field | Type | Validation | Error message |
|---|---|---|---|
| username | TextInput | required, non-empty | "Tên đăng nhập không được để trống" |
| password | TextInput (obscured) | required, non-empty | "Mật khẩu không được để trống" |

### OTP Screen
| Field | Type | Validation | Error message |
|---|---|---|---|
| otpCode | TextInput (numeric) | required, exactly 6 digits | "Mã OTP phải gồm 6 chữ số" |

### Recovery Code Screen
| Field | Type | Validation | Error message |
|---|---|---|---|
| recoveryCode | TextInput | required, non-empty | "Mã khôi phục không được để trống" |

### CreateTask Screen (CA)
| Field | Type | Validation | Error message |
|---|---|---|---|
| taskType | Selector grid | required | "Vui lòng chọn loại nhiệm vụ" |
| title | TextInput | required, max 255 | "Tiêu đề không được để trống" |
| description | Textarea | optional, max 2000 | — |
| priority | Chip selector | required | "Vui lòng chọn mức độ ưu tiên" |
| deadline | DateTimePicker | optional, > now | "Hạn hoàn thành phải sau thời điểm hiện tại" |
| assigneeIds | MultiSelect | required, ≥1 | "Vui lòng chọn ít nhất 1 người thực hiện" |

### ApproveRequests — Reject Dialog
| Field | Type | Validation | Error message |
|---|---|---|---|
| reason | Textarea | required khi action=rejected | "Vui lòng nhập lý do từ chối" |

### ReportWork Screen (DQTV)
| Field | Type | Validation | Error message |
|---|---|---|---|
| reportType | Tab selector | required | — (default = 'daily') |
| location | TextInput | optional | — |
| content | Textarea | required, non-empty | "Nội dung báo cáo không được để trống" |
| images | ImagePicker | optional, max 5, ≤5MB each | "Ảnh quá lớn (tối đa 5MB mỗi ảnh)" / "Tối đa 5 ảnh" |

---

## 6. ERROR MATRIX

| Code | Trigger | HTTP Status | Flutter Action | User Message |
|---|---|---|---|---|
| E001 | Input validation fail | — (client) | Highlight field, show message | Field-specific message |
| E002 | 401 Unauthorized | 401 | AuthInterceptor: silent refresh; fail → logout | "Phiên đăng nhập hết hạn" |
| E003 | 403 Forbidden | 403 | Show error dialog/snackbar | "Không có quyền thực hiện thao tác này" |
| E004 | Network error / timeout | — (DioException) | Snackbar + Retry button | "Lỗi kết nối mạng. Kiểm tra internet." |
| E005 | 500 Server error | 500 | Show error dialog | "Lỗi hệ thống, vui lòng thử lại sau" |
| E006 | 400 Bad request | 400 | Show error from response message | response.data['message'] |
| E007 | 404 Not found | 404 | Navigate back + snackbar | "Không tìm thấy dữ liệu" |

---

## 7. NAVIGATION STRUCTURE

### CA Shell — GoRouter ShellRoute
```
/ca
  /ca/home          → HomeScreen (CA Dashboard)
  /ca/dqtv          → DQTVListScreen
  /ca/dqtv/:id      → DQTVDetailScreen
  /ca/map           → GPSTrackingScreen
  /ca/tasks         → (redirect to /ca/home)
  /ca/tasks/create  → CreateTaskScreen
  /ca/approvals     → ApproveRequestsScreen
  /ca/reports       → ReportsScreen
  /ca/alerts        → AlertsScreen
  /ca/profile       → ProfileCAScreen
  /ca/notifications → NotificationsScreen
```

### DQTV Shell — GoRouter ShellRoute
```
/dqtv
  /dqtv/home        → DQTVHomeScreen
  /dqtv/tasks       → MyTasksScreen
  /dqtv/tasks/:id   → TaskDetailScreen
  /dqtv/checkin     → CheckInScreen
  /dqtv/report      → ReportWorkScreen
  /dqtv/profile     → ProfileDQTVScreen
  /dqtv/notifications → NotificationsScreen
```

### Common Routes
```
/login              → LoginScreen
/otp                → OtpScreen
/mfa-setup          → MfaSetupScreen
/recovery-codes     → RecoveryCodesScreen
```

### Bottom Navigation

**CA Shell:**
| Index | Label | Icon | Route |
|---|---|---|---|
| 0 | Trang chủ | Icons.home | /ca/home |
| 1 | DQTV | Icons.people | /ca/dqtv |
| 2 | Bản đồ | Icons.map | /ca/map |
| 3 | Nhiệm vụ | Icons.assignment | /ca/tasks/create |
| 4 | Cá nhân | Icons.person | /ca/profile |

**DQTV Shell:**
| Index | Label | Icon | Route |
|---|---|---|---|
| 0 | Trang chủ | Icons.home | /dqtv/home |
| 1 | Nhiệm vụ | Icons.assignment | /dqtv/tasks |
| 2 | Chấm công | Icons.access_time | /dqtv/checkin |
| 3 | Báo cáo | Icons.description | /dqtv/report |
| 4 | Cá nhân | Icons.person | /dqtv/profile |

Active color: `#366092` | Inactive color: `#64748B`

---

## 8. SECURE STORAGE KEYS

| Key | Value | Cleared on logout |
|---|---|---|
| `access_token` | JWT access token | ✅ |
| `refresh_token` | JWT refresh token | ✅ |
| `user_id` | UUID | ✅ |
| `user_role` | 'ca' hoặc 'dqtv' | ✅ |
| `username` | string | ❌ (giữ cho biometric) |
| `biometric_enabled` | 'true'/'false' | ❌ |

---

## 9. WEBSOCKET EVENTS

| Event | Direction | Payload | Dùng cho |
|---|---|---|---|
| `location_update` (emit) | DQTV app → Server | `{userId, lat, lng, speed, battery}` | US-016 |
| `location_update` (on) | Server → CA app | `{userId, lat, lng, speed, battery, timestamp}` | US-005 |
| `connect` | bidirectional | — | GPS screen mount |
| `disconnect` | bidirectional | — | Auto reconnect |

Auth: Socket.IO handshake với `auth: { token: accessToken }`

---

## 10. TASK TYPE MAPPING

| Code (API) | Label (UI) | Icon | Màu |
|---|---|---|---|
| `patrol` | Tuần tra | 🚔 | #366092 |
| `guard` | Canh gác | 🛡️ | #DC2626 |
| `inspection` | Xử lý sự vụ | 🔍 | #F59E0B |
| `support` | Hỗ trợ dân | 🤝 | #10B981 |
| `training` | Tuyên truyền | 📢 | #3B82F6 |
| `admin` | Hành chính | 📋 | #64748B |
| `other` | Khác | 📌 | #94A3B8 |

## 11. KPI SCORE COLOR THRESHOLDS

| Score | Color | Label |
|---|---|---|
| ≥ 90 | `#10B981` (success) | Xuất sắc |
| ≥ 80 | `#3B82F6` (blue) | Tốt |
| ≥ 70 | `#F59E0B` (warning) | Khá |
| < 70 | `#EF4444` (error) | Cần cải thiện |

## 12. GPS MARKER STATUS

| Status | Color | Điều kiện |
|---|---|---|
| online | `#10B981` | last_seen_at < 2 phút |
| moving | `#F59E0B` | speed > 0.5 m/s AND online |
| offline | `#94A3B8` | last_seen_at ≥ 2 phút |
