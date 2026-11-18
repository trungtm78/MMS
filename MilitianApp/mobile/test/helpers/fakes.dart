// Shared test doubles for network and auth tests.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:militian_app/core/storage/secure_storage_service.dart';

/// In-memory [SecureStorageService]; no platform channel needed.
class MemoryStorage implements SecureStorageService {
  MemoryStorage({
    this.access = 'old_access',
    this.refresh = 'old_refresh',
    List<String> roles = const [],
  }) : roles = [...roles];

  String? access;
  String? refresh;
  String? userId;
  String? username;
  List<String> roles;
  bool biometric = false;
  final Map<String, String> other = {};

  /// When true, storing a session fails like a locked keychain (clearing still works).
  bool failWrites = false;

  void _checkWrite() {
    if (failWrites) throw StateError('secure storage unavailable');
  }

  @override
  Future<String?> getAccessToken() async => access;
  @override
  Future<void> saveAccessToken(String token) async {
    _checkWrite();
    access = token;
  }

  @override
  Future<String?> getRefreshToken() async => refresh;
  @override
  Future<void> saveRefreshToken(String token) async {
    _checkWrite();
    refresh = token;
  }

  @override
  Future<String?> getUserId() async => userId;
  @override
  Future<void> saveUserId(String id) async {
    _checkWrite();
    userId = id;
  }

  @override
  Future<List<String>> getUserRoles() async => [...roles];
  @override
  Future<void> saveUserRoles(List<String> value) async {
    _checkWrite();
    roles = [...value];
  }

  @override
  Future<bool> isBiometricEnabled() async => biometric;
  @override
  Future<void> setBiometricEnabled(bool enabled) async {
    biometric = enabled;
  }

  @override
  Future<String?> getSavedUsername() async => username;
  @override
  Future<void> saveUsername(String value) async {
    username = value;
  }

  @override
  Future<void> clearAll() async {
    access = null;
    refresh = null;
    userId = null;
    username = null;
    roles = [];
    biometric = false;
    other.clear();
  }

  @override
  Future<void> clearTokens() async {
    access = null;
    refresh = null;
    roles = [];
  }

  @override
  Future<String?> read(String key) async => other[key];
  @override
  Future<void> write(String key, String value) async {
    other[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    other.remove(key);
  }
}

/// A [MemoryStorage] whose access-token reads wait until the test completes [release]: a stored
/// session check that takes as long as the test wants.
class GatedStorage extends MemoryStorage {
  GatedStorage({super.access, super.refresh, super.roles});

  final release = Completer<void>();

  @override
  Future<String?> getAccessToken() async {
    await release.future;
    return super.getAccessToken();
  }
}

/// Records requests and answers them with [handler] instead of the network.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler, {this.delay = Duration.zero, this.delayFor, this.gate});

  final ResponseBody Function(RequestOptions options) handler;

  /// Fixed wait before answering. Prefer [gate]: a fixed delay only hopes calls overlap.
  /// Kept for test/widget_my_requests_screen_test.dart (leave area), which still uses [delayFor];
  /// remove both once it holds the cancel with a [gate].
  final Duration delay;

  /// Delay for one request; null falls back to [delay]. See [delay].
  final Duration? Function(RequestOptions options)? delayFor;

  /// Holds a request until the returned future completes (typically a Completer the test completes),
  /// so the test decides when an overlapping call answers. Null answers at once.
  final Future<void>? Function(RequestOptions options)? gate;
  final List<RequestOptions> requests = [];

  /// (path, Authorization) as each request went out. A retry mutates the RequestOptions already
  /// in [requests], so their headers show only the last token.
  final List<(String, Object?)> sent = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    sent.add((options.path, options.headers['Authorization']));
    // Safety valve: a retry loop must fail the test, not hang it
    if (requests.length > 20) return jsonBody(418, {'message': 'loop'});
    final hold = gate?.call(options);
    if (hold != null) await hold;
    final wait = delayFor?.call(options) ?? delay;
    if (wait > Duration.zero) await Future<void>.delayed(wait);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody jsonBody(int status, Object body) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

/// 200 only when the request carries `Bearer <token>`, otherwise 401.
ResponseBody okWhenBearer(RequestOptions o, String token) =>
    o.headers['Authorization'] == 'Bearer $token'
        ? jsonBody(200, {'ok': true})
        : jsonBody(401, {'message': 'missing_token'});

ResponseBody newTokenPair(RequestOptions _) =>
    jsonBody(200, {'accessToken': 'new_access', 'refreshToken': 'new_refresh'});

/// Answers each request by "METHOD path"; unknown routes get a 404.
ResponseBody Function(RequestOptions) routeTable(
  Map<String, ResponseBody Function(RequestOptions)> routes,
) =>
    (o) {
      final handler = routes['${o.method} ${o.path}'];
      return handler == null
          ? jsonBody(404, {'message': 'no_route ${o.method} ${o.path}'})
          : handler(o);
    };

ResponseBody noContent(RequestOptions _) => ResponseBody.fromString('', 204);

/// A challenge token shaped like the backend's "<uuid>.<43 base64url chars>"
/// (Web/backend/src/auth/mfa/mfa-challenge.service.ts TOKEN_PATTERN).
const testMfaToken =
    '3f0c6a52-1d2b-4c8e-9a51-6a1f2b3c4d5e.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';

/// Ten codes in the backend's XXXXX-XXXXX format (Web/backend/src/auth/mfa/recovery-codes.ts).
const testRecoveryCodes = [
  'ABCDE-FGHJK', 'MNPQR-STVWX', '01234-56789', 'YZ012-34567', 'KMNPQ-RSTVW',
  'XYZ01-23456', '789AB-CDEFG', 'HJKMN-PQRST', 'VWXYZ-01234', '56789-ABCDE',
];

/// A SUCCESS sign-in body (Web/backend/src/auth/mfa/mfa.service.ts LoginResult,
/// auth.service.ts signInUser) for an account holding [role], plus [extra] fields.
Map<String, dynamic> backendSession(String role, [Map<String, dynamic> extra = const {}]) => {
      'status': 'SUCCESS',
      'user': {
        'id': 'u1',
        'username': 'user01',
        'fullName': 'User',
        'status': 'active',
        'role': role,
        'roles': [role],
      },
      'tokens': {'accessToken': 'tok_access', 'refreshToken': 'tok_refresh', 'expiresIn': 900},
      ...extra,
    };

/// POST /auth/login for an enrolled account (mfa.service.ts beginLogin).
Map<String, dynamic> mfaRequiredLogin([Map<String, dynamic> extra = const {}]) => {
      'status': 'MFA_REQUIRED',
      'mfaToken': testMfaToken,
      'expiresAt': '2026-09-14T01:05:00.000Z',
      'methods': ['totp', 'recovery_code'],
      'mfa_required': true,
      'requiresMfa': true,
      'tempToken': testMfaToken,
      ...extra,
    };

/// POST /auth/login for an unenrolled account whose role requires MFA (mfa.service.ts beginLogin).
Map<String, dynamic> mfaSetupRequiredLogin() => {
      'status': 'MFA_SETUP_REQUIRED',
      'mfaToken': testMfaToken,
      'expiresAt': '2026-09-14T01:10:00.000Z',
      'requiresMfaSetup': true,
      'tempToken': testMfaToken,
    };

const testTotpSecret = 'JBSWY3DPEHPK3PXP';
const testOtpauthUri = 'otpauth://totp/MMS:user01?secret=JBSWY3DPEHPK3PXP&period=30&digits=6&algorithm=SHA1&issuer=MMS';

/// POST /auth/mfa/enroll and POST /auth/mfa/setup (mfa.service.ts EnrollmentStart).
Map<String, dynamic> backendEnrollment() => {
      'mfaToken': testMfaToken,
      'secret': testTotpSecret,
      'otpauthUri': testOtpauthUri,
      'qrUri': testOtpauthUri,
      'expiresAt': '2026-09-14T01:10:00.000Z',
    };

/// An error body as written by Web/backend/src/common/filters/http-exception.filter.ts.
Map<String, dynamic> backendError(int status, String message, {Map<String, dynamic>? details}) => {
      'code': const {400: 'E001', 401: 'E004', 403: 'E004', 404: 'E003', 409: 'E002', 429: 'E006'}[status] ??
          'E005',
      'message': message,
      if (details != null) 'details': details,
      'statusCode': status,
      'timestamp': '2026-09-14T01:00:00.000Z',
      'path': '/api/v1/mms_core/auth/mfa',
    };

/// A structurally valid JWT whose `exp` is far in the future (2100-01-01).
String unexpiredJwt() {
  String part(Map<String, Object> json) =>
      base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
  return '${part({'alg': 'HS256', 'typ': 'JWT'})}.${part({'sub': 'u1', 'exp': 4102444800})}.sig';
}

/// The pagination contract {data, total, page, limit}
/// (Web/backend/src/tasks/tasks.service.ts:447, leave/leave.service.ts:200).
Map<String, dynamic> backendPage(
  List<Map<String, dynamic>> data, {
  int? total,
  int page = 1,
  int limit = 100,
}) =>
    {'data': data, 'total': total ?? data.length, 'page': page, 'limit': limit};

/// One row of GET /tasks `data` / GET /tasks/:id, with exactly the columns of taskRowSelect in
/// Web/backend/src/tasks/task-sql.ts: one row per task of the caller's scope. `status` is tasks.status,
/// `deadline` a timestamptz (ISO string or null), `overdue` the server's flag (TASK_OVERDUE_SQL: status overdue, or
/// open past the deadline), by default derived the same way against the clock. GET /tasks/:id and the accept answer
/// add `attachments` ([backendFile] entries).
Map<String, dynamic> backendTaskRow(
  String id,
  String status, {
  String? deadline,
  String? assigneeId = 'u-me',
  String title = '',
  bool? overdue,
  String priority = 'medium',
  String type = 'patrol',
  String? locationName,
  Object? locationLat,
  Object? locationLng,
  List<Map<String, dynamic>>? attachments,
}) {
  final open = status != 'completed' && status != 'cancelled';
  final pastDeadline = deadline != null && DateTime.parse(deadline).isBefore(DateTime.now());
  return {
    'id': id,
    'code': 'TASK-20260914-${id.toUpperCase()}',
    'title': title.isEmpty ? 'Task $id' : title,
    'description': 'Task description',
    'type': type,
    'priority': priority,
    'status': status,
    'deadline': deadline,
    'createdAt': '2026-09-14T01:00:00.000Z',
    'updatedAt': '2026-09-14T02:00:00.000Z',
    'overdue': overdue ?? (status == 'overdue' || (open && pastDeadline)),
    'unitCode': 'U-01',
    'assigneeId': assigneeId,
    'assigneeName': 'Nguyen Van An',
    'militiaId': 'mp-1',
    'militiaCode': 'DQ-001',
    'locationName': locationName,
    'locationLat': locationLat,
    'locationLng': locationLng,
    if (attachments != null) 'attachments': attachments,
  };
}

/// A stored file as every backend answer shows it (FileView, Web/backend/src/files/files.service.ts).
Map<String, dynamic> backendFile(
  String id, {
  String name = 'photo.png',
  String mimeType = 'image/png',
  Object size = 68,
}) =>
    {'id': id, 'url': '/api/v1/mms_core/files/$id', 'name': name, 'mimeType': mimeType, 'size': size};

/// One row of GET /leave `data`, with exactly the columns of the SELECT in
/// Web/backend/src/leave/leave.service.ts:175-190 (listLeaveRequests).
Map<String, dynamic> backendLeaveRow(String id, String status, {String code = ''}) => {
      'id': id,
      'code': code.isEmpty ? 'LEAVE-20260914-${id.toUpperCase()}' : code,
      'requesterId': 'u-me',
      'requesterName': 'Nguyen Van An',
      'leaveTypeId': 'lt-1',
      'leaveTypeName': 'Annual leave',
      'fromDate': '2026-09-20',
      'toDate': '2026-09-21',
      'isHalfDay': false,
      'halfDayPeriod': null,
      'reason': 'Family matters',
      'replacementId': null,
      'status': status,
      'totalDays': '2.0',
      'createdAt': '2026-09-14T01:00:00.000Z',
      'updatedAt': '2026-09-14T01:00:00.000Z',
    };

/// Bearer POST /auth/mfa/confirm: {recoveryCodes, user, tokens}, no `status`
/// (Web/backend/src/auth/mfa/mfa.controller.ts:142-153, mfa.service.ts:349-356). Enabling MFA
/// ended every earlier session; this is the replacement.
Map<String, dynamic> mfaConfirmSession([String role = 'dqtv']) {
  final session = backendSession(role)..remove('status');
  return {'recoveryCodes': testRecoveryCodes, ...session};
}
