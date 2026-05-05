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

  // Auth endpoints
  static const String login = '/auth/login';
  static const String logout = '/auth/logout';
  static const String refreshToken = '/auth/refresh';
  static const String setupMfa = '/auth/setup-mfa';
  static const String verifyMfa = '/auth/verify-mfa';
  static const String verifyRecovery = '/auth/verify-recovery';

  // Profile
  static const String profile = '/users/me';
  static const String updateProfile = '/users/me';
  static const String changePassword = '/users/me/change-password';

  // Attendance
  static const String checkIn = '/attendance/check-in';
  static const String checkOut = '/attendance/check-out';
  static const String attendanceToday = '/attendance/today';
  static const String attendanceStats = '/attendance/stats';
  static const String attendanceHistory = '/attendance/history';

  // Tasks
  static const String tasks = '/tasks';
  static const String taskById = '/tasks/{id}';
  static const String acceptTask = '/tasks/{id}/accept';
  static const String updateTaskProgress = '/tasks/{id}/progress';
  static const String submitTaskReport = '/tasks/{id}/report';

  // Leave
  static const String leaveRequest = '/leave';
  static const String leaveHistory = '/leave';
  static const String leaveById = '/leave/{id}';
  static const String cancelLeave = '/leave/{id}/cancel';

  // KPI
  static const String kpiCurrent = '/kpi/current';
  static const String kpiHistory = '/kpi/history';
  static const String kpiRanking = '/kpi/ranking';

  // GPS
  static const String gpsRecord = '/gps/record';

  // Incidents / SOS
  static const String sos = '/sos';
  static const String incidentReport = '/work-reports';

  // Notifications
  static const String notifications = '/notifications';
  static const String markNotificationRead = '/notifications/{id}/read';
  static const String markAllNotificationsRead = '/notifications/read-all';
  // fcmToken removed — using NestJS WebSocket push instead of Firebase

  // Chat
  static const String conversations = '/chat/conversations';
  static const String messages = '/chat/conversations/{id}/messages';
  static const String sendMessage = '/chat/conversations/{id}/messages';

  // WebSocket
  static const String wsPath = '/socket.io/';

  // Secure storage keys
  static const String keyAccessToken = 'access_token';
  static const String keyRefreshToken = 'refresh_token';
  static const String keyUserId = 'user_id';
  static const String keyBiometricEnabled = 'biometric_enabled';
  static const String keyUsername = 'saved_username';
}
