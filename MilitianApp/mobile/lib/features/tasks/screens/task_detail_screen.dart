import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../l10n/error_texts.dart';
import '../../../l10n/l10n.dart';
import '../../auth/providers/auth_provider.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../shared/widgets/status_badge.dart';
import '../repositories/tasks_repository.dart';
import '../task_location.dart';
import '../task_report_request.dart';
import '../task_status.dart';

class TaskDetailScreen extends ConsumerStatefulWidget {
  final String taskId;

  const TaskDetailScreen({super.key, required this.taskId});

  @override
  ConsumerState<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends ConsumerState<TaskDetailScreen> {
  Map<String, dynamic>? _task;
  bool _loading = true;
  final _reportCtrl = TextEditingController();
  bool _submitting = false;
  bool _updating = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _loadTask();
  }

  /// GET /tasks/:id returns the task itself, not a {data} envelope
  /// (Web/backend/src/tasks/tasks.service.ts:148-168)
  Future<void> _loadTask() async {
    try {
      final task = await ref.read(tasksRepositoryProvider).task(widget.taskId);
      if (mounted) {
        setState(() {
          _task = task;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _setMessage(String text, {bool isError = false}) {
    _message = text;
    _messageIsError = isError;
  }

  /// PATCH /tasks/:id/progress with a backend status code (UpdateProgressDto); the screen shows the
  /// task the backend returns.
  Future<void> _updateStatus(String newStatus) async {
    if (_updating) return;
    setState(() => _updating = true);
    try {
      final task = await ref.read(tasksRepositoryProvider).updateStatus(widget.taskId, newStatus);
      if (mounted) {
        setState(() {
          _task = task;
          _updating = false;
          _setMessage('Đã cập nhật trạng thái');
        });
      }
    } on TasksException catch (e) {
      if (mounted) {
        setState(() {
          _updating = false;
          _setMessage(e.message ?? errorTextFor(context.l10n, e), isError: true);
        });
      }
    }
  }

  /// POST /tasks/:id/report with SubmitReportDto {description}; the backend then marks the task
  /// completed, so it is read again.
  Future<void> _submitReport() async {
    if (_submitting) return;
    final Map<String, dynamic> body;
    try {
      body = buildTaskReportBody(description: _reportCtrl.text);
    } on ArgumentError catch (e) {
      setState(() => _setMessage('${e.message}', isError: true));
      return;
    }
    setState(() => _submitting = true);
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      await dio.post(
        ApiConstants.submitTaskReport.replaceFirst('{id}', widget.taskId),
        data: body,
      );
      if (mounted) {
        setState(() {
          _submitting = false;
          _setMessage('Đã nộp báo cáo');
          _reportCtrl.clear();
        });
        await _loadTask();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _setMessage(errorTextFor(context.l10n, e), isError: true);
        });
      }
    }
  }

  @override
  void dispose() {
    _reportCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final task = _task;
    final location = task == null ? null : taskLocationText(task);
    final status = task == null ? '' : taskStatusOf(task);
    final deadline = task == null ? '' : formatTaskDeadline(task);
    final overdue = task != null && isTaskOverdue(task, DateTime.now());
    final targets = task == null ? const <String>[] : taskStatusTargets(task);
    final canReport = task != null && canReportTask(task);

    return Scaffold(
      appBar: const AppHeader(title: AppStrings.taskDetail, showBack: true),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : task == null
              ? const Center(child: Text(AppStrings.noData))
              : SafeArea(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Title
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  task['title'] as String? ?? '',
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 4,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    StatusBadge(
                                      label: taskStatusLabel(status),
                                      color: taskStatusColor(status),
                                    ),
                                    if (overdue && status != TaskStatus.overdue)
                                      StatusBadge(
                                        label: taskStatusLabel(TaskStatus.overdue),
                                        color: AppColors.error,
                                      ),
                                    Text(
                                      'Hạn: ${deadline.isEmpty ? '—' : deadline}',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: overdue ? AppColors.error : AppColors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                                if (location != null) ...[
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      const Icon(Icons.location_on_outlined,
                                          size: 16, color: AppColors.textSecondary),
                                      const SizedBox(width: 4),
                                      Expanded(
                                        child: Text(
                                          location,
                                          style: const TextStyle(
                                            fontSize: 13,
                                            color: AppColors.textSecondary,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        // Description
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  AppStrings.taskDescription,
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(task['description'] as String? ?? ''),
                              ],
                            ),
                          ),
                        ),
                        // Update status: only the codes UpdateProgressDto accepts from this status
                        if (targets.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    AppStrings.updateStatus,
                                    style: TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                  const SizedBox(height: 8),
                                  Wrap(
                                    spacing: 8,
                                    children: [
                                      for (final target in targets)
                                        ActionChip(
                                          label: Text(taskStatusLabel(target)),
                                          onPressed: _updating ? null : () => _updateStatus(target),
                                          backgroundColor:
                                              taskStatusColor(target).withValues(alpha: 0.1),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                        // Report
                        if (canReport) ...[
                          const SizedBox(height: 12),
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    AppStrings.submitReport,
                                    style: TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                  const SizedBox(height: 8),
                                  TextFormField(
                                    controller: _reportCtrl,
                                    maxLines: 4,
                                    maxLength: maxTaskReportDescriptionLength,
                                    decoration: const InputDecoration(
                                      hintText: AppStrings.reportContent,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  ElevatedButton(
                                    onPressed: _submitting ? null : _submitReport,
                                    child: Text(
                                      _submitting
                                          ? AppStrings.loading
                                          : AppStrings.submitReport,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                        if (_message != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              _message!,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: _messageIsError ? AppColors.error : AppColors.success,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
    );
  }
}
