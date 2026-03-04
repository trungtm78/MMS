# UAT CASES
Task ID: TASK-2026-001 | Version: v1.0 | Date: 2026-03-04

### UAT-US006-01: Militia starts morning shift with valid check-in
**Actor:** Militia user  
**Risk:** 🔴 HIGH  
**Context:** User starts patrol shift and must be counted for attendance.

**Initial state:**
- System: Shift and assignment exist for today.
- Actor: Logged into MilitianApp with GPS on.

**Steps:**
1. Open check-in flow before assignment execution.
2. Confirm position and submit check-in.
3. Open "My Tasks" and proceed with work.

**Expected outcome:**
- User sees successful check-in status with time and location.
- System records attendance + location proof.
- Police/Web sees updated online status.

**Failure path:**
- If GPS accuracy is poor, user gets actionable retry guidance.

**-> Automation:** `tests/uat/attendance.uat.spec.ts#uat-us006-01`

### UAT-US006-02: Check-in outside allowed task area
**Actor:** Militia user  
**Risk:** 🔴 HIGH  
**Context:** User attempts check-in from outside assignment zone.

**Expected outcome:**
- User receives warning and required follow-up note if policy demands.
- System flags abnormal attendance and raises operational alert.

**-> Automation:** `tests/uat/attendance.uat.spec.ts#uat-us006-02`

### UAT-US006-03: Forgot check-out and submits correction
**Actor:** Militia + Police approver  
**Risk:** 🔴 HIGH

**Expected outcome:**
- Correction request flows to approver.
- Approved correction updates attendance with adjustment flag.

**-> Automation:** `tests/uat/attendance.uat.spec.ts#uat-us006-03`

### UAT-US006-04: End-of-month multi-role attendance closure
**Actor:** Militia -> Police -> Office Staff  
**Risk:** 🔴 HIGH

**Expected outcome:**
- Attendance period is closed only after anomaly review.
- Payroll module receives locked attendance dataset.

**-> Automation:** `tests/uat/attendance.uat.spec.ts#uat-us006-04`

### UAT-US006-05: Boundary case at exact shift threshold time
**Actor:** Militia user  
**Risk:** 🔴 HIGH

**Expected outcome:**
- Exact threshold check-in is classified consistently by policy.

**-> Automation:** `tests/uat/attendance.uat.spec.ts#uat-us006-05`

### UAT-US008-01: SOS triggered at field location and received instantly
**Actor:** Militia + Police operator  
**Risk:** 🔴 HIGH

**Expected outcome:**
- SOS appears in PoliceApp/Web with high priority.
- Incident timeline starts immediately.

**-> Automation:** `tests/uat/sos.uat.spec.ts#uat-us008-01`

### UAT-US008-02: SOS queued offline and auto-sent when online
**Actor:** Militia user  
**Risk:** 🔴 HIGH

**Expected outcome:**
- User sees queued state then sent state.
- System creates exactly one incident record.

**-> Automation:** `tests/uat/sos.uat.spec.ts#uat-us008-02`

### UAT-US008-03: Unauthorized attempt to resolve SOS
**Actor:** Militia user (non-resolver)  
**Risk:** 🔴 HIGH

**Expected outcome:**
- Access is denied.
- Incident status remains unchanged.

**-> Automation:** `tests/uat/sos.uat.spec.ts#uat-us008-03`

### UAT-US008-04: Escalation workflow across multiple police roles
**Actor:** Militia -> Area Police -> Ward Police -> Leader  
**Risk:** 🔴 HIGH

**Expected outcome:**
- Escalation timeline is complete and traceable.
- Correct recipients receive notifications by level.

**-> Automation:** `tests/uat/sos.uat.spec.ts#uat-us008-04`

### UAT-US008-05: Boundary severity exactly at escalation threshold
**Actor:** Police operator  
**Risk:** 🔴 HIGH

**Expected outcome:**
- Incident follows exact threshold routing rule without ambiguity.

**-> Automation:** `tests/uat/sos.uat.spec.ts#uat-us008-05`

### UAT-US015-01: New device enrollment with verification
**Actor:** Militia/Police user  
**Risk:** 🔴 HIGH

**Expected outcome:**
- New device becomes trusted only after verification.

**-> Automation:** `tests/uat/device.uat.spec.ts#uat-us015-01`

### UAT-US015-02: Device limit reached and replacement required
**Actor:** Militia user  
**Risk:** 🔴 HIGH

**Expected outcome:**
- User is forced to remove an old device before adding a new one.

**-> Automation:** `tests/uat/device.uat.spec.ts#uat-us015-02`

### UAT-US016-01: Security admin revokes all risky sessions
**Actor:** Security Admin  
**Risk:** 🔴 HIGH

**Expected outcome:**
- All targeted sessions are invalidated immediately.
- Account owner is notified of session revocation.

**-> Automation:** `tests/uat/session.uat.spec.ts#uat-us016-01`

### UAT-US017-01: Non-compliant device is blocked
**Actor:** Militia/Police user  
**Risk:** 🔴 HIGH

**Expected outcome:**
- Rooted/jailbroken or outdated app cannot proceed into protected modules.

**-> Automation:** `tests/uat/device-policy.uat.spec.ts#uat-us017-01`

### UAT-US011-01: Payroll period close by multi-role process
**Actor:** Office Staff -> Admin -> Leader  
**Risk:** 🔴 HIGH

**Expected outcome:**
- Payroll period closes only with valid input dependencies.
- Summary is visible to leadership and traceable.

**-> Automation:** `tests/uat/payroll.uat.spec.ts#uat-us011-01`

### UAT-US011-02: Correcting payroll after submission
**Actor:** Office Staff + Admin  
**Risk:** 🔴 HIGH

**Expected outcome:**
- Re-open by policy only; all revisions are versioned and auditable.

**-> Automation:** `tests/uat/payroll.uat.spec.ts#uat-us011-02`

### UAT-US014-01: Auditor traces sensitive task state change
**Actor:** Auditor  
**Risk:** 🔴 HIGH

**Expected outcome:**
- Auditor can identify actor/time/before-after values.

**-> Automation:** `tests/uat/audit.uat.spec.ts#uat-us014-01`

---

## MAPPING UAT -> AUTOMATION
| UAT Case | Type | Automation spec | Priority |
|---|---|---|---|
| UAT-US006-01 | End-to-end | tests/uat/attendance.uat.spec.ts#uat-us006-01 | P1 |
| UAT-US006-02 | Exception | tests/uat/attendance.uat.spec.ts#uat-us006-02 | P1 |
| UAT-US006-03 | User error | tests/uat/attendance.uat.spec.ts#uat-us006-03 | P1 |
| UAT-US006-04 | Multi-role | tests/uat/attendance.uat.spec.ts#uat-us006-04 | P1 |
| UAT-US006-05 | Business boundary | tests/uat/attendance.uat.spec.ts#uat-us006-05 | P1 |
| UAT-US008-01 | End-to-end | tests/uat/sos.uat.spec.ts#uat-us008-01 | P1 |
| UAT-US008-02 | Error recovery | tests/uat/sos.uat.spec.ts#uat-us008-02 | P1 |
| UAT-US008-03 | Authorization | tests/uat/sos.uat.spec.ts#uat-us008-03 | P1 |
| UAT-US008-04 | Multi-role | tests/uat/sos.uat.spec.ts#uat-us008-04 | P1 |
| UAT-US008-05 | Business boundary | tests/uat/sos.uat.spec.ts#uat-us008-05 | P1 |
| UAT-US015-01 | End-to-end | tests/uat/device.uat.spec.ts#uat-us015-01 | P1 |
| UAT-US015-02 | Boundary | tests/uat/device.uat.spec.ts#uat-us015-02 | P1 |
| UAT-US016-01 | Security multi-role | tests/uat/session.uat.spec.ts#uat-us016-01 | P1 |
| UAT-US017-01 | Compliance | tests/uat/device-policy.uat.spec.ts#uat-us017-01 | P1 |
| UAT-US011-01 | End-to-end | tests/uat/payroll.uat.spec.ts#uat-us011-01 | P1 |
| UAT-US011-02 | Rework/undo | tests/uat/payroll.uat.spec.ts#uat-us011-02 | P1 |
| UAT-US014-01 | Audit traceability | tests/uat/audit.uat.spec.ts#uat-us014-01 | P1 |
