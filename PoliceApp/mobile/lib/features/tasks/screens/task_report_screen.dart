import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/files/files.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/task_report_request.dart';

/// The completion report of a task under way: what was done, where, and photos uploaded for the
/// task report (FilePurpose.taskReport) and sent by id. POST /tasks/:id/report completes the task;
/// the screen then shows the recorded report and returns true when closed.
class TaskReportScreen extends ConsumerStatefulWidget {
  const TaskReportScreen({super.key, required this.taskId});

  final String taskId;

  @override
  ConsumerState<TaskReportScreen> createState() => _TaskReportScreenState();
}

class _TaskReportScreenState extends ConsumerState<TaskReportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _description = TextEditingController();
  final _location = TextEditingController();
  late final _uploads = AttachmentUploads(
    api: ref.read(filesApiProvider),
    purpose: FilePurpose.taskReport,
    max: maxTaskReportPhotos,
  );
  bool _sending = false;
  TaskReportResult? _result;

  @override
  void dispose() {
    _description.dispose();
    _location.dispose();
    _uploads.dispose();
    super.dispose();
  }

  void _snack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: error ? AppColors.error : null),
    );
  }

  Future<void> _submit() async {
    final l10n = context.l10n;
    if (!_formKey.currentState!.validate()) return;
    if (_uploads.isUploading) {
      _snack(l10n.tasksReportPhotosUploading);
      return;
    }
    if (_uploads.hasFailures) {
      _snack(l10n.tasksReportPhotosFailed, error: true);
      return;
    }
    setState(() => _sending = true);
    try {
      final body = buildTaskReportBody(
        description: _description.text,
        location: _location.text,
        photoIds: _uploads.uploadedIds,
      );
      final res = await ref
          .read(dioProvider)
          .post(ApiConstants.taskReport.replaceFirst('{id}', widget.taskId), data: body);
      final result = TaskReportResult.fromJson(res.data);
      if (!mounted) return;
      setState(() {
        _result = result;
        _sending = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      _snack(l10n.tasksReportFailed(failureText(l10n, AppFailure.from(e))), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final result = _result;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.tasksReportTitle, showBack: true),
      body: result == null ? _buildForm(l10n) : _buildResult(l10n, result),
    );
  }

  Widget _buildForm(AppLocalizations l10n) {
    String? textOf(AppFailure? failure) => failure == null ? null : failureText(l10n, failure);
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SectionLabel(l10n.tasksReportDescriptionLabel),
          TextFormField(
            controller: _description,
            enabled: !_sending,
            maxLines: 5,
            maxLength: maxTaskReportDescriptionLength,
            decoration: InputDecoration(hintText: l10n.tasksReportDescriptionHint),
            validator: (v) => textOf(taskReportDescriptionFailure(v ?? '')),
          ),
          const SizedBox(height: 12),
          _SectionLabel(l10n.tasksReportLocationLabel),
          TextFormField(
            controller: _location,
            enabled: !_sending,
            maxLength: maxTaskReportLocationLength,
            decoration: InputDecoration(
              hintText: l10n.tasksReportLocationHint,
              prefixIcon: const Icon(Icons.location_on_outlined),
            ),
            validator: (v) => textOf(taskReportLocationFailure(v ?? '')),
          ),
          const SizedBox(height: 12),
          _SectionLabel(l10n.tasksReportPhotosLabel),
          AttachmentPickerField(uploads: _uploads, enabled: !_sending),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: _sending ? null : _submit,
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white),
              icon: _sending
                  ? const SizedBox(
                      width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.send_outlined),
              label: Text(_sending ? l10n.tasksReportSubmitting : l10n.tasksReportSubmit,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResult(AppLocalizations l10n, TaskReportResult result) {
    final submittedAt = result.submittedAt;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Icon(Icons.check_circle_outline, color: AppColors.success, size: 56),
        const SizedBox(height: 8),
        Text(l10n.tasksReportSent,
            textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        if (submittedAt != null) ...[
          const SizedBox(height: 4),
          Text(
            l10n.tasksReportSentAt(DateFormat('dd/MM/yyyy HH:mm').format(submittedAt.toLocal())),
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textSecondary),
          ),
        ],
        if (result.photos.isNotEmpty) ...[
          const SizedBox(height: 16),
          _SectionLabel(l10n.tasksReportSentPhotos(result.photos.length)),
          AttachmentThumbnails(files: result.photos),
        ],
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white),
          child: Text(l10n.tasksReportDone),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
      );
}
