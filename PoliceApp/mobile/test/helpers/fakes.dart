// Shared test doubles for network and auth tests.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:police_app/core/storage/secure_storage_service.dart';

/// In-memory [SecureStorageService]; no platform channel needed.
class MemoryStorage implements SecureStorageService {
  MemoryStorage({
    this.access = 'old_access',
    this.refresh = 'old_refresh',
    this.role,
  });

  String? access;
  String? refresh;
  String? userId;
  String? role;
  String? username;
  final Map<String, String> other = {};

  @override
  Future<String?> getAccessToken() async => access;
  @override
  Future<void> saveAccessToken(String token) async {
    access = token;
  }

  @override
  Future<String?> getRefreshToken() async => refresh;
  @override
  Future<void> saveRefreshToken(String token) async {
    refresh = token;
  }

  @override
  Future<String?> getUserId() async => userId;
  @override
  Future<void> saveUserId(String id) async {
    userId = id;
  }

  @override
  Future<String?> getUserRole() async => role;
  @override
  Future<void> saveUserRole(String value) async {
    role = value;
  }

  @override
  Future<String?> getSavedUsername() async => username;
  @override
  Future<void> saveUsername(String value) async {
    username = value;
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

  @override
  Future<void> clearTokens() async {
    access = null;
    refresh = null;
    userId = null;
    role = null;
  }

  @override
  Future<void> clearAll() async {
    await clearTokens();
    username = null;
    other.clear();
  }
}

/// Records requests and answers them with [handler] instead of the network.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler, {this.gate});

  final ResponseBody Function(RequestOptions options) handler;

  /// Awaited before answering: complete a Completer to release a response exactly when a test
  /// needs it, never a fixed delay
  final Future<void> Function(RequestOptions options)? gate;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    // Safety valve: a retry loop must fail the test, not hang it
    if (requests.length > 20) return jsonBody(418, {'message': 'loop'});
    final gate = this.gate;
    if (gate != null) await gate(options);
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

/// A structurally valid JWT whose `exp` is far in the future (2100-01-01).
String unexpiredJwt() {
  String part(Map<String, Object> json) =>
      base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
  return '${part({'alg': 'HS256', 'typ': 'JWT'})}.${part({'sub': 'u1', 'exp': 4102444800})}.sig';
}
