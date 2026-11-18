import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/files/files.dart';
import '../../../shared/widgets/stored_file_list.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/create_task_request.dart';
import '../models/task_status.dart';
import '../task_texts.dart';
import 'task_report_screen.dart';

class TaskDetailScreen extends ConsumerStatefulWidget {
  final String taskId;
  const TaskDetailScreen({super.key, required this.taskId});

  @override
  ConsumerState<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends ConsumerState<TaskDetailScreen> {
  Map<String, dynamic>? _task;
  bool _loading = true;
  AppFailure? _failure;
  bool _updating = false;

  String get _id => widget.taskId;

  @override
  void initState() {
    super.initState();
    _loadTask();
  }

  /// GET /tasks/:id returns the task row itself, for a task of the caller's scope
  /// (tasks.service.ts getTaskById); anything else is 404 task_not_found
  Future<void> _loadTask() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final resp = await ref.read(dioProvider).get(ApiConstants.taskById.replaceFirst('{id}', _id));
      final body = resp.data;
      if (!mounted) return;
      setState(() {
        _task = body is Map ? Map<String, dynamic>.from(body) : null;
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

  /// POST /tasks/:id/accept: pending, assigned or overdue → in_progress
  Future<void> _acceptTask() async {
    setState(() => _updating = true);
    try {
      await ref.read(dioProvider).post(ApiConstants.acceptTask.replaceFirst('{id}', _id));
      await _loadTask();
      if (!mounted) return;
      _snack(context.l10n.tasksDetailAccepted, AppColors.success);
    } catch (e) {
      if (mounted) {
        _snack(context.l10n.tasksDetailAcceptFailed(failureText(context.l10n, AppFailure.from(e))), AppColors.error);
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  /// Completion takes a report (POST /tasks/:id/report); the task is reloaded once one was sent
  Future<void> _openReport() async {
    final sent = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => TaskReportScreen(taskId: _id)),
    );
    if (sent == true && mounted) await _loadTask();
  }

  void _snack(String message, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), backgroundColor: color));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.tasksDetailTitle, showBack: true),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _failure != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(l10n.tasksDetailLoadFailed(failureText(l10n, _failure!)), textAlign: TextAlign.center),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton(onPressed: _loadTask, child: Text(l10n.commonRetry)),
                ]))
              : _task == null
                  ? Center(child: Text(l10n.tasksDetailNotFound))
                  : _buildTask(l10n, _task!),
    );
  }

  Widget _buildTask(AppLocalizations l10n, Map<String, dynamic> task) {
    final status = task['status'] as String? ?? '';
    final code = task['code'];
    final description = task['description'];
    final location = taskLocationLabel(task);
    final deadline = task['deadline'];
    final assigneeName = task['assigneeName'];
    final militiaCode = task['militiaCode'];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Status + title
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                _Chip(text: taskStatusText(l10n, status), color: AppColors.taskStatusColor(status)),
                // Open past its deadline, whatever the stored status says (tasks.service.ts overdue)
                if (task['overdue'] == true && status != 'overdue') ...[
                  const SizedBox(width: 6),
                  _Chip(text: l10n.tasksStatusOverdue, color: AppColors.error),
                ],
                const Spacer(),
                _PriorityChip(priority: task['priority'] as String? ?? 'medium'),
              ]),
              const SizedBox(height: 12),
              Text(task['title'] as String? ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              if (code is String) ...[
                const SizedBox(height: 4),
                Text(code, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
              ],
            ]),
          ),
        ),
        const SizedBox(height: 12),

        // Details
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l10n.tasksDetailSectionDetails,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
              const Divider(height: 16),
              if (description is String && description.isNotEmpty) ...[
                _DetailRow(label: l10n.tasksDetailDescription, value: description),
                const Divider(height: 12),
              ],
              // locationName, locationLat, locationLng
              if (location != null) ...[
                _DetailRow(label: l10n.tasksDetailLocation, value: location, icon: Icons.location_on_outlined),
                const Divider(height: 12),
              ],
              if (deadline is String) ...[
                _DetailRow(
                  label: l10n.tasksDetailDeadline,
                  value: _formatDate(deadline),
                  icon: Icons.calendar_today_outlined,
                ),
                const Divider(height: 12),
              ],
              _DetailRow(
                label: l10n.tasksDetailCreatedAt,
                value: _formatDate(task['createdAt'] as String? ?? ''),
                icon: Icons.access_time,
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),

        // Assignee: one per task (assigneeName, militiaCode)
        if (assigneeName is String && assigneeName.isNotEmpty) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(l10n.tasksDetailSectionAssignee,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
                const Divider(height: 16),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(radius: 16, child: Icon(Icons.person, size: 16)),
                  title: Text(assigneeName),
                  subtitle: militiaCode is String ? Text(militiaCode) : null,
                ),
              ]),
            ),
          ),
          const SizedBox(height: 12),
        ],

        // Files the creator attached (GET /tasks/:id attachments); the accept and report reloads keep them current
        if (UploadedFile.listFromJson(task['attachments']) case final attachments when attachments.isNotEmpty) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(l10n.tasksDetailSectionAttachments,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
                const Divider(height: 16),
                StoredFileList(files: attachments),
              ]),
            ),
          ),
          const SizedBox(height: 12),
        ],

        // Actions: accept a task not yet under way; report one under way
        if (acceptableTaskStatuses.contains(status))
          _ActionButton(
            label: l10n.tasksDetailAccept,
            icon: Icons.check_circle_outline,
            color: AppColors.navy,
            loading: _updating,
            onTap: _acceptTask,
          ),
        if (status == reportableTaskStatus)
          _ActionButton(
            label: l10n.tasksDetailReport,
            icon: Icons.task_alt,
            color: AppColors.success,
            loading: false,
            onTap: _openReport,
          ),
        const SizedBox(height: 16),
      ],
    );
  }

  String _formatDate(String iso) {
    final dt = DateTime.tryParse(iso);
    return dt == null ? iso : DateFormat('dd/MM/yyyy HH:mm').format(dt.toLocal());
  }
}

class _Chip extends StatelessWidget {
  final String text;
  final Color color;
  const _Chip({required this.text, required this.color});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

class _PriorityChip extends StatelessWidget {
  final String priority;
  const _PriorityChip({required this.priority});
  @override
  Widget build(BuildContext context) {
    final color = switch (priority) {
      'urgent' => AppColors.error,
      'high' => AppColors.warning,
      'low' => AppColors.textMuted,
      _ => AppColors.navy,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
      child: Text(taskPriorityText(context.l10n, priority),
          style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final IconData? icon;
  const _DetailRow({required this.label, required this.value, this.icon});
  @override
  Widget build(BuildContext context) {
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (icon != null) Icon(icon, size: 16, color: AppColors.textSecondary),
      if (icon != null) const SizedBox(width: 8),
      SizedBox(width: 110, child: Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13))),
      Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
    ]);
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool loading;
  final VoidCallback onTap;
  const _ActionButton({required this.label, required this.icon, required this.color, required this.loading, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: SizedBox(
        width: double.infinity,
        height: 50,
        child: ElevatedButton.icon(
          onPressed: loading ? null : onTap,
          style: ElevatedButton.styleFrom(backgroundColor: color, foregroundColor: Colors.white),
          icon: loading
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Icon(icon),
          label: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      ),
    );
  }
}
