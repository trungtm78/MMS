import 'package:flutter/foundation.dart';

class ApiConstants {
  ApiConstants._();

  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api/v1/mms_core',
  );

  static const String wsUrl = String.fromEnvironment(
    'WS_URL',
    defaultValue: 'ws://10.0.2.2:3000',
  );

  /// Fail fast in release builds if API_BASE_URL/WS_URL are cleartext.
  /// Dev/emulator defaults stay http for 10.0.2.2 convenience.
  /// Call from main() before runApp().
  static void assertSecureSchemeInRelease() {
    if (kReleaseMode) {
      if (!baseUrl.startsWith('https://')) {
        throw StateError(
          'SECURITY: API_BASE_URL must use https:// in release. Got: $baseUrl',
        );
      }
      if (!wsUrl.startsWith('wss://')) {
        throw StateError(
          'SECURITY: WS_URL must use wss:// in release. Got: $wsUrl',
        );
      }
    }
  }

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 30);

  // Auth
  static const String login = '/auth/login';
  static const String logout = '/auth/logout';
  static const String refreshToken = '/auth/refresh';
  static const String verifyMfa = '/auth/verify-mfa';
  static const String verifyRecovery = '/auth/verify-recovery';
  static const String setupMfa = '/auth/setup-mfa';
  static const String setupMfaConfirm = '/auth/setup-mfa/confirm';

  // Users / Admin
  static const String profile = '/users/me';
  static const String users = '/users';
  static const String adminUsers = '/admin/users';

  // Tasks
  static const String tasks = '/tasks';
  static const String createTask = '/tasks';
  static const String taskById = '/tasks/{id}';
  static const String assignTask = '/tasks/{id}/assign';
  static const String updateTaskStatus = '/tasks/{id}/status';

  // Militia
  static const String militiaList = '/militia';
  static const String militiaSearch = '/militia';  // with query params ?q=&unitCode=
  static const String militiaById = '/militia/{id}';

  // Attendance
  static const String attendanceList = '/attendance';
  static const String checkIn = '/attendance/check-in';
  static const String checkOut = '/attendance/check-out';

  // Notifications (WebSocket-based, no Firebase)
  static const String notifications = '/notifications';
  static const String notificationRead = '/notifications/{id}/read';
  static const String notificationReadAll = '/notifications/read-all';
  static const String wsPath = '/socket.io/';

  // SOS / Alerts
  static const String sosList = '/sos';
  static const String sosById = '/sos/{id}';
  static const String sosResolve = '/sos/{id}/status';  // PATCH with body {status, resolutionNote}

  // Leave approvals
  static const String leaveRequests = '/leave';
  static const String leaveById = '/leave/{id}';
  static const String leaveReview = '/leave/{id}/review';  // PATCH

  // KPI
  static const String kpiCurrent = '/kpi/current';
  static const String kpiHistory = '/kpi/history';
  static const String kpiEvaluate = '/kpi/evaluate';

  // GPS
  static const String gpsLive = '/gps/live';
  static const String gpsRecord = '/gps/record';
  static const String gpsHistory = '/gps/history';

  // Work Reports
  static const String workReports = '/work-reports';
  static const String workReportById = '/work-reports/{id}';
  static const String reportsTeam = '/work-reports/team';

  // Dashboard stats
  static const String dashboardStats = '/dashboard/stats';

  // Police-specific profile
  static const String policeProfile = '/police-profile';

  // Militia self-profile (for DQTV own profile screen)
  static const String militiaProfile = '/militia/me';

  // Chat
  static const String conversations = '/chat/conversations';
  static const String conversationMessages = '/chat/conversations/{id}/messages';

  // Tasks sub-actions
  static const String taskAccept = '/tasks/{id}/accept';
  static const String acceptTask = '/tasks/{id}/accept';  // alias
  static const String taskProgress = '/tasks/{id}/progress';

  // Attendance named endpoints
  static const String attendanceCheckIn = '/attendance/check-in';
  static const String attendanceCheckOut = '/attendance/check-out';
  static const String attendanceToday = '/attendance/today';

  // Secure storage keys
  static const String keyAccessToken = 'access_token';
  static const String keyRefreshToken = 'refresh_token';
  static const String keyUserId = 'user_id';
  static const String keyUsername = 'saved_username';
  static const String keyUserRole = 'user_role';
}
