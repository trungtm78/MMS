import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/files/files.dart';
import '../models/work_report.dart';
import '../providers/work_reports_provider.dart';
import 'work_report_texts.dart';

/// Opens [report] in a sheet: what the list holds at once, then its current state and every
/// attachment from GET /work-reports/:id.
Future<void> showWorkReportDetail(BuildContext context, WorkReport report) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => WorkReportDetailSheet(report: report),
    );

/// One work report in full: content, location, review, and its attachments large enough to read
class WorkReportDetailSheet extends ConsumerStatefulWidget {
  const WorkReportDetailSheet({super.key, required this.report});

  /// The report as listed, shown until the detail arrives
  final WorkReport report;

  @override
  ConsumerState<WorkReportDetailSheet> createState() => _WorkReportDetailSheetState();
}

class _WorkReportDetailSheetState extends ConsumerState<WorkReportDetailSheet> {
  static final _time = DateFormat('dd/MM/yyyy HH:mm');

  late WorkReport _report = widget.report;
  bool _loading = true;
  AppFailure? _failure;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final report = await ref.read(workReportsApiProvider).findOne(widget.report.id);
      if (!mounted) return;
      setState(() {
        _report = report;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _failure = AppFailure.from(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final report = _report;
    final created = report.createdAt;
    final reviewedAt = report.reviewedAt;
    final failure = _failure;
    return FractionallySizedBox(
      heightFactor: 0.9,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 4, 0),
          child: Row(children: [
            Expanded(
              child: Text(l10n.reportsDetailTitle,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
            IconButton(
              tooltip: l10n.reportsDetailClose,
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ]),
        ),
        if (_loading) const LinearProgressIndicator(color: AppColors.navy),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            if (failure != null)
              Row(children: [
                Expanded(
                  child: Text(failureText(l10n, failure), style: const TextStyle(color: AppColors.error)),
                ),
                TextButton(onPressed: _load, child: Text(l10n.commonRetry)),
              ]),
            Row(children: [
              const Icon(Icons.person_outline, size: 16, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(report.authorName ?? l10n.reportsDetailAuthorUnknown,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ),
              if (created != null)
                Text(_time.format(created.toLocal()),
                    style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              WorkReportBadge(text: l10n.workReportType(report.reportType), color: AppColors.navy),
              const Spacer(),
              WorkReportBadge(
                text: l10n.workReviewStatus(report.reviewStatus),
                color: workReviewStatusColor(report.reviewStatus),
              ),
            ]),
            const SizedBox(height: 12),
            Text(report.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 6),
            Text(report.content, style: const TextStyle(fontSize: 14, color: AppColors.textPrimary)),
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.location_on_outlined, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Expanded(
                child: Text(report.location ?? l10n.reportsDetailNoLocation,
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ),
            ]),
            if (report.reviewNote case final note?) ...[
              const SizedBox(height: 8),
              Text(l10n.reportsDetailReviewNote(note),
                  style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: AppColors.textSecondary)),
            ],
            if (reviewedAt != null) ...[
              const SizedBox(height: 4),
              Text(l10n.reportsDetailReviewedAt(_time.format(reviewedAt.toLocal())),
                  style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
            ],
            const SizedBox(height: 16),
            Text(
              report.attachments.isEmpty
                  ? l10n.reportsDetailNoAttachments
                  : l10n.reportsDetailAttachments(report.attachments.length),
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
            const SizedBox(height: 8),
            AttachmentThumbnails(files: report.attachments, size: 96),
          ]),
        ),
      ]),
    );
  }
}
