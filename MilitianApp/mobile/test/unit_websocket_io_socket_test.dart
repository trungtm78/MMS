// Unit Tests: the socket.io adapter behind ChatSocket (IoChatSocket), on a socket_io_client 2.0.3+1
// socket that never connects (autoConnect off). Reserved events ('connect', 'disconnect', 'error',
// 'connect_error') are emitted locally by socket_io_client, so the test plays them directly:
//   - a refused handshake: the CONNECT_ERROR packet is emitted as 'error' {message}
//     (socket_io_client lib/src/socket.dart:299-300);
//   - a transport failure: 'connect_error' with whatever the engine reported (socket.dart:239-243).
// Run: flutter test test/unit_websocket_io_socket_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/shared/services/websocket_service.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

io.Socket _raw() => io.io(
      'ws://127.0.0.1:9',
      io.OptionBuilder().setTransports(['websocket']).disableAutoConnect().enableForceNew().build(),
    );

void main() {
  test('WS-IO-01: socket.io events reach the ChatSocket handlers', () {
    final raw = _raw();
    final socket = IoChatSocket(raw);
    var connects = 0;
    final reasons = <String?>[];
    final refusals = <String?>[];
    final messages = <Object?>[];
    socket.onConnect(() => connects++);
    socket.onDisconnect(reasons.add);
    socket.onConnectError(refusals.add);
    socket.on('chat:message', messages.add);

    raw.emit('connect');
    raw.emit('disconnect', 'io server disconnect');
    raw.emit('disconnect', 42);
    raw.emit('error', {'message': 'invalid_token'});
    raw.emit('error', {'data': 'no message'});
    raw.emit('connect_error', 'websocket error');
    raw.emit('connect_error', StateError('engine'));
    // Server events are delivered only to a connected socket
    raw.connected = true;
    raw.onevent({
      'data': [
        'chat:message',
        {'id': 'm1'},
      ],
    });
    // Back to unconnected: this socket has no engine to send a disconnect packet through
    raw.connected = false;

    expect(connects, 1);
    expect(reasons, ['io server disconnect', null]);
    expect(refusals, ['invalid_token', null, 'websocket error', null]);
    expect(messages, [
      {'id': 'm1'},
    ]);

    socket.dispose();
    raw.emit('connect');
    expect(connects, 1, reason: 'dispose drops every listener');
  });

  test('WS-IO-02: emits become socket.io packets and an acknowledgement reaches its callback', () {
    final raw = _raw();
    final socket = IoChatSocket(raw);
    final answers = <Object?>[];

    socket.emit('typing_start', {'conversationId': 'c1'});
    socket.emitWithAck('chat:join', {'conversationId': 'c1'}, answers.add);

    // Not connected: socket.io keeps the packets until the connection opens
    expect(raw.sendBuffer.map((p) => p['data']), [
      [
        'typing_start',
        {'conversationId': 'c1'},
      ],
      [
        'chat:join',
        {'conversationId': 'c1'},
      ],
    ]);
    raw.onack({
      'id': raw.sendBuffer.last['id'],
      'data': [
        {'joined': 'c1'},
      ],
    });
    expect(answers, [
      {'joined': 'c1'},
    ]);
    socket.dispose();
  });

  test('WS-IO-03: ioChatSocket sends the token in the auth payload and the Authorization header only', () {
    final socket = ioChatSocket('tok_access');
    final raw = (socket as IoChatSocket).socket;

    expect(raw.auth, {'token': 'tok_access'});
    expect(raw.io.options?['extraHeaders'], {'Authorization': 'Bearer tok_access'});
    expect(raw.io.options?['forceNew'], isTrue);
    expect(raw.io.autoConnect, isFalse);
    expect(raw.io.uri, isNot(contains('tok_access')));
    socket.dispose();
  });
}
