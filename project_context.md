# PROJECT CONTEXT

Task ID: TASK-2026-001
Version: v2.1
Date: 2026-03-09

## Mission
Build a DQTV (Dân Quân Tự Vệ) management platform with 3 subsystems:
- `Web` — central control plane (Admin, Police Officer, Office Staff)
- `MilitianApp` — native mobile app for militia (DQTV) members
- `PoliceApp` — native mobile app for police area commanders

## Technology Decisions

| Subsystem | Platform | Framework | Language |
|---|---|---|---|
| Web | Browser | React + Next.js | TypeScript |
| MilitianApp | Android + iOS | Flutter | Dart |
| PoliceApp | Android + iOS | Flutter | Dart |
| Backend (shared) | Node.js | Express / NestJS | TypeScript |
| Database | PostgreSQL 18 | — | SQL |

## Authentication & Security

### Login Flow (all mobile apps)
1. User enters `username` + `password`
2. Backend validates credentials, returns `mfa_required: true` + `mfa_session_token`
3. User opens **Microsoft Authenticator** app → reads 6-digit TOTP
4. App submits TOTP + `mfa_session_token` to `/auth/verify-mfa`
5. Backend validates TOTP (RFC 6238, HMAC-SHA1, 30s window, ±1 step tolerance)
6. Backend returns `access_token` (JWT, 15min) + `refresh_token` (7 days)
7. App stores tokens in **Flutter Secure Storage** (Keychain/Keystore)

### 2FA Setup Flow (first time)
1. User logs in for the first time → backend generates TOTP secret
2. Backend returns `otpauth://totp/...` URI + base32 secret
3. App shows QR code → user scans with Microsoft Authenticator
4. User enters first OTP to confirm setup
5. Backend marks 2FA as enabled for this account

### Token Refresh
- Access token expires → app auto-refreshes via `refresh_token`
- Refresh token revoked/expired → force re-login

## Workspace Layout

```
C:/MMS
├── project_context.md          ← this file
├── CHANGELOG.md
├── Promt_Lib/                  ← AI pipeline prompts
├── core/                       ← shared backend & contracts
├── Web/                        ← React/Next.js web app
├── MilitianApp/                ← Flutter native app (militia)
├── PoliceApp/                  ← Flutter native app (police)
└── qa/                         ← QA test suites
```

### Shared Core (`C:/MMS/core`)
- `core/backend/` — shared API server (Node.js), runs on port 3001
- `core/frontend/` — shared UI kit (web only), client SDK
- `core/docs/` — shared documentation (business, technical, testing)
- `core/api/` — OpenAPI / Postman collections for mms_core
- `core/schemas/` — shared DTO, validation schemas
- `core/libs/` — shared packages
- `core/scripts/` — migrations, seed, utilities

### Web Subsystem (`C:/MMS/Web`)
- `Web/frontend/` — React + Next.js source (TypeScript)
- `Web/backend/` — Web-specific BFF (Node.js)
- `Web/docs/` — Web-specific documentation
- Status: **In Planning**

### MilitianApp Subsystem (`C:/MMS/MilitianApp`)
- `MilitianApp/mobile/` — **Flutter app** (Android + iOS)
  - `lib/core/` — network, storage, constants, auth
  - `lib/features/` — login (with 2FA), home, tasks, checkin, kpi, profile, notifications, leave, sos
  - `lib/shared/` — widgets, theme (Material 3), utils
  - `android/` — Android native config
  - `ios/` — iOS native config
  - `pubspec.yaml`
- `MilitianApp/backend/` — BFF Express proxy (port 3003 → core 3001)
- `MilitianApp/docs/` — App-specific documentation
- Status: **Planning Flutter rewrite** (React frontend removed 2026-03-08)

### PoliceApp Subsystem (`C:/MMS/PoliceApp`)
- `PoliceApp/mobile/` — **Flutter app** (Android + iOS), same stack as MilitianApp
  - `lib/core/` — network, storage, constants, auth
  - `lib/features/` — login (with 2FA), home (CA), dqtv_management, tasks, attendance, approvals, reports, alerts, profile, notifications
  - `lib/shared/` — widgets (2 shells: CA + DQTV), theme (Material 3), utils
  - `android/` — Android native config
  - `ios/` — iOS native config
  - `pubspec.yaml`
- `PoliceApp/backend/` — BFF Express proxy (port 3004 → core 3001)
- `PoliceApp/docs/` — App-specific documentation
- Status: **In Progress**

### QA/Testing (`C:/MMS/qa`)
- `qa/e2e/` — end-to-end tests (Playwright for Web; Flutter integration tests for mobile)
- `qa/uat/` — UAT test scripts
- `qa/unit/` — unit tests
- `qa/integration/` — integration tests
- `qa/rpa/` — RPA flows
- `qa/test-results/` — test outputs and screenshots

## PoliceApp Architecture

### App Design
PoliceApp phục vụ **2 role trong cùng 1 app**: Cảnh sát khu vực (CA) và Dân Quân Tự Vệ (DQTV). Role được detect tự động từ JWT claims sau khi đăng nhập — không có màn hình chọn role thủ công.

### UI/UX & Color Palette (theo Refs)
| Token | Hex | Dùng cho |
|---|---|---|
| `primary` | `#DC2626` | Header border, tiêu đề, button CA, icon accent |
| `secondary` | `#FBBF24` | Gradient header start |
| `gradientMid` | `#FDE047` | Gradient header mid |
| `gradientEnd` | `#FEF08A` | Gradient header end |
| `tertiary` | `#15803D` | Submit button, completed, darkGreen border |
| `navy` | `#366092` | Active nav, action buttons, progress bars |
| `background` | `#F8FAFC` | Page background |
| `surface` | `#FFFFFF` | Cards |
| `success` | `#10B981` | Online, completed, approved |
| `warning` | `#F59E0B` | Pending, late, away |
| `error` | `#EF4444` | Offline, rejected, urgent |
| `blue` | `#3B82F6` | In-progress, notifications |
| `textPrimary` | `#0F172A` | Main text |
| `textSecondary` | `#64748B` | Sub text, labels |
| `divider` | `#E2E8F0` | Borders, separators |
| `cardBorder` | `#FDE047` | Quick action card border |

**Header pattern** (tất cả screens): `gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A]` với `border-bottom: 4px solid #DC2626`.

### Feature Modules — CA Role
| Feature | Screens | Key APIs |
|---|---|---|
| Auth | Login, MFA Setup, MFA Verify | `POST /auth/login`, `POST /auth/verify-mfa`, `POST /auth/setup-mfa` |
| Dashboard | Tổng quan (stats, quick actions, alerts, activity) | `GET /dqtv`, `GET /tasks`, `GET /alerts`, `GET /kpi/team` |
| DQTV Management | Danh sách, tìm kiếm, filter, hồ sơ | `GET /dqtv`, `GET /dqtv/:id` |
| GPS Tracking | Bản đồ, markers, popup, bottom sheet | `WS /location`, `GET /dqtv/locations` |
| Create Task | Loại NV, voice input, map picker, giao DQTV | `POST /tasks`, `GET /dqtv` |
| Approve Requests | Tab pending/approved/rejected, modal detail | `GET /leave`, `PUT /leave/:id/approve`, `PUT /leave/:id/reject` |
| Reports | Thống kê chỉ tiêu, trend charts, bar charts, top 5 | `GET /reports/team`, `GET /kpi/team`, `GET /reports/attendance` |
| Alerts | Alert list (urgent/important/normal), modal chi tiết | `GET /alerts`, `PUT /alerts/:id/resolve` |
| Profile | Avatar, thông tin công tác, settings, notifications mgmt | `GET /users/me`, `PUT /users/me` |

### Feature Modules — DQTV Role
| Feature | Screens | Key APIs |
|---|---|---|
| Auth | Login DQTV, Forgot Password | `POST /auth/login` |
| Dashboard | Stats 2-col, Quick Actions 2×2, tasks hôm nay, notifications | `GET /tasks/today`, `GET /attendance/today`, `GET /kpi/current` |
| My Tasks | Filter tabs, stats 3-col, task cards, bắt đầu/hoàn thành | `GET /tasks`, `PUT /tasks/:id/accept`, `PUT /tasks/:id/complete` |
| Check-in | GPS check-in/out, lịch sử chấm công, stats | `POST /attendance/check-in`, `POST /attendance/check-out`, `GET /attendance/history` |
| Report Work | Loại báo cáo (hàng ngày/sự vụ/tháng), form, ảnh đính kèm | `POST /reports`, `GET /reports/my` |
| Profile DQTV | Stats (chỉ tiêu/ngày công/nhiệm vụ), thông tin cá nhân, logout | `GET /users/me` |

### Bottom Navigation
| Role | Tab 1 | Tab 2 | Tab 3 | Tab 4 | Tab 5 |
|---|---|---|---|---|---|
| CA | Trang chủ (Home) | DQTV (Users) | Bản đồ (MapPin) | Nhiệm vụ (ClipboardList) | Cá nhân (User) |
| DQTV | Trang chủ (Home) | Nhiệm vụ (ClipboardList) | Chấm công (Clock) | Báo cáo (FileText) | Cá nhân (User) |

Active color: `#366092` (navy). Inactive color: `#64748B`.

### Screen-by-Screen Implementation Notes

**Login (CA):**
- Yellow gradient full-screen background
- Card: `bg-[#FEFCE8]`, `border-4 border-[#DC2626]`, `rounded-3xl`
- Logo police image (assets), title "ĐĂNG NHẬP" in `#DC2626`
- Input fields: `border-2 border-[#DC2626]`, prefix icon panel `bg-white border-[#DC2626]`
- Submit button: `bg-[#15803D] text-[#FEFCE8] border-2 border-[#DC2626]`
- Footer: "HỆ THỐNG QUẢN LÝ DÂN QUÂN TỰ VỆ"

**Login (DQTV):**
- Yellow gradient full-screen background
- Shield icon (Lucide) trong circle `border-4 border-[#DC2626]`
- Card: `bg-gradient-to-br from-[#FEF9C3] to-[#FEF3C7]`, `border-4 border-[#DC2626]`
- Input: `border-2 border-[#DC2626]`
- Submit: `bg-[#DC2626]`, forgot password link
- Demo accounts shown at bottom

**Dashboard (CA):**
- Header gradient + avatar + tên + badge đơn vị + bell icon với badge
- Stats 2-col: card xanh (DQTV đang làm việc) + card đỏ (chỉ tiêu TB)
- Quick Actions 3×2 grid: Giao việc, Quản lý DQTV, Xem GPS, Duyệt đơn, Báo cáo, Cảnh báo
- Status Overview: horizontal scroll (Đang hoạt động / Nghỉ phép / Offline)
- Tasks Summary: donut chart SVG + 3 legend items
- Urgent Alerts: card `border-l-4 border-[#EF4444]` với action buttons Xem/Gọi
- Recent Activity: timeline với dots màu theo status
- FAB: `bg-[#366092]` bottom-right

**DQTVList (CA):**
- Header sticky với search bar + filter chips
- Filter: Tổng | Hoạt động | Nghỉ phép | Offline (màu dots tương ứng)
- Card DQTV: avatar circle, tên, mã số, phone, status dot, chỉ tiêu score (màu theo ngưỡng), 4 action buttons (Gọi/Nhắn/GPS/Hồ sơ)
- Chỉ tiêu color: `≥90 → #10B981`, `≥80 → #3B82F6`, `≥70 → #F59E0B`, `<70 → #EF4444`
- FAB: thêm DQTV mới

**GPS Tracking (CA):**
- Full-screen map area (gradient background + grid pattern)
- Floating header card với gradient + `border-2 border-[#DC2626]`
- Markers: avatar circles với border màu theo status + pulse animation khi online
- Map controls: 4 buttons (MyLocation, ZoomIn, ZoomOut, Layers)
- Filter chips floating (All/On Duty/Moving/Offline)
- Info popup khi tap marker: tên, vị trí, tốc độ, pin, nhiệm vụ, 3 buttons Gọi/Nhắn tin/Chi tiết
- Bottom sheet: list DQTV đang online

**CreateTask (CA):**
- Header sticky yellow gradient
- Task type grid 2×2: icon emoji + label (Tuần tra/Xử lý sự vụ/Tuyên truyền/Hỗ trợ dân)
- Thông tin cơ bản: title input + textarea + mic button (voice-to-text)
- Priority chips: Khẩn cấp(đỏ)/Cao(cam)/Trung bình(vàng)/Thấp(xám)
- Địa điểm: mini map placeholder + address input + "Chọn trên bản đồ"
- Thời gian: date pickers + time picker + toggle lặp lại
- Giao cho DQTV: search + selected chips (removable) + "Thêm người"
- Đính kèm: audio recordings list (play/pause/delete) + upload area
- Fixed bottom: "Lưu nháp" | "Gửi nhiệm vụ"

**ApproveRequests (CA):**
- Tabs: Chờ duyệt (amber) / Đã duyệt (green) / Từ chối (red)
- Request cards: `border-l-4` màu theo status, thông tin đơn, buttons Xem chi tiết/Duyệt/Từ chối
- Bottom sheet modal: thông tin DQTV + phép còn lại progress bar + chi tiết đơn + người thay thế + impact indicator
- Modal actions: "Từ chối" | "Phê duyệt"

**Reports (CA):**
- Horizontal scroll: 3 metric cards (Nhiệm vụ/Chấm công/Chỉ tiêu TB) với mini sparkline
- Task Completion Trend: SVG line chart (3 lines: Giao/Hoàn thành/Quá hạn)
- Attendance Breakdown: stacked bar chart theo tuần (Đúng giờ/Trễ/Vắng)
- Chỉ tiêu Distribution: horizontal bar chart theo range
- Top 5 xuất sắc: ranked list với medals
- Cần chú ý: warning list
- Fixed bottom: "Xuất PDF" | "Gửi báo cáo"

**Alerts (CA):**
- Tabs: Tất cả / Chưa đọc (red) / Đã đọc (green)
- Alert cards: `border-l-4` màu theo type (urgent=đỏ/important=cam/normal=xanh)
- Icon theo category (absence/deadline/kpi/gps/violation/task)
- Unread dot indicator
- Bottom sheet modal chi tiết: type badge, mô tả, DQTV info, call/message buttons, detail rows (vị trí/tasks/kpi change/violations/progress/lastSeen)
- Suggested actions block: `bg-[#FFF7ED] border border-[#F59E0B]`
- Modal actions: "Đóng" | "Đánh dấu đã xử lý"

**Profile (CA):**
- Header gradient với avatar circle `border-4 border-[#DC2626]`, tên, mã, đơn vị, edit button
- Stats 3-col: DQTV / Chỉ tiêu TB / Kinh nghiệm
- Sections: Thông tin cá nhân / Thông tin công tác / Cài đặt ứng dụng / Quản lý thông báo / Dữ liệu & bảo mật / Về ứng dụng
- Toggle switches (green `#10B981` when on)
- Logout section: `bg-[#FEF2F2] border border-[#FEE2E2]`

**DashboardDQTV:**
- Header gradient + avatar + tên + badge "DQTV - CA Khu vực 1" + bell
- Stats 2-col: xanh (Nhiệm vụ hôm nay) + đỏ (Chỉ tiêu tháng này)
- Quick Actions 2×2: Nhiệm vụ(đỏ)/Chấm công(xanh)/Báo cáo(amber)/Hồ sơ(blue)
- Today's tasks list: cards `border-l-4` (xanh=hoàn thành/amber=đang làm/gray=chưa)
- Notifications: cards với icon circle màu

**MyTasks (DQTV):**
- Header sticky với search + filter icon
- Filter tabs: Tất cả/Chưa bắt đầu/Đang làm/Hoàn thành (active = `bg-[#DC2626]`)
- Stats 3-col: Hoàn thành(xanh)/Đang làm(amber)/Chưa làm(gray)
- Task cards: `border-l-4` màu theo priority (high=đỏ/medium=amber/low=gray)
- Card content: title, date, MapPin(đỏ), Clock(amber), action buttons
- Empty state: AlertCircle icon + message

**CheckIn (DQTV):**
- Date card với Calendar icon trong circle đỏ
- Check-in card: `bg-gradient-to-br from-[#DC2626] to-[#B91C1C]`, big clock display
- Khi checked-in: info panel `bg-white bg-opacity-20` + "Check-out" button trắng
- Khi chưa check-in: "Check-in ngay" + "Chụp ảnh check-in" buttons
- Stats 3-col: Ngày công(xanh)/Đi muộn(amber)/Vắng mặt(đỏ)
- Attendance History: list cards `border-l-4` xanh/đỏ

**ReportWork (DQTV):**
- Type tabs: Hàng ngày/Sự vụ/Tháng (active = `bg-[#DC2626]`)
- Form card: `border-2 border-[#FDE047]`
- Location input với MapPin icon đỏ
- Textarea + character counter + Mic button
- Image grid 4-col + add button với dashed border đỏ
- Submit: `bg-[#DC2626]` với Send icon
- Recent reports list: `border-l-4` xanh/amber theo status

**ProfileDQTV:**
- Header gradient + avatar `border-4 border-[#DC2626]` + tên + badges (DQTV + rank)
- Stats 3-col: Chỉ tiêu(xanh)/Ngày công(đỏ)/Nhiệm vụ(amber), negative margin để overlap header
- Personal info: rows với icon circles màu (Phone=amber/Mail=blue/MapPin=red/Calendar=green/Award=amber)
- Settings menu: Cài đặt/Đổi MK/Điều khoản/Đăng xuất(đỏ)
- Logout confirmation modal: icon circle đỏ + confirm dialog

## Flutter App Architecture (MilitianApp & PoliceApp)

### Package Decisions
| Concern | Package |
|---|---|
| State management | `flutter_riverpod` |
| HTTP client | `dio` + JWT interceptor |
| Secure storage | `flutter_secure_storage` |
| Navigation | `go_router` |
| GPS/Location | `geolocator` |
| QR code display | `qr_flutter` |
| TOTP client-side | `otp` (dart) |
| Local DB / cache | `drift` (SQLite) |
| Push notifications | `firebase_messaging` |
| UI base | Material 3 |

### Feature Modules (MilitianApp)
| Feature | Screens | Key APIs |
|---|---|---|
| Auth | Login, MFA Setup, MFA Verify | `POST /auth/login`, `POST /auth/verify-mfa`, `POST /auth/setup-mfa` |
| Home | Dashboard, Quick Actions | `GET /attendance/today`, `GET /tasks?limit=3`, `GET /kpi/current` |
| Tasks | Task List, Task Detail, Accept | `GET /tasks`, `POST /tasks/:id/accept`, `POST /tasks/:id/progress` |
| Check-in | GPS Check-in/out, History | `POST /attendance/check-in`, `POST /attendance/check-out` |
| KPI | Score Card, Ranking, History | `GET /kpi/current`, `GET /kpi/ranking`, `GET /kpi/history` |
| Profile | Info, Settings, Logout | `GET /users/me`, `GET /users/me/militia-profile` |
| Notifications | List, Mark Read | `GET /notifications`, `POST /notifications/:id/read` |
| Leave Request | New Request, My Requests | `POST /leave-requests`, `GET /leave-requests` |
| Emergency SOS | Report Incident, Contacts | `POST /incidents/sos`, `POST /incidents/report` |

### Feature Modules (PoliceApp — CA Role)
| Feature | Screens | Key APIs |
|---|---|---|
| Auth | Login, MFA Setup, MFA Verify | `POST /auth/login`, `POST /auth/verify-mfa`, `POST /auth/setup-mfa` |
| Home | Dashboard CA (stats, quick actions, alerts, activity) | `GET /dqtv`, `GET /tasks`, `GET /alerts`, `GET /kpi/team` |
| DQTV Management | Danh sách, tìm kiếm, filter, hồ sơ | `GET /dqtv`, `GET /dqtv/:id` |
| GPS Tracking | Bản đồ, markers real-time, popup, bottom sheet | `WS /location`, `GET /dqtv/locations` |
| Create Task | Loại NV, voice input, map picker, giao DQTV | `POST /tasks`, `GET /dqtv` |
| Approve Requests | Tab pending/approved/rejected, modal detail | `GET /leave`, `PUT /leave/:id/approve`, `PUT /leave/:id/reject` |
| Reports | Trend charts, bar charts, top 5, attendance breakdown | `GET /reports/team`, `GET /kpi/team`, `GET /reports/attendance` |
| Alerts | Alert list (urgent/important/normal), modal + suggested actions | `GET /alerts`, `PUT /alerts/:id/resolve` |
| Profile CA | Avatar, thông tin công tác, settings, notification toggles | `GET /users/me`, `PUT /users/me` |

### Feature Modules (PoliceApp — DQTV Role)
| Feature | Screens | Key APIs |
|---|---|---|
| Auth | Login DQTV, Forgot Password | `POST /auth/login` |
| Dashboard DQTV | Stats 2-col, Quick Actions 2×2, tasks hôm nay, notifications | `GET /tasks/today`, `GET /attendance/today`, `GET /kpi/current` |
| My Tasks | Filter tabs, stats 3-col, task cards, bắt đầu/hoàn thành | `GET /tasks`, `PUT /tasks/:id/accept`, `PUT /tasks/:id/complete` |
| Check-in | GPS check-in/out, stats, lịch sử chấm công | `POST /attendance/check-in`, `POST /attendance/check-out`, `GET /attendance/history` |
| Report Work | Loại báo cáo, form + ảnh đính kèm, báo cáo gần đây | `POST /reports`, `GET /reports/my` |
| Profile DQTV | Stats, thông tin cá nhân, logout confirm modal | `GET /users/me` |

## Shared Core Contract
- API namespace: `mms_core`
- Base URL: `/api/v1/mms_core`
- Auth: Bearer JWT (access_token)
- 2FA endpoint: `/api/v1/mms_core/auth/verify-mfa`
- MFA setup endpoint: `/api/v1/mms_core/auth/setup-mfa`

## Database (Dev)
- Engine: PostgreSQL 18
- Host: `localhost`
- Port: `5433`
- Database: `MMS`
- Credentials: `postgres/postgres` (dev only — never commit to prod)

## Architecture Principles
- One backend + one central database for all channels
- RBAC + unit scope enforcement on UI and API
- 2FA mandatory for all mobile users (TOTP via Microsoft Authenticator)
- JWT tokens stored in platform secure storage only (never localStorage/SharedPreferences plain)
- Event-driven notifications and alerts (Firebase FCM)
- GPS accuracy threshold: ≤15m for check-in validation
- Offline queue: failed check-in/report actions retry on reconnect
- Immutable audit logging for all sensitive operations
- Device/session tracking on login

## Primary Document Index (Shared)
- `C:/MMS/core/docs/business/01_BUSINESS_FLOW.md`
- `C:/MMS/core/docs/user-stories/US_LIST.md`
- `C:/MMS/core/docs/technical/02_SPEC_v1.0.md`
- `C:/MMS/core/docs/technical/api_specification.md`
- `C:/MMS/core/docs/technical/erd.md`
- `C:/MMS/core/docs/testing/03_TEST_SCENARIOS.md`
- `C:/MMS/core/docs/testing/04_E2E_TEST_PLAN.md`

## MilitianApp Document Index
- `C:/MMS/MilitianApp/docs/business/01_BUSINESS_FLOW.md`
- `C:/MMS/MilitianApp/docs/user-stories/US_LIST.md`
- `C:/MMS/MilitianApp/docs/technical/02_SPEC_v1.0.md`
- `C:/MMS/MilitianApp/docs/technical/api_specification.md`
- `C:/MMS/MilitianApp/docs/technical/erd.md`
- `C:/MMS/MilitianApp/docs/technical/ui_spec.md`
- `C:/MMS/MilitianApp/docs/testing/03_TEST_SCENARIOS.md`
- `C:/MMS/MilitianApp/docs/testing/04_E2E_TEST_PLAN.md`

## PoliceApp Document Index
- `C:/MMS/PoliceApp/docs/business/01_BUSINESS_FLOW.md`
- `C:/MMS/PoliceApp/docs/user-stories/US_LIST.md`
- `C:/MMS/PoliceApp/docs/technical/02_SPEC_v1.0.md`
- `C:/MMS/PoliceApp/docs/technical/api_specification.md`
- `C:/MMS/PoliceApp/docs/technical/erd.md`
- `C:/MMS/PoliceApp/docs/technical/ui_spec.md`
- `C:/MMS/PoliceApp/docs/testing/03_TEST_SCENARIOS.md`
- `C:/MMS/PoliceApp/docs/testing/04_E2E_TEST_PLAN.md`

## Changelog
- `2026-03-09` — v2.1: PoliceApp architecture documented — 2 roles (CA + DQTV), full screen-by-screen UI/UX spec, feature module table, color palette, navigation structure. Status changed to "In Progress".
- `2026-03-08` — v2.0: MilitianApp/PoliceApp changed from React+Vite to Flutter native. 2FA (TOTP) added to auth flow. React frontend and Refs removed from MilitianApp.
- `2026-03-04` — v1.0: Initial project context created.
