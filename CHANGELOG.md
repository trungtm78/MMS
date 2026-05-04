# CHANGELOG — MMS Platform

---

## [0.3.1.0] — 2026-05-04

### Fixed
- **GPS Tracking** — trang `/gps` không hiển thị bản đồ và danh sách DQTV do 3 lỗi đồng thời:
  - `getLive()` trả sai tên field (`militiaId`/`fullName`/`lastSeenAt` → `id`/`name`/`lastUpdate`); giữ alias backward-compat cho PoliceApp `/gps/team`
  - `gps_points` và `gps_latest` không tồn tại trong DB dev; SeederService tự tạo khi khởi động
  - `recordLocation` ghi sai ID (`users.id` thay vì `militia_profiles.id`); thêm lookup + CTE atomic insert; throw 404 thay vì silent drop khi profile chưa liên kết
- **MilitiaList Edit button** — nút "Chỉnh sửa" trong danh sách DQTV không có `onClick`; giờ fetch full profile và mở `MilitiaEditModal`
- **Frontend crash khi khởi động** — `TaskListPage` import `TaskItem` interface như runtime value gây Vite crash toàn bộ app; fix thành `import type`
- **Favicon và tab title** — đổi tên tab từ "vite-project" thành "Hệ thống quản lý DQTV"; favicon thay bằng khiên xanh + ngôi sao vàng

### Changed
- `capturedAt` trong GPS record API: validate `@IsISO8601()` thay vì `@IsString()` để tránh PostgreSQL runtime error

## [0.3.0.0] — 2026-05-01

### Added
- **Hệ thống báo cáo pháp định DQTV** — 9 loại báo cáo Excel chuẩn nhà nước: quân số (Mẫu 01-BC), điểm danh tổng hợp, kết quả huấn luyện (TT 69/2020), KPI, khen thưởng-kỷ luật (TT 57/2020), lương phụ cấp (NĐ 72/2020 Điều 41-52), kiểm kê vũ khí, Mẫu 03-BC tổng hợp (TT 144/2014), nhật ký kiểm toán (TT 13/2013)
- **ExcelExportService** — dịch vụ xuất Excel chuẩn nhà nước: header CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM 5 dòng, SHA-256 document hash (NĐ 30/2020), signature block với cell.note hướng dẫn in, freeze panes, conditional status coloring (ĐẠT/CẢNH BÁO/KHÔNG ĐẠT), currency format ₫, summary stats thay thế chart (tương thích WPS/Office 2010)
- **ComplianceDashboardPage** — dashboard tổng quan tuân thủ pháp luật: 5 widget cards (quân số, huấn luyện, điểm danh, KPI, miễn giảm), skeleton loader, stale timestamp, NaN guard, ngưỡng cảnh báo từ system_settings
- **TrainingComplianceReportPage** — báo cáo huấn luyện per TT 69/2020: ĐẠT/CẢNH BÁO/KHÔNG ĐẠT per DQTV, phân loại theo 4 loại huấn luyện
- **Sidebar "Báo cáo pháp định"** — nhóm collapsible 5 routes trong sidebar (≤14 items tổng)
- **Compliance alerts scheduler** — cron 8am daily: cảnh báo DQTV < 12 ngày huấn luyện khi còn < 60 ngày cuối năm
- **MilitianApp TrainingScreen** — màn hình xem đợt huấn luyện: progress bar X/15 ngày, filter chips theo loại, pull-to-refresh, empty/error states
- **PoliceApp UnitComplianceScreen** — màn hình tuân thủ đơn vị cho CA: 4 summary cards, danh sách DQTV cần chú ý
- **PoliceApp TrainingManagementScreen** — quản lý huấn luyện trên mobile: danh sách, FAB thêm mới, form type/ngày/địa điểm/kết quả

### Changed
- **PayrollPage** — thêm tab "Tuân thủ": so sánh lương thực lĩnh vs lương tối thiểu vùng, highlight vi phạm
- **ChiTieuDashboardPage** — thêm tab "Báo cáo KPI": bảng 5 tiêu chí, xepLoai (Xuất sắc/Tốt/Khá/Cần cải thiện), export
- **WeaponsPage** — thêm tab "Kiểm kê": tình trạng kho, overdue highlight, biên bản kiểm kê (nội bộ)
- **CustomReportPage** — hoàn thiện Mẫu 03-BC với dữ liệu thực từ API (4-section: quân số/huấn luyện/kỷ luật/kinh phí)
- **ActivityLogPage** — thêm export nhật ký kiểm toán (system_admin only, 90-day cap, CSV/Excel)

### Security
- IDOR fix: tất cả export endpoints enforce `unitScope` từ JWT — CA ward A không xem roster ward B
- `GET /dashboard/compliance`: thêm `@Roles` guard (dqtv_member không xem unit-wide stats)
- `GET /audit/export`: restrict to `system_admin` only
- `GET /militia/me/data-export`: thêm commander approval step (NĐ 13/2023)

## [0.2.2.0] — 2026-05-01

### Added
- **Thêm DQTV flow** — "Thêm DQTV" button on MilitiaList now navigates to `/militia/new`; new `MilitiaCreateForm` component with Zod validation, duplicate-code (409) error handling, role guard (`office_staff`, `ca_officer`, `system_admin` only), and route ordering fix (`/militia/new` declared before `/militia/:id`)
- **Chỉnh sửa modal** — "Chỉnh sửa" button on MilitiaProfilePage now opens inline `MilitiaEditModal` with 5 editable fields, Escape/backdrop dismiss, unsaved-changes confirmation guard, and query invalidation on save
- **Xuất Excel (Attendance)** — "Xuất Excel" button on AttendanceReportPage wired to a `limit:1000` export query with `disabled` + loading state; downloads as `diem-danh-YYYY-MM-DD.csv`
- **csv-export.ts utility** — shared CSV export utility extracted from MilitiaList with email-column bug fix; used by MilitiaList and AttendanceReportPage
- **Backend test coverage** — 29 new `.spec.ts` files for Web/backend (24 controllers + 5 services); 12 new Vitest spec files for core/backend services; total test count: 858 tests across 98 suites

### Fixed
- CSV email column was incorrectly populated from the phone field — fixed during csv-export utility extraction
- Route order: `/militia/new` now declared before `/militia/:id` in App.tsx to prevent React Router matching `"new"` as a profile ID

## [0.2.1.0] — 2026-04-30

### Added
- **Payroll Period Management** — create new payroll periods (`POST /payroll/periods`) and reopen locked periods (`POST /payroll/periods/:id/reopen`); periods transition to `draft` state on reopen with full audit log
- **Leave Cancel** — militia members can cancel their own pending leave requests (`PATCH /leave/:id/cancel`); frontend "Hủy đơn" button added to LeavePage
- **Militia Update + Soft Delete** — commanders can update militia profiles (`PATCH /militia/:id`) and soft-delete (deactivate) records (`DELETE /militia/:id`); MilitiaProfilePage Edit button now functional
- **Task Edit + Cancel** — CA officers can edit pending/assigned tasks (`PATCH /tasks/:id`) with race-condition-safe SELECT FOR UPDATE, and cancel tasks with required reason (`DELETE /tasks/:id`); TaskListPage now shows Edit/Cancel actions
- **Weapons Full CRUD** — complete weapon inventory management: create, update, get by ID, retire (soft delete) weapons, plus allocate weapons to militia and record returns (`PATCH /weapons/allocations/:id/return`). Custody records are immutable — no hard deletes.
- **Recruitment Module** — new backend module for militia recruitment applications (`/recruitment/applications`): create, list, review (status transitions: new → reviewing → approved/rejected), and soft delete. Includes reviewer notes and audit fields.
- **Organization Full CRUD** — unit management with proper TypeScript DTOs replacing `any` types; add `GET`, `PATCH`, `DELETE` for individual units with sub-unit dependency checks; `PUT positions/:id` → `PATCH` for consistent REST semantics.

### Fixed
- Race conditions in payroll `reopenPeriod`, leave `cancelLeaveRequest`, weapon `retire`, and weapon `createAllocation` — all now use database-level `SELECT FOR UPDATE` within transactions to prevent concurrent mutation conflicts.
- Weapon service: replaced `null as unknown as Date` TypeORM type hack with proper `IsNull()` operator.

## [0.2.0.0] — 2026-04-27

### Added

**ANTT Branding & UI/UX Redesign (Phase 1-3)**
- Complete redesign applying official UBND Phường Phú Định ANTT color system: `#C62828` red, `#2E7D32` green, `#F4F269` yellow
- New `GlobalFooter` component with ward address, contact info, and NCSC trust badge
- Header redesigned: `h-20`, `bg-[#F4F269]`, `border-b-4 border-[#C62828]`, ANTT banner logo, WS/SOS/bell/user-dropdown in right rail
- Sidebar redesigned: `bg-[#2E7D32]`, collapsible grouped navigation (8 groups), `openMenus` Set state, active item `bg-[#F4F269] text-[#C62828]`, mobile slide-in overlay
- LoginPage redesigned: `bg-[#F4F269]` background, ANTT logo, red border form card, show/hide password toggle
- DashboardPage: 4 stat cards with trend badges, Recharts line+bar charts, gradient quick-actions panel
- All 23 content pages restyled to design system (MilitiaList, MilitiaProfilePage, TaskListPage, TimesheetPage, PayrollPage, AttendanceReportPage, TaskReportPage, ChiTieuDashboardPage, CustomReportPage, ApprovalsPage, UserManagementPage, AssignmentManagePage, ActivityLogPage, SettingsProfilePage, SettingsPasswordPage, SettingsSystemPage, SettingsChiTieuPage, SettingsNotificationsPage, DocumentationPage, ChatPage, OfficialDocumentsPage, QuickActionsWidget, MilitiaSearchPage)

**Phase 0 — Stub Completions**
- `SettingsProfilePage`: proper edit-mode toggle with PATCH `/users/me/profile` mutation, cancel resets to original values
- `SettingsPasswordPage`: Zod schema (min 8, confirmPassword match), POST `/auth/change-password` with 400 error handling
- `SettingsNotificationsPage`: each toggle calls PATCH `/users/me/notifications` immediately with optimistic update + rollback
- `SettingsChiTieuPage`: Zod validation (min 0, reasonable max), inline errors `text-[#C62828]`, submit disabled when invalid
- `SettingsSystemPage`: AlertDialog confirm before destructive save, `data-testid="confirm-save-btn"` for testability
- `DocumentationPage`: client-side search filter via `useMemo`, accordion sections with `border-[#E2E8F0]`, ANTT section headers

**Phase 0.5 — New Route Pages**
- `GPSTrackingPage` (`/gps`): Leaflet map with `react-leaflet`, sidebar filter, `refetchInterval: 30000`, RBAC guard `can.viewGps`
- `LeavePage` (`/leave`): 2 tabs (my requests / manage approvals), modal form, approve/reject mutations
- `SOSPage` (`/sos`): live alert list with resolve mutation, empty state
- `NotificationsPage` (`/notifications`): filter Tất cả/Chưa đọc/Đã đọc, mark-as-read per item, mark-all button
- `DeviceSessionsPage` (`/devices`): session table with revoke confirm dialog, RBAC guard `can.manageDevices`

**Phase 4 — Legal Compliance Modules (Luật 48/2019 & Nghị định 72/2020)**
- `OrganizationPage` (`/organization`): unit tree view (Đại đội → Trung đội → Tiểu đội), biên chế thực tế vs quy định, Loại 1/2-3 classification per Chương 3 Luật 48/2019
- `WeaponsPage` (`/weapons`): weapon inventory with serial numbers, allocation log (issue/return), periodic inventory form per Luật quản lý sử dụng vũ khí
- `RecruitmentPage` (`/recruitment`): application workflow tabs, criteria checklist (political/health/judicial), approve → creates militia record per Luật 48/2019 Điều 18-21
- `ExemptionPage` (`/exemptions`): miễn/hoãn nghĩa vụ records, expiry warning badge (≤30 days), legalBasis field per Điều 20 Nghị định 72/2020
- `TrainingPlanPage` (`/training`): annual training plans, per-session attendance checkboxes, compliance % vs 15-day minimum per Thông tư 69/2020/TT-BQP
- `RewardsManagePage` (`/rewards`): 12 commendation forms per Thông tư 57/2020, discipline workflow with appeal per Thông tư 93/2024

**Phase 4 — Backend (NestJS)**
- `organization` module: `GET /organization/structure`, `PUT /organization/positions/:id`, `POST /organization/units`
- `weapons` module: `GET/POST/PUT /weapons`, `GET/POST /weapons/allocations`, `POST /weapons/inventory-check`
- `exemption` module: `GET/POST /exemptions`, `PATCH /exemptions/:id/review`
- TypeORM entities: `OrganizationUnit`, `WeaponItem`, `WeaponAllocation`, `ExemptionRecord`

**RBAC Additions**
- `can.manageWeapons` — `system_admin`, `police_ward`, `ubnd_leader`
- `can.manageRecruitment` — `system_admin`, `police_ward`, `ubnd_leader`

### Changed

- App.tsx: 5 new routes added (`/gps`, `/leave`, `/sos`, `/notifications`, `/devices`, `/organization`, `/weapons`, `/recruitment`, `/exemptions`, `/training`, `/rewards`)
- Sidebar: 8 grouped collapsible sections replacing flat list, `'organization'/'weapons'/'recruitment'/'exemptions'/'training'/'rewards'` AppRoute entries added
- `MilitiaProfilePage`: 6 NĐ 72/2020 fields added to Personal tab (occupation, educationLevel, healthStatus, bloodType, permanentAddress, judicialClearanceStatus)
- Training tab on MilitiaProfilePage: per-member training records table with `compliance-badge` (≥15 days = Đạt)
- Content area layout: `pt-20 lg:ml-64` to accommodate `h-20` header

### Tests

- Frontend unit tests: **214 tests** (30 suites) — all green
- New test files: `GPSTrackingPage.test.tsx`, `LeavePage.test.tsx`, `SOSPage.test.tsx`, `NotificationsPage.test.tsx`, `DeviceSessionsPage.test.tsx`, `OrganizationPage.test.tsx`, `WeaponsPage.test.tsx`, `RecruitmentPage.test.tsx`, `ExemptionPage.test.tsx`, `TrainingPlanPage.test.tsx`, `RewardsManagePage.test.tsx`
- Updated tests: PayrollPage (totalPages field, multi-element heading), SettingsSystemPage (confirm dialog step), MilitiaProfilePage (TrainingRecord types, badge class patterns), SettingsNotificationsPage (auto-save design)

---

## [0.1.1.0] — 2026-04-26

### Added

**CA→DQTV Explicit Assignment (Tree Permission)**
- New `ca_dqtv_assignments` table — explicitly links CA officers to the DQTV members they supervise, replacing the previous implicit unit-scope relationship
- New `/assignments` API: POST to assign a DQTV to a CA, DELETE to remove, GET to list (system_admin manages; CA officers can view their own list)
- AssignmentManagePage — admin split-panel UI to select a CA officer, view their assigned DQTV, add new ones via a search-and-select modal, and remove them with inline confirmation
- "Phân công" sidebar menu item visible to `system_admin` only

### Changed

**Scope Enforcement Across Services**
- Militia list view: CA officers now see only their explicitly assigned DQTV (falls back to unit scope when they have zero assignments, for backward compatibility with new accounts)
- Task assignment: CA officers can only create tasks for DQTV they are explicitly assigned to
- KPI evaluation: CA officers can only submit evaluations for their assigned DQTV

### Fixed

- `createAssignment` now uses a single CTE to INSERT + JOIN in one round-trip, eliminating a partial-failure window where the row could exist in the DB but the API returned a 500
- `removeAssignment` now uses `DELETE ... RETURNING` instead of a SELECT-then-DELETE, closing a TOCTOU race condition
- `formatDate` returns `—` instead of `NaN/NaN/NaN` on null or malformed date values
- Multi-DQTV assignment now uses `Promise.allSettled` so partial failures are reported per-item rather than silently orphaning earlier successful assignments

---

## [0.1.0.0] — 2026-04-18

### Added

**Infrastructure (Phase 1)**
- Docker Compose stack: Redis (AOF), PostgreSQL (5433:5432), NestJS, Nginx, React frontend
- Production compose with replica support and no exposed DB ports
- Multi-stage Dockerfiles (NestJS + React/Vite → Nginx)
- Nginx config: `/api/*` and `/socket.io/` → NestJS, `/` → React SPA
- Makefile targets: `up`, `down`, `migrate`, `test-backend`, `dev-backend`
- Idempotent DB migration runner (`npm run db:migrate`) with `unaccent` extension bootstrap

**NestJS Backend (Phase 1+2)**
- Redis distributed login-lockout (TTL 30min, survives restart) via `@nestjs/cache-manager`
- Distributed rate limiting via `@nest-lab/throttler-storage-redis`
- TypeORM pool: `{min: 2, max: 20, idleTimeoutMillis: 30000}`
- Health endpoint: `GET /health` (DB ping + heap via Terminus)
- AdminModule: 6 endpoints with `assertUnitScope()` RBAC (list/create/get/update-status/update-role/reset-password)
- WebSocket NotificationsGateway: JWT auth on connect, room-based routing (`user:<id>`, `unit:<code>`)
- `@socket.io/redis-adapter` for Socket.IO multi-instance
- Militia, Tasks, Attendance: paginated endpoints returning `{ data, total, page, limit }`

**React Web Frontend (Phase 2+3)**
- URL-based React Router routing (replaced `useState<AppRoute>` + switch)
- 16 CSS design-system tokens (header gradient, primary navy, status colors)
- UserManagementPage, TaskListPage, MilitiaList, MilitiaSearchPage, SettingsProfilePage, SettingsPasswordPage, AttendanceReportPage — all with server-side pagination and TanStack Query
- Password strength meter with 5 requirement indicators
- Fixed WebSocket CORS from wildcard to configurable `CORS_ORIGIN` env var

**Flutter Mobile Apps**
- AppColors superset merged across MilitianApp + PoliceApp (all design tokens unified)
- `dart-define` API URL pattern — dev: `http://10.0.2.2:3000/api/v1/mms_core`, prod via `--dart-define`
- Firebase/FCM removed; NestJS WebSocket push replaces it (on-premise, no Google dependency)
- PoliceApp: `speech_to_text`, `record`, `just_audio`, `flutter_rating_bar` added

### Changed

- Pagination API contract: all list endpoints standardized to `{ data, total, page, limit }` with `?page=1&limit=20`
- Refresh token `withCredentials` consistently `false` (body-based strategy)

### Tests

- NestJS: 52 tests (7 suites — auth, admin, militia, tasks, attendance, integration, app controller)
- React frontend: 111 Vitest tests (9 suites)
- E2E Playwright specs: admin-module, militia-list, task-list

---

## [v1.0.0-militian-docs] — 2026-03-08

Task: TASK-2026-001 | Subsystem: MilitianApp
Stories: 12 (10 Must / 2 Should) | BRs: 12
E2E Risk: 4 HIGH 🔴 / 4 MED 🟡 / 4 LOW 🟢

### BUILD DOCS — MilitianApp Frontend (Phase 04)
- Tạo `MilitianApp/docs/business/01_BUSINESS_FLOW.md` — actors, happy path, exceptions, business rules
- Tạo `MilitianApp/docs/user-stories/US_LIST.md` — 12 US với AC và UAT risk + Scope Lock
- Tạo `MilitianApp/docs/technical/02_SPEC_v1.0.md` — input schema, validation, boundary values, error matrix, component architecture
- Tạo `MilitianApp/docs/technical/api_specification.md` — 23 endpoints với request/response schema
- Tạo `MilitianApp/docs/technical/erd.md` — frontend TypeScript types + backend table mapping
- Tạo `MilitianApp/docs/technical/ui_spec.md` — form specs, screen specs, data-testid map (50+ elements)
- Tạo `MilitianApp/docs/testing/03_TEST_SCENARIOS.md` — 80+ test scenarios theo UAT risk
- Tạo `MilitianApp/docs/testing/04_E2E_TEST_PLAN.md` — E2E test inventory + screenshot requirements + traceability matrix
- Tạo cấu trúc thư mục: `frontend/tests/` (unit, integration, uat, e2e/specs, pages, fixtures, helpers)
- Tạo `frontend/test-results/uat/screenshots/`

### Scope confirmed
IN_SCOPE: Login, Home, MyTasks, CheckIn, LeaveRequest, SOS, TaskReport, KPI, Profile, Notifications, MyRequests, Token Refresh
OUT_OF_SCOPE: EvaluateDQTV, CreateTask, TaskManagement, WebSocket, Flutter

---

## [Planned] v1.0.0-militian-build — TBD

### BUILD EXECUTE — MilitianApp Frontend (Phase 05)
- Phase 0: Tool readiness check
- Phase 0.5: E2E skeleton files tạo trước code
- Phase 0.6: UI Element Scan + add data-testid
- Phase 1: Implement — port 5 screens từ Refs, nâng cấp 6 screens từ mock → API
- Phase 2: Unit tests (hooks, utils)
- Phase 3: Integration tests
- Phase 4: Code review + lint
- Phase 5: Refactoring gate
- Phase 6: UAT automation
- Phase 7: E2E Playwright
- Phase 8: EXECUTION_RETURN.md
