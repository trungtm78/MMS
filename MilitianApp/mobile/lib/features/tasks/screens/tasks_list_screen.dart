import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';

// ── Screen ───────────────────────────────────────────────────────────────────
class TasksListScreen extends ConsumerStatefulWidget {
  const TasksListScreen({super.key});

  @override
  ConsumerState<TasksListScreen> createState() => _TasksListScreenState();
}

class _TasksListScreenState extends ConsumerState<TasksListScreen> {
  List<Map<String, dynamic>> _tasks = [];
  bool _loading = true;
  String _filter = 'in-progress';
  String? _error;

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
      final res = await dio.get(ApiConstants.tasks);
      final data = (res.data['data'] as List?) ?? [];
      if (mounted) {
        setState(() {
          _tasks = data.cast<Map<String, dynamic>>();
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = 'Lỗi tải nhiệm vụ'; _loading = false; });
    }
  }

  List<Map<String, dynamic>> get _filtered =>
      _filter == 'all' ? _tasks : _tasks.where((t) => t['status'] == _filter).toList();

  int _count(String status) => _tasks.where((t) => t['status'] == status).length;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // ── Yellow header + red border ─────────────────────────────────────
          Container(
            decoration: const BoxDecoration(
              gradient: AppColors.headerGradient,
              border: Border(bottom: BorderSide(color: AppColors.primary, width: 4)),
            ),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text('Nhiệm Vụ Của Tôi',
                        style: TextStyle(
                          color: AppColors.primary,
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        )),
                    ),
                    IconButton(
                      icon: const Icon(Icons.filter_list, color: AppColors.primary),
                      onPressed: () {},
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Filter tabs ────────────────────────────────────────────────────
          Container(
            color: Colors.white,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  _TabBtn('Đang làm', 'in-progress', _filter, _count('in-progress'),
                      (v) => setState(() => _filter = v)),
                  _TabBtn('Chờ tiếp nhận', 'pending', _filter, _count('pending'),
                      (v) => setState(() => _filter = v)),
                  _TabBtn('Đã hoàn thành', 'completed', _filter, _count('completed'),
                      (v) => setState(() => _filter = v)),
                  _TabBtn('Quá hạn', 'overdue', _filter, _count('overdue'),
                      (v) => setState(() => _filter = v)),
                ],
              ),
            ),
          ),

          // ── Task list ──────────────────────────────────────────────────────
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
                              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                              itemCount: _filtered.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 10),
                              itemBuilder: (ctx, i) {
                                final task = _filtered[i];
                                return _TaskCard(
                                  task: task,
                                  onTap: () => context.push('/tasks/${task['id']}', extra: task),
                                  onAccept: task['status'] == 'pending'
                                      ? () => _handleAccept(task['id'].toString())
                                      : null,
                                  onReport: task['status'] == 'in-progress'
                                      ? () => context.push('/tasks/${task['id']}/report')
                                      : null,
                                  onExplain: task['status'] == 'overdue'
                                      ? () {}
                                      : null,
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty() => const Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.assignment_outlined, size: 64, color: AppColors.textSecondary),
        SizedBox(height: 12),
        Text('Không có nhiệm vụ', style: TextStyle(fontSize: 16, color: AppColors.textSecondary)),
      ],
    ),
  );

  Future<void> _handleAccept(String id) async {
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      await dio.post('/tasks/$id/accept');
      _load();
    } catch (_) {}
  }
}

// ── Tab Button ────────────────────────────────────────────────────────────────
class _TabBtn extends StatelessWidget {
  final String label;
  final String value;
  final String current;
  final int count;
  final ValueChanged<String> onSelect;

  const _TabBtn(this.label, this.value, this.current, this.count, this.onSelect);

  @override
  Widget build(BuildContext context) {
    final active = current == value;
    return GestureDetector(
      onTap: () => onSelect(value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
        margin: const EdgeInsets.only(right: 20),
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

// ── Task Card ─────────────────────────────────────────────────────────────────
class _TaskCard extends StatelessWidget {
  final Map<String, dynamic> task;
  final VoidCallback onTap;
  final VoidCallback? onAccept;
  final VoidCallback? onReport;
  final VoidCallback? onExplain;

  const _TaskCard({
    required this.task,
    required this.onTap,
    this.onAccept,
    this.onReport,
    this.onExplain,
  });

  @override
  Widget build(BuildContext context) {
    final status = task['status'] as String? ?? 'pending';
    final priority = task['priority'] as String? ?? 'medium';
    final isOverdue = status == 'overdue';

    // Left border color by status
    Color leftBorder;
    switch (status) {
      case 'overdue':
        leftBorder = AppColors.error;
        break;
      case 'in-progress':
        leftBorder = AppColors.blue;
        break;
      case 'completed':
        leftBorder = AppColors.success;
        break;
      default:
        leftBorder = AppColors.textSecondary;
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border(left: BorderSide(color: leftBorder, width: 4)),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
        ),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top row: code + priority badge
            Row(
              children: [
                Text(
                  task['code'] as String? ?? '',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                    fontFamily: 'monospace',
                  ),
                ),
                const Spacer(),
                _PriorityBadge(priority),
              ],
            ),
            const SizedBox(height: 6),

            // Title
            Text(
              task['title'] as String? ?? '',
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 14,
                color: AppColors.textPrimary,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),

            // Meta info
            _MetaRow(Icons.location_on_outlined, task['location'] as String? ?? '', AppColors.textSecondary),
            const SizedBox(height: 3),
            _MetaRow(
              Icons.access_time,
              task['deadline'] as String? ?? '',
              isOverdue ? AppColors.error : AppColors.textSecondary,
            ),
            const SizedBox(height: 3),
            _MetaRow(Icons.person_outline, task['assignedBy'] as String? ?? task['assigned_by'] as String? ?? '', AppColors.textSecondary),
            const SizedBox(height: 8),

            // Description
            Text(
              task['description'] as String? ?? '',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 10),

            // Status row + action button
            const Divider(height: 1, color: AppColors.divider),
            const SizedBox(height: 10),
            Row(
              children: [
                _StatusBadge(status),
                const Spacer(),
                if (onAccept != null)
                  _ActionBtn('Tiếp nhận', AppColors.navy, false, onAccept!),
                if (onReport != null)
                  _ActionBtn('Báo cáo', AppColors.primary, true, onReport!),
                if (onExplain != null)
                  _ActionBtn('Giải trình', AppColors.warning, true, onExplain!),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Meta Row ──────────────────────────────────────────────────────────────────
class _MetaRow extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;
  const _MetaRow(this.icon, this.text, this.color);

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, size: 12, color: color),
      const SizedBox(width: 4),
      Expanded(
        child: Text(text, style: TextStyle(fontSize: 11, color: color), overflow: TextOverflow.ellipsis),
      ),
    ],
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge(this.status);

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    String label;
    switch (status) {
      case 'pending':
        bg = AppColors.textSecondary.withOpacity(0.1);
        fg = AppColors.textSecondary;
        label = 'Chờ tiếp nhận';
        break;
      case 'in-progress':
        bg = AppColors.blue.withOpacity(0.1);
        fg = AppColors.blue;
        label = 'Đang làm';
        break;
      case 'completed':
        bg = AppColors.success.withOpacity(0.1);
        fg = AppColors.success;
        label = 'Đã hoàn thành';
        break;
      case 'overdue':
        bg = AppColors.error.withOpacity(0.1);
        fg = AppColors.error;
        label = 'Quá hạn';
        break;
      default:
        bg = AppColors.textMuted.withOpacity(0.1);
        fg = AppColors.textMuted;
        label = status;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg)),
    );
  }
}

// ── Priority Badge ────────────────────────────────────────────────────────────
class _PriorityBadge extends StatelessWidget {
  final String priority;
  const _PriorityBadge(this.priority);

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    String label;
    switch (priority) {
      case 'urgent':
      case 'critical':
        bg = AppColors.error;
        fg = Colors.white;
        label = 'Khẩn cấp';
        break;
      case 'high':
        bg = AppColors.warning;
        fg = Colors.white;
        label = 'Cao';
        break;
      case 'medium':
        bg = AppColors.warning.withOpacity(0.5);
        fg = Colors.white;
        label = 'Trung bình';
        break;
      default:
        bg = const Color(0xFF94A3B8);
        fg = Colors.white;
        label = 'Thấp';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg)),
    );
  }
}

// ── Action Button ─────────────────────────────────────────────────────────────
class _ActionBtn extends StatelessWidget {
  final String label;
  final Color color;
  final bool filled;
  final VoidCallback onTap;
  const _ActionBtn(this.label, this.color, this.filled, this.onTap);

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: filled ? color : Colors.transparent,
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: filled ? Colors.white : color,
        )),
    ),
  );
}
