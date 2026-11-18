import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../../l10n/error_texts.dart';
import '../../../l10n/l10n.dart';
import '../../auth/providers/auth_provider.dart';
import '../task_location.dart';
import '../task_report_request.dart';

/// Task completion report: POST /tasks/:id/report (Web/backend/src/tasks/tasks.controller.ts).
/// Photos and voice notes are not offered: uploaded files get a filename id that
/// SubmitReportDto.photoIds (UUID[]) rejects, and voice recording is not available.
class TaskReportScreen extends ConsumerStatefulWidget {
  final String taskId;
  const TaskReportScreen({super.key, required this.taskId});

  @override
  ConsumerState<TaskReportScreen> createState() => _TaskReportScreenState();
}

class _TaskReportScreenState extends ConsumerState<TaskReportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _descCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();

  // Task info (loaded from API)
  Map<String, dynamic>? _task;
  bool _loadingTask = true;

  // Date/time
  DateTime _completedAt = DateTime.now();

  // Location presets
  static const _presets = [
    'Trụ sở',
    'Địa bàn A',
    'Địa bàn B',
    'Khu vực 1',
    'Khu vực 2',
  ];

  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadTask();
  }

  @override
  void dispose() {
    _descCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  /// GET /tasks/:id → the task object (no envelope)
  Future<void> _loadTask() async {
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final res = await dio.get(ApiConstants.taskById.replaceFirst('{id}', widget.taskId));
      final data = res.data;
      if (mounted) {
        setState(() {
          _task = data is Map ? Map<String, dynamic>.from(data) : null;
          _loadingTask = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingTask = false);
    }
  }

  Future<void> _getGPS() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
      );
      if (mounted) _locationCtrl.text = '${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)}';
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Không lấy được vị trí GPS')),
        );
      }
    }
  }

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _completedAt,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now(),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_completedAt),
    );
    if (time == null) return;
    setState(() => _completedAt = DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.error),
    );
  }

  /// POST /tasks/:id/report {description, completedAt, location}
  Future<void> _submit() async {
    if (_submitting || !_formKey.currentState!.validate()) return;
    final Map<String, dynamic> body;
    try {
      body = buildTaskReportBody(
        description: _descCtrl.text,
        completedAt: _completedAt,
        location: _locationCtrl.text,
      );
    } on ArgumentError catch (e) {
      _showError('${e.message}');
      return;
    }
    setState(() => _submitting = true);
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      await dio.post(ApiConstants.submitTaskReport.replaceFirst('{id}', widget.taskId), data: body);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Báo cáo đã được gửi thành công!'),
          backgroundColor: AppColors.success,
        ),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      _showError(errorTextFor(context.l10n, e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Báo cáo nhiệm vụ', style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: _loadingTask
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Task info card
                    if (_task != null) _TaskInfoCard(task: _task!),
                    const SizedBox(height: 16),

                    // Description
                    const _SectionLabel('Mô tả kết quả *'),
                    TextFormField(
                      controller: _descCtrl,
                      maxLines: 4,
                      maxLength: maxTaskReportDescriptionLength,
                      decoration: const InputDecoration(
                        hintText: 'Mô tả công việc đã thực hiện...',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) => (v == null || v.trim().length < 10)
                          ? 'Nhập ít nhất 10 ký tự'
                          : null,
                    ),
                    const SizedBox(height: 16),

                    // DateTime
                    const _SectionLabel('Thời điểm hoàn thành'),
                    InkWell(
                      onTap: _pickDateTime,
                      child: InputDecorator(
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          suffixIcon: Icon(Icons.calendar_today),
                        ),
                        child: Text(
                          '${_completedAt.day}/${_completedAt.month}/${_completedAt.year} ${_completedAt.hour.toString().padLeft(2, '0')}:${_completedAt.minute.toString().padLeft(2, '0')}',
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Location
                    const _SectionLabel('Vị trí'),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _locationCtrl,
                            maxLength: maxTaskReportLocationLength,
                            decoration: const InputDecoration(
                              hintText: 'Nhập địa điểm hoặc chọn',
                              border: OutlineInputBorder(),
                              counterText: '',
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          onPressed: _getGPS,
                          icon: const Icon(Icons.my_location),
                          style: IconButton.styleFrom(backgroundColor: AppColors.primary),
                        ),
                        const SizedBox(width: 4),
                        PopupMenuButton<String>(
                          icon: const Icon(Icons.arrow_drop_down_circle_outlined),
                          onSelected: (v) => _locationCtrl.text = v,
                          itemBuilder: (context) => _presets
                              .map((p) => PopupMenuItem(value: p, child: Text(p)))
                              .toList(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Attachments: not supported by the backend
                    const _SectionLabel('Ảnh và ghi âm'),
                    const _UnsupportedAttachments(),
                    const SizedBox(height: 24),

                    // Submit
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        onPressed: _submitting ? null : _submit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: _submitting
                            ? const SizedBox(
                                width: 20, height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('GỬI BÁO CÁO', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
    );
  }
}

class _TaskInfoCard extends StatelessWidget {
  final Map<String, dynamic> task;
  const _TaskInfoCard({required this.task});

  @override
  Widget build(BuildContext context) {
    final location = taskLocationText(task);
    return Card(
      color: AppColors.primary.withValues(alpha: 0.07),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              task['title'] as String? ?? 'Nhiệm vụ',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            if (task['type'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Loại: ${task['type']}', style: const TextStyle(fontSize: 13, color: Colors.black54)),
              ),
            if (location != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  children: [
                    const Icon(Icons.location_on_outlined, size: 14, color: Colors.black54),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(location, style: const TextStyle(fontSize: 13, color: Colors.black54)),
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

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
      );
}

/// Disabled attachments section: SubmitReportDto.photoIds must be UUIDs but POST /files/upload
/// returns a filename, and voice recording is not available in the app.
class _UnsupportedAttachments extends StatelessWidget {
  const _UnsupportedAttachments();

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Row(
          children: [
            Icon(Icons.attach_file, color: Colors.grey),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'Máy chủ chưa hỗ trợ đính kèm ảnh và ghi âm cho báo cáo nhiệm vụ.',
                style: TextStyle(color: Colors.black54),
              ),
            ),
          ],
        ),
      );
}
