class Routes {
  Routes._();

  static const String splash = '/';
  static const String login = '/login';
  static const String otpVerify = '/otp-verify';
  static const String mfaSetup = '/mfa-setup';
  static const String recoveryCodes = '/recovery-codes';

  // Main shell (bottom nav)
  static const String home = '/home';
  static const String checkin = '/checkin';
  static const String tasks = '/tasks';
  static const String taskDetail = '/tasks/:id';
  static const String notifications = '/notifications';
  static const String profile = '/profile';
  static const String settings = '/settings';

  // Features reachable from shell
  static const String leaveRequest = '/leave-request';
  static const String myRequests = '/my-requests';
  static const String kpi = '/kpi';
  static const String sos = '/sos';
  static const String incidentReport = '/incident-report';
  static const String chat = '/chat';
  static const String chatDetail = '/chat/:conversationId';
}
