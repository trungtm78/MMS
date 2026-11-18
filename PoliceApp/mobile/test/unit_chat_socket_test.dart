// Unit Tests: the socket.io adapter behind ChatSocket (no network: the socket never connects)
// Run: flutter test test/unit_chat_socket_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/chat/chat_socket.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

io.Socket _offlineSocket() => io.io(
      'http://localhost:9',
      io.OptionBuilder().setTransports(['websocket']).disableAutoConnect().enableForceNew().build(),
    );

void main() {
  test('UT-SOCKET-01: handlers, emits and acknowledgements go to socket.io', () {
    final raw = _offlineSocket();
    final socket = SocketIoChatSocket(raw);
    var connects = 0;
    final disconnects = <Object?>[];
    final acks = <Object?>[];

    socket.onConnect(() => connects++);
    socket.on('disconnect', disconnects.add);
    // Reserved events only reach local listeners
    raw.emit('connect');
    raw.emit('disconnect', 'io server disconnect');

    expect(connects, 1);
    expect(disconnects, ['io server disconnect']);

    socket.emit('typing_start', {'conversationId': 'c1'});
    socket.emitWithAck('chat:join', {'conversationId': 'c1'}, acks.add);
    // Not connected: both are queued with the join waiting for its acknowledgement
    expect(raw.sendBuffer, hasLength(2));
    expect(raw.acks, hasLength(1));
    // socket.io applies the acknowledgement's data list as positional arguments
    Function.apply(raw.acks.values.single as Function, [
      {'joined': 'c1'},
    ]);
    expect(acks, [{'joined': 'c1'}]);

    socket.dispose();
    expect(raw.connected, isFalse);
  });
}
