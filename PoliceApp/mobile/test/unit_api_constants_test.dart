// Contract test: every REST path in lib/core/constants/api_constants.dart must exist on
// Web/backend (routes read from the @Controller/@Get/@Post/@Put/@Patch/@Delete decorators,
// served under the global prefix api/v1/mms_core — src/main.ts:46, src/config/configuration.ts:14).
// Run: flutter test test/unit_api_constants_test.dart

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/constants/api_constants.dart';

/// Backend routes; `{id}` stands for any path parameter.
const _backendRoutes = <String>{
  // auth/auth.controller.ts
  '/auth/login', '/auth/refresh', '/auth/logout', '/auth/me',
  // auth/mfa/mfa.controller.ts (T15)
  '/auth/mfa/verify', '/auth/mfa/login', '/auth/mfa/enroll', '/auth/mfa/enroll/confirm',
  '/auth/mfa/setup', '/auth/mfa/confirm', '/auth/mfa/status', '/auth/mfa/recovery-codes/regenerate',
  '/auth/mfa/disable', '/admin/users/{id}/mfa/reset',
  // users/users.controller.ts, users/profile.controller.ts
  '/users/me', '/users/me/change-password', '/users/search', '/users/profile',
  '/users/police-profile', '/units/search', '/profile', '/police-profile',
  // admin/admin.controller.ts
  '/admin/users', '/admin/users/{id}', '/admin/users/{id}/status', '/admin/users/{id}/role',
  '/admin/users/{id}/reset-password', '/admin/system-settings',
  // tasks/tasks.controller.ts
  '/tasks', '/tasks/{id}', '/tasks/{id}/accept', '/tasks/{id}/progress', '/tasks/{id}/report',
  // militia/militia.controller.ts
  '/militia', '/militia/search', '/militia/export', '/militia/rewards-report',
  '/militia/rewards-export', '/militia/me/data-export', '/militia/me/data-correction-request',
  '/militia/quick-create', '/militia/{id}', '/militia/{id}/history', '/militia/{id}/rewards',
  '/militia/{id}/documents',
  // attendance/attendance.controller.ts
  '/attendance', '/attendance/summary', '/attendance/export', '/attendance/check-in',
  '/attendance/check-out', '/attendance/today', '/attendance/stats',
  // notifications/notifications.controller.ts, notifications/chat-messages.controller.ts, chat/chat.controller.ts
  '/notifications', '/notifications/{id}', '/notifications/{id}/read', '/notifications/read-all',
  '/chat/conversations', '/chat/conversations/{id}/messages', '/chat/conversations/{id}/read',
  // sos/sos.controller.ts
  '/sos', '/sos/{id}', '/sos/{id}/status',
  // leave/leave.controller.ts
  '/leave', '/leave/{id}', '/leave/{id}/review', '/leave/{id}/cancel', '/leave-balances',
  '/approvals', '/approvals/{id}/approve', '/approvals/{id}/reject',
  // kpi/kpi.controller.ts
  '/kpi/evaluate', '/kpi/current', '/kpi/history', '/kpi/summary-report', '/kpi/export',
  // gps/gps.controller.ts
  '/gps/record', '/gps/live', '/gps/team', '/gps/history/{id}',
  // work-reports/work-reports.controller.ts
  '/work-reports', '/work-reports/{id}', '/work-reports/{id}/review',
  // files/files.controller.ts (T20)
  '/files/upload', '/files/{id}',
  // dashboard/dashboard.controller.ts
  '/dashboard/stats', '/dashboard/compliance', '/dashboard/mau-03-bc', '/dashboard/mau-03-bc/export',
  // training/training.controller.ts
  '/training', '/training/compliance-report', '/training/export', '/training/report', '/training/{id}',
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

  test('UT-API-02: renamed auth and review routes point at the real handlers', () {
    expect(ApiConstants.verifyMfa, '/auth/mfa/verify');
    expect(ApiConstants.mfaEnroll, '/auth/mfa/enroll');
    expect(ApiConstants.mfaEnrollConfirm, '/auth/mfa/enroll/confirm');
    expect(ApiConstants.mfaStatus, '/auth/mfa/status');
    expect(ApiConstants.setupMfa, '/auth/mfa/setup');
    expect(ApiConstants.setupMfaConfirm, '/auth/mfa/confirm');
    expect(ApiConstants.mfaRegenerateRecoveryCodes, '/auth/mfa/recovery-codes/regenerate');
    expect(ApiConstants.mfaDisable, '/auth/mfa/disable');
    expect(ApiConstants.leaveReview, '/leave/{id}/review');
    expect(ApiConstants.workReportReview, '/work-reports/{id}/review');
    expect(ApiConstants.militiaProfile, '/militia/me/data-export');
    expect(ApiConstants.conversationRead, '/chat/conversations/{id}/read');
    expect(ApiConstants.usersSearch, '/users/search');
    expect(ApiConstants.militiaPicker, '/militia/search');
    expect(ApiConstants.training, '/training');
  });
}
