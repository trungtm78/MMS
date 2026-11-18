import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/errors/app_failure.dart';

/// A session that ended without the user signing out
class SessionEnd {
  const SessionEnd(this.code);

  /// Backend refusal of the refresh (refresh_token_reused, refresh_token_revoked,
  /// mfa_reauthentication_required, account_disabled, no_role_assigned — Web/backend/src/auth/
  /// auth.service.ts:472-487), [SessionEvents.refreshFailed] or [SessionEvents.passwordChanged]
  final String code;

  /// The notice for the login screen: reasons the user can act on keep their code, the rest
  /// (reused or revoked tokens, failed refreshes) is a neutral "session ended"
  AppFailure get failure => switch (code) {
        'account_disabled' || 'no_role_assigned' || 'mfa_reauthentication_required' => AppFailure(code),
        SessionEvents.passwordChanged => const AppFailure(AppFailure.passwordChanged),
        _ => const AppFailure(AppFailure.sessionEnded),
      };
}

/// Reports sessions ended outside the auth notifier (e.g. by the token refresh), so the app can
/// sign out and explain why
class SessionEvents {
  static const refreshFailed = 'refresh_failed';
  static const passwordChanged = 'password_changed';

  final _controller = StreamController<SessionEnd>.broadcast();

  Stream<SessionEnd> get stream => _controller.stream;

  void end(String code) {
    if (!_controller.isClosed) _controller.add(SessionEnd(code));
  }

  Future<void> dispose() => _controller.close();
}

final sessionEventsProvider = Provider<SessionEvents>((ref) {
  final events = SessionEvents();
  ref.onDispose(events.dispose);
  return events;
});
