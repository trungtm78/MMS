import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/error_texts.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/services/websocket_service.dart';
import '../../../shared/utils/api_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';
import '../chat_texts.dart';
import '../repositories/chat_repository.dart';

class ChatScreen extends ConsumerStatefulWidget {
  final String conversationId;

  /// Conversation title from the list screen, when known
  final String? title;

  const ChatScreen({super.key, required this.conversationId, this.title});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  String? _loadError;
  bool _sending = false;
  bool _remoteTyping = false;
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  String? _myUserId;
  StreamSubscription<WsMessage>? _wsSub;
  Timer? _typingTimer;
  Timer? _remoteTypingTimer;

  // Read once while the screen is alive: dispose() must not use ref
  late final WebSocketService _ws;
  late final ChatRepository _repo;

  @override
  void initState() {
    super.initState();
    _ws = ref.read(webSocketServiceProvider);
    _repo = ref.read(chatRepositoryProvider);
    _init();
  }

  Future<void> _init() async {
    final storage = ref.read(secureStorageProvider);
    _myUserId = await storage.getUserId();
    await _loadMessages();
    _connectWebSocket();
  }

  // ─── WebSocket: receive broadcasts, join the room ─────────────────────────

  void _connectWebSocket() {
    if (!mounted) return;
    final ws = _ws;
    ws.connect().then((_) => ws.joinConversation(widget.conversationId));

    _wsSub = ws.stream.listen((msg) {
      if (!mounted) return;
      switch (msg.event) {
        case WsEvent.messageReceived:
          final data = msg.data;
          if (data is Map && data['conversationId'] == widget.conversationId) {
            final message = Map<String, dynamic>.from(data);
            setState(() => _messages = mergeMessage(_messages, message));
            _scrollToBottom();
            final senderId = message['senderId'] ?? message['sender_id'];
            // A message from someone else is read at once while the chat is open
            if (senderId != null && senderId != _myUserId) {
              _setRemoteTyping(false);
              _markRead();
            }
          }
          break;
        case WsEvent.error:
          // Refusals of chat:join arrive as their backend code, an unanswered join as a timeout
          final refusal = msg.data;
          if (refusal is ApiFailure) _showError(refusal.text(context.l10n, flow: ErrorFlow.chatAck));
          break;
        case WsEvent.userTyping:
        case WsEvent.userStoppedTyping:
          // chat:typing {conversationId, userId, typing}: other rooms and my own echo are ignored
          final typing = typingStateFor(msg, conversationId: widget.conversationId, myUserId: _myUserId);
          if (typing != null) _setRemoteTyping(typing);
          break;
        default:
          break;
      }
    });
  }

  // ─── HTTP: history ────────────────────────────────────────────────────────

  Future<void> _loadMessages() async {
    if (mounted) setState(() { _loading = true; _loadError = null; });
    try {
      final history = await _repo.messages(widget.conversationId);
      if (!mounted) return;
      setState(() {
        // Keep anything received while the history was loading
        var merged = history;
        for (final m in _messages) {
          merged = mergeMessage(merged, m);
        }
        _messages = merged;
        _loading = false;
      });
      _scrollToBottom();
      _markRead();
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadError = chatErrorText(context.l10n, e);
          _loading = false;
        });
      }
    }
  }

  // ─── Read marker ──────────────────────────────────────────────────────────

  /// POST /chat/conversations/:id/read so the list's unread badge clears. Best effort:
  /// a failure only leaves the badge, so it must not interrupt the chat.
  Future<void> _markRead() async {
    if (!mounted) return;
    try {
      await _repo.markRead(widget.conversationId);
    } catch (e) {
      // The next open marks the conversation read again
      debugPrint('[Chat] Marking ${widget.conversationId} read failed: $e');
    }
  }

  /// Shows the typing indicator; hides it again when no typing_stop arrives (the sender left)
  void _setRemoteTyping(bool typing) {
    _remoteTypingTimer?.cancel();
    if (typing) {
      _remoteTypingTimer = Timer(const Duration(seconds: 5), () {
        if (mounted) setState(() => _remoteTyping = false);
      });
    }
    if (_remoteTyping != typing) setState(() => _remoteTyping = typing);
  }

  // ─── Send: REST, so failures are reported ─────────────────────────────────

  Future<void> _sendMessage() async {
    if (_sending || _msgCtrl.text.trim().isEmpty) return;
    setState(() => _sending = true);
    try {
      final saved = await _repo.sendMessage(widget.conversationId, _msgCtrl.text);
      if (!mounted) return;
      _msgCtrl.clear();
      setState(() => _messages = mergeMessage(_messages, saved));
      _scrollToBottom();
    } on ChatException catch (e) {
      // The draft stays in the input so it can be sent again
      if (!mounted) return;
      _showError(chatErrorText(context.l10n, e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }

    // Stop typing indicator
    _typingTimer?.cancel();
    _ws.stopTyping(widget.conversationId);
  }

  // ─── Typing indicator ─────────────────────────────────────────────────────

  void _onTextChanged(String _) {
    final ws = _ws;
    ws.startTyping(widget.conversationId);
    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(seconds: 2), () {
      ws.stopTyping(widget.conversationId);
    });
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.error),
    );
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

  @override
  void dispose() {
    _wsSub?.cancel();
    _typingTimer?.cancel();
    _remoteTypingTimer?.cancel();
    _ws.leaveConversation(widget.conversationId);
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppHeader(title: widget.title ?? l10n.chatScreenTitleFallback, showBack: true),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _loadError != null
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 24),
                                child: Text(_loadError!,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(color: AppColors.error)),
                              ),
                              const SizedBox(height: 12),
                              ElevatedButton(onPressed: _loadMessages, child: Text(l10n.chatScreenRetryButton)),
                            ],
                          ),
                        )
                      : ListView.builder(
                          controller: _scrollCtrl,
                          padding: const EdgeInsets.all(12),
                          itemCount: _messages.length,
                          itemBuilder: (ctx, i) {
                            final msg = _messages[i];
                            final senderId = msg['senderId'] as String? ??
                                msg['sender_id'] as String?;
                            final isMe = senderId == _myUserId;
                            return _MessageBubble(msg: msg, isMe: isMe);
                          },
                        ),
            ),
            // Typing indicator
            if (_remoteTyping)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    l10n.chatScreenTypingIndicator,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 12,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ),
              ),
            // Input bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: AppColors.divider)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _msgCtrl,
                      decoration: InputDecoration(
                        hintText: l10n.chatScreenMessageHint,
                        border: InputBorder.none,
                      ),
                      minLines: 1,
                      maxLines: 5,
                      // ChatService.MAX_MESSAGE_LENGTH (Web/backend/src/chat/chat.service.ts)
                      maxLength: ChatRepository.maxMessageLength,
                      maxLengthEnforcement: MaxLengthEnforcement.enforced,
                      buildCounter: (
                        BuildContext context, {
                        required int currentLength,
                        required bool isFocused,
                        required int? maxLength,
                      }) =>
                          maxLength != null && currentLength > maxLength - 200
                              ? Text('$currentLength/$maxLength',
                                  style: const TextStyle(fontSize: 11, color: AppColors.textSecondary))
                              : null,
                      textInputAction: TextInputAction.send,
                      onChanged: _onTextChanged,
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  _sending
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : IconButton(
                          icon: const Icon(Icons.send, color: AppColors.primary),
                          onPressed: _sendMessage,
                        ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final Map<String, dynamic> msg;
  final bool isMe;

  const _MessageBubble({required this.msg, required this.isMe});

  @override
  Widget build(BuildContext context) {
    final isPending = msg['pending'] == true;
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.72,
        ),
        decoration: BoxDecoration(
          color: isMe
              ? (isPending
                  ? AppColors.primary.withValues(alpha: 0.6)
                  : AppColors.primary)
              : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isMe ? 16 : 4),
            bottomRight: Radius.circular(isMe ? 4 : 16),
          ),
          boxShadow: const [
            BoxShadow(
              color: Colors.black12,
              blurRadius: 4,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: Text(
          msg['content'] as String? ?? '',
          style: TextStyle(
            color: isMe ? Colors.white : AppColors.textPrimary,
            fontSize: 15,
          ),
        ),
      ),
    );
  }
}
