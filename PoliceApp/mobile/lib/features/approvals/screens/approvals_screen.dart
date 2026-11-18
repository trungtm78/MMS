import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../shared/widgets/status_badge.dart';
import '../models/leave_request.dart';
import '../providers/leave_approvals_provider.dart';
import '../widgets/leave_status_texts.dart';

/// Leave requests of the reviewer's scope: pending ones to approve or reject, and the decided
/// ones with who decided, when and why (GET /leave, PATCH /leave/:id/review).
class ApprovalsScreen extends ConsumerStatefulWidget {
  const ApprovalsScreen({super.key});

  @override
  ConsumerState<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends ConsumerState<ApprovalsScreen> with SingleTickerProviderStateMixin {
  static final _day = DateFormat('dd/MM/yyyy');
  static final _time = DateFormat('dd/MM/yyyy HH:mm');

  late TabController _tabCtrl;
  List<LeaveRequest> _pending = [], _approved = [], _rejected = [];
  bool _loading = true;
  AppFailure? _failure;
  final Set<String> _busy = {};

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final api = ref.read(leaveApprovalsApiProvider);
      final results = await Future.wait([
        api.list(status: 'pending'),
        api.list(status: 'approved'),
        api.list(status: 'rejected'),
      ]);
      if (!mounted) return;
      setState(() {
        _pending = results[0].items;
        _approved = results[1].items;
        _rejected = results[2].items;
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

  /// PATCH /leave/:id/review {action, reason?}
  Future<void> _decide(LeaveRequest req, {required bool approve, String? reason}) async {
    final messenger = ScaffoldMessenger.of(context);
    final l10n = context.l10n;
    setState(() => _busy.add(req.id));
    try {
      await ref.read(leaveApprovalsApiProvider).review(req.id, approve: approve, reason: reason);
      messenger.showSnackBar(SnackBar(
        content: Text(approve ? l10n.approvalsScreenApproved : l10n.approvalsScreenRejected),
        backgroundColor: approve ? AppColors.success : AppColors.error,
      ));
      if (mounted) await _load();
    } on AppFailure catch (failure) {
      messenger.showSnackBar(
        SnackBar(content: Text(failureText(l10n, failure)), backgroundColor: AppColors.error),
      );
      // Already decided elsewhere, or no longer in scope: refresh the lists
      if (mounted && (failure.status == 409 || failure.status == 404)) await _load();
    } finally {
      if (mounted) setState(() => _busy.remove(req.id));
    }
  }

  Future<void> _showRejectDialog(LeaveRequest req) async {
    final reason = await showDialog<String>(
      context: context,
      builder: (_) => const _RejectReasonDialog(),
    );
    if (reason != null && mounted) {
      await _decide(req, approve: false, reason: reason);
    }
  }

  String _date(DateTime? d) => d == null ? '?' : _day.format(d);

  String _days(double days) =>
      days == days.roundToDouble() ? days.toInt().toString() : days.toString().replaceAll('.', ',');

  Widget _buildList(AppLocalizations l10n, List<LeaveRequest> list, bool showActions) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: AppColors.navy));
    final failure = _failure;
    if (failure != null) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline, color: AppColors.error, size: 48),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(failureText(l10n, failure), textAlign: TextAlign.center),
        ),
        ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
      ]));
    }
    if (list.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            // Reviewers see their unit's requests; CA officers only those of the DQTV
            // assigned to them (Web/backend/src/leave/leave.service.ts)
            showActions ? l10n.approvalsScreenEmptyPending : l10n.approvalsScreenEmpty,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textSecondary),
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: list.length,
        itemBuilder: (ctx, i) {
          final req = list[i];
          final busy = _busy.contains(req.id);
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text(req.requesterName,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  ),
                  Text(req.code, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                ]),
                const SizedBox(height: 6),
                Text(
                  l10n.approvalsScreenLeavePeriod(
                      req.leaveTypeName, _date(req.fromDate), _date(req.toDate), _days(req.totalDays)),
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                ),
                const SizedBox(height: 4),
                Text(l10n.approvalsScreenReason(req.reason), style: const TextStyle(fontSize: 13)),
                if (showActions) ...[
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: busy ? null : () => _showRejectDialog(req),
                        style: OutlinedButton.styleFrom(
                            side: const BorderSide(color: AppColors.error), foregroundColor: AppColors.error),
                        child: Text(l10n.approvalsScreenReject),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: busy ? null : () => _decide(req, approve: true),
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.tertiary),
                        child: busy
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : Text(l10n.approvalsScreenApprove),
                      ),
                    ),
                  ]),
                ] else ...[
                  // The latest decision (leave.service.ts LEAVE_REQUEST_COLUMNS)
                  if (req.reviewedBy case final reviewer?) ...[
                    const SizedBox(height: 6),
                    Text(l10n.approvalsScreenReviewer(reviewer.fullName),
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ],
                  if (req.reviewedAt case final reviewedAt?)
                    Text(l10n.approvalsScreenReviewedAt(_time.format(reviewedAt.toLocal())),
                        style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                  if (req.reviewNote case final note?)
                    Text(
                      req.status == 'rejected'
                          ? l10n.approvalsScreenRejectReason(note)
                          : l10n.approvalsScreenApproveNote(note),
                      style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic),
                    ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: StatusBadge(
                      status: req.status,
                      label: l10n.leaveStatus(req.status),
                      color: AppColors.leaveStatusColor(req.status),
                    ),
                  ),
                ],
              ]),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: l10n.approvalsScreenTitle,
        showBack: false,
        action: IconButton(tooltip: l10n.approvalsScreenRefresh, icon: const Icon(Icons.refresh), onPressed: _load),
      ),
      body: Column(children: [
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabCtrl,
            labelColor: AppColors.navy,
            unselectedLabelColor: AppColors.textSecondary,
            indicatorColor: AppColors.navy,
            tabs: [
              Tab(text: l10n.approvalsScreenTabPending(_pending.length)),
              Tab(text: l10n.approvalsScreenTabApproved),
              Tab(text: l10n.approvalsScreenTabRejected),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: [
              _buildList(l10n, _pending, true),
              _buildList(l10n, _approved, false),
              _buildList(l10n, _rejected, false),
            ],
          ),
        ),
      ]),
    );
  }
}

/// Asks for the rejection reason; pops the reason, or null when cancelled.
class _RejectReasonDialog extends StatefulWidget {
  const _RejectReasonDialog();

  @override
  State<_RejectReasonDialog> createState() => _RejectReasonDialogState();
}

class _RejectReasonDialogState extends State<_RejectReasonDialog> {
  final _reasonCtrl = TextEditingController();
  bool _missing = false;

  @override
  void dispose() {
    _reasonCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AlertDialog(
      title: Text(l10n.approvalsRejectDialogTitle),
      content: TextField(
        controller: _reasonCtrl,
        maxLength: LeaveApprovalsApi.maxReasonLength,
        decoration: InputDecoration(
          labelText: l10n.approvalsRejectDialogReasonLabel,
          hintText: l10n.approvalsRejectDialogReasonHint,
          errorText: _missing ? l10n.approvalsRejectDialogReasonRequired : null,
        ),
        maxLines: 3,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.approvalsRejectDialogCancel)),
        ElevatedButton(
          onPressed: () {
            final reason = _reasonCtrl.text.trim();
            if (reason.isEmpty) {
              setState(() => _missing = true);
              return;
            }
            Navigator.pop(context, reason);
          },
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
          child: Text(l10n.approvalsRejectDialogConfirm),
        ),
      ],
    );
  }
}
