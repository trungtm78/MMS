import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/router/routes.dart';
import '../../auth/providers/auth_provider.dart';
import '../../../shared/widgets/app_header.dart';

class ConversationsScreen extends ConsumerStatefulWidget {
  const ConversationsScreen({super.key});

  @override
  ConsumerState<ConversationsScreen> createState() =>
      _ConversationsScreenState();
}

class _ConversationsScreenState extends ConsumerState<ConversationsScreen> {
  List<Map<String, dynamic>> _conversations = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final res = await dio.get(ApiConstants.conversations);
      final data = (res.data['data'] as List?) ?? [];
      if (mounted) {
        setState(() {
          _conversations = data.cast<Map<String, dynamic>>();
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = AppStrings.errorGeneral;
          _loading = false;
        });
      }
    }
  }

  String _participantName(Map<String, dynamic> conv) {
    final participants = conv['participants'] as List?;
    if (participants != null && participants.isNotEmpty) {
      final first = participants.first as Map<String, dynamic>;
      return first['fullName'] as String? ?? AppStrings.commanderKV;
    }
    return conv['name'] as String? ?? AppStrings.commanderKV;
  }

  String _formatTime(dynamic raw) {
    if (raw == null) return '';
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      final now = DateTime.now();
      if (dt.day == now.day && dt.month == now.month && dt.year == now.year) {
        return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      }
      return '${dt.day}/${dt.month}';
    } catch (_) {
      return '';
    }
  }

  Future<void> _showNewConversationDialog() async {
    final titleCtrl = TextEditingController();
    final participantsCtrl = TextEditingController();
    String? errorMsg;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Tạo cuộc trò chuyện'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: participantsCtrl,
                decoration: const InputDecoration(
                  labelText: 'ID người tham gia (phân cách bằng dấu phẩy) *',
                  hintText: 'userId1, userId2',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: titleCtrl,
                decoration: const InputDecoration(
                  labelText: 'Tiêu đề nhóm (tùy chọn)',
                ),
              ),
              if (errorMsg != null) ...[
                const SizedBox(height: 8),
                Text(errorMsg!, style: const TextStyle(color: AppColors.error, fontSize: 12)),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              onPressed: () async {
                final rawIds = participantsCtrl.text.trim();
                if (rawIds.isEmpty) {
                  setDialogState(() => errorMsg = 'Vui lòng nhập ID người tham gia');
                  return;
                }
                final participantIds = rawIds
                    .split(',')
                    .map((s) => s.trim())
                    .where((s) => s.isNotEmpty)
                    .toList();
                try {
                  final storage = ref.read(secureStorageProvider);
                  final dio = DioClient.getInstance(storage);
                  await dio.post(ApiConstants.conversations, data: {
                    'participantIds': participantIds,
                    if (titleCtrl.text.trim().isNotEmpty) 'title': titleCtrl.text.trim(),
                    'conversationType': participantIds.length == 1 ? 'direct' : 'group',
                  });
                  if (ctx.mounted) Navigator.of(ctx).pop();
                  _load();
                } catch (_) {
                  setDialogState(() => errorMsg = 'Tạo cuộc trò chuyện thất bại');
                }
              },
              child: const Text('Tạo'),
            ),
          ],
        ),
      ),
    );

    titleCtrl.dispose();
    participantsCtrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppHeader(title: AppStrings.chatTitle),
      floatingActionButton: FloatingActionButton(
        onPressed: _showNewConversationDialog,
        backgroundColor: AppColors.navy,
        child: const Icon(Icons.edit, color: Colors.white),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(_error!,
                          style: const TextStyle(color: AppColors.error)),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: _load,
                        child: const Text(AppStrings.retry),
                      ),
                    ],
                  ),
                )
              : _conversations.isEmpty
                  ? const Center(child: Text(AppStrings.noConversations))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: _conversations.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (ctx, i) {
                          final conv = _conversations[i];
                          final unread = conv['unreadCount'] as int? ?? 0;
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: AppColors.navy.withOpacity(0.2),
                              child: const Icon(Icons.person,
                                  color: AppColors.navy),
                            ),
                            title: Text(
                              _participantName(conv),
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            subtitle: Text(
                              conv['lastMessage'] as String? ?? '',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: AppColors.textSecondary),
                            ),
                            trailing: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  _formatTime(conv['lastMessageAt']),
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                                if (unread > 0)
                                  Container(
                                    margin: const EdgeInsets.only(top: 4),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    decoration: const BoxDecoration(
                                      color: AppColors.primary,
                                      borderRadius:
                                          BorderRadius.all(Radius.circular(10)),
                                    ),
                                    child: Text(
                                      '$unread',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                            onTap: () => context.push(
                              '${Routes.chat}/${conv['id']}',
                              extra: conv,
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
