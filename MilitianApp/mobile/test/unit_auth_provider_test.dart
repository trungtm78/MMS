// Unit Tests: AuthNotifier session restore on app start
// Run: flutter test test/unit_auth_provider_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository.dart';

import 'helpers/fakes.dart';

/// Restore on start never calls the repository.
class _UnusedRepository implements AuthRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

Future<AuthNotifier> _boot(MemoryStorage storage) async {
  final notifier = AuthNotifier(_UnusedRepository(), storage);
  // _checkAuth runs from the constructor; let its awaits settle
  await Future<void>.delayed(const Duration(milliseconds: 10));
  return notifier;
}

void main() {
  group('AuthNotifier restores a stored session', () {
    test('stored DQTV session is restored', () async {
      final storage = MemoryStorage(roles: ['dqtv']);
      final n = await _boot(storage);
      expect(n.debugState.isAuthenticated, isTrue);
      n.dispose();
    });

    test('stored session without a DQTV role is discarded', () async {
      for (final roles in [<String>[], ['ca_officer'], ['system_admin']]) {
        final storage = MemoryStorage(roles: roles);
        final n = await _boot(storage);
        expect(n.debugState.isAuthenticated, isFalse, reason: '$roles');
        expect(storage.access, isNull, reason: '$roles');
        expect(storage.refresh, isNull, reason: '$roles');
        n.dispose();
      }
    });

    test('unexpired session without a refresh token is discarded', () async {
      final storage = MemoryStorage(access: unexpiredJwt(), refresh: null, roles: ['dqtv']);
      final n = await _boot(storage);
      expect(n.debugState.isAuthenticated, isFalse);
      expect(storage.access, isNull);
      n.dispose();
    });

    test('whitespace-only stored tokens are discarded', () async {
      final storage = MemoryStorage(access: '   ', refresh: '  ', roles: ['dqtv']);
      final n = await _boot(storage);
      expect(n.debugState.isAuthenticated, isFalse);
      expect(storage.access, isNull);
      expect(storage.refresh, isNull);
      n.dispose();
    });
  });
}
