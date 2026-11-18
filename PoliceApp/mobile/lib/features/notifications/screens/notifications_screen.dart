import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../models/notification_models.dart';
import '../providers/notifications_provider.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  static const _pageSize = 20;

  List<AppNotification> _notifications = [];
  int _total = 0;
  int _page = 0;
  bool _loading = true;
  bool _loadingMore = false;
  bool _markingAll = false;
  AppFailure? _failure;

  NotificationsApi get _api => ref.read(notificationsApiProvider);

  bool get _hasMore => _notifications.length < _total;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final page = await _api.fetch(page: 1, limit: _pageSize);
      if (!mounted) return;
      setState(() {
        _notifications = page.items;
        _total = page.total;
        _page = page.page;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _failure = AppFailure.from(e);
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final page = await _api.fetch(page: _page + 1, limit: _pageSize);
      if (!mounted) return;
      final shown = _notifications.map((n) => n.id).toSet();
      setState(() {
        _notifications = [..._notifications, ...page.items.where((n) => !shown.contains(n.id))];
        _total = page.total;
        _page = page.page;
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
      _showFailure(e);
    }
  }

  Future<void> _markAllRead() async {
    if (_markingAll) return;
    setState(() => _markingAll = true);
    try {
      await _api.markAllRead();
      if (!mounted) return;
      final now = DateTime.now();
      setState(() {
        _notifications = [for (final n in _notifications) n.isRead ? n : n.markedRead(now)];
        _markingAll = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _markingAll = false);
      _showFailure(e);
    }
  }

  Future<void> _markRead(AppNotification notification) async {
    if (notification.isRead) return;
    _replace(notification.markedRead());
    try {
      await _api.markRead(notification.id);
    } catch (e) {
      // Put the unread state back so the list matches the server
      _replace(notification);
      if (mounted) _showFailure(e);
    }
  }

  void _replace(AppNotification updated) {
    if (!mounted) return;
    setState(() {
      _notifications = [for (final n in _notifications) n.id == updated.id ? updated : n];
    });
  }

  void _showFailure(Object error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(failureText(context.l10n, AppFailure.from(error))),
        backgroundColor: AppColors.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final hasUnread = _notifications.any((n) => !n.isRead);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: l10n.notificationsTitle,
        showBack: true,
        action: hasUnread
            ? TextButton(
                onPressed: _markingAll ? null : _markAllRead,
                child: Text(l10n.notificationsMarkAllRead, style: const TextStyle(color: AppColors.navy)),
              )
            : null,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _failure != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(
                      l10n.notificationsLoadFailed(failureText(l10n, _failure!)),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
                ]))
              : _notifications.isEmpty
                  ? Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.notifications_none, size: 64, color: AppColors.textMuted),
                        const SizedBox(height: 8),
                        Text(l10n.notificationsEmpty, style: const TextStyle(color: AppColors.textMuted)),
                      ]),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        itemCount: _notifications.length + (_hasMore ? 1 : 0),
                        separatorBuilder: (context, index) => const Divider(height: 1),
                        itemBuilder: (context, i) {
                          if (i == _notifications.length) {
                            return Padding(
                              padding: const EdgeInsets.all(12),
                              child: Center(
                                child: _loadingMore
                                    ? const CircularProgressIndicator(color: AppColors.navy)
                                    : TextButton(
                                        onPressed: _loadMore,
                                        child: Text(
                                          l10n.notificationsLoadMore(_notifications.length, _total),
                                          style: const TextStyle(color: AppColors.navy),
                                        ),
                                      ),
                              ),
                            );
                          }
                          final n = _notifications[i];
                          final created = n.createdAt;
                          final timeStr =
                              created == null ? '' : DateFormat('dd/MM HH:mm').format(created.toLocal());

                          return ListTile(
                            tileColor: n.isRead ? null : AppColors.blue.withValues(alpha: 0.05),
                            leading: CircleAvatar(
                              radius: 20,
                              backgroundColor: _notifColor(n.type).withValues(alpha: 0.12),
                              child: Icon(_notifIcon(n.type), size: 18, color: _notifColor(n.type)),
                            ),
                            title: Text(
                              n.title,
                              style: TextStyle(
                                fontWeight: n.isRead ? FontWeight.w400 : FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                            subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(n.body, maxLines: 2, overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12)),
                              const SizedBox(height: 2),
                              Text(timeStr, style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                            ]),
                            trailing: !n.isRead
                                ? Container(width: 8, height: 8, decoration: const BoxDecoration(
                                    color: AppColors.blue, shape: BoxShape.circle))
                                : null,
                            onTap: () => _markRead(n),
                          );
                        },
                      ),
                    ),
    );
  }

  IconData _notifIcon(String type) => switch (type) {
        'task' => Icons.assignment_outlined,
        'alert' => Icons.warning_outlined,
        'leave' => Icons.event_available_outlined,
        'attendance' => Icons.access_time,
        _ => Icons.notifications_outlined,
      };

  Color _notifColor(String type) => switch (type) {
        'task' => AppColors.navy,
        'alert' => AppColors.error,
        'leave' => AppColors.warning,
        _ => AppColors.blue,
      };
}
