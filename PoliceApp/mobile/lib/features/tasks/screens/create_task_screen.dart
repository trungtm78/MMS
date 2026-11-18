import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/files/files.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';
import '../../training/militia_search.dart';
import '../models/create_task_request.dart';
import '../task_texts.dart';

/// A device position in degrees
typedef DevicePosition = ({double latitude, double longitude});

/// Reads the device position. Tests override it, so no location platform channel is needed.
final currentPositionProvider = Provider<Future<DevicePosition> Function()>((ref) => _devicePosition);

/// Through the location plugin: a refused permission is AppFailure.locationPermission; the plugin's
/// own errors (service switched off, ...) are turned into failures by AppFailure.from
Future<DevicePosition> _devicePosition() async {
  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
  if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
    throw const AppFailure(AppFailure.locationPermission);
  }
  final position = await Geolocator.getCurrentPosition();
  return (latitude: position.latitude, longitude: position.longitude);
}

class CreateTaskScreen extends ConsumerStatefulWidget {
  const CreateTaskScreen({super.key});

  @override
  ConsumerState<CreateTaskScreen> createState() => _CreateTaskScreenState();
}

class _CreateTaskScreenState extends ConsumerState<CreateTaskScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();

  List<MilitiaSearchItem> _militia = [];
  String? _selectedMilitiaId;
  String _priority = 'medium';
  DateTime? _dueDate;
  bool _loading = false;
  bool _loadingUsers = true;
  AppFailure? _usersFailure;
  double? _locationLat;
  double? _locationLng;
  bool _locating = false;
  // Files for the assignee, uploaded for the task (POST /tasks attachmentIds)
  late final _attachments = AttachmentUploads(
    api: ref.read(filesApiProvider),
    purpose: FilePurpose.task,
    max: maxTaskAttachments,
  );

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _locationCtrl.dispose();
    _attachments.dispose();
    super.dispose();
  }

  /// GET /militia returns militia profiles; POST /tasks needs their id as assigneeMilitiaId.
  Future<void> _loadUsers() async {
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.get(ApiConstants.militiaList, queryParameters: {'limit': 100});
      final page = MilitiaSearchPage.fromJson(resp.data);
      if (!mounted) return;
      setState(() {
        _militia = page.items;
        _usersFailure = null;
        _loadingUsers = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _usersFailure = AppFailure.from(e);
        _loadingUsers = false;
      });
    }
  }

  Future<void> _pickDueDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_dueDate ?? now.add(const Duration(hours: 1))),
    );
    if (time == null || !mounted) return;
    setState(() {
      _dueDate = DateTime(picked.year, picked.month, picked.day, time.hour, time.minute);
    });
  }

  /// Fills locationLat / locationLng from the device position
  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);
    try {
      final position = await ref.read(currentPositionProvider)();
      if (!mounted) return;
      setState(() {
        _locationLat = position.latitude;
        _locationLng = position.longitude;
      });
    } catch (e) {
      if (mounted) {
        _showError(context.l10n.tasksCreateLocationFailed(failureText(context.l10n, AppFailure.from(e))));
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.error),
    );
  }

  Future<void> _submit() async {
    final l10n = context.l10n;
    if (!_formKey.currentState!.validate()) return;
    final assignee = _selectedMilitiaId;
    if (assignee == null) {
      _showError(l10n.tasksCreateAssigneeRequired);
      return;
    }
    if (_attachments.isUploading) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.tasksCreateAttachmentsUploading)));
      return;
    }
    if (_attachments.hasFailures) {
      _showError(l10n.tasksCreateAttachmentsFailed);
      return;
    }
    final Map<String, dynamic> body;
    try {
      body = buildCreateTaskBody(
        title: _titleCtrl.text,
        description: _descCtrl.text,
        locationName: _locationCtrl.text,
        locationLat: _locationLat,
        locationLng: _locationLng,
        priority: _priority,
        deadline: _dueDate,
        assigneeMilitiaId: assignee,
        attachmentIds: _attachments.uploadedIds,
      );
    } on AppFailure catch (failure) {
      _showError(l10n.tasksCreateInvalid(failureText(l10n, failure)));
      return;
    }
    setState(() => _loading = true);
    try {
      await ref.read(dioProvider).post(ApiConstants.tasks, data: body);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.tasksCreateSuccess), backgroundColor: AppColors.success),
      );
      context.pop();
    } catch (e) {
      if (mounted) _showError(l10n.tasksCreateFailed(failureText(l10n, AppFailure.from(e))));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.tasksCreateTitle, showBack: true),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Title
            _SectionLabel(l10n.tasksCreateTitleLabel),
            TextFormField(
              controller: _titleCtrl,
              decoration: InputDecoration(hintText: l10n.tasksCreateTitleHint),
              validator: (v) => (v == null || v.trim().isEmpty) ? l10n.tasksCreateTitleRequired : null,
              maxLength: 200,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),

            // Description
            _SectionLabel(l10n.tasksCreateDescriptionLabel),
            TextFormField(
              controller: _descCtrl,
              decoration: InputDecoration(hintText: l10n.tasksCreateDescriptionHint),
              maxLines: 3,
              maxLength: 1000,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),

            // Location: locationName (≤ 500) and optional coordinates (tasks.controller.ts:84-100)
            _SectionLabel(l10n.tasksCreateLocationLabel),
            TextFormField(
              controller: _locationCtrl,
              maxLength: maxTaskLocationNameLength,
              decoration: InputDecoration(
                hintText: l10n.tasksCreateLocationHint,
                prefixIcon: const Icon(Icons.location_on_outlined),
                counterText: '',
              ),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 4),
            Row(children: [
              Expanded(
                child: Text(
                  _locationLat != null && _locationLng != null
                      ? l10n.tasksCreateCoordinates(
                          _locationLat!.toStringAsFixed(5), _locationLng!.toStringAsFixed(5))
                      : l10n.tasksCreateNoCoordinates,
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ),
              if (_locationLat != null)
                IconButton(
                  tooltip: l10n.tasksCreateClearCoordinatesTooltip,
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () => setState(() {
                    _locationLat = null;
                    _locationLng = null;
                  }),
                ),
              TextButton.icon(
                onPressed: _locating ? null : _useCurrentLocation,
                icon: _locating
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.my_location, size: 18),
                label: Text(l10n.tasksCreateUseCurrentLocation),
              ),
            ]),
            const SizedBox(height: 12),

            // Priority
            _SectionLabel(l10n.tasksCreatePriorityLabel),
            DropdownButtonFormField<String>(
              initialValue: _priority,
              decoration: const InputDecoration(),
              items: taskPriorities
                  .map((p) => DropdownMenuItem(
                        value: p,
                        child: Row(children: [
                          Icon(_priorityIcon(p), size: 16, color: _priorityColor(p)),
                          const SizedBox(width: 8),
                          Text(taskPriorityText(l10n, p)),
                        ]),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _priority = v ?? 'medium'),
            ),
            const SizedBox(height: 12),

            // Due date
            _SectionLabel(l10n.tasksCreateDeadlineLabel),
            InkWell(
              onTap: _pickDueDate,
              child: InputDecorator(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.calendar_today_outlined),
                  suffixIcon: Icon(Icons.chevron_right),
                ),
                child: Text(
                  _dueDate != null
                      ? DateFormat('dd/MM/yyyy HH:mm').format(_dueDate!)
                      : l10n.tasksCreateDeadlineHint,
                  style: TextStyle(color: _dueDate != null ? AppColors.textPrimary : AppColors.textMuted),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Assignee (required by the backend)
            _SectionLabel(l10n.tasksCreateAssigneeLabel),
            if (_loadingUsers)
              const Center(child: CircularProgressIndicator(color: AppColors.navy))
            else if (_usersFailure != null)
              Row(children: [
                Expanded(
                  child: Text(
                    l10n.tasksCreateAssigneesLoadFailed(failureText(l10n, _usersFailure!)),
                    style: const TextStyle(color: AppColors.error, fontSize: 13),
                  ),
                ),
                TextButton(
                  onPressed: () {
                    setState(() => _loadingUsers = true);
                    _loadUsers();
                  },
                  child: Text(l10n.commonRetry),
                ),
              ])
            else
              DropdownButtonFormField<String>(
                initialValue: _selectedMilitiaId,
                isExpanded: true,
                decoration: InputDecoration(hintText: l10n.tasksCreateAssigneeHint),
                items: _militia
                    .map((m) => DropdownMenuItem(
                          value: m.id,
                          child: Text(
                            m.militiaCode.isEmpty ? m.fullName : '${m.fullName} (${m.militiaCode})',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ))
                    .toList(),
                onChanged: (v) => setState(() => _selectedMilitiaId = v),
                validator: (v) => v == null ? l10n.tasksCreateAssigneeRequired : null,
              ),
            const SizedBox(height: 12),

            // Attachments for the assignee
            _SectionLabel(l10n.tasksCreateAttachmentsLabel),
            AttachmentPickerField(uploads: _attachments, enabled: !_loading),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.navy,
                  foregroundColor: Colors.white,
                ),
                icon: _loading
                    ? const SizedBox(width: 16, height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.assignment_turned_in_outlined),
                label: Text(_loading ? l10n.tasksCreateSubmitting : l10n.tasksCreateSubmit,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  IconData _priorityIcon(String p) => switch (p) {
        'urgent' => Icons.priority_high,
        'high' => Icons.arrow_upward,
        'low' => Icons.arrow_downward,
        _ => Icons.remove,
      };

  Color _priorityColor(String p) => switch (p) {
        'urgent' => AppColors.error,
        'high' => AppColors.warning,
        'low' => AppColors.textMuted,
        _ => AppColors.navy,
      };
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
      );
}
