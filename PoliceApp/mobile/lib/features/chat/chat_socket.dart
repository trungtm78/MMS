import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../core/constants/api_constants.dart';

/// The part of the socket.io client the chat screen uses, so tests can drive server events
abstract class ChatSocket {
  void onConnect(void Function() handler);

  void on(String event, void Function(dynamic data) handler);

  void emit(String event, Object? data);

  void emitWithAck(String event, Object? data, void Function(dynamic response) onAck);

  /// Disconnecting leaves every room on the server
  void dispose();
}

typedef ChatSocketFactory = ChatSocket Function(String accessToken);

/// [ChatSocket] over a socket.io client socket
class SocketIoChatSocket implements ChatSocket {
  SocketIoChatSocket(this._socket);

  /// A new connection to the notifications gateway, authenticated in the handshake
  factory SocketIoChatSocket.connect(String accessToken) => SocketIoChatSocket(io.io(
        ApiConstants.wsUrl,
        // forceNew: io() otherwise hands back the cached manager's socket for this URL, which
        // would keep connecting with the old token after a renewal (socket_io_client.dart:52-64,
        // src/manager.dart:275-279)
        io.OptionBuilder()
            .setTransports(['websocket'])
            .enableForceNew()
            .setAuth({'token': accessToken})
            .build(),
      ));

  final io.Socket _socket;

  @override
  void onConnect(void Function() handler) => _socket.onConnect((_) => handler());

  @override
  void on(String event, void Function(dynamic data) handler) => _socket.on(event, handler);

  @override
  void emit(String event, Object? data) => _socket.emit(event, data);

  @override
  void emitWithAck(String event, Object? data, void Function(dynamic response) onAck) =>
      _socket.emitWithAck(event, data, ack: ([dynamic response]) => onAck(response));

  @override
  void dispose() => _socket
    ..disconnect()
    ..dispose();
}

final chatSocketFactoryProvider = Provider<ChatSocketFactory>((ref) => SocketIoChatSocket.connect);
