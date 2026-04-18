import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  List<Map<String, dynamic>> _notifications = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.get(ApiConstants.notifications);
      final data = resp.data['data'];
      setState(() {
        if (data is List) {
          _notifications = List<Map<String, dynamic>>.from(data);
        } else if (data is Map && data['items'] is List) {
          _notifications = List<Map<String, dynamic>>.from(data['items'] as List);
        }
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = 'Lỗi tải thông báo'; _loading = false; });
    }
  }

  Future<void> _markAllRead() async {
    try {
      final dio = ref.read(dioProvider);
      await dio.post(ApiConstants.notificationReadAll);
      await _load();
    } catch (_) {}
  }

  Future<void> _markRead(String id) async {
    try {
      final dio = ref.read(dioProvider);
      final url = ApiConstants.notificationRead.replaceFirst('{id}', id);
      await dio.post(url);
      setState(() {
        final idx = _notifications.indexWhere((n) => n['id'] == id);
        if (idx != -1) _notifications[idx] = {..._notifications[idx], 'isRead': true};
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final unreadCount = _notifications.where((n) => n['isRead'] != true).length;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: 'Thông báo',
        showBack: true,
        action: unreadCount > 0
            ? TextButton(onPressed: _markAllRead, child: const Text('Đọc hết', style: TextStyle(color: AppColors.navy)))
            : null,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _error != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                  const SizedBox(height: 8),
                  Text(_error!),
                  ElevatedButton(onPressed: _load, child: const Text('Thử lại')),
                ]))
              : _notifications.isEmpty
                  ? const Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.notifications_none, size: 64, color: AppColors.textMuted),
                        SizedBox(height: 8),
                        Text('Chưa có thông báo nào', style: TextStyle(color: AppColors.textMuted)),
                      ]),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        itemCount: _notifications.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, i) {
                          final n = _notifications[i];
                          final isRead = n['isRead'] == true;
                          final createdAt = n['createdAt'] as String?;
                          String timeStr = '';
                          if (createdAt != null) {
                            try {
                              final dt = DateTime.parse(createdAt).toLocal();
                              timeStr = DateFormat('dd/MM HH:mm').format(dt);
                            } catch (_) {}
                          }

                          return ListTile(
                            tileColor: isRead ? null : AppColors.blue.withOpacity(0.05),
                            leading: CircleAvatar(
                              radius: 20,
                              backgroundColor: _notifColor(n['type'] as String? ?? '').withOpacity(0.12),
                              child: Icon(
                                _notifIcon(n['type'] as String? ?? ''),
                                size: 18,
                                color: _notifColor(n['type'] as String? ?? ''),
                              ),
                            ),
                            title: Text(
                              n['title'] as String? ?? '',
                              style: TextStyle(
                                fontWeight: isRead ? FontWeight.w400 : FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                            subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(n['body'] as String? ?? '', maxLines: 2, overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12)),
                              const SizedBox(height: 2),
                              Text(timeStr, style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                            ]),
                            trailing: !isRead
                                ? Container(width: 8, height: 8, decoration: const BoxDecoration(
                                    color: AppColors.blue, shape: BoxShape.circle))
                                : null,
                            onTap: () { if (!isRead) _markRead(n['id'] as String); },
                          );
                        },
                      ),
                    ),
    );
  }

  IconData _notifIcon(String type) {
    switch (type) {
      case 'task': return Icons.assignment_outlined;
      case 'alert': return Icons.warning_outlined;
      case 'leave': return Icons.event_available_outlined;
      case 'attendance': return Icons.access_time;
      default: return Icons.notifications_outlined;
    }
  }

  Color _notifColor(String type) {
    switch (type) {
      case 'task': return AppColors.navy;
      case 'alert': return AppColors.error;
      case 'leave': return AppColors.warning;
      default: return AppColors.blue;
    }
  }
}
