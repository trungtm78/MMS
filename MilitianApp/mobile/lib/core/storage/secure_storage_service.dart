import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/api_constants.dart';

class SecureStorageService {
  final FlutterSecureStorage _storage;

  SecureStorageService()
      : _storage = const FlutterSecureStorage(
          aOptions: AndroidOptions(encryptedSharedPreferences: true),
          iOptions:
              IOSOptions(accessibility: KeychainAccessibility.first_unlock),
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

  // Biometric enabled flag
  Future<bool> isBiometricEnabled() async {
    final val = await _storage.read(key: ApiConstants.keyBiometricEnabled);
    return val == 'true';
  }

  Future<void> setBiometricEnabled(bool enabled) => _storage.write(
        key: ApiConstants.keyBiometricEnabled,
        value: enabled.toString(),
      );

  // Saved username (for biometric re-login)
  Future<String?> getSavedUsername() =>
      _storage.read(key: ApiConstants.keyUsername);

  Future<void> saveUsername(String username) =>
      _storage.write(key: ApiConstants.keyUsername, value: username);

  // Clear all (on logout)
  Future<void> clearAll() async {
    await _storage.deleteAll();
  }

  // Clear tokens only (keep biometric pref)
  Future<void> clearTokens() async {
    await _storage.delete(key: ApiConstants.keyAccessToken);
    await _storage.delete(key: ApiConstants.keyRefreshToken);
  }

  // Generic key-value helpers (used by services like PushNotificationService)
  Future<String?> read(String key) => _storage.read(key: key);

  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  Future<void> delete(String key) => _storage.delete(key: key);
}
