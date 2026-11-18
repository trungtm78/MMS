// Unit Tests: AuthNotifier session restore on app start, and the readiness future the splash screen
// waits for
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
  await notifier.ready;
  return notifier;
}

AuthState _state(AuthNotifier n) {
  late AuthState current;
  n.addListener((s) => current = s)();
  return current;
}

void main() {
  group('AuthNotifier restores a stored session', () {
    test('stored DQTV session is restored', () async {
      final storage = MemoryStorage(roles: ['dqtv']);
      final n = await _boot(storage);
      expect(_state(n).isAuthenticated, isTrue);
      n.dispose();
    });

    test('stored session without a DQTV role is discarded', () async {
      for (final roles in [<String>[], ['ca_officer'], ['system_admin']]) {
        final storage = MemoryStorage(roles: roles);
        final n = await _boot(storage);
        expect(_state(n).isAuthenticated, isFalse, reason: '$roles');
        expect(storage.access, isNull, reason: '$roles');
        expect(storage.refresh, isNull, reason: '$roles');
        n.dispose();
      }
    });

    test('unexpired session without a refresh token is discarded', () async {
      final storage = MemoryStorage(access: unexpiredJwt(), refresh: null, roles: ['dqtv']);
      final n = await _boot(storage);
      expect(_state(n).isAuthenticated, isFalse);
      expect(storage.access, isNull);
      n.dispose();
    });

    test('whitespace-only stored tokens are discarded', () async {
      final storage = MemoryStorage(access: '   ', refresh: '  ', roles: ['dqtv']);
      final n = await _boot(storage);
      expect(_state(n).isAuthenticated, isFalse);
      expect(storage.access, isNull);
      expect(storage.refresh, isNull);
      n.dispose();
    });

    test('no stored session: ready completes signed out', () async {
      final n = await _boot(MemoryStorage(access: null, refresh: null));
      expect(_state(n).isAuthenticated, isFalse);
      n.dispose();
    });
  });

  test('UT-AUTH-READY-01: ready completes only once the stored session has been read', () async {
    final storage = GatedStorage(roles: ['dqtv']);
    final n = AuthNotifier(_UnusedRepository(), storage);
    var ready = false;
    n.ready.then((_) => ready = true).ignore();

    await pumpEventQueue();
    expect(ready, isFalse);
    expect(_state(n).isAuthenticated, isFalse);

    storage.release.complete();
    await n.ready;

    expect(ready, isTrue);
    expect(_state(n).isAuthenticated, isTrue);
    n.dispose();
  });
}
