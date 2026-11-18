import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../l10n/error_texts.dart';
import '../../../l10n/l10n.dart';
import '../models/app_notification.dart';
import '../repositories/notifications_repository.dart';

// ── Tab enum ─────────────────────────────────────────────────────────────────
enum _NotifTab { all, task, attendance, system }

// ── Screen ───────────────────────────────────────────────────────────────────
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
  String? _error;
  _NotifTab _tab = _NotifTab.all;

  late final NotificationsRepository _repo;

  bool get _hasMore => _notifications.length < _total;

  @override
  void initState() {
    super.initState();
    _repo = ref.read(notificationsRepositoryProvider);
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final page = await _repo.fetch(page: 1, limit: _pageSize);
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
        _error = context.l10n.notificationsScreenLoadError(_describe(e));
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final page = await _repo.fetch(page: _page + 1, limit: _pageSize);
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
      _showError(_describe(e));
    }
  }

  /// POST /notifications/read-all
  Future<void> _markAllRead() async {
    if (_markingAll) return;
    setState(() => _markingAll = true);
    try {
      await _repo.markAllRead();
      if (!mounted) return;
      final now = DateTime.now();
      setState(() {
        _notifications = [for (final n in _notifications) n.isRead ? n : n.markedRead(now)];
        _markingAll = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _markingAll = false);
      _showError(_describe(e));
    }
  }

  /// PATCH /notifications/:id/read, shown immediately and undone if the call fails
  Future<void> _markRead(AppNotification notification) async {
    if (notification.isRead) return;
    _replace(notification.markedRead());
    try {
      await _repo.markRead(notification.id);
    } catch (e) {
      _replace(notification);
      if (mounted) _showError(_describe(e));
    }
  }

  void _replace(AppNotification updated) {
    if (!mounted) return;
    setState(() {
      _notifications = [for (final n in _notifications) n.id == updated.id ? updated : n];
    });
  }

  /// DELETE /notifications/:id, removed at once and put back if the call fails.
  /// A 404 means the notification is already gone, so it stays removed.
  Future<void> _delete(AppNotification notification) async {
    final index = _notifications.indexWhere((n) => n.id == notification.id);
    if (index < 0) return;
    setState(() {
      _notifications = [..._notifications]..removeAt(index);
      if (_total > 0) _total--;
    });
    try {
      await _repo.delete(notification.id);
    } catch (e) {
      if (!mounted || notificationAlreadyGone(e)) return;
      setState(() {
        // A reload during the call may already show it again
        if (!_notifications.any((n) => n.id == notification.id)) {
          final restored = [..._notifications];
          restored.insert(index <= restored.length ? index : restored.length, notification);
          _notifications = restored;
          _total++;
        }
      });
      _showError(_describe(e));
    }
  }

  String _describe(Object e) =>
      e is FormatException ? context.l10n.notificationsScreenMalformed : errorTextFor(context.l10n, e);

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.error),
    );
  }

  bool _inTab(AppNotification n, _NotifTab tab) {
    switch (tab) {
      case _NotifTab.task:
        return n.type == 'task';
      case _NotifTab.attendance:
        return n.type == 'attendance';
      case _NotifTab.system:
        return ['info', 'alert', 'system'].contains(n.type);
      case _NotifTab.all:
        return true;
    }
  }

  List<AppNotification> get _filtered => _notifications.where((n) => _inTab(n, _tab)).toList();

  int _tabCount(_NotifTab t) => _notifications.where((n) => _inTab(n, t) && !n.isRead).length;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final unread = _notifications.where((n) => !n.isRead).length;
    final filtered = _filtered;

    Widget tab(String label, _NotifTab value) =>
        _TabBtn(label, value, _tab, _tabCount(value), (t) => setState(() => _tab = t));

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
                          Text(l10n.notificationsScreenTitle,
                            style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                          Text(
                            unread > 0 ? l10n.notificationsScreenUnreadCount(unread) : l10n.notificationsScreenNoUnread,
                            style: const TextStyle(color: Colors.white70, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    if (unread > 0)
                      GestureDetector(
                        onTap: _markingAll ? null : _markAllRead,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(l10n.notificationsScreenMarkAllRead,
                            style: const TextStyle(color: Colors.white, fontSize: 12)),
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
                  tab(l10n.notificationsScreenTabAll, _NotifTab.all),
                  tab(l10n.notificationsScreenTabTask, _NotifTab.task),
                  tab(l10n.notificationsScreenTabAttendance, _NotifTab.attendance),
                  tab(l10n.notificationsScreenTabSystem, _NotifTab.system),
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
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 24),
                              child: Text(_error!, textAlign: TextAlign.center,
                                  style: const TextStyle(color: AppColors.error)),
                            ),
                            const SizedBox(height: 12),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy),
                              onPressed: _load,
                              child: Text(l10n.notificationsScreenRetryButton,
                                  style: const TextStyle(color: Colors.white)),
                            ),
                          ],
                        ),
                      )
                    : filtered.isEmpty && !_hasMore
                        ? _buildEmpty(l10n)
                        : RefreshIndicator(
                            color: AppColors.navy,
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                              itemCount: filtered.length + (_hasMore ? 1 : 0),
                              separatorBuilder: (context, index) => const SizedBox(height: 10),
                              itemBuilder: (ctx, i) {
                                if (i == filtered.length) {
                                  return Center(
                                    child: _loadingMore
                                        ? const Padding(
                                            padding: EdgeInsets.all(8),
                                            child: CircularProgressIndicator(color: AppColors.navy),
                                          )
                                        : TextButton(
                                            onPressed: _loadMore,
                                            child: Text(
                                                l10n.notificationsScreenLoadMore(_notifications.length, _total),
                                                style: const TextStyle(color: AppColors.navy)),
                                          ),
                                  );
                                }
                                final n = filtered[i];
                                return _NotifCard(
                                  item: n,
                                  onTap: () => _markRead(n),
                                  onDismiss: () => _delete(n),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty(AppLocalizations l10n) => Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.notifications_none, size: 64, color: AppColors.textSecondary.withValues(alpha: 0.5)),
        const SizedBox(height: 16),
        Text(l10n.notificationsScreenEmptyTitle,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
        const SizedBox(height: 8),
        Text(l10n.notificationsScreenEmptySubtitle,
          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
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
          count > 0 ? context.l10n.notificationsScreenTabWithCount(label, count) : label,
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
  final AppNotification item;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  const _NotifCard({required this.item, required this.onTap, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    final isRead = item.isRead;
    final isUrgent = item.type == 'sos';
    final iconData = _iconFor(item.type);
    final created = item.createdAt;
    final timeStr = created == null ? '' : DateFormat(AppStrings.datetimeFormat).format(created.toLocal());

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
              BoxShadow(color: AppColors.error.withValues(alpha: 0.3), blurRadius: 0, spreadRadius: 2)
            else
              BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8),
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
                                item.title,
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
                                child: Text(context.l10n.notificationsScreenUrgentBadge,
                                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ],
                        ),
                      ),
                      GestureDetector(
                        onTap: onDismiss,
                        child: const Padding(
                          padding: EdgeInsets.all(4),
                          child: Icon(Icons.close, size: 16, color: AppColors.textSecondary),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    item.body,
                    style: TextStyle(
                      fontSize: 12,
                      color: isRead ? AppColors.textSecondary : AppColors.textPrimary,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    timeStr,
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
      return _IconData(Icons.assignment, AppColors.blue, AppColors.blue.withValues(alpha: 0.1));
    case 'attendance':
      return _IconData(Icons.check_circle_outline, AppColors.success, AppColors.success.withValues(alpha: 0.1));
    case 'alert':
    case 'sos':
      return _IconData(Icons.warning_amber_rounded, AppColors.error, AppColors.error.withValues(alpha: 0.1));
    case 'message':
      return _IconData(Icons.chat_bubble_outline, AppColors.purple, AppColors.purple.withValues(alpha: 0.1));
    case 'leave':
      return _IconData(Icons.description_outlined, AppColors.warning, AppColors.warning.withValues(alpha: 0.1));
    case 'kpi':
      return _IconData(Icons.trending_up, AppColors.success, AppColors.success.withValues(alpha: 0.1));
    default:
      return _IconData(Icons.notifications_none, AppColors.blue, AppColors.blue.withValues(alpha: 0.1));
  }
}
