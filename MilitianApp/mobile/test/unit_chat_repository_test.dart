// Unit Tests: chat against the Web/backend contract
//   GET  /chat/conversations → bare array of
//        {id, title, conversationType, createdAt, lastMessage, lastMessageAt,
//         participants: [{id, fullName, username}] (everyone but the caller), unreadCount}
//        (chat/chat.service.ts conversationSummaries)
//   POST /chat/conversations {participantIds, conversationType, title?} → 201 a new conversation, or
//        200 the pair's existing direct conversation; both shaped like a list item
//        (chat/chat.controller.ts:65-80, chat.service.ts createConversation)
//   GET  /chat/conversations/:id/messages → {data (newest first), total, page, limit}  (chat.service.ts)
//   POST /chat/conversations/:id/messages {content} (≤ 4000)  (notifications/chat-messages.controller.ts)
//   POST /chat/conversations/:id/read → {conversationId, readAt}; 403 not_a_participant
//   GET  /users/search?q=&limit= → q trimmed 2..100, limit ≤ 50; one row per person
//        {id, username, fullName, role, roles, status} (users/users.controller.ts, users.service.ts)
//   socket acks {joined} | {error}  (notifications/notifications.gateway.ts)
// Local refusals carry a ChatIssue; titles and issues are worded by lib/features/chat/chat_texts.dart.
// Run: flutter test test/unit_chat_repository_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/chat/chat_texts.dart';
import 'package:militian_app/features/chat/models/conversation.dart';
import 'package:militian_app/features/chat/repositories/chat_repository.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

(ChatRepository, FakeAdapter) _repo(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (ChatRepository(dio), adapter);
}

Map<String, dynamic> _message(String id, String createdAt) => {
      'id': id,
      'senderId': 'u1',
      'senderName': 'ca01',
      'content': 'Message $id',
      'createdAt': createdAt,
    };

Map<String, dynamic> _person(String id, String fullName, [String? username]) =>
    {'id': id, 'fullName': fullName, 'username': username ?? id};

Conversation _conv(String type, {String? title, List<Object?> participants = const []}) =>
    Conversation.fromJson({
      'id': 'c',
      'title': title,
      'conversationType': type,
      'participants': participants,
    });

String _title(Conversation c) => conversationTitle(viL10n, c);

Matcher _issue(ChatIssue issue) => throwsA(isA<ChatException>()
    .having((e) => e.issue, 'issue', issue)
    .having((e) => e.failure, 'failure', isNull));

void main() {
  group('conversations', () {
    test('UT-CONV-01: parses the bare array the backend returns, including title', () async {
      final (repo, adapter) = _repo((_) => jsonBody(200, [
            {
              'id': 'c1',
              'title': 'Patrol team KP3',
              'conversationType': 'group',
              'createdAt': '2026-09-01T00:00:00.000Z',
              'lastMessage': 'Meet at 19h',
              'lastMessageAt': '2026-09-14T01:00:00.000Z',
            },
            {
              'id': 'c2',
              'title': null,
              'conversationType': 'direct',
              'createdAt': '2026-09-02T00:00:00.000Z',
              'lastMessage': null,
              'lastMessageAt': null,
            },
          ]));

      final list = await repo.conversations();

      expect(adapter.requests.single.method, 'GET');
      expect(adapter.requests.single.path, '/chat/conversations');
      expect(list, hasLength(2));
      expect(list.first.id, 'c1');
      expect(list.first.title, 'Patrol team KP3');
      expect(_title(list.first), 'Patrol team KP3');
      expect(list.first.conversationType, 'group');
      expect(list.first.isGroup, isTrue);
      expect(list.first.lastMessage, 'Meet at 19h');
      expect(list.first.lastMessageAt, DateTime.utc(2026, 9, 14, 1));
      expect(list.last.title, isNull);
      expect(list.last.isGroup, isFalse);
      expect(list.last.lastMessageAt, isNull);
    });

    test('UT-CONV-02: untitled conversations without participants get a label from their type', () {
      expect(_title(_conv('direct')), viL10n.chatConversationUntitledDirect);
      expect(_title(_conv('direct', title: '  ')), viL10n.chatConversationUntitledDirect);
      expect(_title(_conv('group')), viL10n.chatConversationUntitledGroup);
    });

    test('UT-CONV-03: anything but an array is a malformed-list ChatException, not an empty list', () async {
      final (repo, _) = _repo((_) => jsonBody(200, {'data': []}));
      await expectLater(repo.conversations(), _issue(ChatIssue.malformedConversationList));

      final (failing, _) = _repo((_) => jsonBody(500, backendError(500, 'Internal server error')));
      await expectLater(
        failing.conversations(),
        throwsA(isA<ChatException>().having((e) => e.failure?.status, 'status', 500)),
      );
    });

    test('UT-CONV-04: parses participants and unreadCount', () async {
      final (repo, _) = _repo((_) => jsonBody(200, [
            {
              'id': 'c3',
              'title': null,
              'conversationType': 'direct',
              'createdAt': '2026-09-02T00:00:00.000Z',
              'lastMessage': 'Received',
              'lastMessageAt': '2026-09-14T02:00:00.000Z',
              'participants': [_person('u2', 'Tran Van Binh', 'ca02')],
              'unreadCount': 2,
            },
          ]));

      final conv = (await repo.conversations()).single;

      expect(conv.participants, hasLength(1));
      expect(conv.participants.single.id, 'u2');
      expect(conv.participants.single.fullName, 'Tran Van Binh');
      expect(conv.participants.single.username, 'ca02');
      expect(conv.unreadCount, 2);
      expect(_title(conv), 'Tran Van Binh');
    });

    test('UT-CONV-05: missing or malformed participants and unreadCount', () {
      final bare = Conversation.fromJson({'id': 'c', 'conversationType': 'group'});
      expect(bare.participants, isEmpty);
      expect(bare.unreadCount, 0);

      final messy = Conversation.fromJson({
        'id': 'c',
        'conversationType': 'group',
        'participants': [null, 'x', {'fullName': 'No id'}, {'id': 'u3'}],
        'unreadCount': 3.0,
      });
      expect(messy.participants.map((p) => p.id), ['u3']);
      expect(messy.participants.single.fullName, '');
      expect(messy.participants.single.username, '');
      expect(messy.unreadCount, 3);

      expect(Conversation.fromJson({'id': 'c', 'unreadCount': 'many'}).unreadCount, 0);
      expect(Conversation.fromJson({'id': 'c', 'unreadCount': ' 4 '}).unreadCount, 4);
      expect(Conversation.fromJson({'id': 'c', 'participants': 'x'}).participants, isEmpty);
    });

    test('UT-CONV-06: the title of a direct chat', () {
      expect(_title(_conv('direct', title: 'Team 1', participants: [_person('u2', 'Binh')])), 'Team 1');
      expect(_title(_conv('direct', participants: [_person('u2', 'Tran Van Binh')])), 'Tran Van Binh');
      expect(_title(_conv('direct', participants: [_person('u2', '  ', 'ca02')])), 'ca02');
      expect(_title(_conv('direct', participants: [{'id': 'u2'}])), viL10n.chatConversationUntitledDirect);
    });

    test('UT-CONV-07: the title of a group', () {
      expect(_title(_conv('group', participants: [_person('u2', 'Binh'), _person('u3', 'Cam')])), 'Binh, Cam');
      expect(
        _title(_conv('group', participants: [
          _person('u2', 'Binh'),
          _person('u3', ' ', 'ca03'),
          _person('u4', 'Duc'),
          _person('u5', 'Em'),
          _person('u6', 'Phuc'),
        ])),
        viL10n.chatConversationGroupMembersMore('Binh, ca03, Duc', 2),
      );
      expect(_title(_conv('group', title: 'Patrol team', participants: [_person('u2', 'Binh')])), 'Patrol team');
      expect(_title(_conv('group', participants: [{'id': 'u2'}])), viL10n.chatConversationUntitledGroup);
    });

    test('UT-CONV-08: upsertConversation lists an opened conversation once: replaced in place, or first when new',
        () {
      Conversation c(String id, [String? last]) =>
          Conversation.fromJson({'id': id, 'conversationType': 'direct', 'lastMessage': last});
      final list = [c('c1'), c('c2', 'old'), c('c3')];

      final existing = upsertConversation(list, c('c2', 'new'));
      expect(existing.map((x) => x.id), ['c1', 'c2', 'c3']);
      expect(existing[1].lastMessage, 'new');

      final added = upsertConversation(list, c('c9'));
      expect(added.map((x) => x.id), ['c9', 'c1', 'c2', 'c3']);
      expect(list.map((x) => x.id), ['c1', 'c2', 'c3'], reason: 'the given list is not changed');
    });
  });

  group('messages', () {
    test('UT-MSG-01: history is shown oldest first', () async {
      final (repo, adapter) = _repo((_) => jsonBody(200, {
            'data': [
              _message('m3', '2026-09-14T03:00:00.000Z'),
              _message('m2', '2026-09-14T02:00:00.000Z'),
              _message('m1', '2026-09-14T01:00:00.000Z'),
            ],
            'total': 3,
            'page': 1,
            'limit': 50,
          }));

      final msgs = await repo.messages('c1');

      expect(adapter.requests.single.path, '/chat/conversations/c1/messages');
      expect(adapter.requests.single.queryParameters, {'page': 1, 'limit': 50});
      expect(msgs.map((m) => m['id']), ['m1', 'm2', 'm3']);
    });

    test('UT-MSG-06: a history that is not the envelope, or a failed call, is a ChatException', () async {
      final (repo, _) = _repo((_) => jsonBody(200, [_message('m1', '2026-09-14T01:00:00.000Z')]));
      await expectLater(repo.messages('c1'), _issue(ChatIssue.malformedMessageList));

      final (forbidden, _) = _repo((_) => jsonBody(403, backendError(403, 'not_a_participant')));
      await expectLater(
        forbidden.messages('c1'),
        throwsA(isA<ChatException>().having((e) => e.failure?.code, 'code', 'not_a_participant')),
      );
    });

    test('UT-MSG-02: sendMessage posts trimmed content over REST', () async {
      final (repo, adapter) = _repo((o) => jsonBody(201, {
            ..._message('m9', '2026-09-14T04:00:00.000Z'),
            'conversationId': 'c1',
            'content': (o.data as Map)['content'],
          }));

      final saved = await repo.sendMessage('c1', '  On my way  ');

      expect(adapter.requests.single.method, 'POST');
      expect(adapter.requests.single.path, '/chat/conversations/c1/messages');
      expect(adapter.requests.single.data, {'content': 'On my way'});
      expect(saved['id'], 'm9');
    });

    test('UT-MSG-03: empty or over 4000 characters is refused locally', () async {
      final (repo, adapter) = _repo((_) => jsonBody(201, {}));
      expect(ChatRepository.validate('  '), ChatIssue.messageEmpty);
      expect(ChatRepository.validate('a' * 4001), ChatIssue.messageTooLong);
      expect(ChatRepository.validate('a' * 4000), isNull);
      await expectLater(repo.sendMessage('c1', 'a' * 4001), _issue(ChatIssue.messageTooLong));
      await expectLater(repo.sendMessage('c1', ' '), _issue(ChatIssue.messageEmpty));
      expect(adapter.requests, isEmpty);
    });

    test('UT-MSG-04: 403 not_a_participant keeps the backend code for the error table', () async {
      final (repo, _) = _repo((_) => jsonBody(403, {'code': 'E004', 'message': 'not_a_participant', 'statusCode': 403}));
      await expectLater(
        repo.sendMessage('c1', 'Hello'),
        throwsA(isA<ChatException>()
            .having((e) => e.failure?.code, 'code', 'not_a_participant')
            .having((e) => e.issue, 'issue', isNull)),
      );
    });

    test('UT-MSG-07: a stored message that is not an object is a malformed-message ChatException', () async {
      final (repo, _) = _repo((_) => jsonBody(201, ['m1']));
      await expectLater(repo.sendMessage('c1', 'Hello'), _issue(ChatIssue.malformedMessage));
    });

    test('UT-MSG-05: mergeMessage shows the REST reply and the broadcast once', () {
      final msg = {..._message('m1', '2026-09-14T01:00:00.000Z'), 'conversationId': 'c1'};
      var list = mergeMessage(const [], msg);
      list = mergeMessage(list, Map<String, dynamic>.from(msg));
      expect(list, hasLength(1));
      expect(mergeMessage(list, {'content': 'no id'}), hasLength(2));
    });
  });

  group('markRead', () {
    test('UT-READ-01: POST /chat/conversations/:id/read', () async {
      final (repo, adapter) = _repo((_) => jsonBody(200, {
            'conversationId': 'c1',
            'readAt': '2026-09-14T05:00:00.000Z',
          }));

      await repo.markRead('c1');

      expect(adapter.requests.single.method, 'POST');
      expect(adapter.requests.single.path, '/chat/conversations/c1/read');
    });

    test('UT-READ-02: 403 not_a_participant becomes a ChatException', () async {
      final (repo, _) = _repo((_) => jsonBody(403, {'code': 'E004', 'message': 'not_a_participant', 'statusCode': 403}));
      await expectLater(
        repo.markRead('c1'),
        throwsA(isA<ChatException>()
            .having((e) => e.failure?.code, 'code', 'not_a_participant')
            .having((e) => e.statusCode, 'statusCode', 403)),
      );
    });
  });

  group('socket acknowledgements', () {
    test('UT-ACK-01: chat:join errors give the refusal code', () {
      expect(chatAckError({'error': 'not_a_participant'}), 'not_a_participant');
      expect(chatAckError([{'error': 'invalid_conversation_id'}]), 'invalid_conversation_id');
      expect(chatAckError({'joined': 'c1'}), isNull);
      expect(chatAckError(null), isNull);
    });
  });

  group('createConversation', () {
    Map<String, dynamic> summary(RequestOptions o, {String id = 'c-new', String? lastMessage, int unread = 0}) {
      final body = o.data as Map;
      return {
        'id': id,
        'title': body['title'],
        'conversationType': body['conversationType'],
        'createdAt': '2026-09-14T01:00:00.000Z',
        'lastMessage': lastMessage,
        'lastMessageAt': lastMessage == null ? null : '2026-09-14T02:00:00.000Z',
        'participants': [
          for (final id in body['participantIds'] as List) _person('$id', 'Person $id', 'user_$id'),
        ],
        'unreadCount': unread,
      };
    }

    test('UT-NEWCONV-01: direct sends exactly one participant and no title; the 201 answer is parsed in full',
        () async {
      final (repo, adapter) = _repo((o) => jsonBody(201, summary(o)));

      final c = await repo.createConversation(participantIds: ['u2'], group: false, title: 'ignored');

      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/chat/conversations');
      expect(req.data, {'participantIds': ['u2'], 'conversationType': 'direct'});
      expect(c.id, 'c-new');
      expect(c.conversationType, 'direct');
      expect(c.participants.map((p) => (p.id, p.fullName, p.username)), [('u2', 'Person u2', 'user_u2')]);
      expect(_title(c), 'Person u2');
    });

    test('UT-NEWCONV-05: 200 is the pair\'s existing direct conversation, returned as it stands', () async {
      final (repo, _) = _repo((o) => jsonBody(200, summary(o, id: 'c-old', lastMessage: 'Earlier', unread: 3)));

      final c = await repo.createConversation(participantIds: ['u2'], group: false);

      expect(c.id, 'c-old');
      expect(c.lastMessage, 'Earlier');
      expect(c.unreadCount, 3);
      expect(c.participants.single.id, 'u2');
    });

    test('UT-NEWCONV-02: group sends every participant once and the trimmed title', () async {
      final (repo, adapter) = _repo((o) => jsonBody(201, summary(o)));

      final c = await repo.createConversation(participantIds: ['u2', 'u3', 'u2'], group: true, title: ' Patrol team ');
      await repo.createConversation(participantIds: ['u2'], group: true, title: '   ');

      expect(adapter.requests.first.data,
          {'participantIds': ['u2', 'u3'], 'conversationType': 'group', 'title': 'Patrol team'});
      expect(adapter.requests.last.data, {'participantIds': ['u2'], 'conversationType': 'group'});
      expect(c.title, 'Patrol team');
      expect(c.participants.map((p) => p.id), ['u2', 'u3']);
      expect(ChatRepository.maxTitleLength, 255);
    });

    test('UT-NEWCONV-03: invalid selections are refused before any request', () async {
      final (repo, adapter) = _repo((o) => jsonBody(201, summary(o)));

      await expectLater(
          repo.createConversation(participantIds: [], group: false), _issue(ChatIssue.directNeedsOneParticipant));
      await expectLater(repo.createConversation(participantIds: ['u2', 'u3'], group: false),
          _issue(ChatIssue.directNeedsOneParticipant));
      await expectLater(
          repo.createConversation(participantIds: [], group: true), _issue(ChatIssue.groupNeedsParticipants));
      await expectLater(repo.createConversation(participantIds: ['u2'], group: true, title: 't' * 256),
          _issue(ChatIssue.titleTooLong));
      await repo.createConversation(participantIds: ['u2'], group: true, title: 't' * 255);
      expect(adapter.requests, hasLength(1));
    });

    test('UT-NEWCONV-04: backend refusals keep their code for the error table', () async {
      for (final code in ['participant_not_found', 'direct_conversation_requires_one_participant']) {
        final (repo, _) = _repo((_) => jsonBody(400, backendError(400, code)));
        await expectLater(
          repo.createConversation(participantIds: ['u2'], group: false),
          throwsA(isA<ChatException>()
              .having((e) => e.failure?.code, 'code', code)
              .having((e) => e.statusCode, 'statusCode', 400)),
          reason: code,
        );
      }
    });

    test('UT-NEWCONV-06: an answer without an id is a malformed-conversation ChatException', () async {
      final (repo, _) = _repo((_) => jsonBody(201, {'title': null}));
      await expectLater(
          repo.createConversation(participantIds: ['u2'], group: false), _issue(ChatIssue.malformedConversation));
    });
  });

  group('searchParticipants', () {
    // One row per person (GROUP BY u.id) with every role; the caller is left out by the server.
    // The client still merges by id and leaves out the caller, as a guard.
    ResponseBody users(RequestOptions o) => jsonBody(200, [
          {'id': 'u2', 'username': 'dqtv01', 'fullName': 'Nguyen Van An', 'role': 'dqtv', 'roles': ['dqtv', 'dqtv_member'], 'status': 'active'},
          {'id': 'u2', 'username': 'dqtv01', 'fullName': 'Nguyen Van An', 'role': 'dqtv', 'roles': ['dqtv'], 'status': 'active'},
          {'id': 'u9', 'username': 'dqtv09', 'fullName': 'Nguyen Thi Chin', 'role': 'dqtv', 'roles': ['dqtv'], 'status': 'active'},
          {'id': 'me', 'username': 'dqtv00', 'fullName': 'Me', 'role': 'dqtv', 'roles': ['dqtv'], 'status': 'active'},
          {'username': 'no-id', 'fullName': 'No id'},
        ]);

    test('UT-SEARCH-01: searches users, merges repeated rows and leaves out the caller', () async {
      final (repo, adapter) = _repo(users);

      final people = await repo.searchParticipants(' nguy ', excludeUserId: 'me');

      expect(adapter.requests.single.method, 'GET');
      expect(adapter.requests.single.path, '/users/search');
      expect(adapter.requests.single.queryParameters, {'q': 'nguy', 'limit': 20});
      expect(people.map((p) => p.id), ['u2', 'u9']);
      expect(people.first.fullName, 'Nguyen Van An');
      expect(people.first.username, 'dqtv01');
      expect(people.last.username, 'dqtv09');
    });

    test('UT-SEARCH-02: under 2 characters does not search; 2 does', () async {
      final (repo, adapter) = _repo(users);
      expect(ChatRepository.minSearchLength, 2);
      expect(await repo.searchParticipants(' n '), isEmpty);
      expect(await repo.searchParticipants(''), isEmpty);
      expect(adapter.requests, isEmpty);
      expect((await repo.searchParticipants('ng')).map((p) => p.id), ['u2', 'u9', 'me']);
    });

    test('UT-SEARCH-04: over 100 characters is refused locally; 100 is sent; the limit stays within 50',
        () async {
      final (repo, adapter) = _repo(users);
      expect(ChatRepository.maxSearchLength, 100);
      expect(ChatRepository.searchLimit, lessThanOrEqualTo(50));

      await expectLater(repo.searchParticipants('a' * 101), _issue(ChatIssue.searchQueryTooLong));
      expect(adapter.requests, isEmpty);

      await repo.searchParticipants('  ${'a' * 100}  ');
      expect(adapter.requests.single.queryParameters['q'], 'a' * 100);
    });

    test('UT-SEARCH-03: failures are ChatExceptions the screen can word', () async {
      final (failing, _) = _repo((_) => jsonBody(500, backendError(500, 'Internal server error')));
      await expectLater(
        failing.searchParticipants('nguy'),
        throwsA(isA<ChatException>()
            .having((e) => e.failure?.status, 'failure status', 500)
            .having((e) => e.statusCode, 'statusCode', 500)),
      );

      final (malformed, _) = _repo((_) => jsonBody(200, {'data': []}));
      await expectLater(malformed.searchParticipants('nguy'), _issue(ChatIssue.malformedSearchResults));
    });
  });

  test('UT-CHATTXT-01: every chat issue has its own text; other errors go through the error table', () {
    final texts = {for (final issue in ChatIssue.values) issue: chatIssueText(viL10n, issue)};
    expect(texts.values.toSet(), hasLength(ChatIssue.values.length));
    expect(texts[ChatIssue.messageTooLong], viL10n.chatIssueMessageTooLong(ChatRepository.maxMessageLength));
    expect(texts[ChatIssue.titleTooLong], viL10n.chatIssueTitleTooLong(ChatRepository.maxTitleLength));
    expect(texts[ChatIssue.searchQueryTooLong], viL10n.chatIssueSearchQueryTooLong(ChatRepository.maxSearchLength));

    expect(chatErrorText(viL10n, const ChatException(ChatIssue.messageEmpty)), viL10n.chatIssueMessageEmpty);
    expect(chatErrorText(viL10n, ChatException.api(const ApiFailure(code: 'not_a_participant', status: 403))),
        viL10n.errorChatNotAParticipant);
    expect(chatErrorText(viL10n, StateError('x')), viL10n.errorUnexpected);
    expect(const ChatException(ChatIssue.messageEmpty).toString(), contains('messageEmpty'));
    expect(ChatException.api(const ApiFailure(status: 500)).toString(), contains('500'));
  });
}
