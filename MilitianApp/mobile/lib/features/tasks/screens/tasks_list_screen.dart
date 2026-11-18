import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../repositories/tasks_repository.dart';
import '../task_location.dart';
import '../task_status.dart';
import '../tasks_texts.dart';

// ── Screen ───────────────────────────────────────────────────────────────────
/// The signed-in member's tasks. Tabs and counts follow the backend's tasks.status and deadline
/// (task_status.dart), over every page of GET /tasks.
class TasksListScreen extends ConsumerStatefulWidget {
  const TasksListScreen({super.key});

  @override
  ConsumerState<TasksListScreen> createState() => _TasksListScreenState();
}

class _TasksListScreenState extends ConsumerState<TasksListScreen> {
  List<Map<String, dynamic>> _tasks = [];
  bool _loading = true;
  TaskTab _tab = TaskTab.inProgress;
  String? _error;
  final Set<String> _accepting = {};

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
      final tasks = await ref.read(tasksRepositoryProvider).myTasks();
      if (mounted) {
        setState(() {
          _tasks = tasks;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = tasksErrorText(context.l10n, e);
          _loading = false;
        });
      }
    }
  }

  /// POST /tasks/:id/accept, then reload so the task moves to the in-progress tab.
  Future<void> _accept(String id) async {
    if (_accepting.contains(id)) return;
    setState(() {
      _accepting.add(id);
    });
    try {
      await ref.read(tasksRepositoryProvider).accept(id);
      if (!mounted) return;
      setState(() {
        _accepting.remove(id);
      });
      _showSnack(context.l10n.taskAcceptDone);
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _accepting.remove(id);
      });
      _showSnack(tasksErrorText(context.l10n, e), isError: true);
    }
  }

  /// Opens the detail or report screen; the status may have changed on return.
  Future<void> _open(String path, [Map<String, dynamic>? task]) async {
    await context.push(path, extra: task);
    if (mounted) _load();
  }

  void _showSnack(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.error : AppColors.success,
      ));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final now = DateTime.now();
    final counts = countTaskTabs(_tasks, now);
    final shown = tasksInTab(_tasks, _tab, now);

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
                child: SizedBox(
                  height: 48,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(l10n.taskListTitle,
                          style: const TextStyle(
                            color: AppColors.primary,
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                          )),
                      ),
                    ],
                  ),
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
                  for (final tab in TaskTab.values)
                    _TabBtn(
                      label: taskTabText(l10n, tab),
                      active: tab == _tab,
                      count: counts[tab] ?? 0,
                      onSelect: () => setState(() => _tab = tab),
                    ),
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
                              child: Text(l10n.commonRetryButton, style: const TextStyle(color: Colors.white)),
                            ),
                          ],
                        ),
                      )
                    : shown.isEmpty
                        ? _buildEmpty(l10n)
                        : RefreshIndicator(
                            color: AppColors.navy,
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                              itemCount: shown.length,
                              separatorBuilder: (context, index) => const SizedBox(height: 10),
                              itemBuilder: (context, index) {
                                final task = shown[index];
                                final id = task['id'].toString();
                                return _TaskCard(
                                  task: task,
                                  overdue: isTaskOverdue(task, now),
                                  accepting: _accepting.contains(id),
                                  onTap: () => _open('/tasks/$id', task),
                                  onAccept: canAcceptTask(task) ? () => _accept(id) : null,
                                  onReport: canReportTask(task) ? () => _open('/tasks/$id/report') : null,
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
        const Icon(Icons.assignment_outlined, size: 64, color: AppColors.textSecondary),
        const SizedBox(height: 12),
        Text(l10n.taskListEmpty, style: const TextStyle(fontSize: 16, color: AppColors.textSecondary)),
      ],
    ),
  );
}

// ── Tab Button ────────────────────────────────────────────────────────────────
class _TabBtn extends StatelessWidget {
  final String label;
  final bool active;
  final int count;
  final VoidCallback onSelect;

  const _TabBtn({
    required this.label,
    required this.active,
    required this.count,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onSelect,
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
          count > 0 ? context.l10n.taskListTabWithCount(label, count) : label,
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
  final bool overdue;
  final bool accepting;
  final VoidCallback onTap;
  final VoidCallback? onAccept;
  final VoidCallback? onReport;

  const _TaskCard({
    required this.task,
    required this.overdue,
    required this.accepting,
    required this.onTap,
    this.onAccept,
    this.onReport,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final status = taskStatusOf(task);
    final priority = task['priority'] as String? ?? 'medium';
    final location = taskLocationText(task);
    final deadline = formatTaskDeadline(task);
    final description = task['description'] as String? ?? '';
    final leftBorder = overdue ? AppColors.error : taskStatusColor(status);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border(left: BorderSide(color: leftBorder, width: 4)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
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

            // Meta info (locationName / locationLat / locationLng, deadline)
            if (location != null) ...[
              _MetaRow(Icons.location_on_outlined, location, AppColors.textSecondary),
              const SizedBox(height: 3),
            ],
            _MetaRow(
              Icons.access_time,
              deadline.isEmpty ? l10n.taskNoDeadline : l10n.taskDeadline(deadline),
              overdue ? AppColors.error : AppColors.textSecondary,
            ),

            // Description
            if (description.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                description,
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            const SizedBox(height: 10),

            // Status row + action button
            const Divider(height: 1, color: AppColors.divider),
            const SizedBox(height: 10),
            Row(
              children: [
                _Badge(taskStatusText(l10n, status), taskStatusColor(status)),
                if (overdue && status != TaskStatus.overdue) ...[
                  const SizedBox(width: 6),
                  _Badge(taskStatusText(l10n, TaskStatus.overdue), AppColors.error),
                ],
                const Spacer(),
                if (onAccept != null)
                  _ActionBtn(
                    accepting ? l10n.taskAccepting : l10n.taskAcceptButton,
                    AppColors.navy,
                    false,
                    accepting ? null : onAccept,
                  ),
                if (onReport != null)
                  _ActionBtn(l10n.taskReportButton, AppColors.primary, true, onReport),
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
class _Badge extends StatelessWidget {
  final String label;
  final Color color;
  const _Badge(this.label, this.color);

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
  );
}

// ── Priority Badge ────────────────────────────────────────────────────────────
class _PriorityBadge extends StatelessWidget {
  final String priority;
  const _PriorityBadge(this.priority);

  @override
  Widget build(BuildContext context) {
    final bg = switch (priority) {
      'urgent' => AppColors.error,
      'high' => AppColors.warning,
      'medium' => AppColors.warning.withValues(alpha: 0.5),
      _ => const Color(0xFF94A3B8),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(taskPriorityText(context.l10n, priority),
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white)),
    );
  }
}

// ── Action Button ─────────────────────────────────────────────────────────────
class _ActionBtn extends StatelessWidget {
  final String label;
  final Color color;
  final bool filled;

  /// null: shown disabled
  final VoidCallback? onTap;
  const _ActionBtn(this.label, this.color, this.filled, this.onTap);

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Opacity(
      opacity: onTap == null ? 0.5 : 1,
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
    ),
  );
}
