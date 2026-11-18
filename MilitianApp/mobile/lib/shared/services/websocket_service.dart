import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../core/constants/api_constants.dart';
import '../../core/network/dio_client.dart';
import '../../core/network/session_events.dart';
import '../../core/network/token_refresher.dart';
import '../../core/storage/secure_storage_service.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/chat/repositories/chat_repository.dart';
import '../utils/api_failure.dart';

/// Events emitted by WebSocketService
enum WsEvent {
  connected,
  disconnected,
  messageReceived,
  messageRead,
  userTyping,
  userStoppedTyping,
  error,
}

class WsMessage {
  final WsEvent event;
  final dynamic data;
  const WsMessage(this.event, this.data);
}

/// Chat events the service forwards to its stream — the ones Web/backend/src/notifications/
/// notifications.gateway.ts emits to clients. 'session_expired' is handled by the service itself.
const wsServerEvents = ['chat:message', 'chat:typing', 'chat:read'];

/// The stream message for a server event, or null when the event is not used or malformed.
///   'chat:typing' {conversationId, userId, typing: bool} → userTyping / userStoppedTyping
///   'chat:read'   {conversationId, userId, readAt}       → messageRead
WsMessage? wsMessageFor(String event, dynamic data) {
  switch (event) {
    case 'chat:message':
      return WsMessage(WsEvent.messageReceived, data);
    case 'chat:typing':
      final typing = data is Map ? data['typing'] : null;
      if (typing is! bool) return null;
      return WsMessage(typing ? WsEvent.userTyping : WsEvent.userStoppedTyping, data);
    case 'chat:read':
      return WsMessage(WsEvent.messageRead, data);
  }
  return null;
}

/// Whether someone else is typing in [conversationId] (true/false), or null when [msg] is
/// not a typing event for that conversation from another user.
bool? typingStateFor(WsMessage msg, {required String conversationId, String? myUserId}) {
  if (msg.event != WsEvent.userTyping && msg.event != WsEvent.userStoppedTyping) return null;
  final data = msg.data;
  if (data is! Map || data['conversationId'] != conversationId) return null;
  if (myUserId != null && data['userId'] == myUserId) return null;
  return msg.event == WsEvent.userTyping;
}

/// The socket calls the service makes, so tests can stand in for socket.io.
abstract class ChatSocket {
  void connect();

  /// Disconnects and drops every listener.
  void dispose();

  void emit(String event, Object? data);

  void emitWithAck(String event, Object? data, void Function(dynamic response) ack);

  void onConnect(void Function() handler);

  /// [reason] as socket.io reports it: 'io server disconnect' when the server closed the socket.
  void onDisconnect(void Function(String? reason) handler);

  /// The connection was not established: [message] is the gateway's refusal (missing_token,
  /// invalid_token, session_revoked, authentication_unavailable) or what the transport reported.
  void onConnectError(void Function(String? message) handler);

  void on(String event, void Function(dynamic data) handler);
}

/// Opens a socket authenticated with [accessToken].
typedef ChatSocketFactory = ChatSocket Function(String accessToken);

/// A usable access token after the socket's [staleToken] was refused, or null when the session is
/// over. Throws RefreshUnavailable when the refresh got no answer (the session is kept).
typedef TokenRenewer = Future<String?> Function(String? staleToken);

/// Starts a timer: `Timer.new` in the app; tests fire timers themselves.
typedef TimerScheduler = Timer Function(Duration delay, void Function() callback);

/// socket.io, authenticated with [accessToken].
ChatSocket ioChatSocket(String accessToken) => IoChatSocket(io.io(
      ApiConstants.wsUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          // A new manager per token: a shared one would present the previous token again
          .enableForceNew()
          // SECURITY: token in Socket.IO `auth` payload + Authorization header only.
          // Never in query string — leaks to proxies, server access logs, crash reports.
          .setExtraHeaders({'Authorization': 'Bearer $accessToken'})
          .setAuth({'token': accessToken})
          .enableReconnection()
          .setReconnectionAttempts(5)
          .setReconnectionDelay(2000)
          .build(),
    ));

/// [ChatSocket] on a socket_io_client socket.
class IoChatSocket implements ChatSocket {
  IoChatSocket(this.socket);

  /// The socket.io socket behind this adapter
  final io.Socket socket;

  @override
  void connect() => socket.connect();

  @override
  void dispose() => socket.dispose();

  @override
  void emit(String event, Object? data) => socket.emit(event, data);

  @override
  void emitWithAck(String event, Object? data, void Function(dynamic response) ack) =>
      socket.emitWithAck(event, data, ack: ([dynamic response]) => ack(response));

  @override
  void onConnect(void Function() handler) => socket.onConnect((_) => handler());

  @override
  void onDisconnect(void Function(String? reason) handler) =>
      socket.onDisconnect((reason) => handler(reason is String ? reason : null));

  /// socket_io_client 2.x emits the server's refusal of the handshake (a CONNECT_ERROR packet) as
  /// 'error' {message} (lib/src/socket.dart:299-300), and engine or transport failures as
  /// 'connect_error' (socket.dart:239-243).
  @override
  void onConnectError(void Function(String? message) handler) {
    socket.on('error', (data) => handler(_messageOf(data)));
    socket.onConnectError((data) => handler(_messageOf(data)));
  }

  static String? _messageOf(Object? data) => switch (data) {
        {'message': final String message} => message,
        final String text => text,
        _ => null,
      };

  @override
  void on(String event, void Function(dynamic data) handler) => socket.on(event, handler);
}

/// The chat socket and its session (Web/backend/src/notifications/notifications.gateway.ts).
///
/// The handshake is authenticated; a refused one reports why:
/// - invalid_token / session_revoked: the token is renewed through the app's shared refresher and a
///   new connection opens with it. A refused refresh has already ended the session (the refresher
///   reported it), so nothing reconnects.
/// - missing_token: the stored session cannot authenticate the socket; the tokens are cleared and the
///   session end is reported, which signs the user out.
/// - authentication_unavailable: the server could not check the session; the same token connects
///   again after [unavailableRetryDelay], at most [maxUnavailableRetries] times in a row.
///
/// An open socket whose session ends receives 'session_expired' {reason} before the server closes it;
/// the service renews and reconnects at once. A server-side disconnect and an acknowledgement
/// {error: 'session_expired'} are fallbacks for the same refusal, which renews only once. Renewals of
/// an open socket stop after [maxRenewals] in a row without a successful chat:join; a renewal after a
/// refused handshake is proven by the next accepted connection. A chat:join acknowledgement is waited
/// for at most [joinAckTimeout].
class WebSocketService {
  WebSocketService(
    this._storage, {
    TokenRenewer? renewToken,
    ChatSocketFactory? socketFactory,
    SessionEvents? sessionEvents,
    TimerScheduler? scheduler,
  })  : _renewToken = renewToken,
        _socketFactory = socketFactory ?? ioChatSocket,
        _sessionEvents = sessionEvents,
        _schedule = scheduler ?? Timer.new;

  /// Renewals in a row that may end without a successful chat:join
  static const maxRenewals = 3;

  /// Connection attempts in a row while the server cannot check sessions
  static const maxUnavailableRetries = 5;

  /// How long a chat:join acknowledgement is waited for
  static const joinAckTimeout = Duration(seconds: 10);

  /// The wait before connection attempt [attempt] (0-based) after authentication_unavailable
  static Duration unavailableRetryDelay(int attempt) => Duration(seconds: 1 << attempt);

  final SecureStorageService _storage;
  final TokenRenewer? _renewToken;
  final ChatSocketFactory _socketFactory;
  final SessionEvents? _sessionEvents;
  final TimerScheduler _schedule;

  ChatSocket? _socket;

  /// The access token [_socket] authenticated with
  String? _socketToken;
  final StreamController<WsMessage> _streamController =
      StreamController<WsMessage>.broadcast();

  bool _isConnected = false;
  bool _renewing = false;
  int _renewals = 0;

  /// The socket was opened after a refused handshake: its acceptance proves the renewal worked
  bool _renewedAfterRefusedHandshake = false;
  int _unavailableRetries = 0;
  Timer? _retryTimer;
  Timer? _joinTimeout;
  String? _currentConversationId;

  Stream<WsMessage> get stream => _streamController.stream;
  bool get isConnected => _isConnected;

  // ─── Connect ──────────────────────────────────────────────────────────────
  Future<void> connect() async {
    if (_socket != null) return;

    final token = await _storage.getAccessToken();
    if (token == null || token.trim().isEmpty) {
      debugPrint('[WS] No access token, skipping connect');
      return;
    }
    if (_socket != null) return;
    _renewals = 0;
    _unavailableRetries = 0;
    _cancelRetry();
    _open(token);
  }

  void _open(String token) {
    final socket = _socketFactory(token);
    _socket = socket;
    _socketToken = token;
    _bindEvents(socket);
    socket.connect();
  }

  // ─── Disconnect ───────────────────────────────────────────────────────────
  void disconnect() {
    _cancelRetry();
    _closeSocket();
    _currentConversationId = null;
    _renewals = 0;
    _unavailableRetries = 0;
    debugPrint('[WS] Disconnected');
  }

  void _closeSocket() {
    final socket = _socket;
    _socket = null;
    _socketToken = null;
    _isConnected = false;
    _renewedAfterRefusedHandshake = false;
    _dropJoinTimeout();
    // Disposed outside the socket's own event callback, which may be running
    if (socket != null) scheduleMicrotask(socket.dispose);
  }

  void _cancelRetry() {
    _retryTimer?.cancel();
    _retryTimer = null;
  }

  // ─── Rooms ────────────────────────────────────────────────────────────────
  void joinConversation(String conversationId) {
    _currentConversationId = conversationId;
    final socket = _socket;
    if (socket == null) return;
    _dropJoinTimeout();
    late final Timer timeout;
    timeout = _schedule(joinAckTimeout, () => _onJoinTimeout(socket, timeout));
    _joinTimeout = timeout;
    // The gateway accepts the bare id or {conversationId} and acks {joined} or {error}
    // (Web/backend/src/notifications/notifications.gateway.ts:177-201)
    socket.emitWithAck(
      'chat:join',
      {'conversationId': conversationId},
      (response) => _onJoinAck(socket, timeout, response),
    );
    debugPrint('[WS] Joining conversation: $conversationId');
  }

  void _dropJoinTimeout() {
    _joinTimeout?.cancel();
    _joinTimeout = null;
  }

  /// No answer to the join: the server may have closed the socket meanwhile (then the session
  /// signals renew it and the next connection joins again) or the answer was lost.
  void _onJoinTimeout(ChatSocket socket, Timer timeout) {
    if (!identical(socket, _socket) || !identical(timeout, _joinTimeout)) return;
    _joinTimeout = null;
    debugPrint('[WS] chat:join got no answer within $joinAckTimeout');
    _add(const WsMessage(WsEvent.error, ApiFailure(kind: FailureKind.timeout)));
  }

  void _onJoinAck(ChatSocket socket, Timer timeout, dynamic response) {
    // The answer of a socket that was replaced since, or of a join that timed out or was dropped
    if (!identical(socket, _socket) || !identical(timeout, _joinTimeout)) return;
    _dropJoinTimeout();
    final payload = response is List && response.isNotEmpty ? response.first : response;
    final error = payload is Map ? payload['error'] : null;
    if (error == null) {
      _renewals = 0;
      return;
    }
    if (error == 'session_expired') {
      // Renewed silently: no "session expired" message for the chat screen
      _renewSession(socket);
      return;
    }
    // The refusal code, worded by the chat screen
    final code = chatAckError(response);
    if (code != null) _add(WsMessage(WsEvent.error, ApiFailure(code: code)));
  }

  /// The gateway refused [socket]'s session: renew the token through the shared refresher (a
  /// token older than the stored one is simply swapped), dispose the socket and open a new one.
  Future<void> _renewSession(ChatSocket socket, {bool refusedHandshake = false}) async {
    if (_renewing || !identical(socket, _socket)) return;
    _dropJoinTimeout();
    if (_renewals >= maxRenewals) {
      debugPrint('[WS] Session still refused after $_renewals renewals; not reconnecting');
      _closeSocket();
      return;
    }
    _renewing = true;
    _renewals++;
    try {
      String? fresh;
      var unavailable = false;
      try {
        final renew = _renewToken;
        fresh = renew == null ? null : await renew(_socketToken);
      } on RefreshUnavailable catch (e) {
        debugPrint('[WS] Token renewal got no answer: $e');
        unavailable = true;
      } catch (e) {
        debugPrint('[WS] Token renewal failed: $e');
        fresh = null;
      }
      // Disconnected or replaced while the token was being renewed
      if (!identical(socket, _socket)) return;
      // The session is kept (offline, 5xx, 429): connect again later, as for authentication_unavailable
      if (unavailable) {
        _retryLater();
        return;
      }
      _closeSocket();
      // null: the session is over (the app goes to the login screen)
      if (fresh != null) {
        _open(fresh);
        _renewedAfterRefusedHandshake = refusedHandshake;
      }
    } finally {
      _renewing = false;
    }
  }

  /// missing_token: the server received no token from this session, so it cannot use the socket.
  /// The tokens are cleared and the end reported (AuthNotifier signs out), as the refresher does for
  /// a refused refresh.
  Future<void> _endSession() async {
    _cancelRetry();
    _closeSocket();
    await _storage.clearTokens();
    _sessionEvents?.end(const SessionEnd(SessionEndReason.ended, code: 'missing_token'));
  }

  /// authentication_unavailable: connect again later with the same token, still signed in.
  void _retryLater() {
    final token = _socketToken;
    _closeSocket();
    _cancelRetry();
    if (token == null || _unavailableRetries >= maxUnavailableRetries) {
      debugPrint('[WS] Sessions cannot be checked; not reconnecting after $_unavailableRetries attempts');
      return;
    }
    final delay = unavailableRetryDelay(_unavailableRetries++);
    _retryTimer = _schedule(delay, () {
      _retryTimer = null;
      if (_socket == null) _open(token);
    });
  }

  void leaveConversation(String conversationId) {
    _socket?.emit('leave_conversation', {'conversationId': conversationId});
    if (_currentConversationId == conversationId) {
      _currentConversationId = null;
      _dropJoinTimeout();
    }
    debugPrint('[WS] Left conversation: $conversationId');
  }

  // ─── Send message ─────────────────────────────────────────────────────────
  void sendMessage({
    required String conversationId,
    required String content,
    String messageType = 'text',
    Map<String, dynamic>? metadata,
  }) {
    if (!_isConnected) {
      debugPrint('[WS] Not connected, cannot send message');
      return;
    }
    _socket?.emit('chat:send', {
      'conversationId': conversationId,
      'content': content,
      'messageType': messageType,
      if (metadata != null) 'metadata': metadata,
    });
  }

  // ─── Typing indicators ────────────────────────────────────────────────────
  void startTyping(String conversationId) {
    _socket?.emit('typing_start', {'conversationId': conversationId});
  }

  void stopTyping(String conversationId) {
    _socket?.emit('typing_stop', {'conversationId': conversationId});
  }

  // ─── Internal event binding ───────────────────────────────────────────────
  void _add(WsMessage message) {
    if (!_streamController.isClosed) _streamController.add(message);
  }

  void _bindEvents(ChatSocket socket) {
    socket.onConnect(() {
      if (!identical(socket, _socket)) return;
      _isConnected = true;
      _unavailableRetries = 0;
      if (_renewedAfterRefusedHandshake) {
        _renewedAfterRefusedHandshake = false;
        _renewals = 0;
      }
      debugPrint('[WS] Connected');
      _add(const WsMessage(WsEvent.connected, null));

      // Rooms do not survive a reconnect: join the current conversation again
      final conversationId = _currentConversationId;
      if (conversationId != null) joinConversation(conversationId);
    });

    socket.onDisconnect((reason) {
      if (!identical(socket, _socket)) return;
      _isConnected = false;
      // A join sent before the disconnect is never answered; the reconnect joins again
      _dropJoinTimeout();
      debugPrint('[WS] Disconnected ($reason)');
      _add(const WsMessage(WsEvent.disconnected, null));
      // Fallback for a server that closes the socket without saying why first. Transport losses are
      // reconnected by socket.io itself.
      if (reason == 'io server disconnect') _renewSession(socket);
    });

    socket.onConnectError((message) {
      if (!identical(socket, _socket)) return;
      switch (message) {
        case 'invalid_token' || 'session_revoked':
          debugPrint('[WS] Handshake refused ($message); renewing the token');
          _renewSession(socket, refusedHandshake: true);
        case 'missing_token':
          debugPrint('[WS] Handshake refused (missing_token); ending the session');
          _endSession();
        case 'authentication_unavailable':
          debugPrint('[WS] Handshake refused (authentication_unavailable); retrying later');
          _retryLater();
        default:
          // Transport failures: socket.io reconnects by itself
          debugPrint('[WS] Connection error: $message');
      }
    });

    // The server ends an open socket's session with this event ({reason: token_expired |
    // session_revoked}), then disconnects it
    socket.on('session_expired', (data) {
      if (!identical(socket, _socket)) return;
      debugPrint('[WS] Session expired: $data');
      _renewSession(socket);
    });

    for (final event in wsServerEvents) {
      socket.on(event, (data) {
        if (!identical(socket, _socket)) return;
        final msg = wsMessageFor(event, data);
        if (msg != null) _add(msg);
      });
    }
  }

  void dispose() {
    disconnect();
    _streamController.close();
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

final webSocketServiceProvider = Provider<WebSocketService>((ref) {
  final storage = ref.watch(secureStorageProvider);
  // The same refresher as HTTP requests: one refresh serves both, and a stale socket token reuses it
  final refresher = DioClient.refresherFor(storage);
  final service = WebSocketService(
    storage,
    renewToken: (staleToken) => refresher.renew(staleToken: staleToken),
    sessionEvents: ref.watch(sessionEventsProvider),
  );

  // Connected explicitly by App after sign-in and by ChatScreen
  ref.onDispose(service.dispose);

  return service;
});
