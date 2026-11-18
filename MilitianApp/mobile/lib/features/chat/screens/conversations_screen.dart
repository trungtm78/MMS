import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/widgets/app_header.dart';
import '../chat_texts.dart';
import '../models/conversation.dart';
import '../repositories/chat_repository.dart';
import 'new_conversation_screen.dart';

class ConversationsScreen extends ConsumerStatefulWidget {
  const ConversationsScreen({super.key});

  @override
  ConsumerState<ConversationsScreen> createState() =>
      _ConversationsScreenState();
}

class _ConversationsScreenState extends ConsumerState<ConversationsScreen> {
  List<Conversation> _conversations = [];
  bool _loading = true;
  String? _error;

  late final ChatRepository _repo;

  @override
  void initState() {
    super.initState();
    _repo = ref.read(chatRepositoryProvider);
    _load();
  }

  /// GET /chat/conversations → bare array (Web/backend/src/chat/chat.service.ts).
  /// [silent] keeps the current list on screen while it reloads (back from a chat); a failed
  /// silent reload leaves the list as it was.
  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final conversations = await _repo.conversations();
      if (mounted) {
        setState(() {
          _conversations = conversations;
          _loading = false;
          _error = null;
        });
      }
    } catch (e) {
      if (!mounted) return;
      if (silent) {
        debugPrint('[Chat] Reloading the conversation list failed: $e');
        return;
      }
      setState(() {
        _error = chatErrorText(context.l10n, e);
        _loading = false;
      });
    }
  }

  String _formatTime(DateTime? raw) {
    if (raw == null) return '';
    final dt = raw.toLocal();
    final now = DateTime.now();
    if (dt.day == now.day && dt.month == now.month && dt.year == now.year) {
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    return '${dt.day}/${dt.month}';
  }

  /// Picks the participants (NewConversationScreen), then opens the conversation the server answered:
  /// a new one (201) or the pair's existing direct conversation (200). It is listed once, and the list
  /// reloads when the chat closes.
  Future<void> _startConversation() async {
    final opened = await Navigator.of(context).push<Conversation>(
      MaterialPageRoute(builder: (context) => const NewConversationScreen()),
    );
    if (opened == null || !mounted) return;
    setState(() => _conversations = upsertConversation(_conversations, opened));
    await context.push('${Routes.chat}/${opened.id}', extra: conversationTitle(context.l10n, opened));
    if (mounted) _load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppHeader(title: l10n.chatConversationsScreenTitle),
      floatingActionButton: FloatingActionButton(
        onPressed: _startConversation,
        backgroundColor: AppColors.navy,
        tooltip: l10n.chatConversationsScreenNewTooltip,
        child: const Icon(Icons.edit, color: Colors.white),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Text(_error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: AppColors.error)),
                      ),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: _load,
                        child: Text(l10n.chatConversationsScreenRetryButton),
                      ),
                    ],
                  ),
                )
              : _conversations.isEmpty
                  ? Center(child: Text(l10n.chatConversationsScreenEmpty))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: _conversations.length,
                        separatorBuilder: (context, index) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final conv = _conversations[index];
                          final title = conversationTitle(l10n, conv);
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: AppColors.navy.withValues(alpha: 0.2),
                              child: Icon(
                                conv.isGroup ? Icons.group : Icons.person,
                                color: AppColors.navy,
                              ),
                            ),
                            title: Text(
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontWeight: conv.unreadCount > 0 ? FontWeight.w800 : FontWeight.w600,
                              ),
                            ),
                            subtitle: Text(
                              conv.lastMessage ?? '',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: AppColors.textSecondary),
                            ),
                            trailing: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  _formatTime(conv.lastMessageAt),
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                                if (conv.unreadCount > 0) ...[
                                  const SizedBox(height: 4),
                                  _UnreadBadge(count: conv.unreadCount),
                                ],
                              ],
                            ),
                            onTap: () async {
                              await context.push('${Routes.chat}/${conv.id}', extra: title);
                              // Unread counts and last messages changed while the chat was open
                              if (mounted) _load(silent: true);
                            },
                          );
                        },
                      ),
                    ),
    );
  }
}

/// Messages from others since the caller last read the conversation
class _UnreadBadge extends StatelessWidget {
  final int count;

  const _UnreadBadge({required this.count});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        constraints: const BoxConstraints(minWidth: 20),
        decoration: BoxDecoration(
          color: AppColors.error,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          count > 99 ? '99+' : '$count',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
        ),
      );
}
