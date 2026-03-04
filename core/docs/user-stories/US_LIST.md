# US_LIST
Task ID: TASK-2026-001 | Version: v1.0 | Locked: 2026-03-04

## US-001: Unified authentication and scoped authorization
Actor: All users | Goal: Sign in and reach correct role/scope workspace | Reason: Security and operational correctness | Priority: Must | Size: L | BR-ref: BR-002, BR-004
UAT Risk: 🔴 HIGH

## US-002: User/role/scope administration
Actor: System Admin | Goal: CRUD users, roles, unit scope | Reason: Centralized governance across 3 systems | Priority: Must | Size: L | BR-ref: BR-003, BR-013
UAT Risk: 🔴 HIGH

## US-003: Militia profile management
Actor: Police + Office Staff | Goal: Maintain full militia profiles | Reason: Shared master data for all channels | Priority: Must | Size: L | BR-ref: BR-002
UAT Risk: 🟡 MED

## US-004: Cross-system task assignment
Actor: Police/Admin | Goal: Assign tasks from Web/PoliceApp to MilitianApp | Reason: Unified dispatch operation | Priority: Must | Size: L | BR-ref: BR-005, BR-009
UAT Risk: 🟡 MED

## US-005: Task progress and overdue handling
Actor: Police/Leader | Goal: Monitor and react to progress changes | Reason: SLA and operational control | Priority: Must | Size: M | BR-ref: BR-005, BR-009
UAT Risk: 🟡 MED

## US-006: Attendance check-in/check-out with GPS
Actor: Militia (app), Police/Office (oversight) | Goal: Accurate attendance with geo-time evidence | Reason: Payroll/KPI foundation | Priority: Must | Size: L | BR-ref: BR-006, BR-010
UAT Risk: 🔴 HIGH

## US-007: Leave request and approval workflow
Actor: Militia submits, Police/Admin approves | Goal: Controlled leave lifecycle | Reason: HR compliance and continuity | Priority: Must | Size: M | BR-ref: BR-007
UAT Risk: 🟡 MED

## US-008: SOS emergency alerts
Actor: Militia + Police | Goal: Trigger and process emergency incidents quickly | Reason: Personnel safety | Priority: Must | Size: M | BR-ref: BR-009
UAT Risk: 🔴 HIGH

## US-009: Device enrollment and trust management
Actor: Militia/Police/Admin | Goal: Bind account access to trusted devices | Reason: Prevent account sharing and leakage | Priority: Must | Size: M | BR-ref: BR-011
UAT Risk: 🔴 HIGH

## US-010: Session management and remote revoke
Actor: User/Admin/Security Admin | Goal: Revoke risky sessions rapidly | Reason: Reduce exposure window | Priority: Must | Size: M | BR-ref: BR-011
UAT Risk: 🔴 HIGH

## US-011: KPI and payroll period processing
Actor: Office/Admin/Leader | Goal: Compute and approve KPI/payroll by period | Reason: Transparent compensation governance | Priority: Must | Size: L | BR-ref: BR-008, BR-010
UAT Risk: 🔴 HIGH

## US-012: Search/filter/export reporting
Actor: Admin/Police/Office/Leader | Goal: Query and export analytics/reports | Reason: Operation visibility | Priority: Should | Size: M | BR-ref: BR-012
UAT Risk: 🟢 LOW

## US-013: Multi-channel notifications
Actor: System + recipients | Goal: Deliver event notifications by role/scope | Reason: Keep users informed in time | Priority: Must | Size: M | BR-ref: BR-009
UAT Risk: 🟡 MED

## US-014: Audit traceability
Actor: Admin/Auditor | Goal: Track who did what and when | Reason: Compliance and incident forensics | Priority: Must | Size: M | BR-ref: BR-013
UAT Risk: 🔴 HIGH

## US-015: Error recovery and idempotent sync
Actor: All users | Goal: Preserve business actions under network/session failures | Reason: Field reliability | Priority: Must | Size: M | BR-ref: BR-014
UAT Risk: 🟡 MED

---
## SCOPE LOCK
IN_SCOPE: US-001 🔴, US-002 🔴, US-003 🟡, US-004 🟡, US-005 🟡, US-006 🔴, US-007 🟡, US-008 🔴, US-009 🔴, US-010 🔴, US-011 🔴, US-013 🟡, US-014 🔴, US-015 🟡

OUT_OF_SCOPE: US-012 🟢 (advanced BI export), external MDM enterprise integration, production SIEM connectors

ACCEPTANCE CRITERIA TONG THE:
- [ ] All 🔴 stories: 100% AC covered by E2E with screenshot evidence
- [ ] All 🟡 stories: happy path + at least 1 negative/error path
- [ ] Unit coverage >= 80% for core modules
- [ ] Lint errors = 0, security high/critical = 0
- [ ] No hardcoded credentials/secrets in implementation paths
