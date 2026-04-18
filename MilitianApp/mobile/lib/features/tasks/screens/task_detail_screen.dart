import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../shared/widgets/status_badge.dart';

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
  String? _message;

  @override
  void initState() {
    super.initState();
    _loadTask();
  }

  Future<void> _loadTask() async {
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final res = await dio.get(
        ApiConstants.taskById.replaceFirst('{id}', widget.taskId),
      );
      if (mounted) {
        setState(() {
          _task = res.data['data'] as Map<String, dynamic>?;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _updateStatus(String newStatus) async {
    // Map Flutter status chips → backend progress values
    final progressMap = {'in-progress': 50, 'completed': 100};
    final progress = progressMap[newStatus] ?? 0;
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      // Use POST /:id/progress (backend route)
      await dio.post(
        ApiConstants.updateTaskProgress.replaceFirst('{id}', widget.taskId),
        data: {'progress': progress, 'note': 'Cập nhật trạng thái: $newStatus'},
      );
      if (mounted) {
        setState(() {
          _task = {...?_task, 'status': newStatus};
          _message = 'Đã cập nhật trạng thái';
        });
      }
    } catch (_) {
      if (mounted) setState(() => _message = AppStrings.errorGeneral);
    }
  }

  Future<void> _submitReport() async {
    if (_reportCtrl.text.trim().isEmpty) return;
    setState(() => _submitting = true);
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      // POST /:id/report
      await dio.post(
        ApiConstants.submitTaskReport.replaceFirst('{id}', widget.taskId),
        data: {'content': _reportCtrl.text.trim()},
      );
      if (mounted) {
        setState(() {
          _submitting = false;
          _message = 'Đã nộp báo cáo';
          _reportCtrl.clear();
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _message = AppStrings.errorGeneral;
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
    return Scaffold(
      appBar: AppHeader(title: AppStrings.taskDetail, showBack: true),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _task == null
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
                                  _task!['title'] as String? ?? '',
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    StatusBadge(
                                      label: _task!['status'] as String? ?? '',
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      'Hạn: ${_task!['deadline'] ?? ''}',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: AppColors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
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
                                Text(_task!['description'] as String? ?? ''),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        // Update status
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
                                  children: ['in-progress', 'completed']
                                      .map(
                                        (s) => ActionChip(
                                          label: Text(_statusLabel(s)),
                                          onPressed: () => _updateStatus(s),
                                          backgroundColor:
                                              AppColors.statusColor(
                                            s,
                                          ).withOpacity(0.1),
                                        ),
                                      )
                                      .toList(),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        // Report
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
                        if (_message != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              _message!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: AppColors.success),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
    );
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'in-progress':
        return AppStrings.statusInProgress;
      case 'completed':
        return AppStrings.statusCompleted;
      default:
        return s;
    }
  }
}
