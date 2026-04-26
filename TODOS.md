# TODOS

## Flutter / Mobile

## Web / Backend

**Priority:** P1
**Title:** NestJS FilesModule — file upload endpoint (DONE 2026-04-19)
**Description:** Multer + local `/uploads/` directory + `POST /files/upload` + `GET /files/:id`. Integrated into AppModule. Required for TaskCreateForm file attachments.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-19)
**Status:** DONE

---

**Priority:** P2
**Title:** Recruitment module — frontend + backend
**Description:** `Recruitment.tsx` Refs component ready but no backend endpoint exists. Need `POST /api/v1/militia/recruitment` + approval workflow before frontend can be implemented. Deferred until backend endpoint is added.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-19)

---

**Priority:** P2
**Title:** Fix worker process leak in auth integration test
**Description:** `auth.integration.spec.ts` causes a worker process to force-exit after tests. Likely an open timer or DB connection not torn down. Run with `--detectOpenHandles` to find the leak.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-18)

**Priority:** P2
**Title:** GPSTracking page — deferred until NestJS GPS module is implemented
**Description:** `GPSTracking.tsx` not included in this release. NestJS GPS module is empty (no API endpoints). Implement backend GPS endpoints first, then port the frontend.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-18)

## Phase 4 (Polish)

**Priority:** P3
**Title:** PulseIndicator animated widget (Flutter both apps)
**Description:** Animated online-status pulse indicator for militia cards.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-18)

## Completed (2026-04-19 continued)

- **PayrollPage** — full KPI table + period selector + lock mutation + CSV export (2026-04-19)
- **QuickActionsWidget** — floating FAB + popup with 8 navigation shortcuts (2026-04-19)
- **TaskCreateForm enhanced** — location field + file upload via FilesModule (2026-04-19)
- **PoliceApp: ForgotPasswordScreen** — 4-step OTP recovery flow (2026-04-19)
- **PoliceApp: MyTasksScreen** — already existed in tasks_screen_dqtv.dart (verified)
- **FilesModule (NestJS)** — Multer upload + file serve (2026-04-19)
- **MilitiaList enhanced** — unit/status filters + CSV export + profile navigation (2026-04-19)
- **MilitiaProfilePage** — 6-tab profile view (2026-04-19)
- **Backend: POST /tasks/:id/report** — task report submission endpoint + tests (2026-04-19)
- **Backend: KpiModule POST /kpi/evaluate** — CA evaluation with weighted score + duplicate guard (2026-04-19)
- **Backend: GET /attendance from/to range** — date range filter + backward-compat fallback (2026-04-19)
- **MilitianApp: TaskReportScreen** — audio/photo/GPS report form + pubspec + permissions (2026-04-19)
- **MilitianApp: IncidentReportScreen upgrade** — replaced timer mock with real AudioRecorder/AudioPlayer (2026-04-19)
- **MilitianApp: task report route** — /tasks/:id/report + "Báo cáo" button in TasksListScreen (2026-04-19)
- **PoliceApp: ChiTieuEvaluationScreen** — 5 weighted sliders + recommendation chips + POST /kpi/evaluate (2026-04-19)
- **PoliceApp: AttendanceCalendar widget** — full-month GridView + from/to range API + integrated into CheckInScreen (2026-04-19)
- **SettingsNotificationsPage** — toggle prefs + save (2026-04-19)
- **SettingsChiTieuPage** — KPI target config (2026-04-19)
- **SettingsSystemPage** — read-only admin settings (2026-04-19)
- **TaskReportPage** — bar charts + stat cards (2026-04-19)
- **CustomReportPage** — date range + type selector + CSV export (2026-04-19)
- **ChiTieuDashboardPage** — KPI metric cards + trend line chart (2026-04-19)
- **ActivityLogPage** — paginated audit trail with search (2026-04-19)
- **ApprovalsPage** — approve/reject leave + task requests (2026-04-19)
- **TimesheetPage** — weekly grid attendance view (2026-04-19)
- **DocumentationPage** — accordion help content (2026-04-19)
- **MilitianApp: EvaluateDQTV screen** — 5-star criteria rating (2026-04-19)
- **MilitianApp: CreateTask screen** — task creation form (2026-04-19)
- **MilitianApp: Documentation screen** — ExpansionTile help sections (2026-04-19)
- **App.tsx routes + Sidebar** — all new pages registered (2026-04-19)

## Completed (2026-04-26 — v0.1.1.0)

- **CA→DQTV AssignmentsModule** — explicit 1-to-many assignment table + CRUD API (2026-04-26)
- **AssignmentManagePage** — split-panel admin UI for managing CA→DQTV assignments (2026-04-26)
- **Militia/Task/KPI scope enforcement** — CA officers restricted to assigned DQTV only (2026-04-26)
