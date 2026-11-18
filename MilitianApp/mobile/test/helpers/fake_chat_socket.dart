// Test doubles for the chat socket: records what WebSocketService sends and lets a test play
// the server (Web/backend/src/notifications/notifications.gateway.ts), plus a scheduler whose
// timers run only when the test fires them (join timeouts, retry backoff).

import 'dart:async';

import 'package:militian_app/shared/services/websocket_service.dart';

class FakeChatSocket implements ChatSocket {
  FakeChatSocket(this.token);

  /// The access token the socket was opened with
  final String token;
  bool connectCalled = false;
  bool disposed = false;
  final List<(String, Object?)> emitted = [];
  final Map<String, void Function(dynamic response)> _acks = {};
  final Map<String, void Function(dynamic data)> _handlers = {};
  void Function()? _onConnect;
  void Function(String? reason)? _onDisconnect;
  void Function(String? message)? _onConnectError;

  @override
  void connect() {
    connectCalled = true;
  }

  @override
  void dispose() {
    disposed = true;
  }

  @override
  void emit(String event, Object? data) {
    emitted.add((event, data));
  }

  @override
  void emitWithAck(String event, Object? data, void Function(dynamic response) ack) {
    emitted.add((event, data));
    _acks[event] = ack;
  }

  @override
  void onConnect(void Function() handler) {
    _onConnect = handler;
  }

  @override
  void onDisconnect(void Function(String? reason) handler) {
    _onDisconnect = handler;
  }

  @override
  void onConnectError(void Function(String? message) handler) {
    _onConnectError = handler;
  }

  @override
  void on(String event, void Function(dynamic data) handler) {
    _handlers[event] = handler;
  }

  /// The server accepted the connection.
  void serverConnect() => _onConnect?.call();

  /// The socket closed with socket.io's [reason] ('io server disconnect' when the server closed it).
  void fireDisconnect(String reason) => _onDisconnect?.call(reason);

  /// The handshake was refused with [message] (missing_token, invalid_token, session_revoked,
  /// authentication_unavailable), or the transport failed (any other message, or none).
  void refuse(String? message) => _onConnectError?.call(message);

  /// The server answers the last [event] sent with an acknowledgement.
  void ack(String event, Object? response) => _acks[event]!(response);

  /// A server event arrives.
  void serverEmit(String event, Object? data) => _handlers[event]?.call(data);

  List<Object?> emittedData(String event) => [
        for (final (name, data) in emitted)
          if (name == event) data,
      ];
}

/// Stands in for `Timer.new`: records every timer and runs one only when the test fires it.
class FakeScheduler {
  final List<FakeTimer> timers = [];

  Timer schedule(Duration delay, void Function() callback) {
    final timer = FakeTimer(delay, callback);
    timers.add(timer);
    return timer;
  }

  /// Timers neither fired nor cancelled
  List<FakeTimer> get active => [for (final t in timers) if (t.isActive) t];
}

class FakeTimer implements Timer {
  FakeTimer(this.duration, this._callback);

  final Duration duration;
  final void Function() _callback;
  bool _active = true;

  @override
  bool get isActive => _active;

  @override
  int get tick => _active ? 0 : 1;

  @override
  void cancel() {
    _active = false;
  }

  /// Runs the callback as if [duration] had passed; a cancelled or fired timer does nothing.
  void fire() {
    if (!_active) return;
    _active = false;
    _callback();
  }
}
