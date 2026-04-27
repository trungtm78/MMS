import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/router/routes.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../models/chat_models.dart';

class ConversationsScreen extends ConsumerWidget {
  const ConversationsScreen({super.key});

  Future<void> _createConversation(BuildContext context, WidgetRef ref) async {
    final titleCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cuộc trò chuyện mới'),
        content: TextField(
          controller: titleCtrl,
          decoration: const InputDecoration(
            labelText: 'Tiêu đề (tùy chọn)',
            hintText: 'Nhập tiêu đề...',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Hủy'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy),
            child: const Text('TẠO'),
          ),
        ],
      ),
    );
    titleCtrl.dispose();

    if (confirmed == true) {
      try {
        final dio = ref.read(dioProvider);
        await dio.post(ApiConstants.conversations, data: {
          'conversationType': 'direct',
          if (titleCtrl.text.trim().isNotEmpty) 'title': titleCtrl.text.trim(),
        });
        ref.invalidate(conversationsProvider);
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Lỗi: $e'), backgroundColor: AppColors.error),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final convAsync = ref.watch(conversationsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: 'Tin nhắn',
        showBack: false,
        action: IconButton(
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
              Text('Lỗi tải cuộc trò chuyện: $e'),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: () => ref.invalidate(conversationsProvider),
                child: const Text('Thử lại'),
              ),
            ],
          ),
        ),
        data: (conversations) {
          if (conversations.isEmpty) {
            return const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.chat_bubble_outline, size: 64, color: AppColors.textMuted),
                  SizedBox(height: 12),
                  Text(
                    'Chưa có cuộc trò chuyện',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 15),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Nhấn + để tạo cuộc trò chuyện mới',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 13),
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
              separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
              itemBuilder: (ctx, i) {
                final conv = conversations[i];
                return _ConversationTile(
                  conversation: conv,
                  onTap: () => context.push('${Routes.caChat}/${conv.id}'),
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

  String _typeLabel(String type) {
    switch (type) {
      case 'group':
        return 'Nhóm';
      case 'broadcast':
        return 'Thông báo';
      default:
        return 'Trực tiếp';
    }
  }

  String _formatTime(String? isoTime) {
    if (isoTime == null || isoTime.isEmpty) return '';
    try {
      final dt = DateTime.parse(isoTime).toLocal();
      final now = DateTime.now();
      if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
        return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      }
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}';
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = conversation.title?.isNotEmpty == true
        ? conversation.title!
        : _typeLabel(conversation.conversationType);
    return ListTile(
      onTap: onTap,
      leading: CircleAvatar(
        backgroundColor: AppColors.navy.withOpacity(0.12),
        child: Icon(
          conversation.conversationType == 'group'
              ? Icons.group
              : Icons.person,
          color: AppColors.navy,
        ),
      ),
      title: Row(children: [
        Expanded(
          child: Text(title,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        ),
        Text(_formatTime(conversation.lastMessageAt),
            style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
      ]),
      subtitle: Text(
        conversation.lastMessage ?? _typeLabel(conversation.conversationType),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
      ),
      trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
    );
  }
}
