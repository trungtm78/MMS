import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/shared/utils/jwt_utils.dart';

String makeFakeJwt(Map<String, dynamic> payload) {
  // Header.Payload.Signature — signature is unverified client-side
  String b64(Map<String, dynamic> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${b64({'alg': 'HS256'})}.${b64(payload)}.signature';
}

void main() {
  group('decodeJwtPayload()', () {
    test('decodes a valid JWT payload', () {
      final token = makeFakeJwt({'sub': 'user-1', 'exp': 9999999999});
      final payload = decodeJwtPayload(token);
      expect(payload, isNotNull);
      expect(payload!['sub'], 'user-1');
      expect(payload['exp'], 9999999999);
    });

    test('returns null for malformed token', () {
      expect(decodeJwtPayload('not-a-jwt'), isNull);
      expect(decodeJwtPayload('only.two'), isNull);
      expect(decodeJwtPayload(''), isNull);
    });
  });

  group('isJwtExpired()', () {
    test('returns true for null/empty', () {
      expect(isJwtExpired(null), isTrue);
      expect(isJwtExpired(''), isTrue);
    });

    test('returns true for malformed token', () {
      expect(isJwtExpired('garbage'), isTrue);
    });

    test('returns true when exp is in the past', () {
      final past = (DateTime.now().millisecondsSinceEpoch ~/ 1000) - 3600;
      expect(isJwtExpired(makeFakeJwt({'exp': past})), isTrue);
    });

    test('returns false when exp is in the future beyond skew', () {
      final future = (DateTime.now().millisecondsSinceEpoch ~/ 1000) + 3600;
      expect(isJwtExpired(makeFakeJwt({'exp': future})), isFalse);
    });

    test('returns true when exp is within skew window', () {
      final almostExpired = (DateTime.now().millisecondsSinceEpoch ~/ 1000) + 10;
      expect(isJwtExpired(makeFakeJwt({'exp': almostExpired})), isTrue);
    });

    test('returns true when exp claim missing', () {
      expect(isJwtExpired(makeFakeJwt({'sub': 'x'})), isTrue);
    });
  });
}
