// Contract test: every REST path the app calls must exist on Web/backend.
// Routes transcribed from the @Controller/@Get/@Post/@Put/@Patch/@Delete decorators in
// Web/backend/src/**/*.controller.ts (global prefix api/v1/mms_core); `{id}` stands for any
// path parameter.
// Run: flutter test test/unit_api_constants_test.dart

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/constants/api_constants.dart';

const _backendRoutes = <String>{
  // admin/admin.controller.ts
  '/admin/users', '/admin/users/{id}', '/admin/users/{id}/status', '/admin/users/{id}/role',
  '/admin/users/{id}/reset-password', '/admin/system-settings',
  // assignments/assignments.controller.ts
  '/assignments', '/assignments/{id}',
  // attendance/attendance.controller.ts
  '/attendance', '/attendance/summary', '/attendance/export', '/attendance/check-in',
  '/attendance/check-out', '/attendance/today', '/attendance/stats',
  // audit/audit.controller.ts
  '/audit', '/audit-logs', '/audit/export',
  // auth/auth.controller.ts
  '/auth/login', '/auth/refresh', '/auth/logout', '/auth/me',
  // auth/mfa/mfa.controller.ts
  '/auth/mfa/verify', '/auth/mfa/login', '/auth/mfa/enroll', '/auth/mfa/enroll/confirm',
  '/auth/mfa/setup', '/auth/mfa/confirm', '/auth/mfa/status',
  '/auth/mfa/recovery-codes/regenerate', '/auth/mfa/disable', '/admin/users/{id}/mfa/reset',
  // chat/chat.controller.ts, notifications/chat-messages.controller.ts
  '/chat/conversations', '/chat/conversations/{id}/messages', '/chat/conversations/{id}/read',
  // dashboard/dashboard.controller.ts
  '/dashboard/stats', '/dashboard/compliance', '/dashboard/mau-03-bc', '/dashboard/mau-03-bc/export',
  // devices/devices.controller.ts
  '/devices', '/devices/{id}',
  // exemption/exemption.controller.ts
  '/exemptions', '/exemptions/{id}/review',
  // files/files.controller.ts
  '/files/upload', '/files/{id}',
  // gps/gps.controller.ts
  '/gps/record', '/gps/live', '/gps/team', '/gps/history/{id}',
  // health/health.controller.ts
  '/health',
  // kpi/kpi.controller.ts
  '/kpi/evaluate', '/kpi/current', '/kpi/history', '/kpi/summary-report', '/kpi/export',
  // leave/leave.controller.ts
  '/leave', '/leave/{id}', '/leave/{id}/review', '/leave/{id}/cancel', '/leave-balances',
  '/approvals', '/approvals/{id}/approve', '/approvals/{id}/reject',
  // militia/militia.controller.ts
  '/militia', '/militia/search', '/militia/export', '/militia/rewards-report',
  '/militia/rewards-export', '/militia/me/data-export', '/militia/me/data-correction-request',
  '/militia/quick-create', '/militia/{id}', '/militia/{id}/history', '/militia/{id}/rewards',
  '/militia/{id}/documents',
  // notifications/notifications.controller.ts
  '/notifications', '/notifications/{id}', '/notifications/{id}/read', '/notifications/read-all',
  // official-documents/official-documents.controller.ts
  '/official-documents', '/official-documents/{id}',
  // organization/organization.controller.ts
  '/organization/structure', '/organization/units', '/organization/units/{id}',
  '/organization/positions/{id}',
  // payroll/payroll.controller.ts
  '/payroll/compliance-check', '/payroll/export', '/payroll/periods', '/payroll/kpi',
  '/payroll/kpi/{id}', '/payroll/periods/{id}/export-pdf', '/payroll/periods/{id}/calculate',
  '/payroll/periods/{id}/reopen', '/payroll/periods/{id}/lock',
  // recruitment/recruitment.controller.ts
  '/recruitment/applications', '/recruitment/applications/{id}',
  // sos/sos.controller.ts
  '/sos', '/sos/{id}', '/sos/{id}/status',
  // tasks/tasks.controller.ts
  '/tasks', '/tasks/{id}', '/tasks/{id}/accept', '/tasks/{id}/progress', '/tasks/{id}/report',
  // training/training.controller.ts
  '/training', '/training/compliance-report', '/training/export', '/training/report', '/training/{id}',
  // users/users.controller.ts, users/profile.controller.ts
  '/users/me', '/users/me/change-password', '/users/search', '/users/profile',
  '/users/police-profile', '/profile', '/police-profile',
  // weapons/weapons.controller.ts
  '/weapons', '/weapons/inventory-report', '/weapons/export', '/weapons/allocations',
  '/weapons/allocations/{id}/return', '/weapons/{id}',
  // work-reports/work-reports.controller.ts
  '/work-reports', '/work-reports/{id}/review',
};

/// Not REST routes
const _nonRest = {'wsPath'};

void main() {
  test('UT-API-01: every endpoint constant exists on the backend', () {
    final source = File('lib/core/constants/api_constants.dart').readAsStringSync();
    final constants = RegExp(r"static const String (\w+) = '(/[^']*)'")
        .allMatches(source)
        .where((m) => !_nonRest.contains(m.group(1)))
        .map((m) => (m.group(1)!, m.group(2)!))
        .toList();
    expect(constants, isNotEmpty);

    final missing = [
      for (final (name, path) in constants)
        if (!_backendRoutes.contains(path)) '$name = $path',
    ];
    expect(missing, isEmpty, reason: 'Endpoints with no backend route');
  });

  test('UT-API-02: added routes point at the real handlers', () {
    expect(ApiConstants.leaveBalances, '/leave-balances');
    expect(ApiConstants.training, '/training');
    expect(ApiConstants.conversationRead, '/chat/conversations/{id}/read');
    expect(ApiConstants.deleteNotification, '/notifications/{id}');
  });

  test('UT-API-04: second-factor constants name the /auth/mfa routes', () {
    // Public sign-in routes (mfaToken from POST /auth/login)
    expect(ApiConstants.verifyMfa, '/auth/mfa/verify');
    expect(ApiConstants.mfaEnroll, '/auth/mfa/enroll');
    expect(ApiConstants.mfaEnrollConfirm, '/auth/mfa/enroll/confirm');
    // Signed-in management routes
    expect(ApiConstants.mfaStatus, '/auth/mfa/status');
    expect(ApiConstants.setupMfa, '/auth/mfa/setup');
    expect(ApiConstants.confirmMfa, '/auth/mfa/confirm');
    expect(ApiConstants.mfaRegenerateRecoveryCodes, '/auth/mfa/recovery-codes/regenerate');
    expect(ApiConstants.mfaDisable, '/auth/mfa/disable');
  });

  test('UT-API-05: the deprecated POST /auth/mfa/login is not an endpoint the app calls', () {
    final source = File('lib/core/constants/api_constants.dart').readAsStringSync();
    expect(source, isNot(contains("'/auth/mfa/login'")));
    expect(source, isNot(contains('verifyRecovery')));
  });

  test('UT-API-03: REST paths written directly in lib/ exist on the backend', () {
    final call = RegExp(r"\.(?:get|post|put|patch|delete)(?:<[^>]*>)?\(\s*'(/[^']*)'");
    final found = <String>[];
    final missing = <String>[];
    for (final file in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!file.path.endsWith('.dart')) continue;
      for (final m in call.allMatches(file.readAsStringSync())) {
        final path = m
            .group(1)!
            .split('?')
            .first
            .replaceAll(RegExp(r'\$\{[^}]*\}'), '{id}')
            .replaceAll(RegExp(r'\$\w+'), '{id}');
        found.add(path);
        if (!_backendRoutes.contains(path)) missing.add('${file.path}: ${m.group(1)}');
      }
    }
    expect(missing, isEmpty, reason: 'Hard-coded paths with no backend route');
  });
}
