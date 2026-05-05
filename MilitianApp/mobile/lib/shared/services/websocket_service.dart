import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../core/constants/api_constants.dart';
import '../../core/storage/secure_storage_service.dart';
import '../../features/auth/providers/auth_provider.dart';

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

class WebSocketService {
  final SecureStorageService _storage;

  io.Socket? _socket;
  final StreamController<WsMessage> _streamController =
      StreamController<WsMessage>.broadcast();

  bool _isConnected = false;
  String? _currentConversationId;

  Stream<WsMessage> get stream => _streamController.stream;
  bool get isConnected => _isConnected;

  WebSocketService(this._storage);

  // ─── Connect ──────────────────────────────────────────────────────────────
  Future<void> connect() async {
    if (_isConnected) return;

    final token = await _storage.getAccessToken();
    if (token == null) {
      debugPrint('[WS] No access token, skipping connect');
      return;
    }

    // SECURITY: token in Socket.IO `auth` payload + Authorization header only.
    // Never in query string — leaks to proxies, server access logs, crash reports.
    _socket = io.io(
      ApiConstants.wsUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setExtraHeaders({'Authorization': 'Bearer $token'})
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionAttempts(5)
          .setReconnectionDelay(2000)
          .build(),
    );

    _bindEvents();
    _socket!.connect();
  }

  // ─── Disconnect ───────────────────────────────────────────────────────────
  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
    _currentConversationId = null;
    debugPrint('[WS] Disconnected');
  }

  // ─── Rooms ────────────────────────────────────────────────────────────────
  void joinConversation(String conversationId) {
    _currentConversationId = conversationId;
    _socket?.emit('chat:join', {'conversationId': conversationId});
    debugPrint('[WS] Joined conversation: $conversationId');
  }

  void leaveConversation(String conversationId) {
    _socket?.emit('leave_conversation', {'conversationId': conversationId});
    if (_currentConversationId == conversationId) {
      _currentConversationId = null;
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

  // ─── Mark messages read ───────────────────────────────────────────────────
  void markRead(String conversationId) {
    _socket?.emit('mark_read', {'conversationId': conversationId});
  }

  // ─── Internal event binding ───────────────────────────────────────────────
  void _bindEvents() {
    final socket = _socket!;

    socket.onConnect((_) {
      _isConnected = true;
      debugPrint('[WS] Connected');
      _streamController.add(const WsMessage(WsEvent.connected, null));

      // Rejoin conversation if we had one (e.g. after reconnect)
      if (_currentConversationId != null) {
        joinConversation(_currentConversationId!);
      }
    });

    socket.onDisconnect((_) {
      _isConnected = false;
      debugPrint('[WS] Disconnected');
      _streamController.add(const WsMessage(WsEvent.disconnected, null));
    });

    socket.onConnectError((data) {
      debugPrint('[WS] Connection error: $data');
      _streamController.add(WsMessage(WsEvent.error, data));
    });

    socket.on('chat:message', (data) {
      debugPrint('[WS] chat:message: $data');
      _streamController.add(WsMessage(WsEvent.messageReceived, data));
    });

    socket.on('messages_read', (data) {
      _streamController.add(WsMessage(WsEvent.messageRead, data));
    });

    socket.on('user_typing', (data) {
      _streamController.add(WsMessage(WsEvent.userTyping, data));
    });

    socket.on('user_stopped_typing', (data) {
      _streamController.add(WsMessage(WsEvent.userStoppedTyping, data));
    });

    socket.on('error', (data) {
      debugPrint('[WS] Server error: $data');
      _streamController.add(WsMessage(WsEvent.error, data));
    });
  }

  void dispose() {
    disconnect();
    _streamController.close();
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

final webSocketServiceProvider = Provider<WebSocketService>((ref) {
  final storage = ref.watch(secureStorageProvider);
  final service = WebSocketService(storage);

  // Auto-connect when provider is created (after auth)
  // Called explicitly by ChatScreen or AuthNotifier after login
  ref.onDispose(service.dispose);

  return service;
});
