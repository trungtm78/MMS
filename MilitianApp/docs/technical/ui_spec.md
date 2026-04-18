# UI SPEC — MilitianApp (Flutter Native)
Task ID: TASK-2026-001
Version: v2.0
Date: 2026-03-08

> Tham khảo UI/UX từ Refs/ directory. Flutter widgets thay thế React components.
> Ngôn ngữ: Tiếng Việt toàn bộ.

---

## DESIGN SYSTEM

### Colors (Material 3 ColorScheme)
```dart
class AppColors {
  static const primary = Color(0xFFDC2626);      // Red — headers, buttons
  static const secondary = Color(0xFFFBBF24);    // Yellow — gradient start
  static const tertiary = Color(0xFF15803D);     // Green — success, confirm
  static const navy = Color(0xFF366092);         // Navy — secondary actions
  static const background = Color(0xFFF8FAFC);   // Light gray
  static const surface = Color(0xFFFFFFFF);      // White — cards
  static const error = Color(0xFFEF4444);        // Red — errors, SOS
  static const warning = Color(0xFFF59E0B);      // Amber — warnings
  static const success = Color(0xFF10B981);      // Green — success
  static const textPrimary = Color(0xFF0F172A);
  static const textSecondary = Color(0xFF64748B);
  
  // Header gradient
  static const headerGradient = LinearGradient(
    colors: [Color(0xFFFBBF24), Color(0xFFFDE047), Color(0xFFFEF08A)],
  );
}
```

### Typography
```dart
class AppTextStyles {
  static const screenTitle = TextStyle(
    fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.primary,
  );
  static const cardTitle = TextStyle(
    fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary,
  );
  static const body = TextStyle(
    fontSize: 14, fontWeight: FontWeight.w400, color: AppColors.textPrimary,
  );
  static const caption = TextStyle(
    fontSize: 12, fontWeight: FontWeight.w400, color: AppColors.textSecondary,
  );
}
```

### Common Widgets
- **AppHeader**: Gradient vàng + border-bottom đỏ 4px + title đỏ in đậm
- **AppCard**: White rounded-xl, shadow-sm
- **PrimaryButton**: Green (#15803D) full-width, height 56, bold text
- **DangerButton**: Red (#DC2626) — SOS, logout
- **StatusBadge**: Rounded pill với màu theo status
- **GPS Indicator**: Key('gps_accuracy_indicator'), hiện ±Xm

---

## SCREENS

### 1. LoginScreen
**Route:** `/login`

**Layout:**
- Background: gradient vàng (from #FBBF24 to #FEF08A)
- Logo ANTT centered (160x160)
- Form card: gradient vàng nhạt, viền đỏ 4px, rounded-2xl
- Footer text bên dưới form

**Form Fields:**
| Field | Widget | Placeholder | Validation |
|-------|--------|-------------|------------|
| username | TextFormField | "dqtv001" | Required, min 3 |
| password | TextFormField (obscure) | "••••••" | Required, min 6 |

**States:**
- Empty: nút Login disabled
- Loading: CircularProgressIndicator trong nút
- Error: red banner với icon AlertCircle + message
- Success: navigate to /otp

**Buttons:**
- Toggle password visibility (eye icon, Key('password_toggle'))
- "Ghi nhớ" checkbox
- "Quên mật khẩu?" → bottom sheet
- "Đăng nhập" (Key('login_button'), xanh lá)

---

### 2. OTPScreen
**Route:** `/otp`

**Layout:**
- Header: "Xác thực 2 lớp"
- Icon khóa hoặc shield
- "Mở Microsoft Authenticator và nhập mã 6 số"
- Countdown timer (5 phút còn lại)
- OTP input: 6 ô vuông (Key('otp_field'))
- "Dùng mã khôi phục" link (Key('use_recovery_code_link'))

**States:**
- Empty: nút disabled
- Loading: spinner
- Error: "Mã OTP không đúng. Còn X lần thử"
- Countdown expired: "Mã đã hết hạn. Vui lòng đăng nhập lại" + nút về login

**Buttons:**
- "Xác nhận" (Key('submit_otp_button'))

---

### 3. MFASetupScreen
**Route:** `/mfa-setup`

**Layout:**
- Header: "Thiết lập xác thực 2 lớp"
- Step indicator (1/3 → 2/3 → 3/3)
- Step 1: Hướng dẫn scan QR + QR code (QrImage widget)
- Step 2: OTP input để confirm
- Step 3: Hiển thị recovery codes (10 codes)

**Recovery Codes Display:**
- Grid 2 columns, monospace font
- Button "Sao chép tất cả"
- Checkbox "Tôi đã lưu các mã này" → bắt buộc tick trước khi Continue
- Button "Hoàn thành" → navigate to Home

---

### 4. HomeScreen
**Route:** `/home`

**Layout:**
- AppHeader với avatar, tên, vai trò + badge + Bell icon (unread dot)
- Quick Stats: 2 cards (Ngày công, Chỉ tiêu) — progress bars
- Quick Actions: 2x2 grid (Báo cáo, Điểm danh, Nghỉ phép, Khẩn cấp)
- Today's Overview: 3 badges (Hoàn thành/Đang làm/Chưa làm)
- Today's Schedule: timeline list
- Notifications preview (max 3 items)
- Weather widget (gradient xanh)
- FAB: red phone icon (SOS)

**Quick Actions:**
| Action | Icon | Color | Navigate |
|--------|------|-------|---------|
| Báo cáo | FileText | #DC2626 | /incident-report |
| Điểm danh | Clock | #15803D | /checkin |
| Nghỉ phép | Calendar | #3B82F6 | /leave-request |
| Khẩn cấp | Phone | #DC2626 (pulse) | /sos |

---

### 5. CheckInScreen
**Route:** `/checkin`

**Layout:**
- AppHeader: "Điểm Danh"
- Status card: icon + text "Đã điểm danh" / "Chưa điểm danh"
- Time display: 08:24 AM + countdown "Còn X phút"
- Progress bar (thời gian còn lại trước deadline)
- GPS section: map placeholder + khoảng cách + accuracy
  - Key('gps_accuracy_indicator'): "±5m ✓" hoặc "±20m ✗"
- Primary button: "ĐIỂM DANH NGAY" (Key('checkin_button'))
- After check-in: "ĐIỂM DANH RA" button (Key('checkout_button'))
- History section: 5 records gần nhất
- Stats: Ngày công / Đúng giờ / Trễ progress bars

**GPS Flow:**
```
App start → request location permission
→ Permission granted → stream GPS updates
→ accuracy <= 15m → enable check-in button
→ accuracy > 15m → show warning, disable button
```

---

### 6. TasksListScreen
**Route:** `/tasks`

**Layout:**
- AppHeader: "Nhiệm Vụ Của Tôi" + Filter icon
- Tab bar: Đang làm | Chờ tiếp nhận | Đã hoàn thành | Quá hạn
- Task cards: border-left màu theo status

**Task Card:**
- Code (monospace, gray)
- Priority badge (top right)
- Title (bold)
- Location (MapPin icon)
- Deadline (Clock icon, red nếu quá hạn)
- AssignedBy (User icon)
- Description (2 lines max)
- Status badge + Action button

**Card Colors:**
| Status | Border | Badge |
|--------|--------|-------|
| pending | gray | gray |
| in-progress | blue | blue |
| completed | green | green |
| overdue | red | red |

---

### 7. TaskDetailScreen
**Route:** `/tasks/:id`

**Layout:**
- AppHeader: "Chi Tiết Nhiệm Vụ" + Back button
- Status + Priority badges
- Title
- Assigned By avatar + name + unit
- Details card: type, created, deadline
- Location card: map + distance + directions button
- Progress timeline (vertical steps)
- Fixed bottom: action buttons

**Bottom Actions:**
| Status | Buttons |
|--------|---------|
| pending | "Từ chối" (outlined red) + "Tiếp nhận" (Key('task_accept_button'), navy) |
| in-progress | "Cập nhật tiến độ" (Key('task_progress_button'), navy) |
| overdue | "Gửi giải trình" (amber) |
| completed | — |

---

### 8. ProfileScreen
**Route:** `/profile`

**Layout:**
- AppHeader: "Cá Nhân"
- Profile card: avatar + name + code + position + status dot
- Quick stats: Thâm niên / Điểm chỉ tiêu / Xếp hạng (3 cards)
- Personal info section (phone, email, dob, address, CCCD)
- Work info section (district, CA KV, start date, position)
- Emergency contact section
- Quick Actions grid (Nghỉ phép, Hotline)
- Settings list item
- Đăng xuất button (Key('logout_button'), red)

---

### 9. LeaveRequestScreen
**Route:** `/leave-request`

**Layout:**
- Header: "Đăng Ký Nghỉ Phép" (navy bg)
- Scrollable form:
  1. Loại nghỉ (radio cards)
  2. Thời gian (date pickers from/to + half-day checkbox)
  3. Số ngày tự động tính
  4. Lý do (textarea, counter, Key('reason_field'))
  5. Người thay thế (dropdown + preview card)
  6. File đính kèm (upload button)
  7. Tóm tắt đơn
- Fixed bottom: "Gửi đơn xin nghỉ" (Key('leave_submit_button'), disabled nếu invalid)

**Validation states:**
- Reason < 20 chars: "Tối thiểu 20 ký tự (còn X)" màu đỏ
- toDate < fromDate: "Ngày kết thúc phải sau ngày bắt đầu" màu đỏ

---

### 10. SOSScreen
**Route:** `/sos`

**Layout:**
- Header: "SOS & Báo Cáo Sự Cố" (navy bg)
- Tab bar: Báo cáo sự cố | SOS Khẩn cấp

**Tab 1 — Incident Report:**
- Loại sự cố (2x3 grid cards với emoji icons)
- Mức độ nghiêm trọng (vertical radio cards, 4 levels)
- Vị trí GPS (map + address)
- Mô tả (title input + textarea + mic button)
- Bằng chứng (3 buttons: camera, upload, mic)
- Người liên quan (number input +/-)
- Hành động đã thực hiện (checkboxes)
- Bottom: Submit button (color theo severity)

**Tab 2 — SOS:**
- Red gradient card + AlertTriangle icon (pulsing)
- "KÍCH HOẠT SOS" button — hold 2s (GestureDetector onLongPressStart)
- Key('sos_button')
- Hướng dẫn text
- Emergency contacts list (Gọi buttons)

**SOS Hold Animation:**
- Ring animation khi hold
- Countdown: 3, 2, 1 → "Đang gọi..."
- "HỦY" button

---

### 11. NotificationsScreen
**Route:** `/notifications`

**Layout:**
- Header: "Thông Báo" (navy bg) + "Đọc hết" button
- Unread count subtitle
- Tab bar: Tất cả | Nhiệm vụ | Chấm công | Hệ thống
- Notification list

**Notification Item:**
- Unread: blue dot + border-left blue
- Urgent: ring-2 ring-red
- Icon (colored by type)
- Title + urgent badge
- Body (2 lines)
- Time
- Trash icon (delete)
- Key: `Key('notification_item_\${id}')`

---

### 12. SettingsScreen
**Route:** `/settings`

**Layout:**
- Back button header
- Thông báo section (toggles):
  - Nhiệm vụ mới
  - Nhắc điểm danh
  - Tin nhắn
  - Âm thanh
  - Rung
- Bảo mật section:
  - Đổi mật khẩu (chevron)
  - Face ID / Touch ID (Key('biometric_toggle'), Switch)
- Ngôn ngữ: Tiếng Việt (only option, no switching)
- Phiên bản: 1.0.0

---

### 13. ConversationsScreen
**Route:** `/chat`

**Layout:**
- AppHeader: "Tin Nhắn"
- Search bar
- Conversation list:
  - Avatar + name + last message + time + unread badge

---

### 14. ChatScreen
**Route:** `/chat/:id`

**Layout:**
- Header: participant name + online status + Back button
- Message list (ListView.builder, reversed)
- Message bubbles:
  - My messages: navy, right aligned
  - Their messages: gray, left aligned
- Image attachments: rounded corners
- Input row:
  - "+" attach button
  - TextField (Key('chat_input_field'), expanded)
  - Send button (Key('chat_send_button'))

---

## BOTTOM NAVIGATION

5 tabs:
| Tab | Icon | Label | Route |
|-----|------|-------|-------|
| Trang chủ | Home | "Trang chủ" | /home |
| Nhiệm vụ | ClipboardList | "Nhiệm vụ" | /tasks (+ unread badge) |
| Điểm danh | MapPin | "Điểm danh" | /checkin |
| Chat | MessageCircle | "Chat" | /chat (+ unread badge) |
| Cá nhân | User | "Cá nhân" | /profile |

Colors:
- Active: #366092
- Inactive: #64748B

---

## COMMON EMPTY STATES

| Context | Icon | Title | Subtitle |
|---------|------|-------|---------|
| No tasks | ClipboardList | "Không có nhiệm vụ" | "Bạn chưa được giao nhiệm vụ nào" |
| No notifications | Bell | "Không có thông báo" | "Bạn đã xem hết thông báo" |
| No conversations | MessageCircle | "Chưa có tin nhắn" | "Bắt đầu trò chuyện với cấp trên" |
| No attendance | Calendar | "Chưa có dữ liệu" | "Dữ liệu điểm danh sẽ hiển thị tại đây" |

---

## LOADING STATES

- Initial load: Shimmer skeleton cards
- Pull to refresh: RefreshIndicator
- API loading: CircularProgressIndicator centered
- Button loading: SizedBox(16x16) CircularProgressIndicator trắng trong nút

---

## SUCCESS ANIMATIONS

| Screen | Animation | Duration |
|--------|-----------|---------|
| Check-in | Green circle scale in + CheckCircle icon | 2s |
| Leave submit | Green circle + CheckCircle | 2.5s → auto close |
| Incident submit | Green circle + CheckCircle | 2.5s → auto close |

---

## DATA-TESTID MAP

| Element | Screen | Key |
|---------|--------|-----|
| login_button | LoginScreen | `Key('login_button')` |
| username_field | LoginScreen | `Key('username_field')` |
| password_field | LoginScreen | `Key('password_field')` |
| password_toggle | LoginScreen | `Key('password_toggle')` |
| otp_field | OTPScreen | `Key('otp_field')` |
| submit_otp_button | OTPScreen | `Key('submit_otp_button')` |
| use_recovery_code_link | OTPScreen | `Key('use_recovery_code_link')` |
| recovery_code_field | RecoveryScreen | `Key('recovery_code_field')` |
| checkin_button | CheckInScreen | `Key('checkin_button')` |
| checkout_button | CheckInScreen | `Key('checkout_button')` |
| gps_accuracy_indicator | CheckInScreen | `Key('gps_accuracy_indicator')` |
| sos_button | SOSScreen | `Key('sos_button')` |
| task_accept_button | TaskDetailScreen | `Key('task_accept_button')` |
| task_progress_button | TaskDetailScreen | `Key('task_progress_button')` |
| progress_input | TaskDetailScreen | `Key('progress_input')` |
| leave_submit_button | LeaveRequestScreen | `Key('leave_submit_button')` |
| reason_field | LeaveRequestScreen | `Key('reason_field')` |
| mark_all_read_button | NotificationsScreen | `Key('mark_all_read_button')` |
| logout_button | ProfileScreen | `Key('logout_button')` |
| biometric_toggle | SettingsScreen | `Key('biometric_toggle')` |
| chat_send_button | ChatScreen | `Key('chat_send_button')` |
| chat_input_field | ChatScreen | `Key('chat_input_field')` |
