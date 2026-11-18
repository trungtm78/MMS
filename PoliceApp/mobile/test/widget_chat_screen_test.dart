// Widget Tests: ChatScreen — input limit, errors, typing indicator, socket session signals
// Gateway: Web/backend/src/notifications/notifications.gateway.ts
//   handshake refusal → connect_error {message: missing_token | invalid_token | session_revoked |
//   authentication_unavailable}; an ended session → 'session_expired' {reason}, then disconnect
// Run: flutter test test/widget_chat_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/network/session_events.dart';
import 'package:police_app/core/network/token_refresher.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/chat/chat_socket.dart';
import 'package:police_app/features/chat/screens/chat_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

/// Records emits and lets a test deliver server events
class _FakeChatSocket implements ChatSocket {
  _FakeChatSocket({this.joinAck = const {'joined': 'c1'}});

  final Object? joinAck;
  final emitted = <(String, Object?)>[];
  final _handlers = <String, void Function(dynamic)>{};
  void Function()? _onConnect;
  bool disposed = false;

  @override
  void onConnect(void Function() handler) => _onConnect = handler;

  @override
  void on(String event, void Function(dynamic data) handler) => _handlers[event] = handler;

  @override
  void emit(String event, Object? data) => emitted.add((event, data));

  @override
  void emitWithAck(String event, Object? data, void Function(dynamic response) onAck) {
    emitted.add((event, data));
    if (event == 'chat:join') onAck(joinAck);
  }

  @override
  void dispose() => disposed = true;

  void connect() => _onConnect?.call();

  void fire(String event, Object? data) => _handlers[event]?.call(data);

  /// [event, payload] pairs as lists, so matchers compare the payload maps deeply
  List<List<Object?>> typing() => [
        for (final e in emitted)
          if (e.$1 == 'typing_start' || e.$1 == 'typing_stop') [e.$1, e.$2],
      ];

  List<(String, Object?)> joins() => emitted.where((e) => e.$1 == 'chat:join').toList();
}

class _SocketHarness {
  final sockets = <_FakeChatSocket>[];

  /// Access token each socket was opened with
  final tokens = <String>[];

  /// staleAccessToken of each session renewal the screen asked for
  final renewals = <String?>[];
  final sessionEnds = <String>[];
  late FakeAdapter adapter;
}

const _conversations = [
  {
    'id': 'c1',
    'title': null,
    'conversationType': 'direct',
    'createdAt': '2026-09-01T00:00:00.000Z',
    'participants': [
      {'id': 'u2', 'fullName': 'Nguyen Van An', 'username': 'dqtv01'},
    ],
    'unreadCount': 0,
  },
];

/// Each new socket answers chat:join with the next of [joinAcks] (the last one repeats)
Future<_SocketHarness> _pumpSockets(
  WidgetTester tester, {
  List<Object?> joinAcks = const [
    {'joined': 'c1'},
  ],
  String? renewedToken = 'tok_renewed',
  Object? renewFailure,
}) async {
  final h = _SocketHarness();
  final adapter = FakeAdapter((o) {
    if (o.path == '/chat/conversations') return jsonBody(200, _conversations);
    if (o.method == 'GET') return jsonBody(200, {'data': [], 'total': 0, 'page': 1, 'limit': 50});
    if (o.path.endsWith('/read')) {
      return jsonBody(200, {'conversationId': 'c1', 'readAt': '2026-09-14T01:00:00.000Z'});
    }
    return jsonBody(201, {
      'id': 'm1',
      'conversationId': 'c1',
      'senderId': 'me',
      'senderName': 'ca01',
      'content': (o.data as Map)['content'],
      'createdAt': '2026-09-14T01:00:00.000Z',
    });
  });
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  h.adapter = adapter;
  final storage = MemoryStorage(access: 'tok_access', refresh: 'tok_refresh')..userId = 'me';
  await tester.pumpWidget(ProviderScope(
    // A fresh scope and screen each time, even when a test pumps twice
    key: UniqueKey(),
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      dioProvider.overrideWithValue(dio),
      chatSocketFactoryProvider.overrideWithValue((token) {
        final ack = joinAcks[h.sockets.length < joinAcks.length ? h.sockets.length : joinAcks.length - 1];
        final socket = _FakeChatSocket(joinAck: ack);
        h.sockets.add(socket);
        h.tokens.add(token);
        return socket;
      }),
      renewSessionProvider.overrideWithValue(({String? staleAccessToken}) async {
        h.renewals.add(staleAccessToken);
        if (renewFailure != null) throw renewFailure;
        return renewedToken;
      }),
    ],
    child: localizedApp(const ChatScreen(conversationId: 'c1')),
  ));
  final container = ProviderScope.containerOf(tester.element(find.byType(ChatScreen)));
  container.read(sessionEventsProvider).stream.listen((end) => h.sessionEnds.add(end.code));
  await tester.pumpAndSettle();
  h.sockets.first.connect();
  await tester.pump();
  return h;
}

Future<(_FakeChatSocket, FakeAdapter)> _pumpWithSocket(
  WidgetTester tester, {
  Object? joinAck = const {'joined': 'c1'},
}) async {
  final h = await _pumpSockets(tester, joinAcks: [joinAck]);
  return (h.sockets.first, h.adapter);
}

Map<String, Object?> _typingEvent(String userId, bool typing, {String conversationId = 'c1'}) =>
    {'conversationId': conversationId, 'userId': userId, 'typing': typing};

Future<FakeAdapter> _pumpChat(
  WidgetTester tester, {
  required int sendStatus,
  ResponseBody Function(RequestOptions)? messages,
}) async {
  final adapter = FakeAdapter((o) {
    if (o.method == 'GET') {
      return messages?.call(o) ?? jsonBody(200, {'data': [], 'total': 0, 'page': 1, 'limit': 50});
    }
    if (o.path.endsWith('/read')) {
      return jsonBody(200, {'conversationId': 'c1', 'readAt': '2026-09-14T01:00:00.000Z'});
    }
    if (sendStatus == 403) {
      return jsonBody(403, {'code': 'E004', 'message': 'not_a_participant', 'statusCode': 403});
    }
    return jsonBody(201, {
      'id': 'm1',
      'conversationId': 'c1',
      'senderId': 'u1',
      'senderName': 'ca01',
      'content': (o.data as Map)['content'],
      'createdAt': '2026-09-14T01:00:00.000Z',
    });
  });
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  await tester.pumpWidget(ProviderScope(
    overrides: [
      // No access token: the screen skips the socket connection
      secureStorageProvider.overrideWithValue(MemoryStorage(access: null, refresh: null)),
      dioProvider.overrideWithValue(dio),
    ],
    child: localizedApp(const ChatScreen(conversationId: 'c1')),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

void main() {
  testWidgets('WT-CHAT-01: the input stops at 4000 characters and shows the count near the limit', (tester) async {
    await _pumpChat(tester, sendStatus: 201);

    expect(find.text(viL10n.chatScreenTitle), findsOneWidget);
    expect(find.text(viL10n.chatScreenEmpty), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'a' * 4001);
    await tester.pump();

    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.controller!.text.length, 4000);
    expect(find.text(viL10n.chatScreenCharacterCount(4000, 4000)), findsOneWidget);
  });

  testWidgets('WT-CHAT-02: 403 not_a_participant is shown and the draft is kept', (tester) async {
    final adapter = await _pumpChat(tester, sendStatus: 403);

    await tester.enterText(find.byType(TextField), 'Xin chao');
    await tester.tap(find.bySemanticsLabel(viL10n.chatScreenSend));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorNotAParticipant), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, 'Xin chao');
    expect(adapter.requests.where((r) => r.path.endsWith('/messages') && r.method == 'POST'), hasLength(1));
  });

  testWidgets('WT-CHAT-03: a sent message appears from the REST reply', (tester) async {
    final adapter = await _pumpChat(tester, sendStatus: 201);

    await tester.enterText(find.byType(TextField), 'Status report');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();

    expect(find.text('Status report'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, isEmpty);
    expect(adapter.requests.where((r) => r.path.endsWith('/messages') && r.method == 'POST'), hasLength(1));
  });

  testWidgets('WT-CHAT-04: opening a conversation marks it read', (tester) async {
    final adapter = await _pumpChat(tester, sendStatus: 201);

    final reads = adapter.requests.where((r) => r.method == 'POST' && r.path == '/chat/conversations/c1/read');
    expect(reads, hasLength(1));
  });

  testWidgets('WT-CHAT-05: a failed history load is explained; refresh loads it again', (tester) async {
    var calls = 0;
    await _pumpChat(tester, sendStatus: 201, messages: (_) {
      calls++;
      return calls == 1
          ? jsonBody(500, {'code': 'E005', 'message': 'Internal server error', 'statusCode': 500})
          : jsonBody(200, {
              'data': [
                {'id': 'm9', 'conversationId': 'c1', 'senderId': 'u2', 'senderName': 'dqtv01', 'content': 'Hello', 'createdAt': '2026-09-14T01:00:00.000Z'},
              ],
              'total': 1,
              'page': 1,
              'limit': 50,
            });
    });

    expect(find.text(viL10n.chatScreenLoadFailed(viL10n.errorServer)), findsOneWidget);
    await tester.tap(find.byTooltip(viL10n.chatScreenRefresh));
    await tester.pumpAndSettle();

    expect(find.text('Hello'), findsOneWidget);
    expect(find.text('dqtv01'), findsOneWidget);
  });

  // Typing indicator (Web/backend/src/notifications/notifications.gateway.ts)
  testWidgets('WT-TYPE-01: the other participant typing is shown and clears by itself', (tester) async {
    final (socket, _) = await _pumpWithSocket(tester);

    socket.fire('chat:typing', _typingEvent('u2', true));
    await tester.pump();
    expect(find.text(viL10n.chatScreenTypingOne('Nguyen Van An')), findsOneWidget);

    // No typing_stop ever arrives
    await tester.pump(const Duration(seconds: 7));
    expect(find.text(viL10n.chatScreenTypingOne('Nguyen Van An')), findsNothing);
  });

  testWidgets('WT-TYPE-02: stop events, own events and other conversations', (tester) async {
    final (socket, _) = await _pumpWithSocket(tester);

    socket.fire('chat:typing', _typingEvent('me', true));
    socket.fire('chat:typing', _typingEvent('u2', true, conversationId: 'c9'));
    await tester.pump();
    expect(find.text(viL10n.chatScreenTypingOne('Nguyen Van An')), findsNothing);

    socket.fire('chat:typing', _typingEvent('u2', true));
    await tester.pump();
    socket.fire('chat:typing', _typingEvent('u2', false));
    await tester.pump();
    expect(find.text(viL10n.chatScreenTypingOne('Nguyen Van An')), findsNothing);
  });

  testWidgets('WT-TYPE-07: someone outside the participant list is named from their messages or generically',
      (tester) async {
    final (socket, _) = await _pumpWithSocket(tester);

    socket.fire('chat:typing', _typingEvent('u7', true));
    await tester.pump();
    expect(find.text(viL10n.chatScreenTypingOne(viL10n.chatScreenTypingSomeone)), findsOneWidget);

    socket.fire('chat:message', {
      'id': 'm2', 'conversationId': 'c1', 'senderId': 'u7', 'senderName': 'ca07', 'content': 'Hi', 'createdAt': '2026-09-14T01:00:00.000Z',
    });
    await tester.pumpAndSettle();
    socket.fire('chat:typing', _typingEvent('u7', true));
    await tester.pump();
    expect(find.text(viL10n.chatScreenTypingOne('ca07')), findsOneWidget);
  });

  testWidgets('WT-TYPE-03: typing_start once while typing, typing_stop when the message is sent',
      (tester) async {
    final (socket, _) = await _pumpWithSocket(tester);

    await tester.enterText(find.byType(TextField), 'X');
    await tester.enterText(find.byType(TextField), 'Xin');
    await tester.enterText(find.byType(TextField), 'Xin chao');
    expect(socket.typing(), [
      ['typing_start', {'conversationId': 'c1'}],
    ]);

    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();
    expect(socket.typing(), [
      ['typing_start', {'conversationId': 'c1'}],
      ['typing_stop', {'conversationId': 'c1'}],
    ]);
  });

  testWidgets('WT-TYPE-04: pausing stops typing after the idle delay', (tester) async {
    final (socket, _) = await _pumpWithSocket(tester);

    await tester.enterText(find.byType(TextField), 'abc');
    await tester.pump(const Duration(seconds: 4));

    expect(socket.typing(), [
      ['typing_start', {'conversationId': 'c1'}],
      ['typing_stop', {'conversationId': 'c1'}],
    ]);
  });

  testWidgets('WT-TYPE-05: leaving the screen stops typing and closes the socket', (tester) async {
    final (socket, _) = await _pumpWithSocket(tester);

    await tester.enterText(find.byType(TextField), 'abc');
    await tester.pumpWidget(const SizedBox());

    expect(socket.typing(), [
      ['typing_start', {'conversationId': 'c1'}],
      ['typing_stop', {'conversationId': 'c1'}],
    ]);
    expect(socket.disposed, isTrue);
  });

  testWidgets('WT-TYPE-06: a refused join is shown and nothing is signalled', (tester) async {
    final (socket, _) = await _pumpWithSocket(tester, joinAck: const {'error': 'not_a_participant'});

    expect(find.text(viL10n.errorNotAParticipant), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'abc');
    await tester.pump(const Duration(seconds: 4));

    expect(socket.typing(), isEmpty);
  });

  // Session signals: an expired or revoked session gets 'session_expired' before the server
  // disconnects; the ack of the triggering emit may never arrive
  testWidgets('WT-SOCK-01: a session_expired ack renews the session and rejoins on a new socket', (tester) async {
    final h = await _pumpSockets(tester, joinAcks: const [
      {'error': 'session_expired'},
      {'joined': 'c1'},
    ]);
    await tester.pumpAndSettle();

    expect(h.renewals, ['tok_access']);
    expect(h.tokens, ['tok_access', 'tok_renewed']);
    expect(h.sockets.first.disposed, isTrue);
    expect(find.text(viL10n.errorSessionExpired), findsNothing);

    h.sockets.last.connect();
    await tester.pump();
    expect(h.sockets.last.joins(), hasLength(1));

    await tester.enterText(find.byType(TextField), 'a');
    expect(h.sockets.last.typing(), [
      ['typing_start', {'conversationId': 'c1'}],
    ]);
  });

  testWidgets('WT-SOCK-02: a server-side disconnect renews and reconnects', (tester) async {
    final h = await _pumpSockets(tester);

    h.sockets.first.fire('disconnect', 'io server disconnect');
    await tester.pumpAndSettle();

    expect(h.renewals, ['tok_access']);
    expect(h.tokens, ['tok_access', 'tok_renewed']);
  });

  testWidgets('WT-SOCK-03: no reconnect when the session could not be renewed', (tester) async {
    final h = await _pumpSockets(tester, joinAcks: const [
      {'error': 'session_expired'},
    ], renewedToken: null);
    await tester.pumpAndSettle();

    expect(h.renewals, hasLength(1));
    expect(h.tokens, ['tok_access']);
  });

  testWidgets('WT-SOCK-12: a renewal without an answer (offline, 5xx, 429) keeps the session and reconnects later',
      (tester) async {
    final h = await _pumpSockets(
      tester,
      joinAcks: const [
        {'error': 'session_expired'},
        {'joined': 'c1'},
      ],
      renewFailure: RefreshUnavailable(DioException(
        requestOptions: RequestOptions(path: '/auth/refresh'),
        response: Response<dynamic>(requestOptions: RequestOptions(path: '/auth/refresh'), statusCode: 503),
        type: DioExceptionType.badResponse,
      )),
    );
    await tester.pump();

    expect(h.renewals, ['tok_access']);
    expect(h.sockets.first.disposed, isTrue);
    expect(h.sessionEnds, isEmpty);

    await tester.pump(const Duration(seconds: 1));
    expect(h.tokens, ['tok_access', 'tok_access']);
    expect(h.sessionEnds, isEmpty);
  });

  testWidgets('WT-SOCK-04: a dropped connection is left to the client reconnect', (tester) async {
    final h = await _pumpSockets(tester);

    h.sockets.first.fire('disconnect', 'transport close');
    await tester.pumpAndSettle();

    expect(h.renewals, isEmpty);
    expect(h.tokens, hasLength(1));
  });

  testWidgets('WT-SOCK-05: renewal stops after three refused joins in a row', (tester) async {
    final h = await _pumpSockets(tester, joinAcks: const [
      {'error': 'session_expired'},
    ]);
    await tester.pumpAndSettle();
    for (var i = 0; i < 5; i++) {
      h.sockets.last.connect();
      await tester.pumpAndSettle();
    }

    expect(h.renewals, hasLength(3));
    expect(h.sockets, hasLength(4));
  });

  testWidgets('WT-SOCK-06: the session_expired event renews once, even with the disconnect that follows',
      (tester) async {
    final h = await _pumpSockets(tester);

    h.sockets.first.fire('session_expired', {'reason': 'session_revoked'});
    h.sockets.first.fire('disconnect', 'io server disconnect');
    await tester.pumpAndSettle();

    expect(h.renewals, ['tok_access']);
    expect(h.tokens, ['tok_access', 'tok_renewed']);
  });

  testWidgets('WT-SOCK-07: a handshake refused for the token renews and reconnects', (tester) async {
    for (final (event, reason) in [('connect_error', 'invalid_token'), ('error', 'session_revoked')]) {
      final h = await _pumpSockets(tester);

      h.sockets.first.fire(event, {'message': reason});
      await tester.pumpAndSettle();

      expect(h.renewals, ['tok_access'], reason: reason);
      expect(h.tokens, ['tok_access', 'tok_renewed'], reason: reason);
      expect(h.sessionEnds, isEmpty, reason: reason);
    }
  });

  testWidgets('WT-SOCK-08: a handshake without a token signs out', (tester) async {
    final h = await _pumpSockets(tester);

    h.sockets.first.fire('connect_error', {'message': 'missing_token'});
    await tester.pumpAndSettle();

    expect(h.sessionEnds, ['missing_token']);
    expect(h.renewals, isEmpty);
    expect(h.tokens, hasLength(1));
    expect(h.sockets.first.disposed, isTrue);
  });

  testWidgets('WT-SOCK-09: authentication_unavailable retries later with growing delays, without signing out',
      (tester) async {
    final h = await _pumpSockets(tester);

    h.sockets.first.fire('connect_error', {'message': 'authentication_unavailable'});
    await tester.pump();
    expect(h.sockets.first.disposed, isTrue);
    expect(h.tokens, hasLength(1));

    await tester.pump(const Duration(seconds: 1));
    expect(h.tokens, ['tok_access', 'tok_access']);

    h.sockets.last.fire('connect_error', {'message': 'authentication_unavailable'});
    await tester.pump(const Duration(seconds: 1));
    expect(h.tokens, hasLength(2), reason: 'the second wait is longer');
    await tester.pump(const Duration(seconds: 1));
    expect(h.tokens, hasLength(3));

    expect(h.renewals, isEmpty);
    expect(h.sessionEnds, isEmpty);
  });

  testWidgets('WT-SOCK-10: transport errors are left to socket.io', (tester) async {
    final h = await _pumpSockets(tester);

    h.sockets.first.fire('connect_error', 'SocketException: connection refused');
    h.sockets.first.fire('error', {'message': 'something else'});
    await tester.pumpAndSettle();

    expect(h.renewals, isEmpty);
    expect(h.sessionEnds, isEmpty);
    expect(h.tokens, hasLength(1));
    expect(h.sockets.first.disposed, isFalse);
  });

  testWidgets('WT-SOCK-11: leaving during a pending retry cancels it', (tester) async {
    final h = await _pumpSockets(tester);

    h.sockets.first.fire('connect_error', {'message': 'authentication_unavailable'});
    await tester.pump();
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 5));

    expect(h.tokens, hasLength(1));
  });
}
