// Widget Tests: the chat screen
//   GET  /chat/conversations/:id/messages (history, oldest first), POST /chat/conversations/:id/messages,
//   POST /chat/conversations/:id/read (best effort) — chat.service.ts, notifications/chat-messages.controller.ts
//   socket (WebSocketService over FakeChatSocket): chat:join acknowledgement, 'chat:message',
//   'chat:typing', typing_start / typing_stop, leave_conversation when the screen closes.
// Run: flutter test test/widget_chat_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/chat/repositories/chat_repository.dart';
import 'package:militian_app/features/chat/screens/chat_screen.dart';
import 'package:militian_app/shared/services/websocket_service.dart';

import 'helpers/fake_chat_socket.dart';
import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _l = viL10n;

Map<String, dynamic> _msg(String id, String senderId, String content, {String conversationId = 'c1'}) => {
      'id': id,
      'conversationId': conversationId,
      'senderId': senderId,
      'senderName': senderId,
      'content': content,
      'createdAt': '2026-09-14T01:00:00.000Z',
    };

class _Rig {
  _Rig({
    ResponseBody Function(RequestOptions o)? history,
    ResponseBody Function(RequestOptions o)? send,
    ResponseBody Function(RequestOptions o)? read,
  }) {
    adapter = FakeAdapter(routeTable({
      'GET /chat/conversations/c1/messages': history ??
          (_) => jsonBody(200, backendPage([_msg('m2', 'u2', 'Second'), _msg('m1', 'me', 'First')])),
      'POST /chat/conversations/c1/messages': send ??
          (o) => jsonBody(201, _msg('m9', 'me', (o.data as Map)['content'] as String)),
      'POST /chat/conversations/c1/read': read ?? (_) => jsonBody(200, {'conversationId': 'c1'}),
    }));
  }

  late final FakeAdapter adapter;
  final storage = MemoryStorage()..userId = 'me';
  final scheduler = FakeScheduler();
  final sockets = <FakeChatSocket>[];
  late final service = WebSocketService(
    storage,
    socketFactory: (token) {
      final socket = FakeChatSocket(token);
      sockets.add(socket);
      return socket;
    },
    scheduler: scheduler.schedule,
  );

  FakeChatSocket get socket => sockets.single;

  Iterable<RequestOptions> requests(String method, String path) =>
      adapter.requests.where((r) => r.method == method && r.path == path);

  late final router = GoRouter(
    initialLocation: '/home',
    routes: [
      GoRoute(
        path: '/home',
        builder: (context, state) => Scaffold(
          body: Center(
            child: Column(children: [
              TextButton(onPressed: () => context.push('/chat/c1', extra: 'Tran Van Binh'), child: const Text('open titled')),
              TextButton(onPressed: () => context.push('/chat/c1'), child: const Text('open untitled')),
            ]),
          ),
        ),
      ),
      GoRoute(
        path: '/chat/:id',
        builder: (context, state) => ChatScreen(
          conversationId: state.pathParameters['id']!,
          title: state.extra is String ? state.extra as String : null,
        ),
      ),
    ],
  );

  Future<void> open(WidgetTester tester, {bool titled = true}) async {
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
    await tester.pumpWidget(ProviderScope(
      overrides: [
        secureStorageProvider.overrideWithValue(storage),
        chatRepositoryProvider.overrideWithValue(ChatRepository(dio)),
        webSocketServiceProvider.overrideWithValue(service),
      ],
      child: localizedRouterApp(router),
    ));
    await tester.tap(find.text(titled ? 'open titled' : 'open untitled'));
    await tester.pumpAndSettle();
  }
}

void main() {
  testWidgets('WT-CHAT-01: shows the history oldest first, marks it read and joins the room', (tester) async {
    final r = _Rig();
    await r.open(tester);

    expect(find.text('Tran Van Binh'), findsOneWidget);
    expect(tester.getTopLeft(find.text('First')).dy, lessThan(tester.getTopLeft(find.text('Second')).dy));
    // Mine on the right, theirs on the left
    expect(tester.getCenter(find.text('First')).dx, greaterThan(tester.getCenter(find.text('Second')).dx));
    expect(r.requests('POST', '/chat/conversations/c1/read'), hasLength(1));
    expect(r.socket.token, 'old_access');
    expect(r.socket.emittedData('chat:join'), [
      {'conversationId': 'c1'},
    ]);
  });

  testWidgets('WT-CHAT-02: leaving the chat closes the screen cleanly and leaves the room', (tester) async {
    final r = _Rig();
    await r.open(tester);
    await tester.enterText(find.byType(TextField), 'draft');
    await tester.pump();

    r.router.pop();
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.byType(ChatScreen), findsNothing);
    expect(r.socket.emittedData('leave_conversation'), [
      {'conversationId': 'c1'},
    ]);
    expect(r.scheduler.active, isEmpty, reason: 'leaving drops the join timeout');
  });

  testWidgets('WT-CHAT-03: a failed read marker does not interrupt the chat', (tester) async {
    final r = _Rig(read: (_) => jsonBody(403, backendError(403, 'not_a_participant')));
    await r.open(tester);

    expect(find.text('First'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
    expect(r.requests('POST', '/chat/conversations/c1/read'), hasLength(1));
  });

  testWidgets('WT-CHAT-04: messages from the socket: shown once, others\' marked read, other rooms ignored',
      (tester) async {
    final r = _Rig();
    await r.open(tester);
    r.socket.serverConnect();

    r.socket.serverEmit('chat:message', _msg('m3', 'u2', 'Third'));
    r.socket.serverEmit('chat:message', _msg('m3', 'u2', 'Third'));
    r.socket.serverEmit('chat:message', _msg('m4', 'u2', 'Elsewhere', conversationId: 'c9'));
    r.socket.serverEmit('chat:message', _msg('m5', 'me', 'Mine from another device'));
    await tester.pumpAndSettle();

    expect(find.text('Third'), findsOneWidget);
    expect(find.text('Elsewhere'), findsNothing);
    expect(find.text('Mine from another device'), findsOneWidget);
    // History load + the message from u2 (twice delivered, marked each time it arrived as new)
    expect(r.requests('POST', '/chat/conversations/c1/read').length, greaterThanOrEqualTo(2));
  });

  testWidgets('WT-CHAT-05: someone typing is shown, and hidden on stop, on their message or after 5 s', (tester) async {
    final r = _Rig();
    await r.open(tester);
    r.socket.serverConnect();

    void typing(bool on, {String userId = 'u2'}) =>
        r.socket.serverEmit('chat:typing', {'conversationId': 'c1', 'userId': userId, 'typing': on});

    // Stream events arrive in a microtask; the rebuild needs the next frame
    typing(true, userId: 'me');
    await tester.pumpAndSettle();
    expect(find.text(_l.chatScreenTypingIndicator), findsNothing);

    typing(true);
    await tester.pumpAndSettle();
    expect(find.text(_l.chatScreenTypingIndicator), findsOneWidget);
    typing(false);
    await tester.pumpAndSettle();
    expect(find.text(_l.chatScreenTypingIndicator), findsNothing);

    typing(true);
    await tester.pumpAndSettle();
    expect(find.text(_l.chatScreenTypingIndicator), findsOneWidget);
    r.socket.serverEmit('chat:message', _msg('m6', 'u2', 'Done typing'));
    await tester.pumpAndSettle();
    expect(find.text(_l.chatScreenTypingIndicator), findsNothing);

    typing(true);
    await tester.pumpAndSettle();
    expect(find.text(_l.chatScreenTypingIndicator), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    expect(find.text(_l.chatScreenTypingIndicator), findsNothing);
  });

  testWidgets('WT-CHAT-06: sending posts over REST, shows the stored message once and signals typing',
      (tester) async {
    final r = _Rig();
    await r.open(tester);
    r.socket.serverConnect();

    expect(find.widgetWithText(TextField, _l.chatScreenMessageHint), findsOneWidget);
    await tester.enterText(find.byType(TextField), '  On my way ');
    await tester.pump();
    expect(r.socket.emittedData('typing_start'), isNotEmpty);
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();

    expect(r.requests('POST', '/chat/conversations/c1/messages').single.data, {'content': 'On my way'});
    expect(find.text('On my way'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, isEmpty);
    expect(r.socket.emittedData('typing_stop'), isNotEmpty);

    // The broadcast of the same message does not show it twice
    r.socket.serverEmit('chat:message', _msg('m9', 'me', 'On my way'));
    await tester.pumpAndSettle();
    expect(find.text('On my way'), findsOneWidget);

    // Nothing but spaces is not sent
    await tester.enterText(find.byType(TextField), '   ');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();
    expect(r.requests('POST', '/chat/conversations/c1/messages'), hasLength(1));

    // The typing stop is sent 2 s after the last keystroke
    final stops = r.socket.emittedData('typing_stop').length;
    await tester.enterText(find.byType(TextField), 'typing');
    await tester.pump(const Duration(seconds: 2));
    expect(r.socket.emittedData('typing_stop'), hasLength(stops + 1));
  });

  testWidgets('WT-CHAT-07: a refused message is worded and the draft stays', (tester) async {
    final r = _Rig(send: (_) => jsonBody(403, backendError(403, 'not_a_participant')));
    await r.open(tester);

    await tester.enterText(find.byType(TextField), 'Hello');
    await tester.testTextInput.receiveAction(TextInputAction.send);
    await tester.pumpAndSettle();

    expect(find.text(_l.errorChatNotAParticipant), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, 'Hello');
  });

  testWidgets('WT-CHAT-08: a failed history is worded with a retry; an unreadable one too', (tester) async {
    var answer = jsonBody(500, backendError(500, 'Internal server error'));
    final r = _Rig(history: (_) => answer);
    await r.open(tester);

    expect(find.text(_l.errorStatusServer), findsOneWidget);
    answer = jsonBody(200, ['not an envelope']);
    await tester.tap(find.text(_l.chatScreenRetryButton));
    await tester.pumpAndSettle();
    expect(find.text(_l.chatIssueMalformedMessageList), findsOneWidget);

    answer = jsonBody(200, backendPage([_msg('m1', 'u2', 'Loaded')]));
    await tester.tap(find.text(_l.chatScreenRetryButton));
    await tester.pumpAndSettle();
    expect(find.text('Loaded'), findsOneWidget);
  });

  testWidgets('WT-CHAT-09: a refused join is worded; an unanswered join times out', (tester) async {
    final r = _Rig();
    await r.open(tester);
    r.socket.serverConnect();
    await tester.pump();

    r.socket.ack('chat:join', {'error': 'not_a_participant'});
    await tester.pumpAndSettle();
    expect(find.text(_l.errorChatNotAParticipant), findsOneWidget);

    ScaffoldMessenger.of(tester.element(find.byType(ChatScreen))).removeCurrentSnackBar();
    await tester.pumpAndSettle();
    r.service.joinConversation('c1');
    r.scheduler.active.single.fire();
    await tester.pumpAndSettle();
    expect(find.text(_l.errorNetworkTimeout), findsOneWidget);
  });

  testWidgets('WT-CHAT-10: without a title the fallback is shown; the counter appears near the limit',
      (tester) async {
    final r = _Rig();
    await r.open(tester, titled: false);

    expect(find.text(_l.chatScreenTitleFallback), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'a' * 3900);
    await tester.pump();
    expect(find.text('3900/${ChatRepository.maxMessageLength}'), findsOneWidget);
  });
}
