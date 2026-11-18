// Unit Tests: the chat socket keeps its session (Web/backend/src/notifications/notifications.gateway.ts)
//   Handshake (afterInit, authenticate :73-114): a refusal arrives as its message
//     missing_token → sign out; invalid_token | session_revoked → renew once through the shared
//     refresher and open a NEW connection (a refused refresh has already ended the session);
//     authentication_unavailable → connect again later with growing delays, still signed in.
//   Open socket (sessionOf / endSession :150-175): 'session_expired' {reason: token_expired |
//     session_revoked}, then the server disconnects ('io server disconnect'); the acknowledgement
//     {error: 'session_expired'} of the emit never arrives. One refusal renews exactly once.
//   Fallback: a server disconnect or an ack {error: 'session_expired'} still renews; at most 3
//   renewals of an open socket in a row until a chat:join succeeds, while a renewal after a refused
//   handshake is proven by the next accepted connection. No acknowledgement is waited for without
//   a timeout. A client-side close is left to socket.io.
// Run: flutter test test/unit_websocket_session_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/network/session_events.dart';
import 'package:militian_app/core/network/token_refresher.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/shared/services/websocket_service.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

import 'helpers/fake_chat_socket.dart';
import 'helpers/fakes.dart';

class _Rig {
  _Rig({String? Function(String? stale)? renew}) : _answer = renew ?? ((_) => 'new_access') {
    service.stream.listen(messages.add);
    events.stream.listen(ends.add);
  }

  final String? Function(String? stale) _answer;
  final storage = MemoryStorage();
  final events = SessionEvents();
  final scheduler = FakeScheduler();
  final sockets = <FakeChatSocket>[];
  final renewals = <String?>[];
  final messages = <WsMessage>[];
  final ends = <SessionEnd>[];
  late final service = WebSocketService(
    storage,
    renewToken: (stale) async {
      renewals.add(stale);
      return _answer(stale);
    },
    socketFactory: (token) {
      final socket = FakeChatSocket(token);
      sockets.add(socket);
      return socket;
    },
    sessionEvents: events,
    scheduler: scheduler.schedule,
  );

  /// Connects, lets the server accept the socket and joins [conversationId].
  Future<FakeChatSocket> openChat(String conversationId) async {
    await service.connect();
    final socket = sockets.last;
    socket.serverConnect();
    service.joinConversation(conversationId);
    return socket;
  }

  Future<void> settle() => pumpEventQueue();

  Iterable<WsMessage> get errors => messages.where((m) => m.event == WsEvent.error);
}

const _joinC1 = {'conversationId': 'c1'};

void main() {
  group('fallback renewals', () {
    test('WS-SES-01: an ack {error: session_expired} reconnects with the renewed token and joins again',
        () async {
      final r = _Rig();
      final first = await r.openChat('c1');
      expect(first.token, 'old_access');
      expect(first.emittedData('chat:join'), [_joinC1]);

      first.ack('chat:join', {'error': 'session_expired'});
      await r.settle();

      expect(r.renewals, ['old_access']);
      expect(first.disposed, isTrue);
      expect(r.sockets, hasLength(2));
      final second = r.sockets.last;
      expect(second.token, 'new_access');
      expect(second.connectCalled, isTrue);

      second.serverConnect();
      expect(second.emittedData('chat:join'), [_joinC1]);
      await r.settle();
      // No "session expired" message reaches the chat screen
      expect(r.errors, isEmpty);
    });

    test('WS-SES-02: a server-side disconnect reconnects with the renewed token', () async {
      final r = _Rig();
      final first = await r.openChat('c1');

      first.fireDisconnect('io server disconnect');
      await r.settle();

      expect(r.renewals, ['old_access']);
      expect(first.disposed, isTrue);
      expect(r.sockets.map((s) => s.token), ['old_access', 'new_access']);
      expect(r.sockets.last.connectCalled, isTrue);
    });

    test('WS-SES-03: a socket the server closes right after connecting is renewed too', () async {
      final r = _Rig();
      await r.service.connect();
      final first = r.sockets.single;

      // handleConnection disconnects a socket without a verified user
      first.fireDisconnect('io server disconnect');
      await r.settle();

      expect(r.renewals, ['old_access']);
      expect(r.sockets.map((s) => s.token), ['old_access', 'new_access']);
    });

    test('WS-SES-04: a null renewal does not reconnect', () async {
      final r = _Rig(renew: (_) => null);
      final first = await r.openChat('c1');

      first.ack('chat:join', {'error': 'session_expired'});
      await r.settle();

      expect(r.renewals, ['old_access']);
      expect(first.disposed, isTrue);
      expect(r.sockets, hasLength(1));
      expect(r.service.isConnected, isFalse);
      expect(r.errors, isEmpty);
    });

    test('WS-SES-26: a renewal without an answer (offline, 5xx, 429) keeps the session and connects again later',
        () async {
      final r = _Rig(renew: (_) => throw RefreshUnavailable(DioException(
            requestOptions: RequestOptions(path: '/auth/refresh'),
            type: DioExceptionType.connectionError,
          )));
      final first = await r.openChat('c1');

      first.ack('chat:join', {'error': 'session_expired'});
      await r.settle();

      expect(r.renewals, ['old_access']);
      expect(first.disposed, isTrue);
      expect(r.ends, isEmpty);
      final retry = r.scheduler.active.single;
      expect(retry.duration, WebSocketService.unavailableRetryDelay(0));
      retry.fire();
      expect(r.sockets, hasLength(2));
      expect(r.sockets.last.token, 'old_access');
      expect(r.sockets.last.connectCalled, isTrue);
    });

    test('WS-SES-05: a client-side transport close does not renew', () async {
      final r = _Rig();
      final first = await r.openChat('c1');

      for (final reason in ['transport close', 'ping timeout', 'transport error']) {
        first.fireDisconnect(reason);
      }
      await r.settle();

      expect(r.renewals, isEmpty);
      expect(r.sockets, hasLength(1));
      expect(first.disposed, isFalse);
    });

    test('WS-SES-06: the ack and the disconnect of one refusal renew once', () async {
      final r = _Rig();
      final first = await r.openChat('c1');

      first.ack('chat:join', {'error': 'session_expired'});
      first.fireDisconnect('io server disconnect');
      await r.settle();

      expect(r.renewals, hasLength(1));
      expect(r.sockets, hasLength(2));
    });

    test('WS-SES-07: renewals of an open socket stop after 3 until a join succeeds', () async {
      final r = _Rig();
      var socket = await r.openChat('c1');

      for (var i = 0; i < 4; i++) {
        socket.ack('chat:join', {'error': 'session_expired'});
        await r.settle();
        socket = r.sockets.last;
        socket.serverConnect();
      }

      expect(r.renewals, hasLength(3));
      expect(r.sockets, hasLength(4));
      expect(r.sockets.last.disposed, isTrue);
    });

    test('WS-SES-08: a successful join resets the count', () async {
      final r = _Rig();
      var socket = await r.openChat('c1');

      for (var i = 0; i < 5; i++) {
        socket.ack('chat:join', {'error': 'session_expired'});
        await r.settle();
        socket = r.sockets.last;
        socket.serverConnect();
        socket.ack('chat:join', {'joined': 'c1'});
        // Each join is answered once: the next refusal answers a new join
        r.service.joinConversation('c1');
      }

      expect(r.renewals, hasLength(5));
      expect(r.sockets, hasLength(6));
    });

    test('WS-SES-09: other join refusals still reach the chat screen, as their code', () async {
      final r = _Rig();
      final first = await r.openChat('c1');

      first.ack('chat:join', {'error': 'not_a_participant'});
      await r.settle();

      expect(r.errors.map((m) => (m.data as ApiFailure).code), ['not_a_participant']);
      expect(r.renewals, isEmpty);
    });

    test('WS-SES-10: disconnecting during a renewal does not reconnect', () async {
      final r = _Rig();
      final first = await r.openChat('c1');

      first.ack('chat:join', {'error': 'session_expired'});
      r.service.disconnect();
      await r.settle();

      expect(r.sockets, hasLength(1));
      expect(first.disposed, isTrue);
    });
  });

  group('refused handshake', () {
    test('WS-SES-11: invalid_token and session_revoked renew once and open a new connection', () async {
      for (final code in ['invalid_token', 'session_revoked']) {
        final r = _Rig();
        await r.service.connect();
        final first = r.sockets.single;

        first.refuse(code);
        await r.settle();

        expect(r.renewals, ['old_access'], reason: code);
        expect(first.disposed, isTrue, reason: code);
        expect(r.sockets.map((s) => s.token), ['old_access', 'new_access'], reason: code);
        expect(r.sockets.last.connectCalled, isTrue, reason: code);
        expect(r.ends, isEmpty, reason: code);
        expect(r.storage.access, 'old_access', reason: code);
      }
    });

    test('WS-SES-12: a refused refresh after a refused handshake leaves the socket closed', () async {
      final r = _Rig(renew: (_) => null);
      await r.service.connect();
      final first = r.sockets.single;

      first.refuse('session_revoked');
      await r.settle();

      expect(r.renewals, ['old_access']);
      expect(first.disposed, isTrue);
      expect(r.sockets, hasLength(1));
      expect(r.service.isConnected, isFalse);
    });

    test('WS-SES-13: missing_token signs out: tokens cleared and one session end, no renewal', () async {
      final r = _Rig();
      await r.service.connect();
      final first = r.sockets.single;

      first.refuse('missing_token');
      await r.settle();

      expect(r.ends.map((e) => (e.reason, e.code)), [(SessionEndReason.ended, 'missing_token')]);
      expect(r.storage.access, isNull);
      expect(r.storage.refresh, isNull);
      expect(r.renewals, isEmpty);
      expect(first.disposed, isTrue);
      expect(r.sockets, hasLength(1));
      expect(r.scheduler.active, isEmpty);
    });

    test('WS-SES-14: authentication_unavailable connects again later with the same token, growing delays, '
        'still signed in', () async {
      final r = _Rig();
      await r.service.connect();
      var socket = r.sockets.single;
      final delays = <Duration>[];

      for (var i = 0; i < WebSocketService.maxUnavailableRetries; i++) {
        socket.refuse('authentication_unavailable');
        await r.settle();
        expect(socket.disposed, isTrue);
        final retry = r.scheduler.active.single;
        delays.add(retry.duration);
        retry.fire();
        socket = r.sockets.last;
        expect(socket.token, 'old_access');
        expect(socket.connectCalled, isTrue);
      }
      expect(delays, [1, 2, 4, 8, 16].map((s) => Duration(seconds: s)).toList());

      // Out of retries: closed until the app connects again (sign-in, a chat opened)
      socket.refuse('authentication_unavailable');
      await r.settle();
      expect(r.scheduler.active, isEmpty);
      expect(r.sockets, hasLength(WebSocketService.maxUnavailableRetries + 1));
      expect(r.renewals, isEmpty);
      expect(r.ends, isEmpty);
      expect(r.storage.access, 'old_access');

      await r.service.connect();
      expect(r.sockets, hasLength(WebSocketService.maxUnavailableRetries + 2));
    });

    test('WS-SES-15: an accepted connection starts the delays over', () async {
      final r = _Rig();
      await r.service.connect();

      r.sockets.last.refuse('authentication_unavailable');
      await r.settle();
      r.scheduler.active.single.fire();
      r.sockets.last.refuse('authentication_unavailable');
      await r.settle();
      expect(r.scheduler.active.single.duration, const Duration(seconds: 2));
      r.scheduler.active.single.fire();

      r.sockets.last.serverConnect();
      r.sockets.last.refuse('authentication_unavailable');
      await r.settle();
      expect(r.scheduler.active.single.duration, const Duration(seconds: 1));
    });

    test('WS-SES-16: disconnect() drops a waiting retry; connect() opens one socket instead of two', () async {
      final r = _Rig();
      await r.service.connect();
      r.sockets.single.refuse('authentication_unavailable');
      await r.settle();
      final retry = r.scheduler.active.single;

      r.service.disconnect();
      expect(retry.isActive, isFalse);
      retry.fire();
      expect(r.sockets, hasLength(1));

      await r.service.connect();
      r.sockets.last.refuse('authentication_unavailable');
      await r.settle();
      final second = r.scheduler.active.single;

      await r.service.connect();
      expect(second.isActive, isFalse);
      expect(r.sockets, hasLength(3));
    });

    test('WS-SES-17: renewals after refused handshakes are proven by the accepted connection', () async {
      final r = _Rig();
      await r.service.connect();

      for (var i = 0; i < 5; i++) {
        r.sockets.last.refuse('invalid_token');
        await r.settle();
        r.sockets.last.serverConnect();
      }

      expect(r.renewals, hasLength(5));
      expect(r.sockets, hasLength(6));
      expect(r.sockets.last.disposed, isFalse);
    });

    test('WS-SES-18: transport failures are left to socket.io', () async {
      final r = _Rig();
      await r.service.connect();
      final first = r.sockets.single;

      first.refuse('websocket error');
      first.refuse(null);
      await r.settle();

      expect(r.renewals, isEmpty);
      expect(first.disposed, isFalse);
      expect(r.sockets, hasLength(1));
      expect(r.scheduler.active, isEmpty);
      expect(r.ends, isEmpty);
    });
  });

  group('session_expired on an open socket', () {
    test('WS-SES-19: the event, the server disconnect and a late ack renew exactly once, then rejoin', () async {
      for (final reason in ['token_expired', 'session_revoked']) {
        final r = _Rig();
        final first = await r.openChat('c1');

        first.serverEmit('session_expired', {'reason': reason});
        first.fireDisconnect('io server disconnect');
        first.ack('chat:join', {'error': 'session_expired'});
        await r.settle();

        expect(r.renewals, ['old_access'], reason: reason);
        expect(first.disposed, isTrue, reason: reason);
        expect(r.sockets, hasLength(2), reason: reason);
        final second = r.sockets.last;
        expect(second.token, 'new_access', reason: reason);
        second.serverConnect();
        expect(second.emittedData('chat:join'), [_joinC1], reason: reason);
        expect(r.errors, isEmpty, reason: reason);
      }
    });

    test('WS-SES-20: without a chat open the socket still renews and reconnects', () async {
      final r = _Rig();
      await r.service.connect();
      final first = r.sockets.single;
      first.serverConnect();

      first.serverEmit('session_expired', {'reason': 'token_expired'});
      await r.settle();

      expect(r.renewals, ['old_access']);
      expect(r.sockets, hasLength(2));
      r.sockets.last.serverConnect();
      expect(r.sockets.last.emittedData('chat:join'), isEmpty);
    });

    test('WS-SES-21: a refused refresh leaves the socket closed', () async {
      final r = _Rig(renew: (_) => null);
      final first = await r.openChat('c1');

      first.serverEmit('session_expired', {'reason': 'session_revoked'});
      first.fireDisconnect('io server disconnect');
      await r.settle();

      expect(r.renewals, hasLength(1));
      expect(r.sockets, hasLength(1));
      expect(r.service.isConnected, isFalse);
    });
  });

  group('acknowledgement timeout', () {
    test('WS-SES-22: a join without an answer times out; the chat screen is told and a late answer is ignored',
        () async {
      final r = _Rig();
      final first = await r.openChat('c1');
      final timeout = r.scheduler.active.single;
      expect(timeout.duration, WebSocketService.joinAckTimeout);

      timeout.fire();
      await r.settle();
      expect(r.errors.map((m) => (m.data as ApiFailure).kind), [FailureKind.timeout]);

      first.ack('chat:join', {'error': 'not_a_participant'});
      await r.settle();
      expect(r.errors, hasLength(1));
    });

    test('WS-SES-23: an answer in time, leaving the chat, joining another or disconnecting drops the timeout',
        () async {
      final r = _Rig();
      final first = await r.openChat('c1');
      first.ack('chat:join', {'joined': 'c1'});
      expect(r.scheduler.active, isEmpty);

      r.service.joinConversation('c2');
      final c2 = r.scheduler.active.single;
      r.service.leaveConversation('c2');
      expect(c2.isActive, isFalse);

      r.service.joinConversation('c3');
      final c3 = r.scheduler.active.single;
      r.service.joinConversation('c4');
      expect(c3.isActive, isFalse);
      final c4 = r.scheduler.active.single;

      r.service.disconnect();
      expect(c4.isActive, isFalse);
      await r.settle();
      expect(r.errors, isEmpty);
    });

    test('WS-SES-24: a renewal drops the old socket\'s join timeout and the new join gets its own', () async {
      final r = _Rig();
      final first = await r.openChat('c1');
      final old = r.scheduler.active.single;

      first.serverEmit('session_expired', {'reason': 'token_expired'});
      await r.settle();
      expect(old.isActive, isFalse);

      r.sockets.last.serverConnect();
      expect(r.scheduler.active.single.duration, WebSocketService.joinAckTimeout);
      expect(r.errors, isEmpty);
    });
  });

  test('WS-SES-25: the provider builds the service and closes it with the container', () async {
    final container = ProviderContainer(overrides: [
      secureStorageProvider.overrideWithValue(MemoryStorage(access: null)),
    ]);
    final service = container.read(webSocketServiceProvider);
    // No stored token: nothing to open
    await service.connect();
    expect(service.isConnected, isFalse);

    final done = expectLater(service.stream, emitsDone);
    container.dispose();
    await done;
  });
}
