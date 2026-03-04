# E2E TEST PLAN
Task ID: TASK-2026-001 | Version: v1.0 | Date: 2026-03-04

Source of truth for business UAT mapping: `docs/testing/03_UAT_CASES.md`.

## TOOL SELECTION
| US | Risk | Tool | Reason |
|---|---|---|---|
| US-001 | 🔴 | Playwright | Web auth and role routing flows |
| US-004 | 🟡 | Playwright + TagUI | Cross-channel workflow with repeated dispatch actions |
| US-006 | 🔴 | TagUI | Mobile-like attendance/GPS behavior orchestration |
| US-008 | 🔴 | Playwright + TagUI | Alert propagation + multi-role handling |
| US-009 | 🔴 | Playwright | Device enrollment and account controls |
| US-010 | 🔴 | Playwright | Session revoke and token invalidation |
| US-011 | 🔴 | Playwright | Payroll close workflow and approvals |
| US-014 | 🔴 | Playwright | Audit search and traceability |
| US-015 | 🟡 | TagUI | Offline/online recovery and idempotency |

## PLAYWRIGHT TEST INVENTORY
| US | AC | Scenario ID | Spec file | Category | Priority |
|---|---|---|---|---|---|
| US-001 | AC-1 | E2E-001-HP | tests/e2e/specs/auth-role-scope.spec.ts | happy-path | P0 |
| US-001 | AC-4 | E2E-001-AUTH | tests/e2e/specs/auth-role-scope.spec.ts | auth | P0 |
| US-002 | AC-1 | E2E-002-HP | tests/e2e/specs/admin-user-role.spec.ts | happy-path | P0 |
| US-002 | AC-2 | E2E-002-NG | tests/e2e/specs/admin-user-role.spec.ts | negative-path | P1 |
| US-004 | AC-1 | E2E-004-HP | tests/e2e/specs/task-cross-platform.spec.ts | happy-path | P1 |
| US-005 | AC-3 | E2E-005-ALERT | tests/e2e/specs/task-cross-platform.spec.ts | exception | P1 |
| US-007 | AC-1 | E2E-007-HP | tests/e2e/specs/leave-approval.spec.ts | happy-path | P1 |
| US-007 | AC-4 | E2E-007-AUTH | tests/e2e/specs/leave-approval.spec.ts | auth | P1 |
| US-008 | AC-1 | E2E-008-HP | tests/e2e/specs/sos-alert.spec.ts | happy-path | P0 |
| US-009 | AC-1 | E2E-009-HP | tests/e2e/specs/device-enrollment.spec.ts | happy-path | P0 |
| US-009 | AC-3 | E2E-009-BV | tests/e2e/specs/device-enrollment.spec.ts | boundary | P0 |
| US-010 | AC-1 | E2E-010-HP | tests/e2e/specs/session-revoke.spec.ts | happy-path | P0 |
| US-010 | AC-3 | E2E-010-NG | tests/e2e/specs/session-revoke.spec.ts | negative-path | P0 |
| US-011 | AC-1 | E2E-011-HP | tests/e2e/specs/payroll-close-period.spec.ts | happy-path | P0 |
| US-011 | AC-3 | E2E-011-REWORK | tests/e2e/specs/payroll-close-period.spec.ts | multi-step | P0 |
| US-013 | AC-1 | E2E-013-ROUTING | tests/e2e/specs/notification-routing.spec.ts | integration | P1 |
| US-014 | AC-1 | E2E-014-TRACE | tests/e2e/specs/audit-traceability.spec.ts | traceability | P0 |

## TAGUI FLOW INVENTORY
| Flow | Script | Trigger | Frequency |
|---|---|---|---|
| Attendance check-in/out with GPS quality conditions | rpa/flows/attendance_gps.tag | Shift start/end | Daily |
| SOS offline queue then online replay | rpa/flows/sos_offline_replay.tag | Connectivity change | Event-driven |
| Cross-platform task dispatch verification | rpa/flows/task_dispatch_cross_platform.tag | Task created by police/admin | Hourly |
| Offline idempotent retry verification | rpa/flows/offline_recovery_idempotent.tag | Scheduled resilience run | Daily |

## SCREENSHOT REQUIREMENTS
For each HIGH risk US, required screenshot checkpoints:

| US | Step | File name pattern |
|---|---|---|
| US-001 | Login form before submit | auth-step01-form.png |
| US-001 | Post-login role landing | auth-step02-role-landing.png |
| US-006 | Successful check-in | attendance-step01-checkin-success.png |
| US-006 | GPS accuracy rejection | attendance-error01-gps-accuracy.png |
| US-008 | SOS submitted | sos-step01-submitted.png |
| US-008 | Alert received in police view | sos-step02-police-alert.png |
| US-009 | Device enroll success | device-step01-enrolled.png |
| US-009 | Device-limit reached error | device-error01-limit-reached.png |
| US-010 | Session revoke confirmation | session-step01-revoke-confirm.png |
| US-011 | Payroll close review | payroll-step01-review.png |
| US-011 | Payroll locked success | payroll-step02-locked.png |
| US-014 | Audit query result | audit-step01-query-result.png |

## TRACEABILITY MATRIX
| Requirement | AC | Scenario ID | Test file | Status |
|---|---|---|---|---|
| US-001 | AC-1 | E2E-001-HP | tests/e2e/specs/auth-role-scope.spec.ts | Pending |
| US-001 | AC-4 | E2E-001-AUTH | tests/e2e/specs/auth-role-scope.spec.ts | Pending |
| US-004 | AC-1 | E2E-004-HP | tests/e2e/specs/task-cross-platform.spec.ts | Pending |
| US-006 | AC-1 | UAT-US006-01 | tests/uat/attendance.uat.spec.ts | Pending |
| US-008 | AC-1 | UAT-US008-01 | tests/uat/sos.uat.spec.ts | Pending |
| US-009 | AC-3 | E2E-009-BV | tests/e2e/specs/device-enrollment.spec.ts | Pending |
| US-010 | AC-1 | E2E-010-HP | tests/e2e/specs/session-revoke.spec.ts | Pending |
| US-011 | AC-1 | E2E-011-HP | tests/e2e/specs/payroll-close-period.spec.ts | Pending |
| US-014 | AC-1 | E2E-014-TRACE | tests/e2e/specs/audit-traceability.spec.ts | Pending |
| US-015 | AC-3 | UAT-US006-02 | tests/uat/offline-recovery.uat.spec.ts | Pending |
