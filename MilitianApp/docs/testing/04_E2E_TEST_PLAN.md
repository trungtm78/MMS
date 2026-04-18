# E2E TEST PLAN — MilitianApp (Flutter)
Task ID: TASK-2026-001 | Version: v2.0 | Date: 2026-03-08

Tool: Flutter Integration Tests (`integration_test` package)
Runner: `flutter test integration_test/`

---

## TOOL SELECTION

| US | Risk | Tool | Lý do |
|----|------|------|-------|
| US-001 | 🔴 | Flutter Integration Test | Native auth flow |
| US-002 | 🔴 | Flutter Integration Test | QR + OTP setup |
| US-003 | 🔴 | Flutter Integration Test | Recovery code auth |
| US-005 | 🟡 | Flutter Integration Test | GPS mock + submit |
| US-006 | 🟡 | Flutter Integration Test | Check-out flow |
| US-010 | 🟡 | Flutter Integration Test | Task status change |
| US-011 | 🟡 | Flutter Integration Test | Progress update |
| US-014 | 🟡 | Flutter Integration Test | Leave form submit |
| US-016 | 🔴 | Flutter Integration Test | SOS trigger |
| US-017 | 🟡 | Flutter Integration Test | Incident report |
| US-020 | 🔴 | Flutter Integration Test | Change password |
| US-021 | 🔴 | Flutter Integration Test | Logout |
| US-022 | 🔴 | Flutter Integration Test | Token refresh |
| US-023 | 🔴 | Flutter Integration Test | Biometric |

---

## FLUTTER TEST INVENTORY

| US | AC | Scenario ID | Spec file | Category | Priority |
|----|----|-------------|-----------|----------|----------|
| US-001 | AC-1 | E2E-001-HP | auth/login_test.dart | happy-path | P0 |
| US-001 | AC-2 | E2E-001-NP1 | auth/login_test.dart | negative-path | P1 |
| US-001 | AC-3 | E2E-001-NP2 | auth/login_test.dart | negative-path | P1 |
| US-001 | AC-4 | E2E-001-NP3 | auth/login_test.dart | negative-path | P1 |
| US-002 | AC-1 | E2E-002-HP | auth/mfa_setup_test.dart | happy-path | P0 |
| US-002 | AC-2 | E2E-002-NP | auth/mfa_setup_test.dart | negative-path | P1 |
| US-002 | AC-4 | E2E-002-RC | auth/mfa_setup_test.dart | recovery-codes | P0 |
| US-003 | AC-1 | E2E-003-HP | auth/recovery_test.dart | happy-path | P0 |
| US-003 | AC-2 | E2E-003-NP | auth/recovery_test.dart | negative-path | P1 |
| US-003 | AC-3 | E2E-003-BV | auth/recovery_test.dart | boundary | P1 |
| US-004 | AC-1 | E2E-004-HP | home/home_test.dart | happy-path | P2 |
| US-005 | AC-1 | E2E-005-HP | attendance/checkin_test.dart | happy-path | P0 |
| US-005 | AC-2 | E2E-005-NP | attendance/checkin_test.dart | negative-path | P1 |
| US-005 | AC-3 | E2E-005-BV | attendance/checkin_test.dart | boundary | P1 |
| US-006 | AC-1 | E2E-006-HP | attendance/checkout_test.dart | happy-path | P0 |
| US-008 | AC-1 | E2E-008-HP | tasks/tasks_list_test.dart | happy-path | P2 |
| US-009 | AC-1 | E2E-009-HP | tasks/task_detail_test.dart | happy-path | P2 |
| US-010 | AC-1 | E2E-010-HP | tasks/accept_test.dart | happy-path | P0 |
| US-010 | AC-2 | E2E-010-NP | tasks/accept_test.dart | negative-path | P1 |
| US-011 | AC-1 | E2E-011-HP | tasks/progress_test.dart | happy-path | P0 |
| US-011 | AC-2 | E2E-011-BV | tasks/progress_test.dart | boundary | P1 |
| US-012 | AC-1 | E2E-012-HP | tasks/complete_test.dart | happy-path | P0 |
| US-014 | AC-1 | E2E-014-HP | leave/submit_test.dart | happy-path | P0 |
| US-014 | AC-2 | E2E-014-NP | leave/submit_test.dart | negative-path | P1 |
| US-014 | AC-3 | E2E-014-BV | leave/submit_test.dart | boundary | P1 |
| US-016 | AC-1 | E2E-016-HP | incident/sos_test.dart | happy-path | P0 |
| US-016 | AC-3 | E2E-016-NP | incident/sos_test.dart | negative-path | P1 |
| US-017 | AC-1 | E2E-017-HP | incident/report_test.dart | happy-path | P0 |
| US-017 | AC-2 | E2E-017-NP | incident/report_test.dart | negative-path | P1 |
| US-018 | AC-1 | E2E-018-HP | notifications/list_test.dart | happy-path | P2 |
| US-019 | AC-1 | E2E-019-HP | notifications/mark_read_test.dart | happy-path | P2 |
| US-020 | AC-1 | E2E-020-HP | profile/change_password_test.dart | happy-path | P0 |
| US-020 | AC-2 | E2E-020-NP | profile/change_password_test.dart | negative-path | P1 |
| US-021 | AC-1 | E2E-021-HP | auth/logout_test.dart | happy-path | P0 |
| US-021 | AC-3 | E2E-021-NP | auth/logout_test.dart | offline | P1 |
| US-022 | AC-1 | E2E-022-HP | auth/token_refresh_test.dart | happy-path | P0 |
| US-022 | AC-3 | E2E-022-NP | auth/token_refresh_test.dart | negative-path | P0 |
| US-023 | AC-1 | E2E-023-HP | auth/biometric_test.dart | happy-path | P0 |
| US-023 | AC-2 | E2E-023-NP | auth/biometric_test.dart | negative-path | P1 |

---

## SCREENSHOT REQUIREMENTS

Với mỗi US 🔴, bắt buộc chụp screenshot:

| US | Step | File name pattern |
|----|------|-------------------|
| US-001 | Login form empty | auth-login-01-empty.png |
| US-001 | Login form filled | auth-login-02-filled.png |
| US-001 | OTP screen | auth-login-03-otp.png |
| US-001 | Home after login | auth-login-04-home.png |
| US-001 | Wrong password error | auth-login-err-01-wrong-pass.png |
| US-001 | Wrong OTP error | auth-login-err-02-wrong-otp.png |
| US-002 | QR code screen | auth-setup-01-qr.png |
| US-002 | Recovery codes screen | auth-setup-02-recovery-codes.png |
| US-003 | Recovery code input | auth-recovery-01-input.png |
| US-003 | Recovery code success | auth-recovery-02-success.png |
| US-016 | SOS screen | sos-01-screen.png |
| US-016 | SOS holding | sos-02-holding.png |
| US-016 | SOS triggered | sos-03-triggered.png |
| US-020 | Change password form | profile-pwd-01-form.png |
| US-020 | Change password success | profile-pwd-02-success.png |
| US-021 | Logout confirm | auth-logout-01-confirm.png |
| US-021 | Login screen after | auth-logout-02-login.png |
| US-022 | Token refresh (logs) | auth-refresh-01-success.png |
| US-023 | Biometric prompt | auth-biometric-01-prompt.png |
| US-023 | Biometric success | auth-biometric-02-success.png |

---

## TRACEABILITY MATRIX

| Requirement | AC | Scenario ID | Test file | Status |
|-------------|----|-----------  |-----------|--------|
| US-001 | AC-1 | E2E-001-HP | auth/login_test.dart | Pending |
| US-001 | AC-2 | E2E-001-NP1 | auth/login_test.dart | Pending |
| US-002 | AC-1 | E2E-002-HP | auth/mfa_setup_test.dart | Pending |
| US-002 | AC-4 | E2E-002-RC | auth/mfa_setup_test.dart | Pending |
| US-003 | AC-1 | E2E-003-HP | auth/recovery_test.dart | Pending |
| US-005 | AC-1 | E2E-005-HP | attendance/checkin_test.dart | Pending |
| US-005 | AC-2 | E2E-005-NP | attendance/checkin_test.dart | Pending |
| US-010 | AC-1 | E2E-010-HP | tasks/accept_test.dart | Pending |
| US-014 | AC-1 | E2E-014-HP | leave/submit_test.dart | Pending |
| US-016 | AC-1 | E2E-016-HP | incident/sos_test.dart | Pending |
| US-017 | AC-1 | E2E-017-HP | incident/report_test.dart | Pending |
| US-020 | AC-1 | E2E-020-HP | profile/change_password_test.dart | Pending |
| US-021 | AC-1 | E2E-021-HP | auth/logout_test.dart | Pending |
| US-022 | AC-1 | E2E-022-HP | auth/token_refresh_test.dart | Pending |
| US-023 | AC-1 | E2E-023-HP | auth/biometric_test.dart | Pending |
