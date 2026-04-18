# TODOS

## Flutter / Mobile

**Priority:** P1
**Title:** Flutter EvaluateDQTV standalone screen (PoliceApp)
**Description:** Star rating UI + evaluation criteria for police to score DQTV members. Requires `flutter_rating_bar` (already in pubspec). Deferred from plan: `h-y-ph-n-t-ch-k-lovely-pearl.md`
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-18)

---

**Priority:** P1
**Title:** Flutter enhanced team attendance calendar (PoliceApp)
**Description:** Full-month calendar view showing team attendance status per day. Deferred from plan: `h-y-ph-n-t-ch-k-lovely-pearl.md`
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-18)

## Web / Backend

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
**Title:** QuickActions, ActivityLog, Approvals, Payroll, Timesheet pages (Web)
**Description:** Phase 4 polish items — all require backend API endpoints first.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-18)

**Priority:** P3
**Title:** PulseIndicator animated widget (Flutter both apps)
**Description:** Animated online-status pulse indicator for militia cards.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-18)

## Completed

*(none yet)*
