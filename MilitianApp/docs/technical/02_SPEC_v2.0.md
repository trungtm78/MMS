# TECHNICAL SPEC v2.0 — MilitianApp (Flutter Native)

Task ID: TASK-2026-001
Date: 2026-03-08
Version: v2.0 (Flutter Rewrite)
Subsystem: MilitianApp (Flutter + Dart)
Platform: Android + iOS

---

## PLATFORM BASELINE

| Concern | Technology | Version |
|---------|------------|---------|
| Framework | Flutter | 3.19+ |
| Language | Dart | 3.3+ |
| State Management | flutter_riverpod | ^2.4.0 |
| HTTP Client | dio | ^5.4.0 |
| Secure Storage | flutter_secure_storage | ^9.0.0 |
| Navigation | go_router | ^13.0.0 |
| GPS/Location | geolocator | ^10.1.0 |
| QR Display | qr_flutter | ^4.1.0 |
| QR Scan | mobile_scanner | ^4.0.0 |
| Biometric | local_auth | ^2.1.0 |
| Push Notifications | firebase_messaging | ^14.7.0 |
| Real-time Chat | socket_io_client | ^2.0.3 |
| Local DB/Cache | drift | ^2.14.0 |
| UI Base | Material 3 | SDK |

### Port Configuration
- Mobile App: Android / iOS native
- BFF Proxy: 3003
- Core API: 3001
- WebSocket: ws://localhost:3001

### Base API Path
`/api/v1/mms_core` (proxied qua BFF port 3003 → Core port 3001)

---

## INPUT SCHEMA + VALIDATION

### Login Form
| Field | Type | Validation | Error Message |
|-------|------|------------|---------------|
| username | String | Required, 3-50 chars | "Tên đăng nhập tối thiểu 3 ký tự" |
| password | String | Required, min 6 chars | "Mật khẩu tối thiểu 6 ký tự" |

Device Payload (auto-generated):
- `name`: DeviceInfo.model
- `platform`: "android" | "ios"
- `fingerprint`: SHA256(deviceId)

### OTP Form
| Field | Type | Validation | Error Message |
|-------|------|------------|---------------|
| otp | String | Required, exactly 6 digits | "Mã OTP phải là 6 số" |

### Check-in/Check-out Form
| Field | Type | Validation | Error Message |
|-------|------|------------|---------------|
| location.lat | double | Required, valid latitude | "Không thể lấy vị trí" |
| location.lng | double | Required, valid longitude | "Không thể lấy vị trí" |
| location.accuracy | double | Required, ≤ 15.0m | "GPS không đủ chính xác (±{X}m). Vui lòng di chuyển ra nơi thoáng" |
| timestamp | DateTime | Auto-generated | N/A |
| source | String | Hardcode "mobile" | N/A |

### Leave Request Form
| Field | Type | Validation | Error Message |
|-------|------|------------|---------------|
| leaveTypeId | String | Required | "Vui lòng chọn loại nghỉ" |
| fromDate | DateTime | Required | "Vui lòng chọn ngày bắt đầu" |
| toDate | DateTime | Required, >= fromDate | "Ngày kết thúc phải sau ngày bắt đầu" |
| reason | String | Required, 20-500 chars | "Lý do tối thiểu 20 ký tự" |
| replacementUserId | String | Required | "Vui lòng chọn người thay thế" |
| isHalfDay | bool | Optional, default false | N/A |

### SOS Form
| Field | Type | Validation | Error Message |
|-------|------|------------|---------------|
| severity | enum | Required: low/medium/high/urgent | "Vui lòng chọn mức độ" |
| message | String | Required, 20-500 chars | "Mô tả tối thiểu 20 ký tự" |
| location | GpsPoint? | Optional | N/A |

### Incident Report Form
| Field | Type | Validation | Error Message |
|-------|------|------------|---------------|
| incidentType | enum | Required | "Vui lòng chọn loại sự cố" |
| severity | enum | Required | "Vui lòng chọn mức độ nghiêm trọng" |
| title | String | Required, 5-100 chars | "Tiêu đề tối thiểu 5 ký tự" |
| description | String | Required, 20-1000 chars | "Mô tả tối thiểu 20 ký tự" |
| location | GpsPoint? | Optional | N/A |

### Task Progress Form
| Field | Type | Validation | Error Message |
|-------|------|------------|---------------|
| progress | int | Required, 1-100 | "Tiến độ phải từ 1 đến 100" |
| note | String | Optional, 0-1000 chars | N/A |

### Change Password Form
| Field | Type | Validation | Error Message |
|-------|------|------------|---------------|
| currentPassword | String | Required, min 6 chars | N/A |
| newPassword | String | Required, min 6, != current | "Mật khẩu mới phải khác mật khẩu cũ" |
| confirmPassword | String | Required, == newPassword | "Mật khẩu xác nhận không khớp" |

### Chat Message Form
| Field | Type | Validation | Error Message |
|-------|------|------------|---------------|
| content | String | Required, 1-2000 chars | "Tin nhắn không được rỗng" |
| attachments | List<File>? | Optional, max 5, 10MB each | "File quá lớn (tối đa 10MB)" |

---

## BUSINESS RULES — IMPLEMENTATION

| BR-ID | Condition | Logic | Output |
|-------|-----------|-------|--------|
| BR-001 | Check-in on_time | checkinAt <= 08:30 | status = on_time |
| BR-002 | Check-in late | checkinAt > 08:30 | status = late |
| BR-003 | GPS threshold | accuracy <= 15.0 | Allow check-in |
| BR-004 | Task overdue | deadline < now && status != completed | Badge đỏ, require explanation |
| BR-005 | OTP timeout | mfa_session_token TTL = 5 phút | Back to login |
| BR-006 | Access token refresh | TTL = 15 min | Auto-refresh via Dio interceptor |
| BR-007 | Refresh token expiry | TTL = 7 days | Force logout |
| BR-008 | KPI | End of month | attendance + tasks + discipline |
| BR-009 | SOS urgent | severity == urgent | Immediate send + notify CA |
| BR-010 | Biometric | device supports + user enabled | Replace password, still need OTP |
| BR-011 | Recovery codes | 10 codes one-time-use | Fallback auth |
| BR-012 | Chat real-time | WebSocket connected | Real-time messages |

---

## BOUNDARY VALUES (BUILD PHẢI TEST)

| Boundary | Value | Expected |
|----------|-------|----------|
| GPS accuracy = 15.0 | 15.0 | ACCEPTED |
| GPS accuracy = 15.01 | 15.01 | REJECTED |
| GPS accuracy = 14.99 | 14.99 | ACCEPTED |
| Check-in at 08:30:00 | 08:30:00 | on_time |
| Check-in at 08:30:01 | 08:30:01 | late |
| Leave from = to | Same day | ACCEPTED (1 day) |
| Leave from > to | from > to | REJECTED |
| Task progress = 1 | 1 | ACCEPTED |
| Task progress = 0 | 0 | REJECTED |
| Task progress = 100 | 100 | ACCEPTED + complete |
| Task progress = 101 | 101 | REJECTED |
| OTP length = 5 | "12345" | REJECTED |
| OTP length = 6 | "123456" | VALID format |
| OTP length = 7 | "1234567" | REJECTED |
| Username = 3 chars | "abc" | ACCEPTED |
| Username = 2 chars | "ab" | REJECTED |
| Password = 6 chars | "123456" | ACCEPTED |
| Password = 5 chars | "12345" | REJECTED |
| Reason = 20 chars | 20 chars | ACCEPTED |
| Reason = 19 chars | 19 chars | REJECTED |
| Recovery codes used all | 10/10 | "Liên hệ admin" |

---

## ERROR MATRIX

| Code | When | Action | User sees |
|------|------|--------|-----------|
| E001 | Input format invalid | TERMINATE | "Dữ liệu không hợp lệ" |
| E002 | Missing required field | Block submit | "Vui lòng điền [field]" |
| E003 | Auth invalid (401) | Refresh → retry; fail → logout | "Phiên đăng nhập đã hết hạn" |
| E004 | Permission denied (403) | TERMINATE | "Bạn không có quyền thực hiện thao tác này" |
| E005 | Network/5xx | RETRY x3 → manual retry | "Hệ thống đang gặp sự cố, vui lòng thử lại" |
| E006 | GPS unavailable | Disable check-in | "Không thể lấy vị trí GPS. Vui lòng cấp quyền" |
| E007 | GPS accuracy > 15m | Block submit | "GPS không đủ chính xác (±{X}m)" |
| E008 | OTP invalid | Allow retry, count | "Mã OTP không đúng" |
| E009 | OTP attempts = 3 | Invalidate session | "Nhập sai quá số lần. Vui lòng đăng nhập lại" |
| E010 | Recovery code used | TERMINATE | "Mã khôi phục đã sử dụng" |
| E011 | All recovery codes used | TERMINATE | "Đã hết mã khôi phục. Liên hệ admin" |
| E012 | Biometric failed | Fallback to password | "Xác thực sinh trắc học thất bại" |
| E013 | WebSocket disconnected | Show offline badge | "Mất kết nối chat" |
| E014 | File upload too large | TERMINATE | "File quá lớn (tối đa 10MB)" |

---

## FLUTTER PROJECT STRUCTURE

```
MilitianApp/mobile/
├── lib/
│   ├── main.dart
│   ├── app.dart
│   ├── core/
│   │   ├── constants/
│   │   │   ├── api_constants.dart
│   │   │   ├── app_colors.dart
│   │   │   └── app_strings.dart
│   │   ├── router/
│   │   │   ├── app_router.dart
│   │   │   └── routes.dart
│   │   ├── network/
│   │   │   ├── dio_client.dart
│   │   │   ├── auth_interceptor.dart
│   │   │   └── api_result.dart
│   │   ├── storage/
│   │   │   ├── secure_storage_service.dart
│   │   │   └── drift_database.dart
│   │   └── utils/
│   │       ├── validators.dart
│   │       └── extensions.dart
│   ├── features/
│   │   ├── auth/
│   │   ├── home/
│   │   ├── attendance/
│   │   ├── tasks/
│   │   ├── profile/
│   │   ├── leave/
│   │   ├── incident/
│   │   ├── notifications/
│   │   └── chat/
│   └── shared/
│       ├── widgets/
│       ├── providers/
│       └── services/
│           ├── biometric_service.dart
│           ├── push_notification_service.dart
│           └── websocket_service.dart
├── test/
│   ├── unit/
│   ├── widget/
│   └── integration/
├── android/
├── ios/
└── pubspec.yaml
```

---

## DESIGN TOKENS (Material 3)

| Token | Value | Usage |
|-------|-------|-------|
| primary | #DC2626 | Headers, main buttons, borders |
| secondary | #FBBF24 | Header gradient start |
| accent | #15803D | Success, confirm |
| navy | #366092 | Secondary actions, links |
| background | #F8FAFC | App background |
| surface | #FFFFFF | Cards, sheets |
| error | #EF4444 | Errors, SOS |
| warning | #F59E0B | Warnings, pending |
| success | #10B981 | Success, on_time |
| textPrimary | #0F172A | Main text |
| textSecondary | #64748B | Secondary text |
| headerGradient | #FBBF24 → #FDE047 → #FEF08A | All screen headers |
| headerBorder | #DC2626, 4px | Header bottom border |

---

## NAVIGATION STRUCTURE (go_router)

```
/splash         → SplashScreen (check auth)
/login          → LoginScreen
/otp            → OTPScreen
/mfa-setup      → MFASetupScreen
/recovery-codes → RecoveryCodesScreen

Shell (bottom nav):
  /home          → HomeScreen
  /tasks         → TasksListScreen
  /tasks/:id     → TaskDetailScreen
  /checkin       → CheckInScreen
  /profile       → ProfileScreen

Modal:
  /notifications       → NotificationsScreen
  /leave-request       → LeaveRequestScreen
  /sos                 → SOSScreen
  /incident-report     → IncidentReportScreen
  /settings            → SettingsScreen
  /change-password     → ChangePasswordScreen
  /chat                → ConversationsScreen
  /chat/:id            → ChatScreen
```

---

## DATA-TESTID MAP (Flutter Keys)

| Element | Screen | Key |
|---------|--------|-----|
| Login button | LoginScreen | `Key('login_button')` |
| Username field | LoginScreen | `Key('username_field')` |
| Password field | LoginScreen | `Key('password_field')` |
| OTP field | OTPScreen | `Key('otp_field')` |
| Submit OTP button | OTPScreen | `Key('submit_otp_button')` |
| Use recovery code | OTPScreen | `Key('use_recovery_code_link')` |
| Recovery code field | RecoveryScreen | `Key('recovery_code_field')` |
| Check-in button | CheckInScreen | `Key('checkin_button')` |
| Check-out button | CheckInScreen | `Key('checkout_button')` |
| GPS accuracy | CheckInScreen | `Key('gps_accuracy_indicator')` |
| SOS button | SOSScreen | `Key('sos_button')` |
| Task accept button | TaskDetailScreen | `Key('task_accept_button')` |
| Task progress button | TaskDetailScreen | `Key('task_progress_button')` |
| Progress input | TaskDetailScreen | `Key('progress_input')` |
| Leave submit button | LeaveRequestScreen | `Key('leave_submit_button')` |
| Reason field | LeaveRequestScreen | `Key('reason_field')` |
| Mark all read | NotificationsScreen | `Key('mark_all_read_button')` |
| Logout button | ProfileScreen | `Key('logout_button')` |
| Biometric toggle | SettingsScreen | `Key('biometric_toggle')` |
| Chat send button | ChatScreen | `Key('chat_send_button')` |
| Chat input field | ChatScreen | `Key('chat_input_field')` |

---

## DEPENDENCIES (pubspec.yaml)

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.4.0
  dio: ^5.4.0
  socket_io_client: ^2.0.3
  flutter_secure_storage: ^9.0.0
  drift: ^2.14.0
  sqlite3_flutter_libs: ^0.5.0
  go_router: ^13.0.0
  geolocator: ^10.1.0
  geocoding: ^2.1.0
  qr_flutter: ^4.1.0
  mobile_scanner: ^4.0.0
  local_auth: ^2.1.0
  firebase_messaging: ^14.7.0
  firebase_core: ^2.24.0
  image_picker: ^1.0.7
  intl: ^0.19.0
  url_launcher: ^6.2.2
  permission_handler: ^11.2.0
  otp: ^3.1.4

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.1
  integration_test:
    sdk: flutter
  drift_dev: ^2.14.0
  build_runner: ^2.4.8
  mocktail: ^1.0.2
```
