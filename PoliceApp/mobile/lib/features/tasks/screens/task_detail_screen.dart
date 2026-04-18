import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class TaskDetailScreen extends ConsumerStatefulWidget {
  final String taskId;
  const TaskDetailScreen({super.key, required this.taskId});

  @override
  ConsumerState<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends ConsumerState<TaskDetailScreen> {
  Map<String, dynamic>? _task;
  bool _loading = true;
  String? _error;
  bool _updating = false;

  @override
  void initState() {
    super.initState();
    _loadTask();
  }

  Future<void> _loadTask() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      final url = ApiConstants.taskById.replaceFirst('{id}', widget.taskId);
      final resp = await dio.get(url);
      setState(() { _task = resp.data['data'] as Map<String, dynamic>?; _loading = false; });
    } catch (e) {
      setState(() { _error = 'Lỗi tải nhiệm vụ'; _loading = false; });
    }
  }

  Future<void> _acceptTask() async {
    setState(() { _updating = true; });
    try {
      final dio = ref.read(dioProvider);
      final url = ApiConstants.acceptTask.replaceFirst('{id}', widget.taskId);
      await dio.post(url);
      await _loadTask();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã tiếp nhận nhiệm vụ'), backgroundColor: AppColors.success),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lỗi tiếp nhận'), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() { _updating = false; });
    }
  }

  Future<void> _updateProgress(String status) async {
    setState(() { _updating = true; });
    try {
      final dio = ref.read(dioProvider);
      final url = ApiConstants.taskProgress.replaceFirst('{id}', widget.taskId);
      await dio.patch(url, data: {'status': status});
      await _loadTask();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Cập nhật trạng thái: ${AppColors.taskStatusLabel(status)}'),
            backgroundColor: AppColors.success),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lỗi cập nhật'), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() { _updating = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: 'Chi tiết nhiệm vụ', showBack: true),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _error != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                  const SizedBox(height: 8),
                  Text(_error!),
                  const SizedBox(height: 8),
                  ElevatedButton(onPressed: _loadTask, child: const Text('Thử lại')),
                ]))
              : _task == null
                  ? const Center(child: Text('Không tìm thấy nhiệm vụ'))
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        // Status + title
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                _StatusChip(status: _task!['status'] as String? ?? ''),
                                const Spacer(),
                                _PriorityChip(priority: _task!['priority'] as String? ?? 'normal'),
                              ]),
                              const SizedBox(height: 12),
                              Text(_task!['title'] as String? ?? '',
                                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                              if (_task!['code'] != null) ...[
                                const SizedBox(height: 4),
                                Text(_task!['code'] as String,
                                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
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
                              const Text('CHI TIẾT', style: TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
                              const Divider(height: 16),
                              if (_task!['description'] != null) ...[
                                _DetailRow(label: 'Mô tả', value: _task!['description'] as String),
                                const Divider(height: 12),
                              ],
                              if (_task!['location'] != null) ...[
                                _DetailRow(
                                  label: 'Địa điểm',
                                  value: _task!['location'] as String,
                                  icon: Icons.location_on_outlined,
                                ),
                                const Divider(height: 12),
                              ],
                              if (_task!['dueDate'] != null) ...[
                                _DetailRow(
                                  label: 'Hạn hoàn thành',
                                  value: _formatDate(_task!['dueDate'] as String),
                                  icon: Icons.calendar_today_outlined,
                                ),
                                const Divider(height: 12),
                              ],
                              _DetailRow(
                                label: 'Ngày tạo',
                                value: _formatDate(_task!['createdAt'] as String? ?? ''),
                                icon: Icons.access_time,
                              ),
                            ]),
                          ),
                        ),
                        const SizedBox(height: 12),

                        // Assignees
                        if (_task!['assignees'] != null && (_task!['assignees'] as List).isNotEmpty) ...[
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                const Text('ĐƯỢC GIAO', style: TextStyle(
                                    fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
                                const Divider(height: 16),
                                ...(_task!['assignees'] as List).map((a) {
                                  final assignee = a as Map<String, dynamic>;
                                  return ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    leading: const CircleAvatar(radius: 16, child: Icon(Icons.person, size: 16)),
                                    title: Text(assignee['fullName'] as String? ?? ''),
                                    subtitle: Text(assignee['username'] as String? ?? ''),
                                    trailing: _StatusChip(status: assignee['assignmentStatus'] as String? ?? ''),
                                  );
                                }),
                              ]),
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],

                        // Actions
                        _buildActions(),
                        const SizedBox(height: 16),
                      ],
                    ),
    );
  }

  Widget _buildActions() {
    final status = _task?['status'] as String? ?? '';
    final List<Widget> actions = [];

    if (status == 'assigned') {
      actions.add(_ActionButton(
        label: 'Tiếp nhận nhiệm vụ',
        icon: Icons.check_circle_outline,
        color: AppColors.navy,
        loading: _updating,
        onTap: _acceptTask,
      ));
    }
    if (status == 'in_progress') {
      actions.add(_ActionButton(
        label: 'Đánh dấu hoàn thành',
        icon: Icons.task_alt,
        color: AppColors.success,
        loading: _updating,
        onTap: () => _updateProgress('completed'),
      ));
    }

    if (actions.isEmpty) return const SizedBox.shrink();
    return Column(children: actions);
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return DateFormat('dd/MM/yyyy HH:mm').format(dt);
    } catch (_) {
      return iso;
    }
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});
  @override
  Widget build(BuildContext context) {
    final color = AppColors.taskStatusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(AppColors.taskStatusLabel(status),
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

class _PriorityChip extends StatelessWidget {
  final String priority;
  const _PriorityChip({required this.priority});
  @override
  Widget build(BuildContext context) {
    Color color;
    String label;
    switch (priority) {
      case 'urgent': color = AppColors.error; label = 'Khẩn cấp'; break;
      case 'high': color = AppColors.warning; label = 'Cao'; break;
      case 'low': color = AppColors.textMuted; label = 'Thấp'; break;
      default: color = AppColors.navy; label = 'Bình thường';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
      child: Text(label, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
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
