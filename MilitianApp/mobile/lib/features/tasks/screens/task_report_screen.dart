import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../l10n/error_texts.dart';
import '../../../l10n/l10n.dart';
import '../../files/files.dart';
import '../repositories/tasks_repository.dart';
import '../task_location.dart';
import '../task_report_request.dart';
import '../tasks_texts.dart';

/// The device position for the location field: geolocator in the app, a stand-in in tests.
final taskReportPositionProvider = Provider<Future<({double latitude, double longitude})> Function()>(
  (ref) => () async {
    final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.medium);
    return (latitude: pos.latitude, longitude: pos.longitude);
  },
);

/// Task completion report: POST /tasks/:id/report {description, completedAt, location, photoIds}
/// (Web/backend/src/tasks/tasks.controller.ts SubmitReportDto). Photos upload as soon as they are
/// picked (POST /files/upload, purpose task_report) and are sent by id in display order. Voice notes are
/// not offered: there is no voice upload route. Closes with true once the report is stored.
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
  late final AttachmentUploads _photos;

  Map<String, dynamic>? _task;
  bool _loadingTask = true;
  DateTime _completedAt = DateTime.now();
  bool _gettingLocation = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _photos = AttachmentUploads(
      repository: ref.read(filesRepositoryProvider),
      purpose: FilePurpose.taskReport,
      max: maxTaskReportPhotos,
    );
    _loadTask();
  }

  @override
  void dispose() {
    _photos.dispose();
    _descCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  /// GET /tasks/:id, shown above the form. The report can be written without it.
  Future<void> _loadTask() async {
    try {
      final task = await ref.read(tasksRepositoryProvider).task(widget.taskId);
      if (mounted) setState(() => _task = task);
    } on TasksException catch (e) {
      if (mounted) _showSnack(tasksErrorText(context.l10n, e), isError: true);
    } finally {
      if (mounted) setState(() => _loadingTask = false);
    }
  }

  Future<void> _getGPS() async {
    final l10n = context.l10n;
    final position = ref.read(taskReportPositionProvider);
    setState(() => _gettingLocation = true);
    try {
      final pos = await position();
      if (mounted) {
        _locationCtrl.text = l10n.taskReportGpsValue(pos.latitude.toStringAsFixed(5), pos.longitude.toStringAsFixed(5));
      }
    } catch (e) {
      // Never fill in a made-up place: the report would carry a false location
      if (mounted) _showSnack(l10n.taskReportGpsFailed(errorTextFor(l10n, e)), isError: true);
    } finally {
      if (mounted) setState(() => _gettingLocation = false);
    }
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _completedAt,
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now,
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_completedAt));
    if (time == null) return;
    setState(() => _completedAt = DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  void _showSnack(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.error : AppColors.success,
      ));
  }

  /// POST /tasks/:id/report once every picked photo is uploaded
  Future<void> _submit() async {
    if (_submitting || !_formKey.currentState!.validate()) return;
    final l10n = context.l10n;
    if (_photos.isUploading) {
      _showSnack(l10n.taskReportPhotosUploading, isError: true);
      return;
    }
    if (_photos.hasFailures) {
      _showSnack(l10n.taskReportPhotosFailed, isError: true);
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(tasksRepositoryProvider).submitReport(
            widget.taskId,
            description: _descCtrl.text,
            completedAt: _completedAt,
            location: _locationCtrl.text,
            photoIds: _photos.uploadedIds,
          );
      if (!mounted) return;
      _showSnack(l10n.taskReportSent);
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _showSnack(tasksErrorText(l10n, e), isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final task = _task;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.taskReportTitle, style: const TextStyle(fontWeight: FontWeight.w700)),
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
                    if (task != null) _TaskInfoCard(task: task),
                    const SizedBox(height: 16),

                    _SectionLabel(l10n.taskReportDescriptionLabel),
                    TextFormField(
                      controller: _descCtrl,
                      enabled: !_submitting,
                      maxLines: 4,
                      maxLength: maxTaskReportDescriptionLength,
                      decoration: InputDecoration(
                        hintText: l10n.taskReportDescriptionHint,
                        border: const OutlineInputBorder(),
                      ),
                      validator: (v) => (v ?? '').trim().isEmpty
                          ? tasksIssueText(l10n, TasksIssue.reportDescriptionRequired)
                          : null,
                    ),
                    const SizedBox(height: 16),

                    _SectionLabel(l10n.taskReportCompletedAtLabel),
                    InkWell(
                      onTap: _submitting ? null : _pickDateTime,
                      child: InputDecorator(
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          suffixIcon: Icon(Icons.calendar_today),
                        ),
                        child: Text(DateFormat(AppStrings.datetimeFormat).format(_completedAt)),
                      ),
                    ),
                    const SizedBox(height: 16),

                    _SectionLabel(l10n.taskReportLocationLabel),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _locationCtrl,
                            enabled: !_submitting,
                            maxLength: maxTaskReportLocationLength,
                            decoration: InputDecoration(
                              hintText: l10n.taskReportLocationHint,
                              border: const OutlineInputBorder(),
                              counterText: '',
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          tooltip: l10n.taskReportGpsButton,
                          onPressed: _gettingLocation || _submitting ? null : _getGPS,
                          icon: _gettingLocation
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Icon(Icons.my_location),
                          style: IconButton.styleFrom(backgroundColor: AppColors.primary),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    _SectionLabel(l10n.taskReportPhotosLabel),
                    AttachmentPickerField(uploads: _photos, enabled: !_submitting),
                    const SizedBox(height: 24),

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
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : Text(l10n.taskReportSubmitButton,
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
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
    final l10n = context.l10n;
    final location = taskLocationText(task);
    final type = task['type'];
    return Card(
      color: AppColors.primary.withValues(alpha: 0.07),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              task['title'] as String? ?? '',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            if (type is String && type.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(l10n.taskDetailType(taskTypeText(l10n, type)),
                    style: const TextStyle(fontSize: 13, color: Colors.black54)),
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
