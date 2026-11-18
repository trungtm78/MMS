// Unit Tests: socket events the gateway really emits → WsMessage
// Web/backend/src/notifications/notifications.gateway.ts:
//   'chat:message' (message), 'chat:typing' {conversationId, userId, typing: bool},
//   'chat:read' {conversationId, userId, readAt}. There are no 'user_typing',
//   'user_stopped_typing' or 'messages_read' events. 'session_expired' is a session signal the
//   service handles itself (unit_websocket_session_test.dart), and a refused handshake arrives
//   through ChatSocket.onConnectError, so neither becomes a stream message.
// Run: flutter test test/unit_websocket_events_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/shared/services/websocket_service.dart';

void main() {
  group('wsMessageFor', () {
    test('chat:typing with typing true is userTyping', () {
      final data = {'conversationId': 'c1', 'userId': 'u2', 'typing': true};
      final msg = wsMessageFor('chat:typing', data)!;
      expect(msg.event, WsEvent.userTyping);
      expect(msg.data, data);
    });

    test('chat:typing with typing false is userStoppedTyping', () {
      final msg = wsMessageFor('chat:typing', {'conversationId': 'c1', 'userId': 'u2', 'typing': false})!;
      expect(msg.event, WsEvent.userStoppedTyping);
    });

    test('chat:typing without a boolean is ignored', () {
      expect(wsMessageFor('chat:typing', {'conversationId': 'c1', 'userId': 'u2'}), isNull);
      expect(wsMessageFor('chat:typing', {'conversationId': 'c1', 'typing': 'true'}), isNull);
      expect(wsMessageFor('chat:typing', 'c1'), isNull);
    });

    test('chat:read is messageRead', () {
      final data = {'conversationId': 'c1', 'userId': 'u2', 'readAt': '2026-09-14T05:00:00.000Z'};
      final msg = wsMessageFor('chat:read', data)!;
      expect(msg.event, WsEvent.messageRead);
      expect(msg.data, data);
    });

    test('chat:message is messageReceived', () {
      expect(wsMessageFor('chat:message', {'id': 'm1'})!.event, WsEvent.messageReceived);
    });

    test('events the backend never emits, and session signals, are not stream messages', () {
      for (final name in ['user_typing', 'user_stopped_typing', 'messages_read', 'something', 'error',
          'session_expired']) {
        expect(wsMessageFor(name, {'conversationId': 'c1'}), isNull, reason: name);
      }
    });

    test('the service subscribes to exactly the gateway chat events', () {
      expect(wsServerEvents, unorderedEquals(['chat:message', 'chat:typing', 'chat:read']));
    });
  });

  group('typingStateFor', () {
    WsMessage typing(bool on, {String conversationId = 'c1', String userId = 'u2'}) =>
        wsMessageFor('chat:typing', {'conversationId': conversationId, 'userId': userId, 'typing': on})!;

    test('someone else typing in this conversation', () {
      expect(typingStateFor(typing(true), conversationId: 'c1', myUserId: 'u1'), isTrue);
      expect(typingStateFor(typing(false), conversationId: 'c1', myUserId: 'u1'), isFalse);
    });

    test('other conversations and my own events are ignored', () {
      expect(typingStateFor(typing(true, conversationId: 'c9'), conversationId: 'c1', myUserId: 'u1'), isNull);
      expect(typingStateFor(typing(false, conversationId: 'c9'), conversationId: 'c1', myUserId: 'u1'), isNull);
      expect(typingStateFor(typing(true, userId: 'u1'), conversationId: 'c1', myUserId: 'u1'), isNull);
    });

    test('non-typing messages are ignored', () {
      expect(
        typingStateFor(wsMessageFor('chat:read', {'conversationId': 'c1', 'userId': 'u2'})!,
            conversationId: 'c1', myUserId: 'u1'),
        isNull,
      );
      expect(typingStateFor(const WsMessage(WsEvent.userTyping, 'c1'), conversationId: 'c1', myUserId: 'u1'),
          isNull);
    });
  });
}
