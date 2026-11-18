import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/files/files.dart';
import '../../../shared/widgets/app_header.dart';
import '../models/work_report.dart';
import '../providers/work_reports_provider.dart';
import '../widgets/work_report_detail_sheet.dart';
import '../widgets/work_report_texts.dart';

/// DQTV work reports visible to the CA officer, with approve / reject.
/// Period and status are filtered by the backend (GET /work-reports?reviewStatus=&from=&to=).
class TeamReportsScreen extends ConsumerStatefulWidget {
  const TeamReportsScreen({super.key});

  @override
  ConsumerState<TeamReportsScreen> createState() => _TeamReportsScreenState();
}

class _TeamReportsScreenState extends ConsumerState<TeamReportsScreen> {
  static const _pageSize = 20;

  /// null: every review status
  static const _statusFilters = <String?>[null, 'pending', 'approved', 'rejected'];

  List<WorkReport> _reports = [];
  int _total = 0;
  int _page = 1;
  int? _pendingCount;
  int? _approvedCount;
  bool _loading = true;
  bool _loadingMore = false;
  AppFailure? _failure;
  String _period = 'month'; // 'week' | 'month'
  String? _status;
  final Set<String> _reviewing = {};

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
    final range = reportPeriodRange(_period);
    final api = ref.read(workReportsApiProvider);
    try {
      // The list for the chosen filters, and the period's pending/approved counts
      final results = await Future.wait([
        api.list(reviewStatus: _status, from: range.from, to: range.to, limit: _pageSize),
        api.list(reviewStatus: 'pending', from: range.from, to: range.to, limit: 1),
        api.list(reviewStatus: 'approved', from: range.from, to: range.to, limit: 1),
      ]);
      if (!mounted) return;
      setState(() {
        _reports = results[0].items;
        _total = results[0].total;
        _page = results[0].page;
        _pendingCount = results[1].total;
        _approvedCount = results[2].total;
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

  Future<void> _loadMore() async {
    if (_loadingMore || _reports.length >= _total) return;
    setState(() => _loadingMore = true);
    final range = reportPeriodRange(_period);
    try {
      final page = await ref.read(workReportsApiProvider).list(
            reviewStatus: _status,
            from: range.from,
            to: range.to,
            page: _page + 1,
            limit: _pageSize,
          );
      if (!mounted) return;
      final shown = _reports.map((r) => r.id).toSet();
      setState(() {
        _reports = [..._reports, ...page.items.where((r) => !shown.contains(r.id))];
        _total = page.total;
        _page = page.page;
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(failureText(context.l10n, AppFailure.from(e))),
        backgroundColor: AppColors.error,
      ));
    }
  }

  Future<void> _review(WorkReport report, {required bool approve}) async {
    final note = await showDialog<String>(
      context: context,
      builder: (_) => _ReviewNoteDialog(approve: approve),
    );
    if (note == null || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final l10n = context.l10n;
    setState(() => _reviewing.add(report.id));
    try {
      await ref.read(workReportsApiProvider).review(report.id, approve: approve, note: note);
      messenger.showSnackBar(SnackBar(
        content: Text(approve ? l10n.reportsTeamApproved : l10n.reportsTeamRejected),
        backgroundColor: approve ? AppColors.success : AppColors.warning,
      ));
      if (mounted) await _load();
    } on AppFailure catch (failure) {
      messenger.showSnackBar(
        SnackBar(content: Text(failureText(l10n, failure)), backgroundColor: AppColors.error),
      );
      // Already reviewed or no longer visible: show the current state
      if (mounted && (failure.status == 409 || failure.status == 404)) await _load();
    } finally {
      if (mounted) setState(() => _reviewing.remove(report.id));
    }
  }

  Widget _body(AppLocalizations l10n) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: AppColors.navy));
    final failure = _failure;
    if (failure != null) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline, color: AppColors.error, size: 48),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(l10n.reportsTeamLoadError(failureText(l10n, failure)), textAlign: TextAlign.center),
        ),
        ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
      ]));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Row(children: [
            _SummaryCard(label: l10n.reportsTeamSummaryFiltered, value: '$_total', color: AppColors.navy),
            const SizedBox(width: 8),
            _SummaryCard(
                label: l10n.reportsReviewStatusPending, value: '${_pendingCount ?? '-'}', color: AppColors.warning),
            const SizedBox(width: 8),
            _SummaryCard(
                label: l10n.reportsReviewStatusApproved, value: '${_approvedCount ?? '-'}', color: AppColors.success),
          ]),
          const SizedBox(height: 12),
          if (_reports.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: Text(l10n.reportsTeamEmpty, style: const TextStyle(color: AppColors.textMuted)),
                ),
              ),
            )
          else
            ..._reports.map((r) => _ReportCard(
                  report: r,
                  busy: _reviewing.contains(r.id),
                  onApprove: () => _review(r, approve: true),
                  onReject: () => _review(r, approve: false),
                )),
          if (_reports.length < _total)
            Center(
              child: _loadingMore
                  ? const Padding(
                      padding: EdgeInsets.all(8),
                      child: CircularProgressIndicator(color: AppColors.navy),
                    )
                  : TextButton(
                      onPressed: _loadMore,
                      child: Text(l10n.reportsTeamLoadMore(_reports.length, _total),
                          style: const TextStyle(color: AppColors.navy)),
                    ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.reportsTeamTitle, showBack: true),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            child: SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'week', label: Text(l10n.reportsTeamPeriodWeek)),
                ButtonSegment(value: 'month', label: Text(l10n.reportsTeamPeriodMonth)),
              ],
              selected: {_period},
              onSelectionChanged: (s) {
                setState(() => _period = s.first);
                _load();
              },
              style: ButtonStyle(
                backgroundColor: WidgetStateProperty.resolveWith(
                    (states) => states.contains(WidgetState.selected) ? AppColors.navy : null),
                foregroundColor: WidgetStateProperty.resolveWith(
                    (states) => states.contains(WidgetState.selected) ? Colors.white : AppColors.textPrimary),
              ),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                for (final value in _statusFilters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(value == null ? l10n.reportsTeamFilterAll : l10n.workReviewStatus(value)),
                      selected: _status == value,
                      selectedColor: AppColors.navy,
                      labelStyle: TextStyle(
                        color: _status == value ? Colors.white : AppColors.textPrimary,
                        fontSize: 12,
                      ),
                      onSelected: (_) {
                        setState(() => _status = value);
                        _load();
                      },
                    ),
                  ),
              ],
            ),
          ),
          Expanded(child: _body(l10n)),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _SummaryCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          child: Column(children: [
            Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
            const SizedBox(height: 4),
            Text(label,
                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary), textAlign: TextAlign.center),
          ]),
        ),
      ),
    );
  }
}

/// A report to review; tapping it opens its detail
class _ReportCard extends StatelessWidget {
  final WorkReport report;
  final bool busy;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  const _ReportCard({
    required this.report,
    required this.busy,
    required this.onApprove,
    required this.onReject,
  });

  static final _time = DateFormat('dd/MM HH:mm');

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final created = report.createdAt;
    final location = report.location;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => showWorkReportDetail(context, report),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.person_outline, size: 16, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(report.authorName ?? l10n.reportsTeamAuthorUnknown,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ),
              Text(created == null ? '' : _time.format(created.toLocal()),
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
            const SizedBox(height: 8),
            Text(report.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 4),
            Text(report.content,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, color: AppColors.textPrimary)),
            const SizedBox(height: 6),
            Row(children: [
              const Icon(Icons.location_on_outlined, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  location ?? l10n.reportsTeamNoLocation,
                  style: TextStyle(
                    fontSize: 12,
                    color: location == null ? AppColors.textMuted : AppColors.textSecondary,
                  ),
                ),
              ),
            ]),
            if (report.reviewNote case final note?) ...[
              const SizedBox(height: 6),
              Text(l10n.reportsTeamReviewNote(note),
                  style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: AppColors.textSecondary)),
            ],
            if (report.attachments.isNotEmpty) ...[
              const SizedBox(height: 8),
              AttachmentThumbnails(files: report.attachments),
            ],
            if (report.isPending) ...[
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : onReject,
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppColors.error),
                      foregroundColor: AppColors.error,
                    ),
                    child: Text(l10n.reportsTeamReject),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: busy ? null : onApprove,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.tertiary,
                      foregroundColor: Colors.white,
                    ),
                    child: busy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text(l10n.reportsTeamApprove),
                  ),
                ),
              ]),
            ],
          ]),
        ),
      ),
    );
  }
}

/// Optional review note; pops the note text, or null when cancelled.
class _ReviewNoteDialog extends StatefulWidget {
  final bool approve;
  const _ReviewNoteDialog({required this.approve});

  @override
  State<_ReviewNoteDialog> createState() => _ReviewNoteDialogState();
}

class _ReviewNoteDialogState extends State<_ReviewNoteDialog> {
  final _noteCtrl = TextEditingController();

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final approve = widget.approve;
    return AlertDialog(
      title: Text(approve ? l10n.reportsTeamReviewDialogApproveTitle : l10n.reportsTeamReviewDialogRejectTitle),
      content: TextField(
        controller: _noteCtrl,
        maxLines: 3,
        maxLength: WorkReportsApi.maxReviewNoteLength,
        decoration: InputDecoration(
          labelText: approve ? l10n.reportsTeamReviewDialogApproveNote : l10n.reportsTeamReviewDialogRejectNote,
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.reportsTeamReviewDialogCancel)),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, _noteCtrl.text),
          style: ElevatedButton.styleFrom(
            backgroundColor: approve ? AppColors.tertiary : AppColors.error,
            foregroundColor: Colors.white,
          ),
          child: Text(approve ? l10n.reportsTeamApprove : l10n.reportsTeamReject),
        ),
      ],
    );
  }
}
