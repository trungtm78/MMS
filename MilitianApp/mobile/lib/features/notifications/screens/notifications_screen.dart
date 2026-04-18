import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';

// ── Tab enum ─────────────────────────────────────────────────────────────────
enum _NotifTab { all, task, attendance, system }

// ── Screen ───────────────────────────────────────────────────────────────────
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  List<Map<String, dynamic>> _notifications = [];
  bool _loading = true;
  String? _error;
  _NotifTab _tab = _NotifTab.all;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final res = await dio.get(ApiConstants.notifications);
      final data = (res.data['data'] as List?) ?? [];
      if (mounted) {
        setState(() {
          _notifications = data.cast<Map<String, dynamic>>();
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = 'Lỗi tải thông báo'; _loading = false; });
    }
  }

  Future<void> _markAllRead() async {
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      await dio.post(ApiConstants.markAllNotificationsRead);
      if (mounted) {
        setState(() {
          _notifications = _notifications.map((n) => {...n, 'is_read': true}).toList();
        });
      }
    } catch (_) {}
  }

  void _markRead(String id) {
    setState(() {
      _notifications = _notifications
          .map((n) => n['id'].toString() == id ? {...n, 'is_read': true} : n)
          .toList();
    });
  }

  void _delete(String id) {
    setState(() {
      _notifications = _notifications.where((n) => n['id'].toString() != id).toList();
    });
  }

  List<Map<String, dynamic>> get _filtered {
    switch (_tab) {
      case _NotifTab.task:
        return _notifications.where((n) => n['type'] == 'task').toList();
      case _NotifTab.attendance:
        return _notifications.where((n) => n['type'] == 'attendance').toList();
      case _NotifTab.system:
        return _notifications.where((n) => ['info', 'alert', 'system'].contains(n['type'])).toList();
      case _NotifTab.all:
        return _notifications;
    }
  }

  int _tabCount(_NotifTab t) {
    switch (t) {
      case _NotifTab.all:
        return _notifications.where((n) => !(n['is_read'] as bool? ?? false)).length;
      case _NotifTab.task:
        return _notifications.where((n) => n['type'] == 'task' && !(n['is_read'] as bool? ?? false)).length;
      case _NotifTab.attendance:
        return _notifications.where((n) => n['type'] == 'attendance' && !(n['is_read'] as bool? ?? false)).length;
      case _NotifTab.system:
        return _notifications.where((n) => ['info', 'alert', 'system'].contains(n['type']) && !(n['is_read'] as bool? ?? false)).length;
    }
  }

  @override
  Widget build(BuildContext context) {
    final unread = _notifications.where((n) => !(n['is_read'] as bool? ?? false)).length;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // ── Navy Header ────────────────────────────────────────────────────
          Container(
            color: AppColors.navy,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Thông Báo',
                            style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                          Text(
                            unread > 0 ? '$unread tin chưa đọc' : 'Không có tin mới',
                            style: const TextStyle(color: Colors.white70, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    if (unread > 0)
                      GestureDetector(
                        onTap: _markAllRead,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Text('Đọc hết',
                            style: TextStyle(color: Colors.white, fontSize: 12)),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),

          // ── Tabs ───────────────────────────────────────────────────────────
          Container(
            color: Colors.white,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  _TabBtn('Tất cả', _NotifTab.all, _tab, _tabCount(_NotifTab.all), (t) => setState(() => _tab = t)),
                  _TabBtn('Nhiệm vụ', _NotifTab.task, _tab, _tabCount(_NotifTab.task), (t) => setState(() => _tab = t)),
                  _TabBtn('Chấm công', _NotifTab.attendance, _tab, _tabCount(_NotifTab.attendance), (t) => setState(() => _tab = t)),
                  _TabBtn('Hệ thống', _NotifTab.system, _tab, _tabCount(_NotifTab.system), (t) => setState(() => _tab = t)),
                ],
              ),
            ),
          ),

          // ── Body ───────────────────────────────────────────────────────────
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(_error!, style: const TextStyle(color: AppColors.error)),
                            const SizedBox(height: 12),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy),
                              onPressed: _load,
                              child: const Text('Thử lại', style: TextStyle(color: Colors.white)),
                            ),
                          ],
                        ),
                      )
                    : _filtered.isEmpty
                        ? _buildEmpty()
                        : RefreshIndicator(
                            color: AppColors.navy,
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                              itemCount: _filtered.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 10),
                              itemBuilder: (ctx, i) => _NotifCard(
                                item: _filtered[i],
                                onTap: () => _markRead(_filtered[i]['id'].toString()),
                                onDelete: () => _delete(_filtered[i]['id'].toString()),
                              ),
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty() => Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.notifications_none, size: 64, color: AppColors.textSecondary.withOpacity(0.5)),
        const SizedBox(height: 16),
        const Text('Không có thông báo',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
        const SizedBox(height: 8),
        const Text('Bạn đã xem hết thông báo',
          style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
      ],
    ),
  );
}

// ── Tab Button ────────────────────────────────────────────────────────────────
class _TabBtn extends StatelessWidget {
  final String label;
  final _NotifTab value;
  final _NotifTab current;
  final int count;
  final ValueChanged<_NotifTab> onTap;

  const _TabBtn(this.label, this.value, this.current, this.count, this.onTap);

  @override
  Widget build(BuildContext context) {
    final active = current == value;
    return GestureDetector(
      onTap: () => onTap(value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
        margin: const EdgeInsets.only(right: 16),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: active ? AppColors.navy : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Text(
          count > 0 ? '$label ($count)' : label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: active ? AppColors.navy : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

// ── Notification Card ─────────────────────────────────────────────────────────
class _NotifCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _NotifCard({required this.item, required this.onTap, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final isRead = item['is_read'] as bool? ?? false;
    final isUrgent = item['urgent'] as bool? ?? false;
    final type = item['type'] as String? ?? '';
    final iconData = _iconFor(type);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border(
            left: BorderSide(
              color: isRead ? Colors.transparent : AppColors.blue,
              width: 4,
            ),
          ),
          boxShadow: [
            if (isUrgent)
              BoxShadow(color: AppColors.error.withOpacity(0.3), blurRadius: 0, spreadRadius: 2)
            else
              BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8),
          ],
        ),
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Unread dot
            if (!isRead) ...[
              Padding(
                padding: const EdgeInsets.only(top: 6, right: 6),
                child: Container(
                  width: 8, height: 8,
                  decoration: const BoxDecoration(color: AppColors.blue, shape: BoxShape.circle),
                ),
              ),
            ],

            // Type icon
            Container(
              width: 40, height: 40,
              margin: EdgeInsets.only(right: 12, left: isRead ? 20 : 0),
              decoration: BoxDecoration(
                color: iconData.bg,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(iconData.icon, color: iconData.color, size: 20),
            ),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Flexible(
                              child: Text(
                                item['title'] as String? ?? '',
                                style: TextStyle(
                                  fontWeight: isRead ? FontWeight.w500 : FontWeight.w700,
                                  fontSize: 13,
                                  color: isRead ? AppColors.textSecondary : AppColors.textPrimary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (isUrgent) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppColors.error,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: const Text('Khẩn cấp',
                                  style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ],
                        ),
                      ),
                      GestureDetector(
                        onTap: onDelete,
                        child: Padding(
                          padding: const EdgeInsets.all(4),
                          child: Icon(Icons.delete_outline, size: 16, color: AppColors.textSecondary),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    item['body'] as String? ?? item['message'] as String? ?? '',
                    style: TextStyle(
                      fontSize: 12,
                      color: isRead ? AppColors.textSecondary : AppColors.textPrimary,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    item['time'] as String? ?? item['created_at'] as String? ?? '',
                    style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
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

// ── Icon data helper ──────────────────────────────────────────────────────────
class _IconData {
  final IconData icon;
  final Color color;
  final Color bg;
  const _IconData(this.icon, this.color, this.bg);
}

_IconData _iconFor(String type) {
  switch (type) {
    case 'task':
      return _IconData(Icons.assignment, AppColors.blue, AppColors.blue.withOpacity(0.1));
    case 'attendance':
      return _IconData(Icons.check_circle_outline, AppColors.success, AppColors.success.withOpacity(0.1));
    case 'alert':
    case 'sos':
      return _IconData(Icons.warning_amber_rounded, AppColors.error, AppColors.error.withOpacity(0.1));
    case 'message':
      return _IconData(Icons.chat_bubble_outline, AppColors.purple, AppColors.purple.withOpacity(0.1));
    case 'leave':
      return _IconData(Icons.description_outlined, AppColors.warning, AppColors.warning.withOpacity(0.1));
    case 'kpi':
      return _IconData(Icons.trending_up, AppColors.success, AppColors.success.withOpacity(0.1));
    default:
      return _IconData(Icons.notifications_none, AppColors.blue, AppColors.blue.withOpacity(0.1));
  }
}
