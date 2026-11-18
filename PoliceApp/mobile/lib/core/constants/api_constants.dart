import 'package:flutter/foundation.dart';

/// REST paths under the backend's global prefix (api/v1/mms_core — Web/backend/src/main.ts:46).
/// test/unit_api_constants_test.dart checks every path here against the backend routes.
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

  // Auth (auth/auth.controller.ts) and second factor (auth/mfa/mfa.controller.ts, contract T15)
  static const String login = '/auth/login';  // → status SUCCESS | MFA_REQUIRED | MFA_SETUP_REQUIRED
  static const String logout = '/auth/logout';
  static const String refreshToken = '/auth/refresh';
  // Public sign-in steps: no Bearer, never refreshed
  static const String verifyMfa = '/auth/mfa/verify';                 // POST {mfaToken, method, code}
  static const String mfaEnroll = '/auth/mfa/enroll';                 // POST {mfaToken}
  static const String mfaEnrollConfirm = '/auth/mfa/enroll/confirm';  // POST {mfaToken, code}
  static const String mfaLegacyLogin = '/auth/mfa/login';             // deprecated; never called
  // Signed-in management (Bearer)
  static const String mfaStatus = '/auth/mfa/status';
  static const String setupMfa = '/auth/mfa/setup';                   // POST
  static const String setupMfaConfirm = '/auth/mfa/confirm';          // POST {mfaToken, code}
  static const String mfaRegenerateRecoveryCodes = '/auth/mfa/recovery-codes/regenerate';  // POST {code}
  static const String mfaDisable = '/auth/mfa/disable';               // POST {method, code} → 204

  // Users / Admin
  static const String profile = '/users/me';
  // POST {currentPassword, newPassword} → 204; ends every session of the account (users.controller.ts:42-47)
  static const String changePassword = '/users/me/change-password';
  static const String adminUsers = '/admin/users';

  // Tasks (tasks/tasks.controller.ts) — the assignee is set at creation (assigneeMilitiaId)
  static const String tasks = '/tasks';
  static const String createTask = '/tasks';
  static const String taskById = '/tasks/{id}';

  // Militia
  static const String militiaList = '/militia';
  static const String militiaSearch = '/militia';  // with query params ?q=&unitCode=
  static const String militiaById = '/militia/{id}';  // {id} = militia profile id
  static const String militiaPicker = '/militia/search';  // scoped DQTV picker, bare array with userId

  // Users search (bare array: id, username, fullName, role)
  static const String usersSearch = '/users/search';

  // Training records (?unitCode=&militiaId=&year=&page=&limit=)
  static const String training = '/training';

  // Attendance
  static const String attendanceList = '/attendance';
  static const String checkIn = '/attendance/check-in';
  static const String checkOut = '/attendance/check-out';

  // Notifications (WebSocket-based, no Firebase)
  static const String notifications = '/notifications';
  static const String notificationRead = '/notifications/{id}/read';  // PATCH
  static const String notificationReadAll = '/notifications/read-all';  // POST
  static const String wsPath = '/socket.io/';

  // SOS / Alerts
  static const String sosList = '/sos';
  static const String sosById = '/sos/{id}';
  static const String sosResolve = '/sos/{id}/status';  // PATCH with body {status, resolutionNote}

  // Leave approvals
  static const String leaveRequests = '/leave';
  static const String leaveById = '/leave/{id}';
  static const String leaveReview = '/leave/{id}/review';  // PATCH {action: approve|reject, reason?}

  // KPI
  static const String kpiCurrent = '/kpi/current';
  static const String kpiHistory = '/kpi/history';
  static const String kpiEvaluate = '/kpi/evaluate';

  // GPS
  static const String gpsLive = '/gps/live';
  static const String gpsRecord = '/gps/record';
  static const String gpsHistory = '/gps/history/{id}';

  // Work Reports (work-reports/work-reports.controller.ts)
  static const String workReports = '/work-reports';
  static const String workReportReview = '/work-reports/{id}/review';  // PATCH

  // Dashboard stats
  static const String dashboardStats = '/dashboard/stats';

  // Police-specific profile
  static const String policeProfile = '/police-profile';

  // Own militia data for the DQTV profile screen: {profile, training, attendance, ...}
  static const String militiaProfile = '/militia/me/data-export';

  // Chat
  static const String conversations = '/chat/conversations';
  static const String conversationMessages = '/chat/conversations/{id}/messages';
  static const String conversationRead = '/chat/conversations/{id}/read';  // POST

  // Tasks sub-actions
  static const String taskAccept = '/tasks/{id}/accept';
  static const String acceptTask = '/tasks/{id}/accept';  // alias

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

  // Files and work-report detail (T20)
  // POST multipart {file, purpose?} → 201 {id, url, name, mimeType, size} (files/files.controller.ts)
  static const String filesUpload = '/files/upload';
  // GET with the Bearer token → the content; 404 file_not_found for anyone who may not read it
  static const String fileById = '/files/{id}';
  // GET → one report with its attachments (work-reports/work-reports.controller.ts)
  static const String workReportById = '/work-reports/{id}';

  // Task report photos (T20)
  // POST {description, completedAt?, location?, photoIds? (≤ 10 unique task_report upload ids)}
  // → 201 {id, taskId, submittedAt, photos}; completes the task (tasks/tasks.controller.ts)
  static const String taskReport = '/tasks/{id}/report';
  // GET → the profile's files, newest first; POST {fileIds} (staff) attaches militia_profile uploads
  // (militia/militia.controller.ts)
  static const String militiaDocuments = '/militia/{id}/documents';
}
