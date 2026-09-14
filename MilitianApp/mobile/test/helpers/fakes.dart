// Shared test doubles for network and auth tests.

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
  Future<List<String>> getUserRoles() async => [...roles];
  @override
  Future<void> saveUserRoles(List<String> value) async {
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

/// Records requests and answers them with [handler] instead of the network.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler, {this.delay = Duration.zero});

  final ResponseBody Function(RequestOptions options) handler;
  final Duration delay;
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
    if (delay > Duration.zero) await Future<void>.delayed(delay);
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
