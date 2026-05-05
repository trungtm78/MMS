import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/api_constants.dart';

class SecureStorageService {
  final FlutterSecureStorage _storage;

  SecureStorageService()
      : _storage = const FlutterSecureStorage(
          aOptions: AndroidOptions(encryptedSharedPreferences: true),
          // SECURITY: tighter than first_unlock — token is unreadable when device
          // is locked AND not transferable to another device on backup restore.
          iOptions: IOSOptions(
            accessibility: KeychainAccessibility.first_unlock_this_device,
          ),
        );

  // Access token
  Future<String?> getAccessToken() =>
      _storage.read(key: ApiConstants.keyAccessToken);

  Future<void> saveAccessToken(String token) =>
      _storage.write(key: ApiConstants.keyAccessToken, value: token);

  // Refresh token
  Future<String?> getRefreshToken() =>
      _storage.read(key: ApiConstants.keyRefreshToken);

  Future<void> saveRefreshToken(String token) =>
      _storage.write(key: ApiConstants.keyRefreshToken, value: token);

  // User ID
  Future<String?> getUserId() => _storage.read(key: ApiConstants.keyUserId);

  Future<void> saveUserId(String userId) =>
      _storage.write(key: ApiConstants.keyUserId, value: userId);

  // User Role: 'ca' or 'dqtv'
  Future<String?> getUserRole() =>
      _storage.read(key: ApiConstants.keyUserRole);

  Future<void> saveUserRole(String role) =>
      _storage.write(key: ApiConstants.keyUserRole, value: role);

  // Username (kept for re-login convenience)
  Future<String?> getSavedUsername() =>
      _storage.read(key: ApiConstants.keyUsername);

  Future<void> saveUsername(String username) =>
      _storage.write(key: ApiConstants.keyUsername, value: username);

  // Generic
  Future<String?> read(String key) => _storage.read(key: key);
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);
  Future<void> delete(String key) => _storage.delete(key: key);

  // Clear auth tokens on logout (keep username for convenience)
  Future<void> clearTokens() async {
    await _storage.delete(key: ApiConstants.keyAccessToken);
    await _storage.delete(key: ApiConstants.keyRefreshToken);
    await _storage.delete(key: ApiConstants.keyUserId);
    await _storage.delete(key: ApiConstants.keyUserRole);
  }

  // Clear all
  Future<void> clearAll() => _storage.deleteAll();
}
