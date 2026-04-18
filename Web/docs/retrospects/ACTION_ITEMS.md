# ACTION ITEMS
Task: TASK-2026-001 | Date: 2026-03-08

| # | Action | Ai | Deadline | Cập nhật ở đâu | Status |
|---|--------|----|----------|----------------|--------|
| A-001 | Thêm bước "DB Schema Verification" vào 05_MAIN_BUILD_EXECUTE.md Phase 0 | PLAN | Next sprint | Promt_Lib/05_MAIN_BUILD_EXECUTE.md | OPEN |
| A-002 | Thêm ESLint rule `@typescript-eslint/consistent-type-imports: error` vào FE eslint.config.js | BUILD | Next task | Web/frontend/eslint.config.js | OPEN |
| A-003 | Template DTO phải include class-validator decorators từ đầu — update scaffolding guide | BUILD | Next task | docs/technical/02_SPEC_v1.0.md | OPEN |
| A-004 | Migrate in-memory lockout sang Redis khi deploy multi-instance | BUILD | Production | Web/backend/src/auth/auth.service.ts | OPEN |
| A-005 | Implement silent refresh E2E test với clock mocking (Playwright `page.clock`) | BUILD | Next sprint | Web/frontend/tests/e2e/specs/auth-role-scope.spec.ts | OPEN |
| A-006 | Provide DB schema dump (pg_dump --schema-only) khi bắt đầu mọi build task | HUMAN | Pre-task | docs/technical/erd.md | OPEN |
| A-007 | Add test user credentials to spec (seeded users + passwords) | PLAN | Next spec | docs/technical/02_SPEC_v1.0.md | OPEN |
| A-008 | Add route → role mapping table to UI spec | PLAN | Next spec | docs/technical/ui_spec.md | OPEN |
| A-009 | Phase 0.5 skeleton must cover 100% ACs — add to 05_MAIN_BUILD_EXECUTE.md checklist | PLAN | Next sprint | Promt_Lib/05_MAIN_BUILD_EXECUTE.md | OPEN |
| A-010 | Add per-file branch coverage check to Phase 2 exit criteria — verify each HIGH component ≥ 90% | BUILD | Next task | Promt_Lib/05_MAIN_BUILD_EXECUTE.md | OPEN |
| A-011 | Use dynamic dates in E2E tests (new Date() offset) to prevent duplicate-record flakiness | BUILD | Next sprint | Web/frontend/tests/e2e/specs/attendance-form.spec.ts | OPEN |
| A-012 | Add global-teardown cleanup for attendance_records with e2e_ militia prefix | BUILD | Next sprint | Web/frontend/tests/global-teardown.ts | OPEN |
| A-013 | Screenshot naming convention must be documented in task brief with 1 concrete example | PLAN | Next brief | Promt_Lib/05_MAIN_BUILD_EXECUTE.md | OPEN |
