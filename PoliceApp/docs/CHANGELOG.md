# CHANGELOG — PoliceApp
Task ID: TASK-2026-002

---

## [Unreleased] — BUILD EXECUTE phase

### To be added
- Core Backend: migration 010 (work_reports), seed ca001, routes gps/alerts/reports/users
- PoliceApp BFF (port 3004)
- Flutter mobile app (toàn bộ)

---

## [0.2.0] — 2026-03-10 — BUILD DOCS complete

### Added
- `docs/technical/erd.md` — Entity Relationship Diagram toàn bộ DB schema
- `docs/technical/ui_spec.md` — UI Spec đầy đủ tất cả screens (ASCII wireframes + design tokens)
- `docs/testing/03_TEST_SCENARIOS.md` — 70+ test scenarios covering 13 test suites
- `docs/testing/04_E2E_TEST_PLAN.md` — 6 E2E test suites + boundary value tests

---

## [0.1.0] — 2026-03-10 — BUILD DOCS initial

### Added
- `project_context.md` — v2.1 với PoliceApp architecture
- `docs/business/01_BUSINESS_FLOW.md` — Actors, 7 happy paths, exceptions, business rules
- `docs/user-stories/US_LIST.md` — 19 User Stories (US-001..US-019) với AC + UAT Risk
- `docs/technical/02_SPEC_v1.0.md` — Tech stack, architecture, color palette, business rules chi tiết
- `docs/technical/api_specification.md` — Đặc tả tất cả endpoints + Core changes cần thực hiện
- Cấu trúc thư mục: docs/business/, docs/user-stories/, docs/technical/, docs/testing/, mobile/integration_test/, mobile/test/

### Discovered
- Core đã có sẵn: routes auth, users/me, tasks, attendance, leave-requests, kpi, notifications
- Bảng DB sẵn có: users, roles, permissions, militia_profiles, police_profiles, tasks, task_assignments, attendance_records, gps_points, gps_latest, leave_requests, kpi_scores, alerts, notifications
- Cần thêm: migration 010 (work_reports), seed ca001, 3 routes mới (gps/alerts/reports), 2 endpoints users
