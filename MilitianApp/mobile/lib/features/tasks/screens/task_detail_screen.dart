import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../files/authenticated_image.dart';
import '../../files/uploaded_file.dart';
import '../repositories/tasks_repository.dart';
import '../task_location.dart';
import '../task_status.dart';
import '../tasks_texts.dart';

/// One task of the caller (GET /tasks/:id) with the files its author attached. The assignee starts it
/// with POST /tasks/:id/accept and completes it with the report screen (POST /tasks/:id/report); the
/// task is read again when the report screen closes.
class TaskDetailScreen extends ConsumerStatefulWidget {
  final String taskId;

  const TaskDetailScreen({super.key, required this.taskId});

  @override
  ConsumerState<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends ConsumerState<TaskDetailScreen> {
  Map<String, dynamic>? _task;
  bool _loading = true;
  Object? _loadError;
  bool _accepting = false;

  @override
  void initState() {
    super.initState();
    _loadTask();
  }

  Future<void> _loadTask() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final task = await ref.read(tasksRepositoryProvider).task(widget.taskId);
      if (!mounted) return;
      setState(() {
        _task = task;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e;
        _loading = false;
      });
    }
  }

  void _showSnack(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.error : AppColors.success,
      ));
  }

  /// POST /tasks/:id/accept answers the task, now under way
  Future<void> _accept() async {
    if (_accepting) return;
    setState(() => _accepting = true);
    try {
      final task = await ref.read(tasksRepositoryProvider).accept(widget.taskId);
      if (!mounted) return;
      setState(() {
        _task = task;
        _accepting = false;
      });
      _showSnack(context.l10n.taskAcceptDone);
    } catch (e) {
      if (!mounted) return;
      setState(() => _accepting = false);
      _showSnack(tasksErrorText(context.l10n, e), isError: true);
    }
  }

  /// The report completes the task: read it again when the report screen closes
  Future<void> _report() async {
    await context.push('/tasks/${widget.taskId}/report');
    if (mounted) await _loadTask();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final task = _task;
    final error = _loadError;
    return Scaffold(
      appBar: AppHeader(title: l10n.taskDetailTitle, showBack: true),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : task == null
              ? _LoadError(
                  message: error == null ? l10n.taskIssueMalformedResponse : tasksErrorText(l10n, error),
                  onRetry: _loadTask,
                )
              : SafeArea(
                  child: RefreshIndicator(
                    onRefresh: _loadTask,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        _SummaryCard(task: task),
                        const SizedBox(height: 12),
                        _DescriptionCard(task: task),
                        if (taskAttachmentsOf(task) case final files when files.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          _AttachmentsCard(files: files),
                        ],
                        if (canAcceptTask(task) || canReportTask(task)) ...[
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              if (canAcceptTask(task))
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: _accepting ? null : _accept,
                                    child: Text(_accepting ? l10n.taskAccepting : l10n.taskAcceptButton),
                                  ),
                                ),
                              if (canAcceptTask(task) && canReportTask(task)) const SizedBox(width: 12),
                              if (canReportTask(task))
                                Expanded(
                                  child: ElevatedButton(
                                    onPressed: _accepting ? null : _report,
                                    child: Text(l10n.taskReportButton),
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
    );
  }
}

class _LoadError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _LoadError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.error)),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: onRetry, child: Text(context.l10n.commonRetryButton)),
            ],
          ),
        ),
      );
}

class _SummaryCard extends StatelessWidget {
  final Map<String, dynamic> task;
  const _SummaryCard({required this.task});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final status = taskStatusOf(task);
    final deadline = formatTaskDeadline(task);
    final overdue = isTaskOverdue(task, DateTime.now());
    final location = taskLocationText(task);
    final type = task['type'];
    final priority = task['priority'];
    final code = task['code'];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (code is String && code.isNotEmpty)
              Text(code,
                  style: const TextStyle(fontSize: 11, color: AppColors.textSecondary, fontFamily: 'monospace')),
            Text(
              task['title'] as String? ?? '',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                StatusBadge(label: taskStatusText(l10n, status), color: taskStatusColor(status)),
                if (overdue && status != TaskStatus.overdue)
                  StatusBadge(label: taskStatusText(l10n, TaskStatus.overdue), color: AppColors.error),
                Text(
                  deadline.isEmpty ? l10n.taskNoDeadline : l10n.taskDeadline(deadline),
                  style: TextStyle(fontSize: 12, color: overdue ? AppColors.error : AppColors.textSecondary),
                ),
              ],
            ),
            if (type is String && type.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(l10n.taskDetailType(taskTypeText(l10n, type)),
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            ],
            if (priority is String && priority.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(l10n.taskDetailPriority(taskPriorityText(l10n, priority)),
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            ],
            if (location != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.location_on_outlined, size: 16, color: AppColors.textSecondary),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(location, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DescriptionCard extends StatelessWidget {
  final Map<String, dynamic> task;
  const _DescriptionCard({required this.task});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final raw = task['description'];
    final description = raw is String ? raw.trim() : '';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.taskDetailDescription,
                style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textSecondary)),
            const SizedBox(height: 8),
            Text(
              description.isEmpty ? l10n.taskDetailNoDescription : description,
              style: description.isEmpty ? const TextStyle(color: AppColors.textMuted) : null,
            ),
          ],
        ),
      ),
    );
  }
}

/// Files the task's author attached: images shown with the user's session, other files by name
class _AttachmentsCard extends StatelessWidget {
  final List<UploadedFile> files;
  const _AttachmentsCard({required this.files});

  @override
  Widget build(BuildContext context) {
    final images = [for (final f in files) if (f.isImage) f];
    final others = [for (final f in files) if (!f.isImage) f];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.l10n.taskDetailAttachments,
                style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textSecondary)),
            const SizedBox(height: 8),
            if (images.isNotEmpty)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final image in images)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: AuthenticatedImage(fileId: image.id, width: 96, height: 96, semanticLabel: image.name),
                    ),
                ],
              ),
            for (final file in others)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  children: [
                    const Icon(Icons.insert_drive_file_outlined, size: 18, color: AppColors.textSecondary),
                    const SizedBox(width: 6),
                    Expanded(child: Text(file.name, overflow: TextOverflow.ellipsis)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
