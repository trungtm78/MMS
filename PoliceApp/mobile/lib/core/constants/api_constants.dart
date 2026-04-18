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

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 30);

  // Auth
  static const String login = '/auth/login';
  static const String logout = '/auth/logout';
  static const String refreshToken = '/auth/refresh';

  // Users / Admin
  static const String profile = '/users/me';
  static const String adminUsers = '/admin/users';

  // Tasks
  static const String tasks = '/tasks';
  static const String createTask = '/tasks';
  static const String taskById = '/tasks/{id}';
  static const String assignTask = '/tasks/{id}/assign';
  static const String updateTaskStatus = '/tasks/{id}/status';

  // Militia
  static const String militiaSearch = '/militia/search';
  static const String militiaById = '/militia/{id}';

  // Attendance
  static const String attendanceList = '/attendance';
  static const String checkIn = '/attendance/check-in';
  static const String checkOut = '/attendance/check-out';

  // Notifications (WebSocket-based, no Firebase)
  static const String notifications = '/notifications';
  static const String wsPath = '/socket.io/';

  // Secure storage keys
  static const String keyAccessToken = 'access_token';
  static const String keyRefreshToken = 'refresh_token';
  static const String keyUserId = 'user_id';
  static const String keyUsername = 'saved_username';
}
