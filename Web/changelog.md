# CHANGELOG

## [v1.1.0] — 2026-03-08
Task: TASK-SS-2026-001 | Stories: 11 (6 Must / 5 Should) | BRs: 10
E2E Risk: 2 HIGH 🔴 / 5 MED 🟡 / 4 LOW 🟢

### Added
- **SmartSelect component** (`src/components/ui/SmartSelect.tsx`): Reusable FK lookup component
  with keyboard navigation (ArrowUp/Down/Enter/Esc/Tab), mouse interaction, debounce search,
  loading/error/empty states, required validation, clear button, quick-create modal
- **useSmartSelect hook** (`src/hooks/useSmartSelect.ts`): State machine for SmartSelect
- **search.ts utilities** (`src/lib/search.ts`): normalizeVi(), toAcronym(), rankStaticOptions()
- **Button primitive** (`src/components/ui/Button.tsx`): Shared button component
- **Input primitive** (`src/components/ui/Input.tsx`): Shared input component
- **TaskCreateForm** (`src/components/tasks/TaskCreateForm.tsx`): Task assignment form with militia SmartSelect
- **AttendanceForm** (`src/components/attendance/AttendanceForm.tsx`): Attendance entry with militia + period SmartSelect
- **UserForm** (`src/components/users/UserForm.tsx`): Admin user form with static role/unitScope SmartSelect
- **PayrollKpiFilter** (`src/components/payroll/PayrollKpiFilter.tsx`): KPI filter with period + militia SmartSelect
- **Backend MilitiaModule**: `GET /militia/search` (unaccent SQL), `GET /militia/:id`, `POST /militia`
- **Backend UsersModule**: `GET /users/search` (system_admin only)
- **Backend TasksModule**: `POST /tasks`, `GET /tasks` with militia→user mapping
- **Backend AttendanceModule**: `POST /attendance`, `GET /attendance/periods`
- **PostgreSQL unaccent extension**: Required for Vietnamese text search
- **Unit tests**: SmartSelect (≥80% coverage), search.ts, useSmartSelect
- **E2E tests**: Playwright specs for all 🔴/🟡 user stories

### Changed
- `src/api/militia.ts`: Added `search()` and `create()` methods
- `src/api/users.ts`: Added `search()` method
- `src/types/index.ts`: Added `SmartSelectOption`, `MilitiaSearchItem`, `UserSearchItem` interfaces
- `backend/src/app.module.ts`: Imported MilitiaModule, UsersModule, TasksModule, AttendanceModule
- `backend/src/common/dto/`: Added `search-query.dto.ts`

### Schema Notes
- `task_assignments.assignee_id` → `users.id` (existing DB constraint)
- Service-level mapping: `militia_profiles.user_id` → `task_assignments.assignee_id`
- Guard: militia must have `user_id IS NOT NULL` to be assigned a task

---

## [v1.0.0] — 2026-03-08
Task: TASK-2026-001 | Stories: 13 (Must) | BRs: 12
E2E Risk: 0 HIGH 🔴 / 5 MED 🟡 / 0 LOW 🟢

### Added
- Auth flow (login, JWT, silent refresh, session expiry)
- RBAC hook with all role permissions
- All 10 API client modules
- Layout shell (Sidebar, Header, ProtectedRoute)
- Real-time Socket.io context (SOS + GPS)
- Dashboard page
- Global toast system
- Full backend auth (login/refresh/logout/me)
- JWT guard + Roles guard
- Global error filter (HttpExceptionFilter)
- PostgreSQL TypeORM connection
- E2E/UAT Playwright tests (7/7 pass)
- FE unit tests: 31/31
- BE unit tests: 9/9
- BE integration tests: 8/8
