import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Why the stored session ended without the user signing out. The login screen words it
/// (sessionEndText in lib/features/auth/auth_texts.dart).
enum SessionEndReason {
  /// The refresh was refused, revoked or reused, or the session could not be renewed at all.
  ended,

  /// POST /users/me/change-password ended every session of the account
  /// (Web/backend/src/users/users.service.ts:180-229).
  passwordChanged,

  /// 401 mfa_reauthentication_required: MFA was enabled, sign in again with the second factor.
  mfaReauthenticationRequired,

  /// 403 account_disabled
  accountDisabled,

  /// 403 no_role_assigned
  noRoleAssigned,
}

/// The stored session ended without the user signing out.
class SessionEnd {
  const SessionEnd(this.reason, {this.code});

  /// The session of a refresh the server refused with [code] (Web/backend/src/auth/
  /// auth.service.ts:469-484), or one that could not be renewed at all.
  factory SessionEnd.forCode(String? code) => SessionEnd(
        switch (code) {
          'mfa_reauthentication_required' => SessionEndReason.mfaReauthenticationRequired,
          'account_disabled' => SessionEndReason.accountDisabled,
          'no_role_assigned' => SessionEndReason.noRoleAssigned,
          _ => SessionEndReason.ended,
        },
        code: code,
      );

  final SessionEndReason reason;

  /// The backend error code, when the server gave one
  final String? code;
}

/// Broadcasts the end of the stored session. The token refresher reports into it (HTTP and chat
/// socket); AuthNotifier listens and signs out.
class SessionEvents {
  final _controller = StreamController<SessionEnd>.broadcast();

  Stream<SessionEnd> get stream => _controller.stream;

  void end(SessionEnd end) {
    if (!_controller.isClosed) _controller.add(end);
  }

  Future<void> close() => _controller.close();
}

/// The app-wide signal shared by DioClient's refresher and [sessionEventsProvider].
final sharedSessionEvents = SessionEvents();

final sessionEventsProvider = Provider<SessionEvents>((ref) => sharedSessionEvents);
