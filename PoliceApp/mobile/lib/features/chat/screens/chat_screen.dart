import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/session_events.dart';
import '../../../core/storage/secure_storage_service.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../chat_labels.dart';
import '../chat_socket.dart';
import '../models/chat_models.dart';
import '../providers/chat_provider.dart';
import '../typing.dart';

class ChatScreen extends ConsumerStatefulWidget {
  final String conversationId;
  const ChatScreen({super.key, required this.conversationId});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  List<ChatMessage> _messages = [];
  bool _loadedInitial = false;
  bool _sending = false;
  ChatSocket? _socket;
  String? _myUserId;

  /// True once chat:join succeeded; the gateway rejects typing signals before that (not_joined)
  bool _joined = false;
  late final TypingEmitter _typingEmitter;
  late final TypingIndicator _typingIndicator;

  /// Access token the current socket was opened with
  String? _socketToken;
  bool _renewing = false;

  /// Renewals since the last successful join; stops a loop if every new token is refused too
  int _renewals = 0;
  static const _maxRenewals = 3;

  /// Waiting before connecting again while the server cannot check sessions
  Timer? _retryTimer;
  int _unavailableRetries = 0;
  static const _maxUnavailableRetries = 5;

  @override
  void initState() {
    super.initState();
    _typingEmitter = TypingEmitter(onChanged: _emitTyping);
    _typingIndicator = TypingIndicator(
      conversationId: widget.conversationId,
      onChanged: () {
        if (mounted) setState(() {});
      },
    );
    _loadMyUserId();
    _connectSocket();
    _markRead();
  }

  /// POST /chat/conversations/:id/read, so the list's unread badge clears
  Future<void> _markRead() async {
    try {
      await ref.read(chatApiProvider).markRead(widget.conversationId);
    } on ChatException catch (e) {
      // Failing to move the read marker must not interrupt the conversation
      debugPrint('Marking conversation ${widget.conversationId} read failed: ${e.failure}');
    }
  }

  @override
  void dispose() {
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    _retryTimer?.cancel();
    // Tell the others typing stopped, then leave every room by disconnecting
    _typingEmitter.dispose();
    _typingIndicator.dispose();
    _socket?.dispose();
    super.dispose();
  }

  Future<void> _loadMyUserId() async {
    final storage = ref.read(secureStorageProvider);
    final uid = await storage.getUserId();
    _typingIndicator.myUserId = uid;
    if (mounted) setState(() => _myUserId = uid);
  }

  /// typing_start / typing_stop {conversationId} (notifications.gateway.ts)
  void _emitTyping(bool typing) {
    if (!_joined) return;
    _socket?.emit(typing ? 'typing_start' : 'typing_stop', {'conversationId': widget.conversationId});
  }

  /// Participants from the conversation list, then the sender name on their messages
  String _displayNameOf(AppLocalizations l10n, String userId, List<Conversation>? conversations) {
    for (final conversation in conversations ?? const <Conversation>[]) {
      if (conversation.id != widget.conversationId) continue;
      for (final participant in conversation.participants) {
        if (participant.id == userId) return participant.displayName;
      }
    }
    for (final message in _messages.reversed) {
      final name = message.senderName?.trim();
      if (message.senderId == userId && name != null && name.isNotEmpty) return name;
    }
    return l10n.chatScreenTypingSomeone;
  }

  Future<void> _connectSocket() async {
    final SecureStorageService storage = ref.read(secureStorageProvider);
    final token = await storage.getAccessToken();
    if (token == null || !mounted) return;

    // Participant names for the typing indicator (usually cached by the conversation list)
    ref.read(conversationsProvider);
    _openSocket(token);
  }

  void _openSocket(String token) {
    final socket = ref.read(chatSocketFactoryProvider)(token);
    _socket = socket;
    _socketToken = token;

    // Runs again after every reconnect: rooms do not survive a disconnect. Nothing waits for
    // the acknowledgement, which never comes when the server ends the session first.
    socket.onConnect(() {
      socket.emitWithAck(
        'chat:join',
        {'conversationId': widget.conversationId},
        (response) {
          if (!identical(_socket, socket)) return;
          // Expired or revoked session: renew, then reconnect
          if (response is Map && response['error'] == 'session_expired') {
            _joined = false;
            _renewSocket();
            return;
          }
          final error = chatAckError(response);
          if (error != null) {
            _joined = false;
            _showFailure(error);
            return;
          }
          _joined = true;
          _renewals = 0;
          _unavailableRetries = 0;
          // Typing that began before the room was joined
          if (_typingEmitter.isTyping) _emitTyping(true);
        },
      );
    });

    // The server tells an open socket its session ended ({reason: token_expired |
    // session_revoked}), then disconnects it
    socket.on('session_expired', (_) {
      if (!identical(_socket, socket)) return;
      _joined = false;
      _renewSocket();
    });

    // A refused handshake: socket_io_client 2.x reports the server's refusal as 'error';
    // 'connect_error' carries transport failures, which socket.io retries by itself
    socket.on('connect_error', (data) => _onRefused(socket, data));
    socket.on('error', (data) => _onRefused(socket, data));

    socket.on('disconnect', (reason) {
      if (!identical(_socket, socket)) return;
      _joined = false;
      // Stop events sent meanwhile are lost; do not keep showing stale typing
      _typingIndicator.clear();
      // Fallback for servers that close the socket without saying why; dropped connections
      // reconnect on their own
      if (reason == 'io server disconnect') _renewSocket();
    });

    socket.on('chat:typing', (data) {
      if (mounted) _typingIndicator.handle(data);
    });

    socket.on('chat:message', (data) {
      if (!mounted || data is! Map) return;
      final msg = ChatMessage.fromJson(Map<String, dynamic>.from(data));
      if (msg.conversationId != null && msg.conversationId != widget.conversationId) return;
      // The message they were typing has arrived
      _typingIndicator.clearUser(msg.senderId);
      setState(() => _messages = mergeChatMessage(_messages, msg));
      _scrollToBottom();
      // Seen while the conversation is open
      if (msg.senderId != _myUserId) _markRead();
    });
  }

  /// Handshake refusals (Web/backend/src/notifications/notifications.gateway.ts:29-34, 73-111)
  void _onRefused(ChatSocket socket, Object? data) {
    if (!identical(_socket, socket) || !mounted) return;
    final reason = data is Map ? data['message'] : null;
    switch (reason) {
      case 'invalid_token' || 'session_revoked':
        _joined = false;
        _renewSocket();
      case 'missing_token':
        _dropSocket();
        ref.read(sessionEventsProvider).end('missing_token');
      case 'authentication_unavailable':
        _retryLater();
    }
  }

  void _dropSocket() {
    final socket = _socket;
    _socket = null;
    _joined = false;
    // Disposed outside the socket's own event callback
    if (socket != null) scheduleMicrotask(socket.dispose);
  }

  /// The server could not check the session: connect again later, with growing delays, still
  /// signed in
  void _retryLater() {
    final token = _socketToken;
    _dropSocket();
    if (token == null || _unavailableRetries >= _maxUnavailableRetries) return;
    final delay = Duration(seconds: 1 << _unavailableRetries);
    _unavailableRetries++;
    _retryTimer?.cancel();
    _retryTimer = Timer(delay, () {
      if (mounted) _openSocket(token);
    });
  }

  /// Renews the access token through the shared refresher (one refresh with any HTTP 401) and
  /// reconnects with it. When it cannot be renewed the refresher has ended the session and the
  /// router shows the login screen, or the server is unreachable: no reconnect then.
  Future<void> _renewSocket() async {
    if (_renewing || _renewals >= _maxRenewals || !mounted) return;
    _renewing = true;
    _renewals++;
    final token = await ref.read(renewSessionProvider)(staleAccessToken: _socketToken);
    _renewing = false;
    if (!mounted) return;
    // Disposed only now, outside the old socket's own event callbacks
    _socket?.dispose();
    _socket = null;
    if (token == null) return;
    _openSocket(token);
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _showFailure(AppFailure failure) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(failureText(context.l10n, failure)), backgroundColor: AppColors.error),
    );
  }

  /// Sends over REST only. The backend broadcasts the stored message as chat:message,
  /// so emitting chat:send as well would store it twice.
  Future<void> _sendMessage() async {
    if (_sending || _msgCtrl.text.trim().isEmpty) return;
    _typingEmitter.stop();
    setState(() => _sending = true);

    try {
      final msg = await ref.read(chatApiProvider).sendMessage(widget.conversationId, _msgCtrl.text);
      if (!mounted) return;
      _msgCtrl.clear();
      setState(() => _messages = mergeChatMessage(_messages, msg));
      _scrollToBottom();
    } on ChatException catch (e) {
      // The draft stays in the input so it can be sent again
      _showFailure(e.failure);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final msgAsync = ref.watch(chatMessagesProvider(widget.conversationId));

    final typingIds = _typingIndicator.userIds;
    String? typingText;
    if (typingIds.isNotEmpty) {
      final conversations = ref.watch(conversationsProvider).valueOrNull;
      typingText = typingIndicatorText(l10n, [for (final id in typingIds) _displayNameOf(l10n, id, conversations)]);
    }

    // Populate messages on first load
    if (!_loadedInitial) {
      msgAsync.whenData((msgs) {
        if (!_loadedInitial) {
          _loadedInitial = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            // Keep anything sent or received while the history was loading
            var merged = List<ChatMessage>.of(msgs);
            for (final m in _messages) {
              merged = mergeChatMessage(merged, m);
            }
            setState(() => _messages = merged);
            _scrollToBottom();
          });
        }
      });
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: l10n.chatScreenTitle,
        showBack: true,
        action: IconButton(
          tooltip: l10n.chatScreenRefresh,
          icon: const Icon(Icons.refresh),
          onPressed: () {
            ref.invalidate(chatMessagesProvider(widget.conversationId));
            setState(() => _loadedInitial = false);
          },
        ),
      ),
      body: Column(children: [
        Expanded(
          child: msgAsync.when(
            loading: () => const Center(
              child: CircularProgressIndicator(color: AppColors.navy),
            ),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(l10n.chatScreenLoadFailed(failureText(l10n, AppFailure.from(e))),
                    textAlign: TextAlign.center),
              ),
            ),
            data: (_) {
              if (_messages.isEmpty) {
                return Center(
                  child: Text(l10n.chatScreenEmpty, style: const TextStyle(color: AppColors.textSecondary)),
                );
              }
              return ListView.builder(
                controller: _scrollCtrl,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                itemCount: _messages.length,
                itemBuilder: (ctx, i) {
                  final msg = _messages[i];
                  final isMe = _myUserId != null && msg.senderId == _myUserId;
                  return _MessageBubble(message: msg, isMe: isMe);
                },
              );
            },
          ),
        ),
        if (typingText != null)
          Semantics(
            liveRegion: true,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              child: Text(
                typingText,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontStyle: FontStyle.italic,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ),
        // Input bar
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 6,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          padding: EdgeInsets.only(
            left: 12,
            right: 8,
            top: 8,
            bottom: MediaQuery.of(context).padding.bottom + 8,
          ),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _msgCtrl,
                onChanged: _typingEmitter.onInput,
                // Grow up to 5 lines, then scroll inside the field instead of pushing the screen
                minLines: 1,
                maxLines: 5,
                // ChatService.MAX_MESSAGE_LENGTH (Web/backend/src/chat/chat.service.ts:23)
                maxLength: ChatApi.maxMessageLength,
                maxLengthEnforcement: MaxLengthEnforcement.enforced,
                buildCounter: (
                  BuildContext context, {
                  required int currentLength,
                  required bool isFocused,
                  required int? maxLength,
                }) =>
                    maxLength != null && currentLength > maxLength - 200
                        ? Text(l10n.chatScreenCharacterCount(currentLength, maxLength),
                            style: const TextStyle(fontSize: 11, color: AppColors.textMuted))
                        : null,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: l10n.chatScreenInputHint,
                  hintStyle: const TextStyle(color: AppColors.textMuted),
                  filled: true,
                  fillColor: AppColors.background,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Semantics(
              button: true,
              label: l10n.chatScreenSend,
              child: Material(
                color: AppColors.navy,
                borderRadius: BorderRadius.circular(24),
                child: InkWell(
                  borderRadius: BorderRadius.circular(24),
                  onTap: _sending ? null : _sendMessage,
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: _sending
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.send, color: Colors.white, size: 20),
                  ),
                ),
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool isMe;

  const _MessageBubble({required this.message, required this.isMe});

  String _formatTime(String iso) {
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return '';
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.72,
        ),
        child: Column(
          crossAxisAlignment:
              isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (!isMe && message.senderName != null)
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 2),
                child: Text(
                  message.senderName!,
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.textMuted),
                ),
              ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isMe ? AppColors.navy : Colors.white,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isMe ? 16 : 4),
                  bottomRight: Radius.circular(isMe ? 4 : 16),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Text(
                message.content,
                style: TextStyle(
                  color: isMe ? Colors.white : AppColors.textPrimary,
                  fontSize: 14,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
              child: Text(
                _formatTime(message.createdAt),
                style: const TextStyle(
                    fontSize: 10, color: AppColors.textMuted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
