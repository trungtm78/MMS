import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../../../shared/services/websocket_service.dart';
import '../../../shared/widgets/app_header.dart';

class ChatScreen extends ConsumerStatefulWidget {
  final String conversationId;

  const ChatScreen({super.key, required this.conversationId});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _remoteTyping = false;
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  String? _myUserId;
  StreamSubscription<WsMessage>? _wsSub;
  Timer? _typingTimer;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final storage = ref.read(secureStorageProvider);
    _myUserId = await storage.getUserId();
    await _loadMessages();
    _connectWebSocket();
  }

  // ─── WebSocket ────────────────────────────────────────────────────────────

  void _connectWebSocket() {
    final ws = ref.read(webSocketServiceProvider);
    ws.connect().then((_) => ws.joinConversation(widget.conversationId));

    _wsSub = ws.stream.listen((msg) {
      if (!mounted) return;
      switch (msg.event) {
        case WsEvent.messageReceived:
          final data = msg.data as Map<String, dynamic>?;
          if (data != null && data['conversationId'] == widget.conversationId) {
            setState(() {
              // Remove optimistic copy if present
              _messages.removeWhere((m) =>
                  m['pending'] == true && m['content'] == data['content']);
              _messages.add(data);
            });
            _scrollToBottom();
            ws.markRead(widget.conversationId);
          }
          break;
        case WsEvent.userTyping:
          final d = msg.data as Map<String, dynamic>?;
          if (d != null && d['userId'] != _myUserId) {
            setState(() => _remoteTyping = true);
          }
          break;
        case WsEvent.userStoppedTyping:
          setState(() => _remoteTyping = false);
          break;
        default:
          break;
      }
    });
  }

  // ─── HTTP fallback: load initial messages ─────────────────────────────────

  Future<void> _loadMessages() async {
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final url = ApiConstants.messages.replaceFirst(
        '{id}',
        widget.conversationId,
      );
      final res = await dio.get(url);
      final data = (res.data['data'] as List?) ?? [];
      if (mounted) {
        setState(() {
          _messages.addAll(data.cast<Map<String, dynamic>>());
          _loading = false;
        });
        _scrollToBottom();
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ─── Send message via WebSocket ───────────────────────────────────────────

  void _sendMessage() {
    final text = _msgCtrl.text.trim();
    if (text.isEmpty) return;
    _msgCtrl.clear();

    // Optimistic update
    setState(() {
      _messages.add({
        'id': 'tmp_${DateTime.now().millisecondsSinceEpoch}',
        'senderId': _myUserId,
        'sender_id': _myUserId,
        'content': text,
        'sentAt': DateTime.now().toIso8601String(),
        'pending': true,
      });
    });
    _scrollToBottom();

    // Send via WebSocket
    ref.read(webSocketServiceProvider).sendMessage(
          conversationId: widget.conversationId,
          content: text,
        );

    // Stop typing indicator
    _typingTimer?.cancel();
    ref.read(webSocketServiceProvider).stopTyping(widget.conversationId);
  }

  // ─── Typing indicator ─────────────────────────────────────────────────────

  void _onTextChanged(String _) {
    final ws = ref.read(webSocketServiceProvider);
    ws.startTyping(widget.conversationId);
    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(seconds: 2), () {
      ws.stopTyping(widget.conversationId);
    });
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
    ref.read(webSocketServiceProvider).leaveConversation(widget.conversationId);
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppHeader(title: AppStrings.commanderKV, showBack: true),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
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
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Đang nhập...',
                    style: TextStyle(
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
                      decoration: const InputDecoration(
                        hintText: AppStrings.typeMessage,
                        border: InputBorder.none,
                      ),
                      maxLines: null,
                      textInputAction: TextInputAction.send,
                      onChanged: _onTextChanged,
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  IconButton(
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
