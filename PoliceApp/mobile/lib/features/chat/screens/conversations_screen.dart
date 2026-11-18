import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../chat_labels.dart';
import '../providers/chat_provider.dart';
import '../models/chat_models.dart';
import 'new_conversation_screen.dart';

class ConversationsScreen extends ConsumerWidget {
  const ConversationsScreen({super.key});

  /// POST /chat/conversations answers with the new conversation or the pair's existing one;
  /// either way it opens, and the list is fetched again instead of adding an entry
  Future<void> _createConversation(BuildContext context, WidgetRef ref) async {
    final created = await Navigator.of(context).push<Conversation>(
      MaterialPageRoute(builder: (_) => const NewConversationScreen()),
    );
    if (created == null || !context.mounted) return;
    ref.invalidate(conversationsProvider);
    await _openConversation(context, ref, created.id);
  }

  /// Opens the chat, then refreshes the list so the unread badge reflects the read marker
  Future<void> _openConversation(BuildContext context, WidgetRef ref, String id) async {
    await context.push('${Routes.caChat}/$id');
    ref.invalidate(conversationsProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final convAsync = ref.watch(conversationsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: l10n.chatListTitle,
        showBack: false,
        action: IconButton(
          tooltip: l10n.chatListNewConversation,
          icon: const Icon(Icons.add),
          onPressed: () => _createConversation(context, ref),
        ),
      ),
      body: convAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.navy),
        ),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppColors.error, size: 48),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(l10n.chatListLoadFailed(failureText(l10n, AppFailure.from(e))),
                    textAlign: TextAlign.center),
              ),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: () => ref.invalidate(conversationsProvider),
                child: Text(l10n.commonRetry),
              ),
            ],
          ),
        ),
        data: (conversations) {
          if (conversations.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.chat_bubble_outline, size: 64, color: AppColors.textMuted),
                  const SizedBox(height: 12),
                  Text(
                    l10n.chatListEmpty,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 15),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.chatListEmptyHint,
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                  ),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(conversationsProvider),
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: conversations.length,
              separatorBuilder: (context, index) => const Divider(height: 1, indent: 72),
              itemBuilder: (ctx, i) {
                final conv = conversations[i];
                return _ConversationTile(
                  conversation: conv,
                  onTap: () => _openConversation(context, ref, conv.id),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  final Conversation conversation;
  final VoidCallback onTap;

  const _ConversationTile({required this.conversation, required this.onTap});

  String _formatTime(String? isoTime) {
    final dt = isoTime == null ? null : DateTime.tryParse(isoTime)?.toLocal();
    if (dt == null) return '';
    final now = DateTime.now();
    if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final unread = conversation.unreadCount;
    return ListTile(
      onTap: onTap,
      leading: CircleAvatar(
        backgroundColor: AppColors.navy.withValues(alpha: 0.12),
        child: Icon(
          conversation.isGroup ? Icons.group : Icons.person,
          color: AppColors.navy,
        ),
      ),
      title: Row(children: [
        Expanded(
          child: Text(
            conversationTitle(l10n, conversation),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontWeight: unread > 0 ? FontWeight.w800 : FontWeight.w600, fontSize: 14),
          ),
        ),
        Text(_formatTime(conversation.lastMessageAt),
            style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
      ]),
      subtitle: Text(
        conversation.lastMessage ?? conversationTypeLabel(l10n, conversation),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 12,
          color: unread > 0 ? AppColors.textPrimary : AppColors.textSecondary,
        ),
      ),
      trailing: unread > 0
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.error,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                unread > 99 ? l10n.chatListUnreadOverflow : '$unread',
                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            )
          : const Icon(Icons.chevron_right, color: AppColors.textMuted),
    );
  }
}
