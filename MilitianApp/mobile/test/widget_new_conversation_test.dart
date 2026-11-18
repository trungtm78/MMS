// Widget Tests: creating a conversation with a participant picker
//   GET  /users/search?q=&limit=20 → one row per person {id, username, fullName, role, roles, status}; q is
//        2..100 characters (users.controller.ts UserSearchQueryDto, users.service.ts searchUsers)
//   POST /chat/conversations {participantIds, conversationType, title?} → 201 a new conversation, 200 the
//        pair's existing direct conversation; both shaped like a list item, participants included
//        (chat.controller.ts createConversation, chat.service.ts)
// The picker pops the conversation the server answered; the list opens it and never shows it twice.
// Run: flutter test test/widget_new_conversation_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:militian_app/core/router/routes.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/chat/chat_texts.dart';
import 'package:militian_app/features/chat/models/conversation.dart';
import 'package:militian_app/features/chat/repositories/chat_repository.dart';
import 'package:militian_app/features/chat/screens/conversations_screen.dart';
import 'package:militian_app/features/chat/screens/new_conversation_screen.dart';
import 'package:militian_app/l10n/l10n.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _l = viL10n;

class _Launcher extends StatefulWidget {
  const _Launcher();
  @override
  State<_Launcher> createState() => _LauncherState();
}

class _LauncherState extends State<_Launcher> {
  Conversation? _created;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: [
          ElevatedButton(
            onPressed: () async {
              final c = await Navigator.of(context).push<Conversation>(
                MaterialPageRoute(builder: (_) => const NewConversationScreen()),
              );
              setState(() => _created = c);
            },
            child: const Text('OPEN'),
          ),
          Text(_created == null ? 'none' : 'created ${_created!.id} ${conversationTitle(context.l10n, _created!)}'),
        ]),
      );
}

const _people = {
  'u2': {'id': 'u2', 'username': 'dqtv01', 'fullName': 'Nguyen Van An', 'role': 'dqtv', 'roles': ['dqtv', 'dqtv_member'], 'status': 'active'},
  'u9': {'id': 'u9', 'username': 'dqtv09', 'fullName': 'Nguyen Thi Chin', 'role': 'dqtv', 'roles': ['dqtv'], 'status': 'active'},
};

ResponseBody _users(RequestOptions o) => jsonBody(200, [
      _people['u2']!,
      _people['u9']!,
      // Guards the client keeps: a repeated row and the caller
      _people['u2']!,
      {'id': 'me', 'username': 'dqtv00', 'fullName': 'The Creator', 'role': 'dqtv', 'roles': ['dqtv'], 'status': 'active'},
    ]);

/// A conversation as the list and POST /chat/conversations answer it
Map<String, dynamic> _summary(String id, List<String> participantIds, {String? title, String type = 'direct', String? lastMessage}) => {
      'id': id,
      'title': title,
      'conversationType': type,
      'createdAt': '2026-09-14T01:00:00.000Z',
      'lastMessage': lastMessage,
      'lastMessageAt': lastMessage == null ? null : '2026-09-14T02:00:00.000Z',
      'participants': [
        for (final pid in participantIds)
          {'id': pid, 'fullName': _people[pid]!['fullName'], 'username': _people[pid]!['username']},
      ],
      'unreadCount': 0,
    };

ResponseBody _created(RequestOptions o) {
  final body = o.data as Map;
  return jsonBody(
    201,
    _summary('c-new', [for (final id in body['participantIds'] as List) '$id'],
        title: body['title'] as String?, type: body['conversationType'] as String),
  );
}

(ChatRepository, FakeAdapter) _backend({int createStatus = 201}) {
  final adapter = FakeAdapter((o) {
    if (o.path == '/users/search') return _users(o);
    if (o.method == 'POST' && o.path == '/chat/conversations') {
      return createStatus == 201 ? _created(o) : jsonBody(createStatus, backendError(createStatus, 'participant_not_found'));
    }
    return jsonBody(404, {'message': 'no_route ${o.method} ${o.path}'});
  });
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (ChatRepository(dio), adapter);
}

Future<FakeAdapter> _open(WidgetTester tester, {int createStatus = 201, FakeAdapter? adapter}) async {
  final (repo, fake) = adapter == null
      ? _backend(createStatus: createStatus)
      : (ChatRepository(Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter), adapter);
  final storage = MemoryStorage(access: null, refresh: null)..userId = 'me';
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      chatRepositoryProvider.overrideWithValue(repo),
    ],
    child: localizedApp(const _Launcher()),
  ));
  await tester.tap(find.text('OPEN'));
  await tester.pumpAndSettle();
  return fake;
}

Future<void> _search(WidgetTester tester, String q) async {
  await tester.enterText(find.byKey(const Key('participant_search')), q);
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pumpAndSettle();
}

Finder get _createButton => find.widgetWithText(ElevatedButton, _l.chatNewConversationCreateButton);

Iterable<RequestOptions> _creates(FakeAdapter a) =>
    a.requests.where((r) => r.method == 'POST' && r.path == '/chat/conversations');

Iterable<RequestOptions> _searches(FakeAdapter a) => a.requests.where((r) => r.path == '/users/search');

/// ConversationsScreen at /chat with a stand-in chat screen, over [adapter]
Future<GoRouter> _conversationsApp(WidgetTester tester, FakeAdapter adapter) async {
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
            builder: (context, state) => Scaffold(
              body: Text('Chat ${state.pathParameters['conversationId']} - ${state.extra}'),
            ),
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
  return router;
}

Future<void> _pickAndCreate(WidgetTester tester, String name) async {
  await tester.tap(find.byType(FloatingActionButton));
  await tester.pumpAndSettle();
  await _search(tester, 'Nguy');
  await tester.tap(find.widgetWithText(ListTile, name));
  await tester.pump();
  await tester.tap(_createButton);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('WT-NEWCONV-01: direct chat with exactly one picked person; the caller is not listed; '
      'the title comes from the answer', (tester) async {
    final adapter = await _open(tester);

    expect(find.text(_l.chatNewConversationScreenTitle), findsOneWidget);
    expect(find.text(_l.chatNewConversationDirectHint), findsOneWidget);
    await _search(tester, 'Nguy');
    expect(find.widgetWithText(ListTile, 'Nguyen Van An'), findsOneWidget);
    expect(find.text('dqtv01'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'The Creator'), findsNothing);
    expect(_searches(adapter).single.queryParameters, {'q': 'Nguy', 'limit': 20});
    expect(adapter.requests.where((r) => r.path == '/militia/search'), isEmpty);

    // Direct mode keeps a single selection: the second pick replaces the first
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Thi Chin'));
    await tester.pump();
    expect(find.widgetWithText(InputChip, 'Nguyen Van An'), findsNothing);
    expect(find.widgetWithText(InputChip, 'Nguyen Thi Chin'), findsOneWidget);
    await tester.tap(_createButton);
    await tester.pumpAndSettle();

    expect(_creates(adapter).single.data, {'participantIds': ['u9'], 'conversationType': 'direct'});
    expect(find.text('created c-new Nguyen Thi Chin'), findsOneWidget);
  });

  testWidgets('WT-NEWCONV-02: group chat with several people and a title', (tester) async {
    final adapter = await _open(tester);

    await tester.tap(find.text(_l.chatNewConversationGroupSegment));
    await tester.pumpAndSettle();
    expect(find.text(_l.chatNewConversationGroupHint), findsOneWidget);
    expect(find.widgetWithText(TextField, _l.chatNewConversationGroupTitleLabel), findsOneWidget);
    await _search(tester, 'Nguy');
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Thi Chin'));
    await tester.pump();
    await tester.enterText(find.byKey(const Key('group_title')), ' Patrol team ');
    await tester.tap(_createButton);
    await tester.pumpAndSettle();

    expect(_creates(adapter).single.data,
        {'participantIds': ['u2', 'u9'], 'conversationType': 'group', 'title': 'Patrol team'});
    expect(find.text('created c-new Patrol team'), findsOneWidget);
  });

  testWidgets('WT-NEWCONV-03: nothing picked, nothing sent; one character does not search', (tester) async {
    final adapter = await _open(tester);

    final button = tester.widget<ElevatedButton>(_createButton);
    expect(button.onPressed, isNull);

    await _search(tester, 'N');
    expect(find.text(_l.chatNewConversationSearchTooShort(ChatRepository.minSearchLength)), findsOneWidget);
    expect(_searches(adapter), isEmpty);
    expect(_creates(adapter), isEmpty);
  });

  testWidgets('WT-NEWCONV-04: a backend refusal is shown and the screen stays open', (tester) async {
    await _open(tester, createStatus: 400);

    await _search(tester, 'Nguy');
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pump();
    await tester.tap(_createButton);
    await tester.pumpAndSettle();

    expect(find.text(_l.errorChatParticipantNotFound), findsOneWidget);
    expect(find.byKey(const Key('participant_search')), findsOneWidget);
    // A new pick clears the refusal
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Thi Chin'));
    await tester.pump();
    expect(find.text(_l.errorChatParticipantNotFound), findsNothing);
  });

  testWidgets('WT-NEWCONV-05: typing is debounced by 300 ms', (tester) async {
    final adapter = await _open(tester);

    await tester.enterText(find.byKey(const Key('participant_search')), 'Ng');
    await tester.pump(const Duration(milliseconds: 200));
    await tester.enterText(find.byKey(const Key('participant_search')), 'Nguy');
    await tester.pump(const Duration(milliseconds: 200));
    expect(_searches(adapter), isEmpty);
    await tester.pump(const Duration(milliseconds: 150));
    await tester.pumpAndSettle();

    expect(_searches(adapter).map((r) => r.queryParameters['q']), ['Nguy']);
  });

  testWidgets('WT-NEWCONV-06: 201 new: the FAB opens the picker, then the new chat; the list shows it once, '
      'before and after its reload', (tester) async {
    var created = false;
    Completer<void>? holdList;
    final adapter = FakeAdapter(
      (o) {
        if (o.method == 'GET' && o.path == '/chat/conversations') {
          return jsonBody(200, [if (created) _summary('c-new', ['u9'])]);
        }
        if (o.path == '/users/search') return _users(o);
        if (o.method == 'POST' && o.path == '/chat/conversations') {
          created = true;
          return _created(o);
        }
        return jsonBody(404, {'message': 'no_route ${o.method} ${o.path}'});
      },
      gate: (o) => o.method == 'GET' && o.path == '/chat/conversations' ? holdList?.future : null,
    );
    final router = await _conversationsApp(tester, adapter);
    expect(find.text(_l.chatConversationsScreenEmpty), findsOneWidget);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('participant_search')), findsOneWidget);
    // AppHeader's back button
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    // Closing the picker without creating changes nothing
    expect(find.text(_l.chatConversationsScreenEmpty), findsOneWidget);

    holdList = Completer<void>();
    await _pickAndCreate(tester, 'Nguyen Thi Chin');
    expect(find.text('Chat c-new - Nguyen Thi Chin'), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    // The reload is still out: the answered conversation is listed once
    expect(find.widgetWithText(ListTile, 'Nguyen Thi Chin'), findsOneWidget);
    expect(find.text(_l.chatConversationsScreenEmpty), findsNothing);

    holdList.complete();
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, 'Nguyen Thi Chin'), findsOneWidget);
    expect(_creates(adapter).single.data, {'participantIds': ['u9'], 'conversationType': 'direct'});
  });

  testWidgets('WT-NEWCONV-07: 200 existing: the pair\'s conversation opens and is never listed twice', (tester) async {
    Completer<void>? holdList;
    final existing = _summary('c-old', ['u9'], lastMessage: 'Earlier');
    final adapter = FakeAdapter(
      (o) {
        if (o.method == 'GET' && o.path == '/chat/conversations') return jsonBody(200, [existing]);
        if (o.path == '/users/search') return _users(o);
        if (o.method == 'POST' && o.path == '/chat/conversations') return jsonBody(200, existing);
        return jsonBody(404, {'message': 'no_route ${o.method} ${o.path}'});
      },
      gate: (o) => o.method == 'GET' && o.path == '/chat/conversations' ? holdList?.future : null,
    );
    final router = await _conversationsApp(tester, adapter);
    expect(find.widgetWithText(ListTile, 'Nguyen Thi Chin'), findsOneWidget);

    holdList = Completer<void>();
    await _pickAndCreate(tester, 'Nguyen Thi Chin');
    expect(find.text('Chat c-old - Nguyen Thi Chin'), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, 'Nguyen Thi Chin'), findsOneWidget);
    expect(find.text('Earlier'), findsOneWidget);

    holdList.complete();
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, 'Nguyen Thi Chin'), findsOneWidget);
  });

  testWidgets('WT-NEWCONV-08: the search field stops at 100 characters', (tester) async {
    final adapter = await _open(tester);

    final field = tester.widget<TextField>(find.byKey(const Key('participant_search')));
    expect(field.maxLength, ChatRepository.maxSearchLength);
    await _search(tester, 'a' * 101);

    expect(_searches(adapter).single.queryParameters['q'], 'a' * 100);
    expect(find.text(_l.chatNewConversationNoResults), findsNothing);
  });

  testWidgets('WT-NEWCONV-09: search failures and empty results are worded', (tester) async {
    var answer = jsonBody(500, backendError(500, 'Internal server error'));
    final adapter = FakeAdapter((o) => o.path == '/users/search' ? answer : jsonBody(404, {}));
    await _open(tester, adapter: adapter);

    await _search(tester, 'Nguy');
    expect(find.text(_l.errorStatusServer), findsOneWidget);

    answer = jsonBody(200, {'data': []});
    await _search(tester, 'Nguye');
    expect(find.text(_l.chatIssueMalformedSearchResults), findsOneWidget);

    answer = jsonBody(200, []);
    await _search(tester, 'Nobody');
    expect(find.text(_l.chatNewConversationNoResults), findsOneWidget);
  });

  testWidgets('WT-NEWCONV-10: switching to direct keeps one person; a chip or a second tap unpicks', (tester) async {
    await _open(tester);

    await tester.tap(find.text(_l.chatNewConversationGroupSegment));
    await tester.pumpAndSettle();
    await _search(tester, 'Nguy');
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Thi Chin'));
    await tester.pump();
    expect(find.byType(InputChip), findsNWidgets(2));

    await tester.tap(find.text(_l.chatNewConversationDirectSegment));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsOneWidget);
    expect(find.widgetWithText(InputChip, 'Nguyen Van An'), findsOneWidget);

    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pump();
    expect(find.byType(InputChip), findsNothing);

    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Thi Chin'));
    await tester.pump();
    // The chip's delete control
    tester.widget<InputChip>(find.byType(InputChip)).onDeleted!();
    await tester.pump();
    expect(find.byType(InputChip), findsNothing);
  });

  testWidgets('WT-NEWCONV-11: an answer to an older query is ignored', (tester) async {
    final holds = <String, Completer<void>>{};
    final adapter = FakeAdapter(
      (o) => o.path == '/users/search'
          ? jsonBody(200, [if (o.queryParameters['q'] == 'Ngu') _people['u2']! else _people['u9']!])
          : jsonBody(404, {}),
      gate: (o) => holds[o.queryParameters['q']]?.future,
    );
    holds['Ngu'] = Completer<void>();
    await _open(tester, adapter: adapter);

    await tester.enterText(find.byKey(const Key('participant_search')), 'Ngu');
    await tester.pump(const Duration(milliseconds: 400));
    await _search(tester, 'Nguyen Thi');
    expect(find.widgetWithText(ListTile, 'Nguyen Thi Chin'), findsOneWidget);

    holds['Ngu']!.complete();
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, 'Nguyen Thi Chin'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Nguyen Van An'), findsNothing);
  });
}
