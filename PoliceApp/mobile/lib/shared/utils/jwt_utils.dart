import 'dart:convert';

/// Lightweight JWT helpers — no signature verification (server enforces that),
/// only client-side claim parsing for UX (expiry, role) on app start.

/// Decodes the payload claims of a JWT, or null if the token is malformed.
/// Never throws.
Map<String, dynamic>? decodeJwtPayload(String token) {
  try {
    final parts = token.split('.');
    if (parts.length != 3) return null;
    var payload = parts[1];
    // Base64url padding fix
    switch (payload.length % 4) {
      case 2:
        payload += '==';
        break;
      case 3:
        payload += '=';
        break;
    }
    final decoded = utf8.decode(base64Url.decode(payload));
    final json = jsonDecode(decoded);
    if (json is Map<String, dynamic>) return json;
    return null;
  } catch (_) {
    return null;
  }
}

/// Returns true if the JWT is missing, malformed, or `exp` claim is past.
/// Adds a [skewSeconds] buffer (default 30s) to refresh proactively before expiry.
bool isJwtExpired(String? token, {int skewSeconds = 30}) {
  if (token == null || token.isEmpty) return true;
  final payload = decodeJwtPayload(token);
  if (payload == null) return true;
  final exp = payload['exp'];
  if (exp is! int) return true;
  final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
  return nowSec >= (exp - skewSeconds);
}
