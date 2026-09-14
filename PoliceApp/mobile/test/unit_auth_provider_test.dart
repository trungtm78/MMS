// Unit Tests: AuthNotifier session restore on app start
// Run: flutter test test/unit_auth_provider_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';

import 'helpers/fakes.dart';

Future<AuthNotifier> _boot(MemoryStorage storage) async {
  final notifier = AuthNotifier(storage, Dio());
  // _checkAuth runs from the constructor; let its awaits settle
  await Future<void>.delayed(const Duration(milliseconds: 10));
  return notifier;
}

void main() {
  group('AuthNotifier restores a stored session', () {
    test('UT-SESS-01: stored CA and DQTV sessions are restored', () async {
      for (final role in ['ca', 'dqtv']) {
        final storage = MemoryStorage(role: role);
        final n = await _boot(storage);
        expect(n.debugState.isAuthenticated, isTrue, reason: role);
        expect(n.debugState.role, role, reason: role);
        n.dispose();
      }
    });

    test('UT-SESS-02: stored session without an allowed role is discarded', () async {
      for (final role in [null, '', 'unknown']) {
        final storage = MemoryStorage(role: role);
        final n = await _boot(storage);
        expect(n.debugState.isAuthenticated, isFalse, reason: '$role');
        expect(storage.access, isNull, reason: '$role');
        expect(storage.refresh, isNull, reason: '$role');
        n.dispose();
      }
    });

    test('UT-SESS-03: unexpired session without a refresh token is discarded', () async {
      final storage = MemoryStorage(access: unexpiredJwt(), refresh: null, role: 'ca');
      final n = await _boot(storage);
      expect(n.debugState.isAuthenticated, isFalse);
      expect(storage.access, isNull);
      n.dispose();
    });

    test('UT-SESS-04: whitespace-only stored tokens are discarded', () async {
      final storage = MemoryStorage(access: '   ', refresh: '  ', role: 'ca');
      final n = await _boot(storage);
      expect(n.debugState.isAuthenticated, isFalse);
      expect(storage.access, isNull);
      expect(storage.refresh, isNull);
      n.dispose();
    });
  });
}
