// Widget Tests: the conversation list — titles, unread badges, errors, creating and opening chats
// Backend: GET /chat/conversations (Web/backend/src/chat/chat.service.ts:73-121)
// Run: flutter test test/widget_conversations_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:police_app/core/router/routes.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/chat/screens/conversations_screen.dart';
import 'package:police_app/features/chat/screens/new_conversation_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

Map<String, Object?> _item(
  String id, {
  String? title,
  String type = 'direct',
  List<String> names = const [],
  String? lastMessage,
  String? lastMessageAt,
  int unread = 0,
}) =>
    {
      'id': id,
      'title': title,
      'conversationType': type,
      'createdAt': '2026-09-01T00:00:00.000Z',
      'lastMessage': lastMessage,
      'lastMessageAt': lastMessageAt,
      'participants': [
        for (var i = 0; i < names.length; i++) {'id': '$id-u$i', 'fullName': names[i], 'username': 'user$i'},
      ],
      'unreadCount': unread,
    };

Future<FakeAdapter> _pump(WidgetTester tester, ResponseBody Function(RequestOptions) handler) async {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final router = GoRouter(initialLocation: Routes.caChat, routes: [
    GoRoute(
      path: Routes.caChat,
      builder: (_, __) => const ConversationsScreen(),
      routes: [
        GoRoute(path: ':id', builder: (_, state) => Scaffold(body: Text('CHAT ${state.pathParameters['id']}'))),
      ],
    ),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(MemoryStorage(access: null, refresh: null)..userId = 'me'),
      dioProvider.overrideWithValue(dio),
    ],
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

Iterable<RequestOptions> _listLoads(FakeAdapter a) =>
    a.requests.where((r) => r.method == 'GET' && r.path == '/chat/conversations');

void main() {
  testWidgets('WT-CONV-01: titles, last messages, type labels and unread badges', (tester) async {
    final today = DateTime.now().toUtc().toIso8601String();
    await _pump(tester, (_) => jsonBody(200, [
          _item('c1', names: ['Nguyen Van An'], lastMessage: 'On my way', lastMessageAt: today, unread: 2),
          _item('c2', type: 'group', names: ['An', 'Binh', 'Cuong', 'Dung'], unread: 150,
              lastMessageAt: '2026-01-05T02:00:00.000Z'),
          _item('c3', title: 'Patrol team', type: 'group'),
        ]));

    expect(find.text(viL10n.chatListTitle), findsOneWidget);
    expect(find.text('Nguyen Van An'), findsOneWidget);
    expect(find.text('On my way'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text(viL10n.chatConversationGroupMembersMore('An, Binh, Cuong', 1)), findsOneWidget);
    expect(find.text(viL10n.chatListUnreadOverflow), findsOneWidget);
    expect(find.text('Patrol team'), findsOneWidget);
    expect(find.text(viL10n.chatConversationTypeGroup), findsNWidgets(2));
  });

  testWidgets('WT-CONV-02: an empty list says how to start', (tester) async {
    await _pump(tester, (_) => jsonBody(200, []));

    expect(find.text(viL10n.chatListEmpty), findsOneWidget);
    expect(find.text(viL10n.chatListEmptyHint), findsOneWidget);
  });

  testWidgets('WT-CONV-03: a failed load is explained and can be retried', (tester) async {
    var calls = 0;
    final adapter = await _pump(tester, (_) => ++calls == 1
        ? jsonBody(500, {'code': 'E005', 'message': 'Internal server error', 'statusCode': 500})
        : jsonBody(200, [_item('c1', names: ['Nguyen Van An'])]));

    expect(find.text(viL10n.chatListLoadFailed(viL10n.errorServer)), findsOneWidget);
    await tester.tap(find.text(viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.text('Nguyen Van An'), findsOneWidget);
    expect(_listLoads(adapter), hasLength(2));
  });

  testWidgets('WT-CONV-04: opening a chat, then coming back, reloads the list', (tester) async {
    final adapter = await _pump(tester, (_) => jsonBody(200, [_item('c1', names: ['Nguyen Van An'], unread: 1)]));

    await tester.tap(find.text('Nguyen Van An'));
    await tester.pumpAndSettle();
    expect(find.text('CHAT c1'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('Nguyen Van An'), findsOneWidget);
    expect(_listLoads(adapter), hasLength(2));
  });

  testWidgets('WT-CONV-05: a created (or existing) conversation opens and the list is refetched, not duplicated',
      (tester) async {
    var created = false;
    final adapter = await _pump(tester, (o) {
      if (o.method == 'POST' && o.path == '/chat/conversations') {
        created = true;
        return jsonBody(200, _item('c1', names: ['Nguyen Van An']));
      }
      if (o.path == '/militia/search') return jsonBody(200, []);
      if (o.path == '/users/search') {
        return jsonBody(200, [
          {'id': 'u2', 'username': 'dqtv01', 'fullName': 'Nguyen Van An', 'role': 'dqtv'},
        ]);
      }
      return jsonBody(200, [_item('c1', names: ['Nguyen Van An'])]);
    });

    await tester.tap(find.byTooltip(viL10n.chatListNewConversation));
    await tester.pumpAndSettle();
    expect(find.byType(NewConversationScreen), findsOneWidget);

    await tester.enterText(find.byKey(const Key('participant_search')), 'Nguy');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ElevatedButton, viL10n.chatNewCreate));
    await tester.pumpAndSettle();

    expect(created, isTrue);
    expect(find.text('CHAT c1'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Nguyen Van An'), findsOneWidget);
    expect(_listLoads(adapter).length, greaterThanOrEqualTo(2));
  });
}
