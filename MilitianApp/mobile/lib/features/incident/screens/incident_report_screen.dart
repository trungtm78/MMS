import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/error_texts.dart';
import '../../../l10n/l10n.dart';
import '../../files/files.dart';
import '../incident_report_texts.dart';
import '../repositories/incident_report_repository.dart';

/// The device position for the location field: geolocator in the app, a stand-in in tests.
final incidentPositionProvider = Provider<Future<({double latitude, double longitude})> Function()>(
  (ref) => () async {
    final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
    return (latitude: pos.latitude, longitude: pos.longitude);
  },
);

/// How long the confirmation shows before the screen closes
const incidentReportSuccessDuration = Duration(seconds: 2);

/// The works a report can be about; [other] takes a typed title
enum _Task { marketPatrol, residentialCheck, trafficControl, fireSafety, other }

/// POST /work-reports {reportType: 'incident', title, content, location, attachmentIds}
/// (Web/backend/src/work-reports/work-reports.dto.ts). Photos upload as soon as they are picked
/// (POST /files/upload, purpose work_report); voice recordings are not supported: the server accepts no
/// audio type (files/upload-type.ts ALLOWED_UPLOAD_TYPES).
class IncidentReportScreen extends ConsumerStatefulWidget {
  const IncidentReportScreen({super.key});

  @override
  ConsumerState<IncidentReportScreen> createState() => _IncidentReportScreenState();
}

class _IncidentReportScreenState extends ConsumerState<IncidentReportScreen> {
  String _selectedTask = '';
  final _customTitleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  bool _loading = false;
  bool _showSuccess = false;
  bool _gettingLocation = false;
  Timer? _closeTimer;

  late final AttachmentUploads _photos;

  @override
  void initState() {
    super.initState();
    _photos = AttachmentUploads(
      repository: ref.read(filesRepositoryProvider),
      purpose: FilePurpose.workReport,
      max: IncidentReportRepository.maxAttachments,
    );
  }

  @override
  void dispose() {
    _closeTimer?.cancel();
    _photos.dispose();
    _customTitleCtrl.dispose();
    _descCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  static String _taskLabel(AppLocalizations l10n, _Task task) => switch (task) {
        _Task.marketPatrol => l10n.incidentReportTaskMarketPatrol,
        _Task.residentialCheck => l10n.incidentReportTaskResidentialCheck,
        _Task.trafficControl => l10n.incidentReportTaskTrafficControl,
        _Task.fireSafety => l10n.incidentReportTaskFireSafety,
        _Task.other => l10n.incidentReportTaskOther,
      };

  /// Report title: the chosen work, or the typed title for "other"
  String _title(AppLocalizations l10n) {
    if (_selectedTask == _Task.other.name) return _customTitleCtrl.text.trim();
    for (final task in _Task.values) {
      if (task.name == _selectedTask) return _taskLabel(l10n, task);
    }
    return '';
  }

  bool _canSubmit(AppLocalizations l10n) =>
      !_loading &&
      _title(l10n).isNotEmpty &&
      _descCtrl.text.trim().isNotEmpty &&
      _locationCtrl.text.trim().isNotEmpty;

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: AppColors.error,
    ));
  }

  Future<void> _getGPS() async {
    final l10n = context.l10n;
    final position = ref.read(incidentPositionProvider);
    setState(() => _gettingLocation = true);
    try {
      final pos = await position();
      if (mounted) {
        _locationCtrl.text =
            l10n.incidentReportGpsValue(pos.latitude.toStringAsFixed(6), pos.longitude.toStringAsFixed(6));
      }
    } catch (e) {
      // Never fill in a made-up address: the report would carry a false location
      if (mounted) _showError(l10n.incidentReportGpsFailed(errorTextFor(l10n, e)));
    } finally {
      if (mounted) setState(() => _gettingLocation = false);
    }
  }

  /// POST /work-reports once every picked photo is uploaded
  Future<void> _submit() async {
    if (_loading) return;
    final l10n = context.l10n;
    if (_photos.isUploading) {
      _showError(l10n.incidentReportPhotosUploading);
      return;
    }
    if (_photos.hasFailures) {
      _showError(l10n.incidentReportPhotosFailed);
      return;
    }
    final repository = ref.read(incidentReportRepositoryProvider);
    setState(() => _loading = true);
    try {
      await repository.submit(
        title: _title(l10n),
        content: _descCtrl.text,
        location: _locationCtrl.text,
        attachmentIds: _photos.uploadedIds,
      );
      if (!mounted) return;
      setState(() {
        _loading = false;
        _showSuccess = true;
      });
      _closeTimer = Timer(incidentReportSuccessDuration, () {
        if (mounted) context.pop();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _showError(incidentReportErrorText(l10n, e));
    }
  }

  InputDecoration _fieldDecoration({required String hint, Widget? prefixIcon}) => InputDecoration(
        hintText: hint,
        counterText: '',
        prefixIcon: prefixIcon,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.divider, width: 2),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.navy, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      );

  Future<void> _confirmSos(AppLocalizations l10n) => showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(l10n.incidentReportSosDialogTitle),
          content: Text(l10n.incidentReportSosDialogContent),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(l10n.commonCancelButton)),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(l10n.incidentReportSosDialogConfirm, style: const TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (_showSuccess) {
      return Scaffold(
        backgroundColor: Colors.black54,
        body: Center(
          child: Container(
            margin: const EdgeInsets.all(32),
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64, height: 64,
                  decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                  child: const Icon(Icons.check_circle, color: Colors.white, size: 40),
                ),
                const SizedBox(height: 12),
                Text(l10n.incidentReportSuccessTitle,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                const SizedBox(height: 8),
                Text(l10n.incidentReportSuccessSubtitle,
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ],
            ),
          ),
        ),
      );
    }

    final canSubmit = _canSubmit(l10n);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // ── Navy Header ────────────────────────────────────────────────────
          Container(
            color: AppColors.navy,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    GestureDetector(
                      onTap: () => context.pop(),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.arrow_back, color: Colors.white, size: 20),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l10n.incidentReportScreenTitle,
                            style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                          Text(l10n.incidentReportScreenSubtitle,
                            style: const TextStyle(color: Colors.white70, fontSize: 12)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Body ───────────────────────────────────────────────────────────
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // SOS Emergency button
                  GestureDetector(
                    onTap: () => _confirmSos(l10n),
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.error,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [BoxShadow(color: AppColors.error.withValues(alpha: 0.3), blurRadius: 12, offset: const Offset(0, 4))],
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.phone, color: Colors.white, size: 22),
                          const SizedBox(width: 10),
                          Text(l10n.incidentReportSosButton,
                            style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Task selection
                  _SectionCard(
                    title: l10n.incidentReportTaskSection,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            border: Border.all(color: AppColors.divider, width: 2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: _selectedTask.isEmpty ? null : _selectedTask,
                              hint: Text(l10n.incidentReportTaskHint,
                                  style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                              isExpanded: true,
                              items: [
                                for (final task in _Task.values)
                                  DropdownMenuItem(
                                    value: task.name,
                                    child: Text(_taskLabel(l10n, task), style: const TextStyle(fontSize: 13)),
                                  ),
                              ],
                              onChanged: (v) => setState(() => _selectedTask = v ?? ''),
                            ),
                          ),
                        ),
                        if (_selectedTask == _Task.other.name) ...[
                          const SizedBox(height: 10),
                          TextField(
                            controller: _customTitleCtrl,
                            maxLength: IncidentReportRepository.maxTitleLength,
                            onChanged: (_) => setState(() {}),
                            decoration: _fieldDecoration(hint: l10n.incidentReportCustomTitleHint),
                            style: const TextStyle(fontSize: 13),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Photos (POST /files/upload, purpose work_report); voice is not supported by the server
                  _SectionCard(
                    title: l10n.incidentReportPhotosSection,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        AttachmentPickerField(uploads: _photos, enabled: !_loading),
                        const SizedBox(height: 8),
                        _UnsupportedNotice(l10n.incidentReportVoiceUnsupported),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Description (content is required by the backend)
                  _SectionCard(
                    title: l10n.incidentReportDescriptionSection,
                    child: TextField(
                      controller: _descCtrl,
                      maxLines: 4,
                      maxLength: IncidentReportRepository.maxContentLength,
                      onChanged: (_) => setState(() {}),
                      decoration: _fieldDecoration(hint: l10n.incidentReportDescriptionHint)
                          .copyWith(contentPadding: const EdgeInsets.all(12)),
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Location
                  _SectionCard(
                    title: l10n.incidentReportLocationSection,
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _locationCtrl,
                            maxLength: IncidentReportRepository.maxLocationLength,
                            onChanged: (_) => setState(() {}),
                            decoration: _fieldDecoration(
                              hint: l10n.incidentReportLocationHint,
                              prefixIcon: const Icon(Icons.location_on_outlined,
                                  color: AppColors.textSecondary, size: 18),
                            ),
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: _gettingLocation ? null : _getGPS,
                          child: Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppColors.navy,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: _gettingLocation
                                ? const SizedBox(width: 20, height: 20,
                                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                                : const Icon(Icons.my_location, color: Colors.white, size: 20),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Submit
                  GestureDetector(
                    onTap: canSubmit ? _submit : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        color: canSubmit || _loading ? AppColors.navy : AppColors.textMuted,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          if (canSubmit)
                            BoxShadow(color: AppColors.navy.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 4)),
                        ],
                      ),
                      child: _loading
                          ? const Center(child: SizedBox(width: 22, height: 22,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)))
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.send, color: Colors.white, size: 18),
                                const SizedBox(width: 8),
                                Text(l10n.incidentReportSubmitButton,
                                  style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                              ],
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Helper Widgets ────────────────────────────────────────────────────────────
class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.textSecondary)),
        const SizedBox(height: 12),
        child,
      ],
    ),
  );
}

/// A feature the backend does not support, explained
class _UnsupportedNotice extends StatelessWidget {
  final String message;
  const _UnsupportedNotice(this.message);

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: AppColors.background,
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: AppColors.divider),
    ),
    child: Row(
      children: [
        const Icon(Icons.mic_off_outlined, color: AppColors.textMuted, size: 20),
        const SizedBox(width: 8),
        Expanded(
          child: Text(message, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ),
      ],
    ),
  );
}
