# TECHNICAL SPEC v1.0 — MilitianApp Frontend
Task ID: TASK-2026-001
Date: 2026-03-08
Subsystem: MilitianApp (React + Vite + TypeScript)

---

## PLATFORM BASELINE

- Framework: React 18 + Vite 6 + TypeScript 5
- Styling: Tailwind CSS 3 + custom design tokens
- State: Zustand 5 với persist middleware (localStorage key: `mms-auth`)
- HTTP: Axios với interceptors (auto refresh + retry)
- Forms: React Hook Form 7
- Routing: React Router DOM 7 (tab-based navigation, không dùng URL routing)
- Testing: Playwright 1.58 (E2E), Vitest (unit — nếu cần)
- Port: Frontend 3002, BFF 3003, Core API 3001
- Base API path (frontend): `/api/v1/mms_core` (proxied qua Vite dev server → BFF → Core)

---

## INPUT SCHEMA + VALIDATION

### Login Form
- `username`: required, string, 3..50 ký tự
- `password`: required, string, min 6 ký tự (field demo — prod: min 8)
- `device.name`: string, tự động = `navigator.userAgent.slice(0,50)`
- `device.platform`: enum `'android' | 'ios' | 'web'` — dùng `'web'` trong phase 1
- `device.fingerprint`: string — SHA-256 hash của `userAgent + screen.width + screen.height`
- Error: `"Tên đăng nhập hoặc mật khẩu không đúng"`
- Empty field error: disabled submit button (không toast)

### Check-in/Check-out Form
- `location.lat`: required, number, valid latitude
- `location.lng`: required, number, valid longitude
- `location.accuracy`: required, number, phải ≤ 15 (meters)
- `timestamp`: auto-generated ISO string từ `new Date().toISOString()`
- `source`: hardcode `'mobile'`
- Error accuracy: `"GPS không đủ chính xác (±{accuracy}m). Vui lòng di chuyển ra nơi thoáng và thử lại"`
- Error GPS denied: `"Không thể lấy vị trí GPS. Vui lòng cấp quyền truy cập vị trí"`

### Leave Request Form
- `fromDate`: required, ISO date string `YYYY-MM-DD`
- `toDate`: required, ISO date string `YYYY-MM-DD`
- `reason`: required, string, 1..500 ký tự
- `leaveTypeId`: required, string (from `/leave-requests/types`)
- Rule: `fromDate <= toDate`
- Error date: `"Ngày kết thúc phải sau hoặc bằng ngày bắt đầu"`
- Error reason: `"Vui lòng nhập lý do nghỉ phép"`

### SOS Form
- `severity`: required, enum `'high' | 'medium'`
- `message`: required, string, 1..500 ký tự
- `location.lat/lng`: optional (GPS lấy được thì gửi, không bắt buộc)
- Error: toast nếu submit fail sau 3 retry → queue offline

### Task Progress Form
- `progress`: required, number, 1..100
- `note`: string, 0..1000 ký tự (khuyến khích nhập)
- Rule: `progress = 100` → task complete
- Error: `"Tiến độ phải từ 1 đến 100"`

### Change Password Form
- `currentPassword`: required, string, min 6
- `newPassword`: required, string, min 6
- `confirmPassword`: required, phải === `newPassword`
- Error mismatch: `"Mật khẩu xác nhận không khớp"`
- Error wrong current: `"Mật khẩu hiện tại không đúng"` (từ API 400)

---

## BUSINESS RULES — IMPLEMENTATION

| BR-ID | Điều kiện | Logic | Output |
|---|---|---|---|
| BR-MA-01 | Mọi API call (trừ /auth/login) | Axios interceptor thêm `Authorization: Bearer {accessToken}` vào header | Request được gửi với auth |
| BR-MA-02 | Response 401 từ bất kỳ endpoint nào | Interceptor: gọi POST /auth/refresh → lưu token mới → retry request gốc | Seamless token refresh |
| BR-MA-03 | `accuracy > 15` khi check-in | Block submit, show error, enable "Thử lại" button | GPS recheck |
| BR-MA-04 | Task transition | Accept: pending→in_progress; Progress 100%: in_progress→completed | Lifecycle control |
| BR-MA-05 | SOS gửi thất bại (network fail) | LocalStorage queue với retry 30s polling | Offline resilience |
| BR-MA-06 | `fromDate > toDate` trong Leave form | Disable submit, show inline error ngay khi blur | Prevent invalid submit |
| BR-MA-07 | Retry request sau network error | Axios retry với exponential backoff (3 lần) | Error recovery |
| BR-MA-08 | User role = dqtv | Không render features Police/Admin | Role-based UI |
| BR-MA-09 | App foreground | Poll `/notifications?unreadOnly=true` mỗi 60s; stop khi app background | Near-realtime notify |
| BR-MA-10 | App restart | Zustand persist đọc từ localStorage `mms-auth` → restore state | Session persistence |
| BR-MA-11 | Login request | Gửi `device: { name, fingerprint, platform }` trong body | Device tracking |
| BR-MA-12 | SOS trigger | Dialog confirm 2 bước bắt buộc trước khi POST | Accidental press protection |

---

## BOUNDARY VALUES (BUILD PHẢI TEST)

| Boundary | Giá trị test | Expected |
|---|---|---|
| GPS accuracy = 15 | 15.0 | ACCEPTED (check-in allowed) |
| GPS accuracy = 15.01 | 15.01 | REJECTED (show error) |
| GPS accuracy = 14.99 | 14.99 | ACCEPTED |
| Leave from_date = to_date | Cùng ngày | ACCEPTED (single day leave) |
| Leave from_date > to_date | Ngày đến trước ngày đi | REJECTED (validation error) |
| Task progress = 1 | 1 | ACCEPTED |
| Task progress = 0 | 0 | REJECTED |
| Task progress = 100 | 100 | ACCEPTED + trigger complete |
| Task progress = 101 | 101 | REJECTED |
| Username length = 3 | "abc" | ACCEPTED |
| Username length = 2 | "ab" | REJECTED (min 3) |
| Password length = 6 | "123456" | ACCEPTED (demo min) |
| Password length = 5 | "12345" | REJECTED |
| Reason length = 500 | 500 chars | ACCEPTED |
| Reason length = 501 | 501 chars | REJECTED |

---

## ERROR MATRIX

| Code | Khi nào | Action | User thấy |
|---|---|---|---|
| E001 | Input format/schema sai | TERMINATE request | "Dữ liệu không hợp lệ" |
| E002 | Thiếu field bắt buộc | Block submit / show field error | "Vui lòng điền [field]" |
| E003 | Auth/session invalid (401) | Interceptor refresh → retry; fail → logout | "Phiên đăng nhập đã hết hạn" |
| E004 | Permission denied (403) | TERMINATE + toast | "Bạn không có quyền thực hiện thao tác này" |
| E005 | Network/system error (5xx/offline) | RETRY×3 → toast + manual retry button | "Hệ thống đang gặp sự cố, vui lòng thử lại" |

---

## COMPONENT ARCHITECTURE

```
MilitianApp/frontend/src/
├── App.tsx                    # Root: auth gate + session restore
├── main.tsx                   # React root render
├── components/
│   ├── BottomNav.tsx          # Navigation bar (5 tabs)
│   ├── MainLayout.tsx         # Shell: tab switcher + screen renderer
│   ├── LoadingScreen.tsx      # Splash screen during auth init
│   ├── Login.tsx              # US-MA-001
│   ├── Home.tsx               # US-MA-002
│   ├── MyTasks.tsx            # US-MA-003
│   ├── CheckIn.tsx            # US-MA-004
│   ├── LeaveRequest.tsx       # US-MA-005 [PORT FROM REFS]
│   ├── EmergencySOS.tsx       # US-MA-006 [PORT FROM REFS]
│   ├── TaskReport.tsx         # US-MA-007 [PORT FROM REFS]
│   ├── KPI.tsx                # US-MA-008
│   ├── Profile.tsx            # US-MA-009
│   ├── Notifications.tsx      # US-MA-010 [PORT FROM REFS]
│   └── MyRequests.tsx         # US-MA-011 [PORT FROM REFS]
├── hooks/
│   ├── useGPS.ts              # GPS geolocation hook
│   ├── useAttendance.ts       # Check-in/out state + API
│   ├── useNotifications.ts    # Polling hook
│   └── useOfflineQueue.ts     # SOS offline queue
├── services/
│   └── api.ts                 # Axios instance + all API functions
├── stores/
│   └── authStore.ts           # Zustand persist store
├── types/
│   └── app.ts                 # Shared TypeScript types
└── styles/
    └── globals.css            # Tailwind base + custom CSS
```

---

## DESIGN TOKENS (Tailwind)

| Token | Value | Dùng cho |
|---|---|---|
| primary | `#DC2626` | Header, nút chính, border quan trọng |
| secondary | `#FBBF24` | Header gradient, highlight |
| accent | `#15803D` | Success, action confirm |
| navy | `#366092` | Secondary action, links |
| background | `#F8FAFC` | App background |
| header gradient | `from-[#FBBF24] via-[#FDE047] to-[#FEF08A]` | Tất cả screen headers |
| border header | `border-b-4 border-[#DC2626]` | Header bottom border |

---

## NAVIGATION STRUCTURE

```
App
├── LoadingScreen (isLoading = true)
├── Login (isAuthenticated = false)
└── MainLayout (isAuthenticated = true)
    ├── Home (tab: home)
    │   ├── → Notifications (overlay)
    │   ├── → EmergencySOS (overlay)
    │   ├── → LeaveRequest (overlay)
    │   └── → TaskReport (overlay)
    ├── MyTasks (tab: tasks)
    │   └── → Task Detail (screen within)
    ├── CheckIn (tab: checkin)
    ├── KPI (tab: kpi)
    └── Profile (tab: profile)
        └── → MyRequests (screen within)
```
