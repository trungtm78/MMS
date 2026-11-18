// Unit Tests: ChatApi against Web/backend chat contract
//   POST /chat/conversations/:id/messages {content}  (notifications/chat-messages.controller.ts:22-72)
//     content trimmed, non-empty, max ChatService.MAX_MESSAGE_LENGTH = 4000 (chat.service.ts:23)
//     403 not_a_participant
//   POST /chat/conversations: 201 new or 200 the pair's existing direct chat, both shaped like a
//     list item (chat.controller.ts:65-80, chat.service.ts:138-189)
//   socket 'chat:join' ack: {joined} | {error: invalid_conversation_id | not_a_participant | session_expired}
// Run: flutter test test/unit_chat_api_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/chat/models/chat_models.dart';
import 'package:police_app/features/chat/providers/chat_provider.dart';
import 'package:police_app/l10n/failure_texts.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

(ChatApi, FakeAdapter) _api(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (ChatApi(dio), adapter);
}

Map<String, dynamic> _saved(String id, String content) => {
      'id': id,
      'conversationId': 'c1',
      'senderId': 'u1',
      'senderName': 'ca01',
      'content': content,
      'createdAt': '2026-09-14T01:00:00.000Z',
    };

Matcher _failsWith(String code, {int? status}) => throwsA(isA<ChatException>()
    .having((e) => e.failure.code, 'code', code)
    .having((e) => e.statusCode, 'statusCode', status));

void main() {
  group('ChatApi.sendMessage', () {
    test('UT-CHAT-01: POSTs trimmed content and returns the stored message', () async {
      final (api, adapter) = _api((_) => jsonBody(201, _saved('m1', 'Xin chao')));

      final msg = await api.sendMessage('c1', '  Xin chao ');

      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/chat/conversations/c1/messages');
      expect(req.data, {'content': 'Xin chao'});
      expect(msg.id, 'm1');
      expect(msg.conversationId, 'c1');
      expect(msg.content, 'Xin chao');
    });

    test('UT-CHAT-02: 4000 characters are accepted, 4001 are refused locally', () async {
      final (api, adapter) = _api((o) => jsonBody(201, _saved('m1', (o.data as Map)['content'] as String)));

      await api.sendMessage('c1', 'a' * ChatApi.maxMessageLength);
      expect(ChatApi.maxMessageLength, 4000);
      await expectLater(api.sendMessage('c1', 'a' * 4001), _failsWith('message_too_long'));
      expect(adapter.requests, hasLength(1));
    });

    test('UT-CHAT-03: blank content is refused locally', () async {
      final (api, adapter) = _api((_) => jsonBody(201, {}));
      await expectLater(api.sendMessage('c1', '   '), _failsWith('message_content_required'));
      expect(adapter.requests, isEmpty);
    });

    test('UT-CHAT-04: 403 not_a_participant keeps its code and status', () async {
      final (api, _) = _api((_) => jsonBody(403, {'code': 'E004', 'message': 'not_a_participant', 'statusCode': 403}));
      await expectLater(api.sendMessage('c1', 'Xin chao'), _failsWith('not_a_participant', status: 403));
    });

    test('UT-CHAT-19: an answer that is not a message is a data failure', () async {
      final (api, _) = _api((_) => jsonBody(201, ['x']));
      await expectLater(api.sendMessage('c1', 'Xin chao'), _failsWith(AppFailure.badResponse));
    });
  });

  group('socket acknowledgements', () {
    test('UT-CHAT-05: chat:join refusals become failures with a join fallback', () {
      expect(failureText(viL10n, chatAckError({'error': 'not_a_participant'})!), viL10n.errorNotAParticipant);
      expect(failureText(viL10n, chatAckError([{'error': 'session_expired'}])!), viL10n.errorSessionExpired);
      expect(failureText(viL10n, chatAckError({'error': 'weird'})!), viL10n.errorChatJoinFailed('weird'));
      expect(chatAckError({'joined': 'c1'}), isNull);
      expect(chatAckError(null), isNull);
    });
  });

  group('mergeChatMessage', () {
    test('UT-CHAT-06: the REST reply and the chat:message broadcast are shown once', () {
      final fromRest = ChatMessage.fromJson(_saved('m1', 'Xin chao'));
      final fromSocket = ChatMessage.fromJson(_saved('m1', 'Xin chao'));
      final other = ChatMessage.fromJson(_saved('m2', 'Khac'));

      var list = mergeChatMessage(const [], fromRest);
      list = mergeChatMessage(list, fromSocket);
      list = mergeChatMessage(list, other);

      expect(list.map((m) => m.id), ['m1', 'm2']);
    });
  });

  // GET /chat/conversations items: participants (everyone but the caller) and unreadCount
  // (Web/backend/src/chat/chat.service.ts:77-121)
  group('Conversation', () {
    test('UT-CHAT-07: participants, unread count and type are read from a list item', () {
      final c = Conversation.fromJson({
        'id': 'c1',
        'title': null,
        'conversationType': 'direct',
        'createdAt': '2026-09-14T01:00:00.000Z',
        'participants': [
          {'id': 'u2', 'fullName': 'An', 'username': 'dqtv01'},
          {'fullName': 'no id'},
        ],
        'unreadCount': 3,
      });
      expect(c.unreadCount, 3);
      expect(c.isGroup, isFalse);
      expect(c.participants.single.id, 'u2');
      expect(c.participants.single.username, 'dqtv01');
    });

    test('UT-CHAT-08: missing and odd values fall back', () {
      final bare = Conversation.fromJson({'id': 'c1', 'unreadCount': null});
      expect(bare.unreadCount, 0);
      expect(bare.participants, isEmpty);
      expect(bare.conversationType, 'direct');
      expect(Conversation.fromJson({'id': 'c1', 'unreadCount': '7', 'conversationType': 'group'}).unreadCount, 7);
      expect(Conversation.fromJson({'id': 'c1', 'conversationType': 'group'}).isGroup, isTrue);
      expect(const ChatParticipant(id: 'u2', fullName: ' ', username: 'dqtv01').displayName, 'dqtv01');
      expect(const ChatParticipant(id: 'u2', fullName: '').displayName, 'u2');
    });
  });

  // POST /chat/conversations/:id/read (Web/backend/src/notifications/chat-messages.controller.ts:74-92)
  group('ChatApi.markRead', () {
    test('UT-CHAT-09: POSTs /chat/conversations/:id/read', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {'conversationId': 'c1', 'readAt': '2026-09-14T01:00:00.000Z'}));

      await api.markRead('c1');

      expect(adapter.requests.single.method, 'POST');
      expect(adapter.requests.single.path, '/chat/conversations/c1/read');
    });

    test('UT-CHAT-10: 403 not_a_participant is a ChatException', () async {
      final (api, _) = _api((_) => jsonBody(403, {'code': 'E004', 'message': 'not_a_participant', 'statusCode': 403}));
      await expectLater(api.markRead('c1'), _failsWith('not_a_participant', status: 403));
    });
  });

  group('ChatApi.createConversation', () {
    Map<String, dynamic> summary(RequestOptions o, {String id = 'c-new'}) => {
          'id': id,
          'title': (o.data as Map)['title'],
          'conversationType': (o.data as Map)['conversationType'],
          'createdAt': '2026-09-14T01:00:00.000Z',
          'lastMessage': null,
          'lastMessageAt': null,
          'participants': [
            {'id': 'u2', 'fullName': 'An', 'username': 'dqtv01'},
          ],
          'unreadCount': 0,
        };

    test('UT-CHAT-11: direct sends exactly one participant', () async {
      final (api, adapter) = _api((o) => jsonBody(201, summary(o)));

      final c = await api.createConversation(participantIds: ['u2'], group: false, title: 'ignored');

      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/chat/conversations');
      expect(req.data, {'participantIds': ['u2'], 'conversationType': 'direct'});
      expect(c.id, 'c-new');
      expect(c.participants.single.fullName, 'An');
    });

    test('UT-CHAT-20: opening the pair again returns the existing conversation (200)', () async {
      final (api, _) = _api((o) => jsonBody(200, {...summary(o, id: 'c-existing'), 'lastMessage': 'Hi', 'unreadCount': 2}));

      final c = await api.createConversation(participantIds: ['u2'], group: false);

      expect(c.id, 'c-existing');
      expect(c.lastMessage, 'Hi');
      expect(c.unreadCount, 2);
    });

    test('UT-CHAT-12: group sends every participant once and the trimmed title', () async {
      final (api, adapter) = _api((o) => jsonBody(201, summary(o)));

      await api.createConversation(participantIds: ['u2', 'u3', 'u2'], group: true, title: ' Patrol ');
      await api.createConversation(participantIds: ['u2'], group: true, title: '   ');

      expect(adapter.requests.first.data,
          {'participantIds': ['u2', 'u3'], 'conversationType': 'group', 'title': 'Patrol'});
      expect(adapter.requests.last.data, {'participantIds': ['u2'], 'conversationType': 'group'});
    });

    test('UT-CHAT-13: invalid selections are refused before any request', () async {
      final (api, adapter) = _api((o) => jsonBody(201, summary(o)));

      await expectLater(api.createConversation(participantIds: [], group: false), _failsWith(AppFailure.directRequiresOne));
      await expectLater(
          api.createConversation(participantIds: ['u2', 'u3'], group: false), _failsWith(AppFailure.directRequiresOne));
      await expectLater(
          api.createConversation(participantIds: [], group: true), _failsWith(AppFailure.groupRequiresParticipant));
      await expectLater(
        api.createConversation(participantIds: ['u2'], group: true, title: 't' * 256),
        throwsA(isA<ChatException>()
            .having((e) => e.failure.code, 'code', AppFailure.titleTooLong)
            .having((e) => e.failure.args, 'args', {'max': 255})),
      );
      expect(adapter.requests, isEmpty);
    });

    test('UT-CHAT-14: backend refusals and unreadable answers are surfaced', () async {
      final (refusing, _) =
          _api((_) => jsonBody(400, {'code': 'E001', 'message': 'participant_not_found', 'statusCode': 400}));
      await expectLater(refusing.createConversation(participantIds: ['u2'], group: false),
          _failsWith('participant_not_found', status: 400));

      final (garbled, _) = _api((_) => jsonBody(201, 'ok'));
      await expectLater(garbled.createConversation(participantIds: ['u2'], group: false),
          _failsWith(AppFailure.badResponse));
    });
  });

  // People an officer can reach: GET /militia/search (scoped DQTV with userId — militia.service.ts)
  // and GET /users/search?q (2-100 characters), limit <= 50 (users.controller.ts, T20)
  group('ChatApi.searchParticipants', () {
    ResponseBody both(RequestOptions o) {
      if (o.path == '/militia/search') {
        return jsonBody(200, [
          {'id': 'mp1', 'userId': 'u2', 'militiaCode': 'DQ-001', 'fullName': 'An', 'unitName': 'KP1'},
          {'id': 'mp2', 'userId': null, 'militiaCode': 'DQ-002', 'fullName': 'No account'},
        ]);
      }
      return jsonBody(200, [
        {'id': 'u2', 'username': 'dqtv01', 'fullName': 'An', 'role': 'dqtv', 'roles': ['dqtv'], 'status': 'active'},
        {'id': 'u9', 'username': 'ca09', 'fullName': 'Chin', 'role': 'ca_officer', 'roles': ['ca_officer'], 'status': 'active'},
        {'id': 'me', 'username': 'ca01', 'fullName': 'Me', 'role': 'ca_officer', 'roles': ['ca_officer'], 'status': 'active'},
      ]);
    }

    test('UT-CHAT-15: merges reachable DQTV and users, without the caller, duplicates or accountless DQTV', () async {
      final (api, adapter) = _api(both);

      final people = await api.searchParticipants(' an ', excludeUserId: 'me');

      expect(people.map((p) => p.id), ['u2', 'u9']);
      expect(people.first.fullName, 'An');
      expect(people.first.subtitle, 'DQ-001 — KP1');
      expect(people.last.subtitle, 'ca09');
      final paths = adapter.requests.map((r) => r.path).toSet();
      expect(paths, {'/militia/search', '/users/search'});
      for (final r in adapter.requests) {
        expect(r.queryParameters, {'q': 'an', 'limit': 20});
      }
    });

    test('UT-CHAT-16: one source failing still returns the other', () async {
      final (api, _) = _api((o) => o.path == '/militia/search'
          ? jsonBody(403, {'code': 'E004', 'message': 'Forbidden resource', 'statusCode': 403})
          : both(o));

      final people = await api.searchParticipants('an', excludeUserId: 'me');

      expect(people.map((p) => p.id), ['u2', 'u9']);
    });

    test('UT-CHAT-17: both failing is a ChatException', () async {
      final (failing, _) = _api((_) => jsonBody(500, {'code': 'E005', 'message': 'Internal server error', 'statusCode': 500}));
      await expectLater(failing.searchParticipants('an'), throwsA(isA<ChatException>()));

      final (garbled, _) = _api((_) => jsonBody(200, {'data': []}));
      await expectLater(garbled.searchParticipants('an'), _failsWith(AppFailure.participantSearchFailed));
    });

    test('UT-CHAT-18: under 2 characters does not search; the term is capped at 100', () async {
      final (api, adapter) = _api(both);
      expect(await api.searchParticipants(' n '), isEmpty);
      expect(adapter.requests, isEmpty);

      await api.searchParticipants('x' * 150);
      expect(ChatApi.maxSearchLength, 100);
      for (final r in adapter.requests) {
        expect((r.queryParameters['q'] as String).length, 100);
      }
    });
  });
}
