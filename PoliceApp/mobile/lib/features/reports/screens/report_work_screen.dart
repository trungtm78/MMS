import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/files/files.dart';
import '../../../shared/utils/calendar_date.dart';
import '../../../shared/widgets/app_header.dart';
import '../models/work_report.dart';
import '../providers/work_reports_provider.dart';
import '../widgets/work_report_detail_sheet.dart';
import '../widgets/work_report_texts.dart';

/// A DQTV writes a work report, attaches photos (each uploaded as it is picked, purpose
/// work_report) and sends it with their ids; below, the reports already sent.
class ReportWorkScreen extends ConsumerStatefulWidget {
  const ReportWorkScreen({super.key});

  @override
  ConsumerState<ReportWorkScreen> createState() => _ReportWorkScreenState();
}

class _ReportWorkScreenState extends ConsumerState<ReportWorkScreen> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  late AttachmentUploads _uploads;
  final _contentCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  bool _submitting = false;
  List<WorkReport> _myReports = [];
  bool _loadingReports = true;
  AppFailure? _reportsFailure;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: workReportTypes.length, vsync: this);
    _uploads = AttachmentUploads(
      api: ref.read(filesApiProvider),
      purpose: FilePurpose.workReport,
      max: WorkReportsApi.maxAttachments,
    );
    _loadReports();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _uploads.dispose();
    _contentCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadReports() async {
    setState(() {
      _loadingReports = true;
      _reportsFailure = null;
    });
    try {
      final page = await ref.read(workReportsApiProvider).list(limit: 20);
      if (!mounted) return;
      setState(() {
        _myReports = page.items;
        _loadingReports = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _reportsFailure = AppFailure.from(e);
        _loadingReports = false;
      });
    }
  }

  Future<void> _submit() async {
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    // Only photos the server holds can be attached
    if (_uploads.isUploading || _uploads.hasFailures) {
      messenger.showSnackBar(SnackBar(
        content: Text(_uploads.isUploading ? l10n.reportsWorkUploadsPending : l10n.reportsWorkUploadsFailed),
        backgroundColor: _uploads.isUploading ? AppColors.warning : AppColors.error,
      ));
      return;
    }
    final type = workReportTypes[_tabCtrl.index];
    setState(() => _submitting = true);
    try {
      await ref.read(workReportsApiProvider).create(
            reportType: type,
            // The day as the backend counts days: Vietnam's calendar, whatever the device timezone
            title: l10n.reportsWorkDefaultTitle(l10n.workReportType(type), toCalendarDateString(vietnamToday())),
            content: _contentCtrl.text,
            location: _locationCtrl.text,
            attachmentIds: _uploads.uploadedIds,
          );
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text(l10n.reportsWorkSubmitSuccess), backgroundColor: AppColors.success),
      );
      _contentCtrl.clear();
      _locationCtrl.clear();
      _uploads.clear();
      setState(() => _submitting = false);
      _loadReports();
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      // A refused report keeps its text and photos, so it can be corrected and sent again
      messenger.showSnackBar(
        SnackBar(content: Text(failureText(l10n, AppFailure.from(e))), backgroundColor: AppColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    const label = TextStyle(fontWeight: FontWeight.w600, fontSize: 13);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.reportsWorkTitle, showBack: false),
      body: Column(children: [
        // Type tabs
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabCtrl,
            labelColor: AppColors.navy,
            unselectedLabelColor: AppColors.textSecondary,
            indicatorColor: AppColors.navy,
            tabs: [for (final type in workReportTypes) Tab(text: l10n.workReportType(type))],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Form
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(l10n.reportsWorkLocationLabel, style: label),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _locationCtrl,
                      maxLength: WorkReportsApi.maxLocationLength,
                      decoration: InputDecoration(hintText: l10n.reportsWorkLocationHint, counterText: ''),
                    ),
                    const SizedBox(height: 16),
                    Text(l10n.reportsWorkContentLabel, style: label),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _contentCtrl,
                      maxLines: 5,
                      decoration: InputDecoration(hintText: l10n.reportsWorkContentHint),
                    ),
                    const SizedBox(height: 16),
                    Text(l10n.reportsWorkAttachmentsLabel, style: label),
                    const SizedBox(height: 8),
                    AttachmentPickerField(uploads: _uploads, enabled: !_submitting),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton.icon(
                        onPressed: _submitting ? null : _submit,
                        icon: _submitting
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.send),
                        label: Text(l10n.reportsWorkSubmit, style: const TextStyle(fontWeight: FontWeight.w700)),
                        style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.tertiary, foregroundColor: Colors.white),
                      ),
                    ),
                  ]),
                ),
              ),
              const SizedBox(height: 16),
              Text(l10n.reportsWorkSubmittedHeader,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textSecondary)),
              const SizedBox(height: 8),
              if (_loadingReports)
                const Center(child: CircularProgressIndicator(color: AppColors.navy))
              else if (_reportsFailure case final failure?)
                Row(children: [
                  Expanded(child: Text(failureText(l10n, failure), style: const TextStyle(color: AppColors.error))),
                  TextButton(onPressed: _loadReports, child: Text(l10n.commonRetry)),
                ])
              else if (_myReports.isEmpty)
                Text(l10n.reportsWorkSubmittedEmpty, style: const TextStyle(color: AppColors.textMuted))
              else
                ..._myReports.take(5).map((r) => _SentReportCard(report: r)),
            ],
          ),
        ),
      ]),
    );
  }
}

/// A report already sent; tapping it opens its detail
class _SentReportCard extends StatelessWidget {
  const _SentReportCard({required this.report});

  final WorkReport report;

  static final _day = DateFormat('dd/MM/yyyy');

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final created = report.createdAt;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: () => showWorkReportDetail(context, report),
        title: Text(report.content, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l10n.reportsWorkSubmittedSubtitle(
              l10n.workReportType(report.reportType), created == null ? '' : _day.format(created.toLocal()))),
          if (report.location case final location?)
            Row(children: [
              const Icon(Icons.location_on_outlined, size: 12, color: AppColors.textSecondary),
              const SizedBox(width: 2),
              Expanded(
                child: Text(location, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
              ),
            ]),
          if (report.reviewNote case final note?)
            Text(l10n.reportsWorkReviewNote(note), style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          if (report.attachments.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: AttachmentThumbnails(files: report.attachments, size: 48),
            ),
        ]),
        trailing: WorkReportBadge(
          text: l10n.workReviewStatus(report.reviewStatus),
          color: workReviewStatusColor(report.reviewStatus),
        ),
      ),
    );
  }
}
