// Widget Tests: creating a conversation with a participant picker
// Backend: POST /chat/conversations {participantIds, conversationType, title?} → 201 new, or 200 the
// pair's existing direct chat; both answer like a conversation list item
// (Web/backend/src/chat/chat.controller.ts:65-80, chat.service.ts:138-189)
// Run: flutter test test/widget_new_conversation_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/chat/models/chat_models.dart';
import 'package:police_app/features/chat/providers/chat_provider.dart';
import 'package:police_app/features/chat/screens/new_conversation_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

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
          Text(_created == null ? 'none' : 'created ${_created!.id}'),
        ]),
      );
}

Map<String, Object?> _summary(RequestOptions o, {required String id}) => {
      'id': id,
      'title': (o.data as Map)['title'],
      'conversationType': (o.data as Map)['conversationType'],
      'createdAt': '2026-09-14T01:00:00.000Z',
      'lastMessage': null,
      'lastMessageAt': null,
      'participants': [
        {'id': 'u9', 'fullName': 'Nguyen Thi Chin', 'username': 'ca09'},
      ],
      'unreadCount': 0,
    };

Future<FakeAdapter> _open(
  WidgetTester tester, {
  ResponseBody Function(RequestOptions)? create,
  ResponseBody Function(RequestOptions)? search,
}) async {
  final adapter = FakeAdapter((o) {
    if (o.path == '/militia/search') {
      return search?.call(o) ??
          jsonBody(200, [
            {'id': 'mp1', 'userId': 'u2', 'militiaCode': 'DQ-001', 'fullName': 'Nguyen Van An', 'unitName': 'KP1'},
          ]);
    }
    if (o.path == '/users/search') {
      return search?.call(o) ??
          jsonBody(200, [
            {'id': 'u2', 'username': 'dqtv01', 'fullName': 'Nguyen Van An', 'role': 'dqtv'},
            {'id': 'u9', 'username': 'ca09', 'fullName': 'Nguyen Thi Chin', 'role': 'ca_officer'},
            {'id': 'me', 'username': 'ca01', 'fullName': 'Me The Creator', 'role': 'ca_officer'},
          ]);
    }
    return create?.call(o) ?? jsonBody(201, _summary(o, id: 'c-new'));
  });
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final storage = MemoryStorage(access: null, refresh: null)..userId = 'me';
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      dioProvider.overrideWithValue(dio),
    ],
    child: localizedApp(const _Launcher()),
  ));
  await tester.tap(find.text('OPEN'));
  await tester.pumpAndSettle();
  return adapter;
}

Future<void> _search(WidgetTester tester, String q) async {
  await tester.enterText(find.byKey(const Key('participant_search')), q);
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pumpAndSettle();
}

Finder get _createButton => find.widgetWithText(ElevatedButton, viL10n.chatNewCreate);

Iterable<RequestOptions> _creates(FakeAdapter a) =>
    a.requests.where((r) => r.method == 'POST' && r.path == '/chat/conversations');

void main() {
  testWidgets('WT-NEWCONV-01: direct chat with exactly one picked person; the caller is not listed', (tester) async {
    final adapter = await _open(tester);

    expect(find.text(viL10n.chatNewTitle), findsOneWidget);
    expect(find.text(viL10n.chatNewSearchTooShort(ChatApi.minSearchLength)), findsOneWidget);
    await _search(tester, 'Nguy');
    expect(find.widgetWithText(ListTile, 'Nguyen Van An'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Me The Creator'), findsNothing);

    // Direct mode keeps a single selection: the second pick replaces the first
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Thi Chin'));
    await tester.pump();
    await tester.tap(_createButton);
    await tester.pumpAndSettle();

    expect(_creates(adapter).single.data, {'participantIds': ['u9'], 'conversationType': 'direct'});
    expect(find.text('created c-new'), findsOneWidget);
  });

  testWidgets('WT-NEWCONV-02: group chat with several people and a title', (tester) async {
    final adapter = await _open(tester);

    await tester.tap(find.text(viL10n.chatConversationTypeGroup));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.chatNewInstructionGroup), findsOneWidget);
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
  });

  testWidgets('WT-NEWCONV-03: nothing picked, nothing sent; picks can be removed and a group narrowed',
      (tester) async {
    final adapter = await _open(tester);

    expect(tester.widget<ElevatedButton>(_createButton).onPressed, isNull);

    await tester.tap(find.text(viL10n.chatConversationTypeGroup));
    await tester.pumpAndSettle();
    await _search(tester, 'Nguy');
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pump();
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Thi Chin'));
    await tester.pump();
    expect(find.byType(InputChip), findsNWidgets(2));

    // Back to direct: only the first pick stays
    await tester.tap(find.text(viL10n.chatConversationTypeDirect));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsOneWidget);
    expect(find.text(viL10n.chatNewInstructionDirect), findsOneWidget);

    // Tapping a picked person again removes them
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pump();
    expect(find.byType(InputChip), findsNothing);
    expect(_creates(adapter), isEmpty);
  });

  testWidgets('WT-NEWCONV-04: a backend refusal is shown and the screen stays open', (tester) async {
    await _open(tester, create: (_) => jsonBody(400, {'code': 'E001', 'message': 'participant_not_found', 'statusCode': 400}));

    await _search(tester, 'Nguy');
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pump();
    await tester.tap(_createButton);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorParticipantNotFound), findsOneWidget);
    expect(find.byKey(const Key('participant_search')), findsOneWidget);
  });

  testWidgets('WT-NEWCONV-05: the pair already talking returns their existing conversation', (tester) async {
    final adapter = await _open(tester, create: (o) => jsonBody(200, _summary(o, id: 'c-existing')));

    await _search(tester, 'Chin');
    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Thi Chin'));
    await tester.pump();
    await tester.tap(_createButton);
    await tester.pumpAndSettle();

    expect(_creates(adapter), hasLength(1));
    expect(find.text('created c-existing'), findsOneWidget);
  });

  testWidgets('WT-NEWCONV-06: no match and a failed search are explained; the term is capped', (tester) async {
    var fail = false;
    await _open(tester, search: (_) => fail
        ? jsonBody(500, {'code': 'E005', 'message': 'Internal server error', 'statusCode': 500})
        : jsonBody(200, []));

    expect(tester.widget<TextField>(find.byKey(const Key('participant_search'))).maxLength, ChatApi.maxSearchLength);
    await _search(tester, 'zzz');
    expect(find.text(viL10n.chatNewNoResults), findsOneWidget);

    fail = true;
    await _search(tester, 'yyy');
    expect(find.text(viL10n.errorServer), findsOneWidget);
  });
}
