// Widget Tests: the conversation list
//   GET /chat/conversations → [{id, title, conversationType, createdAt, lastMessage, lastMessageAt,
//   participants, unreadCount}] (chat.service.ts conversationSummaries). Titles through conversationTitle;
//   a failed load is worded with a retry; returning from a chat reloads the list silently.
// Run: flutter test test/widget_conversations_screen_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:militian_app/core/router/routes.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/chat/repositories/chat_repository.dart';
import 'package:militian_app/features/chat/screens/conversations_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _l = viL10n;

Map<String, dynamic> _row(
  String id, {
  String? title,
  String type = 'direct',
  List<Map<String, dynamic>> participants = const [],
  String? lastMessage,
  DateTime? lastMessageAt,
  int unread = 0,
}) =>
    {
      'id': id,
      'title': title,
      'conversationType': type,
      'createdAt': '2026-09-01T00:00:00.000Z',
      'lastMessage': lastMessage,
      'lastMessageAt': lastMessageAt?.toUtc().toIso8601String(),
      'participants': participants,
      'unreadCount': unread,
    };

Map<String, dynamic> _p(String id, String name) => {'id': id, 'fullName': name, 'username': id};

Future<(GoRouter, FakeAdapter)> _pump(WidgetTester tester, FakeAdapter adapter) async {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final router = GoRouter(
    initialLocation: Routes.chat,
    routes: [
      GoRoute(
        path: Routes.chat,
        builder: (context, state) => const ConversationsScreen(),
        routes: [
          GoRoute(
            path: ':conversationId',
            builder: (context, state) =>
                Scaffold(body: Text('Chat ${state.pathParameters['conversationId']} - ${state.extra}')),
          ),
        ],
      ),
    ],
  );
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(MemoryStorage()..userId = 'me'),
      chatRepositoryProvider.overrideWithValue(ChatRepository(dio)),
    ],
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
  return (router, adapter);
}

void main() {
  testWidgets('WT-CONVS-01: titles, last messages, times and unread badges', (tester) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day, 9, 5);
    final adapter = FakeAdapter((_) => jsonBody(200, [
          _row('c1', title: 'Patrol team', type: 'group', lastMessage: 'Meet at 19h', lastMessageAt: today, unread: 3),
          _row('c2', participants: [_p('u2', 'Tran Van Binh')], lastMessage: 'Received',
              lastMessageAt: DateTime(2026, 1, 5, 8), unread: 120),
          _row('c3', type: 'group', participants: [_p('u3', 'Cam'), _p('u4', 'Duc')]),
          _row('c4', type: 'group'),
        ]));
    await _pump(tester, adapter);

    expect(find.text(_l.chatConversationsScreenTitle), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Patrol team'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Tran Van Binh'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Cam, Duc'), findsOneWidget);
    expect(find.widgetWithText(ListTile, _l.chatConversationUntitledGroup), findsOneWidget);
    expect(find.text('Meet at 19h'), findsOneWidget);
    expect(find.text('09:05'), findsOneWidget);
    expect(find.text('5/1'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('99+'), findsOneWidget);
    expect(find.byIcon(Icons.group), findsNWidgets(3));
    expect(find.byIcon(Icons.person), findsOneWidget);
    expect(tester.widget<FloatingActionButton>(find.byType(FloatingActionButton)).tooltip,
        _l.chatConversationsScreenNewTooltip);
  });

  testWidgets('WT-CONVS-02: no conversation', (tester) async {
    await _pump(tester, FakeAdapter((_) => jsonBody(200, [])));
    expect(find.text(_l.chatConversationsScreenEmpty), findsOneWidget);
  });

  testWidgets('WT-CONVS-03: a failed or unreadable load is worded, and retry loads again', (tester) async {
    var answer = jsonBody(500, backendError(500, 'Internal server error'));
    await _pump(tester, FakeAdapter((_) => answer));
    expect(find.text(_l.errorStatusServer), findsOneWidget);

    answer = jsonBody(200, {'data': []});
    await tester.tap(find.text(_l.chatConversationsScreenRetryButton));
    await tester.pumpAndSettle();
    expect(find.text(_l.chatIssueMalformedConversationList), findsOneWidget);

    answer = jsonBody(200, [_row('c1', title: 'Patrol team')]);
    await tester.tap(find.text(_l.chatConversationsScreenRetryButton));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, 'Patrol team'), findsOneWidget);
  });

  testWidgets('WT-CONVS-04: a conversation opens with its title; back, the list reloads silently and a failed '
      'reload keeps it', (tester) async {
    var calls = 0;
    Completer<void>? hold;
    final adapter = FakeAdapter(
      (_) {
        calls++;
        return calls == 1
            ? jsonBody(200, [_row('c2', participants: [_p('u2', 'Tran Van Binh')], unread: 2)])
            : jsonBody(500, backendError(500, 'Internal server error'));
      },
      gate: (_) => hold?.future,
    );
    final (router, _) = await _pump(tester, adapter);

    await tester.tap(find.widgetWithText(ListTile, 'Tran Van Binh'));
    await tester.pumpAndSettle();
    expect(find.text('Chat c2 - Tran Van Binh'), findsOneWidget);

    hold = Completer<void>();
    router.pop();
    await tester.pumpAndSettle();
    // The silent reload is out: the list stays, without a spinner
    expect(find.widgetWithText(ListTile, 'Tran Van Binh'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);

    hold.complete();
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.widgetWithText(ListTile, 'Tran Van Binh'), findsOneWidget);
    expect(find.text(_l.errorStatusServer), findsNothing);
  });

  testWidgets('WT-CONVS-05: pull to refresh loads the list again', (tester) async {
    var calls = 0;
    await _pump(tester, FakeAdapter((_) {
      calls++;
      return jsonBody(200, [_row('c1', title: calls == 1 ? 'Before' : 'After')]);
    }));

    await tester.fling(find.widgetWithText(ListTile, 'Before'), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(calls, 2);
    expect(find.widgetWithText(ListTile, 'After'), findsOneWidget);
  });
}
