# BUSINESS FLOW

Feature: Unified DQTV management platform (Web + MilitianApp + PoliceApp)
Task ID: TASK-2026-001
Version: v1.0
Date: 2026-03-04

## ACTORS
| Actor | Role |
|---|---|
| System Admin | Manage system users, roles, policies, security, audit |
| UBND Leader | Monitor dashboards, reports, and approval status |
| Police Ward Officer | Operate ward-level assignments and alerts |
| Police Area Officer | Operate area-level assignments and approvals |
| Office Staff | Manage attendance, payroll preparation, exports |
| Militia User (DQTV) | Receive tasks, check-in, send reports, leave requests, SOS |
| Auditor | Inspect compliance and traceability |
| Security Admin | Manage device/session/risk controls |

## HAPPY PATH
1. User signs in from Web or mobile app, receives role + scope-based access.
2. Web acts as central management channel for all business data.
3. Police/Admin creates assignments from Web or PoliceApp.
4. Militia receives assignment in MilitianApp and updates progress/evidence.
5. Attendance and GPS events are synced to central services.
6. Leave request is submitted from MilitianApp and approved in Web/PoliceApp.
7. SOS or abnormal events trigger high-priority alerts.
8. KPI and payroll are calculated from approved attendance/task data.
9. All sensitive operations are recorded in immutable audit logs.

## EXCEPTIONS
- EX-01: Invalid role/scope for module access -> block 403 + audit.
- EX-02: Offline mobile operation -> queue locally and retry when online.
- EX-03: Concurrent update on same object -> return 409 conflict.
- EX-04: Token/session expiry mid-flow -> refresh or force re-login.
- EX-05: GPS unavailable/low accuracy -> reject or flag abnormal according to policy.
- EX-06: Device non-compliance (root/jailbreak/app too old) -> deny access.
- EX-07: Notification delivery failure -> retry + fallback channel.

## BUSINESS RULES
| BR-ID | Rule | Condition | Outcome |
|---|---|---|---|
| BR-001 | Shared core layer is mandatory | Shared APIs/contracts/libs | Use `C:/MMS/core` |
| BR-002 | Web is central control plane | Any cross-system CRUD | Persist to central backend/database |
| BR-003 | Role and scope are mandatory | Protected UI/API call | Allow only if role + scope pass |
| BR-004 | Unified auth/session/device policy | Any login/request | Enforce auth + session + device checks |
| BR-005 | Task lifecycle is controlled | Task created/updated | `pending -> in_progress -> completed/overdue/rejected` |
| BR-006 | Attendance requires geo-time proof | Check-in/check-out | Save time + geo + accuracy + source |
| BR-007 | Leave approval is traceable | Leave decision | Save approver, reason, timestamp |
| BR-008 | KPI and payroll are period-based | Closing monthly cycle | Use versioned formulas and locked periods |
| BR-009 | Alerts and notifications are event-driven | SOS/overdue/offline events | Real-time routing by role/scope |
| BR-010 | Payroll depends on approved source data | Payroll run/approval | Requires closed attendance + KPI periods |
| BR-011 | Device and session controls are mandatory | Mobile/web session lifecycle | Enrollment, limits, revoke, compliance |
| BR-012 | Search/export is scope-aware | User executes query/export | Return only authorized scoped data |
| BR-013 | Audit log is immutable | Sensitive operation happens | Store before/after + actor metadata |
| BR-014 | Error recovery is idempotent | Retry/offline sync | Prevent duplicate side effects |

## ASSUMPTIONS
- All UI/UX references are available under each subsystem `Refs` folder.
- Production mobile apps will be Flutter implementations based on approved references.
- One shared backend and one shared database are used for all subsystems.
- Shared contracts and common components are maintained in `C:/MMS/core`.
- Dev database credentials are for local environments only.

## PRELIMINARY SCOPE
- In scope: business analysis, detailed module definitions, shared architecture, security/device model, shared data model, testing plans.
- Out of scope: production deployment, external MDM/SIEM enterprise integrations, full BI export suite.
