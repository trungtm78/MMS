import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/shared/utils/jwt_utils.dart';

String makeFakeJwt(Map<String, dynamic> payload) {
  String b64(Map<String, dynamic> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${b64({'alg': 'HS256'})}.${b64(payload)}.signature';
}

void main() {
  group('isJwtExpired()', () {
    test('returns true for null/empty/malformed', () {
      expect(isJwtExpired(null), isTrue);
      expect(isJwtExpired(''), isTrue);
      expect(isJwtExpired('garbage'), isTrue);
    });

    test('returns true when exp is past', () {
      final past = (DateTime.now().millisecondsSinceEpoch ~/ 1000) - 3600;
      expect(isJwtExpired(makeFakeJwt({'exp': past})), isTrue);
    });

    test('returns false when exp is far in future', () {
      final future = (DateTime.now().millisecondsSinceEpoch ~/ 1000) + 3600;
      expect(isJwtExpired(makeFakeJwt({'exp': future})), isFalse);
    });

    test('returns true when exp claim missing', () {
      expect(isJwtExpired(makeFakeJwt({'sub': 'x'})), isTrue);
    });
  });
}
