import 'package:flutter/foundation.dart';

/// REST paths under the backend's global prefix api/v1/mms_core. Every path here must match a
/// route in Web/backend/src/**/*.controller.ts (checked by test/unit_api_constants_test.dart).
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

  // Auth endpoints (auth/auth.controller.ts)
  static const String login = '/auth/login';
  static const String logout = '/auth/logout';
  static const String refreshToken = '/auth/refresh';

  // Second factor (auth/mfa/mfa.controller.ts). Sign-in routes are public and take the
  // mfaToken from POST /auth/login; they never carry the Bearer token.
  static const String verifyMfa = '/auth/mfa/verify';
  static const String mfaEnroll = '/auth/mfa/enroll';
  static const String mfaEnrollConfirm = '/auth/mfa/enroll/confirm';
  // Management routes act on the signed-in user (Bearer)
  static const String mfaStatus = '/auth/mfa/status';
  static const String setupMfa = '/auth/mfa/setup';
  static const String confirmMfa = '/auth/mfa/confirm';
  static const String mfaRegenerateRecoveryCodes = '/auth/mfa/recovery-codes/regenerate';
  static const String mfaDisable = '/auth/mfa/disable';

  // Profile
  static const String profile = '/users/me';
  static const String updateProfile = '/users/me';
  static const String changePassword = '/users/me/change-password';
  // GET /users/search?q=&limit= (users/users.controller.ts:49-53)
  static const String usersSearch = '/users/search';

  // Attendance
  static const String checkIn = '/attendance/check-in';
  static const String checkOut = '/attendance/check-out';
  static const String attendanceToday = '/attendance/today';
  static const String attendanceStats = '/attendance/stats';

  // Tasks
  static const String tasks = '/tasks';
  static const String taskById = '/tasks/{id}';
  static const String acceptTask = '/tasks/{id}/accept';
  static const String submitTaskReport = '/tasks/{id}/report';

  // Leave
  static const String leaveRequest = '/leave';
  static const String leaveHistory = '/leave';
  static const String leaveById = '/leave/{id}';
  static const String cancelLeave = '/leave/{id}/cancel';
  static const String leaveBalances = '/leave-balances';

  // KPI
  static const String kpiCurrent = '/kpi/current';
  static const String kpiHistory = '/kpi/history';

  // Training
  static const String training = '/training';

  // GPS
  static const String gpsRecord = '/gps/record';

  // Incidents / SOS
  static const String sos = '/sos';
  static const String incidentReport = '/work-reports';

  // Files (files/files.controller.ts): multipart upload, and the content of a stored file (Bearer)
  static const String filesUpload = '/files/upload';
  static const String fileById = '/files/{id}';

  // Notifications
  static const String notifications = '/notifications';
  static const String markNotificationRead = '/notifications/{id}/read';
  static const String deleteNotification = '/notifications/{id}';
  static const String markAllNotificationsRead = '/notifications/read-all';
  // fcmToken removed — using NestJS WebSocket push instead of Firebase

  // Chat
  static const String conversations = '/chat/conversations';
  static const String messages = '/chat/conversations/{id}/messages';
  static const String sendMessage = '/chat/conversations/{id}/messages';
  static const String conversationRead = '/chat/conversations/{id}/read';

  // WebSocket
  static const String wsPath = '/socket.io/';

  // Secure storage keys
  static const String keyAccessToken = 'access_token';
  static const String keyRefreshToken = 'refresh_token';
  static const String keyUserId = 'user_id';
  static const String keyBiometricEnabled = 'biometric_enabled';
  static const String keyUsername = 'saved_username';
  static const String keyUserRoles = 'user_roles';
}
