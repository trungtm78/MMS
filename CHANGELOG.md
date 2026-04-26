# CHANGELOG — MMS Platform

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
