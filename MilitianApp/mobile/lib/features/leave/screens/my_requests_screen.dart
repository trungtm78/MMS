import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../shared/utils/calendar_date.dart';
import '../../../l10n/error_texts.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/utils/number_format.dart';
import '../leave_balance.dart';
import '../repositories/leave_repository.dart';

// ── Screen ────────────────────────────────────────────────────────────────────
/// The caller's leave requests. A pending request can be cancelled (PATCH /leave/:id/cancel);
/// the backend has no route that edits or resubmits a request, so nothing else is offered.
class MyRequestsScreen extends ConsumerStatefulWidget {
  const MyRequestsScreen({super.key});

  @override
  ConsumerState<MyRequestsScreen> createState() => _MyRequestsScreenState();
}

class _MyRequestsScreenState extends ConsumerState<MyRequestsScreen> {
  List<Map<String, dynamic>> _requests = [];
  bool _loading = true;
  String? _error;
  String _tab = 'pending';
  Map<String, dynamic>? _selected;
  List<LeaveBalanceItem> _balances = const [];
  bool _cancelling = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// GET /leave?mine=true → the caller's own requests (leave.service.ts:135-201) and
  /// GET /leave-balances → bare array (Web/backend/src/leave/leave.controller.ts). The balance
  /// banner is left out when the balances cannot be loaded or this year has none: no numbers are
  /// made up.
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final repo = ref.read(leaveRepositoryProvider);
    try {
      final rows = await repo.myRequests();
      List<LeaveBalanceItem> balances;
      try {
        balances = await repo.balances(DateTime.now().year);
      } catch (_) {
        balances = const [];
      }
      if (mounted) {
        setState(() {
          _requests = rows;
          _balances = balances;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = (e is LeaveException ? e.message : null) ?? errorTextFor(context.l10n, e);
          _loading = false;
        });
      }
    }
  }

  /// Asks for confirmation, then PATCH /leave/:id/cancel. A 404 or 409 means the request changed
  /// meanwhile (gone, or already decided), so the list is reloaded; other errors keep the detail open.
  Future<void> _confirmCancel(Map<String, dynamic> request) async {
    final id = request['id']?.toString();
    if (id == null || _cancelling) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Hủy đơn nghỉ phép?'),
        content: Text('Đơn ${request['code'] ?? ''} sẽ bị hủy và không thể khôi phục.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Không'),
          ),
          TextButton(
            key: const Key('confirm_cancel_leave'),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Hủy đơn'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancelling = true);
    try {
      await ref.read(leaveRepositoryProvider).cancel(id);
      if (!mounted) return;
      setState(() {
        _cancelling = false;
        _selected = null;
      });
      _showSnack('Đã hủy đơn nghỉ phép.');
      await _load();
    } on LeaveException catch (e) {
      if (!mounted) return;
      setState(() {
        _cancelling = false;
        if (e.requestChanged) _selected = null;
      });
      _showSnack(e.message ?? errorTextFor(context.l10n, e), isError: true);
      if (e.requestChanged) await _load();
    }
  }

  void _showSnack(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.error : AppColors.success,
      ));
  }

  List<Map<String, dynamic>> get _filtered =>
      _tab == 'all' ? _requests : _requests.where((r) => r['status'] == _tab).toList();

  int _count(String status) => _requests.where((r) => r['status'] == status).length;

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    if (selected != null) {
      return _DetailView(
        request: selected,
        cancelling: _cancelling,
        onBack: () => setState(() => _selected = null),
        onCancel: () => _confirmCancel(selected),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // ── White header ──────────────────────────────────────────────────
          Container(
            color: Colors.white,
            child: SafeArea(
              bottom: false,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Row(
                      children: [
                        GestureDetector(
                          onTap: () => context.pop(),
                          child: const Icon(Icons.chevron_left, color: AppColors.navy, size: 28),
                        ),
                        const Expanded(
                          child: Text('Đơn Của Tôi',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                        ),
                        // Balances the back arrow so the title stays centred
                        const SizedBox(width: 28),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Leave balance banner: one line per leave type of this year
                  if (_balances.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: AppColors.navy.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppColors.navy.withValues(alpha: 0.15)),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Padding(
                              padding: EdgeInsets.only(top: 1),
                              child: Icon(Icons.event_available_outlined, size: 16, color: AppColors.navy),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  for (final balance in _balances)
                                    Text(
                                      balance.label,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 12,
                                        color: AppColors.navy,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: 8),
                  // Tabs
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        _TabBtn('Chờ duyệt', 'pending', _tab, _count('pending'), (v) => setState(() => _tab = v)),
                        _TabBtn('Đã duyệt', 'approved', _tab, _count('approved'), (v) => setState(() => _tab = v)),
                        _TabBtn('Bị từ chối', 'rejected', _tab, _count('rejected'), (v) => setState(() => _tab = v)),
                        _TabBtn('Đã hủy', 'cancelled', _tab, _count('cancelled'), (v) => setState(() => _tab = v)),
                        _TabBtn('Tất cả', 'all', _tab, 0, (v) => setState(() => _tab = v)),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.divider),
                ],
              ),
            ),
          ),

          // ── List ──────────────────────────────────────────────────────────
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
                : _error != null
                    ? Center(child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(_error!, style: const TextStyle(color: AppColors.error)),
                          const SizedBox(height: 12),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy),
                            onPressed: _load,
                            child: const Text('Thử lại', style: TextStyle(color: Colors.white)),
                          ),
                        ],
                      ))
                    : _filtered.isEmpty
                        ? _buildEmpty()
                        : RefreshIndicator(
                            color: AppColors.navy,
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                              itemCount: _filtered.length,
                              separatorBuilder: (context, index) => const SizedBox(height: 10),
                              itemBuilder: (context, index) {
                                final item = _filtered[index];
                                return _RequestCard(
                                  item: item,
                                  onTap: () => setState(() => _selected = item),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty() => const Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text('📝', style: TextStyle(fontSize: 56)),
        SizedBox(height: 12),
        Text('Chưa có đơn nào',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
        SizedBox(height: 6),
        Text('Các đơn xin nghỉ sẽ xuất hiện ở đây',
          style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
      ],
    ),
  );
}

// ── Tab Button ────────────────────────────────────────────────────────────────
class _TabBtn extends StatelessWidget {
  final String label;
  final String value;
  final String current;
  final int count;
  final ValueChanged<String> onTap;
  const _TabBtn(this.label, this.value, this.current, this.count, this.onTap);

  @override
  Widget build(BuildContext context) {
    final active = current == value;
    return GestureDetector(
      onTap: () => onTap(value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
        margin: const EdgeInsets.only(right: 16),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(
            color: active ? AppColors.navy : Colors.transparent,
            width: 2,
          )),
        ),
        child: Text(
          count > 0 ? '$label ($count)' : label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: active ? AppColors.navy : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

// ── Request Card ──────────────────────────────────────────────────────────────
class _RequestCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onTap;
  const _RequestCard({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final status = item['status'] as String? ?? 'pending';
    final badge = _badge(status);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border(left: BorderSide(color: badge.borderColor, width: 4)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
        ),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Code + status badge
            Row(
              children: [
                Text(item['code'] as String? ?? '',
                  style: const TextStyle(fontSize: 11, color: AppColors.textSecondary, fontFamily: 'monospace')),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: badge.bg, borderRadius: BorderRadius.circular(20)),
                  child: Text(badge.label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: badge.fg)),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Type
            Row(
              children: [
                Text(item['typeIcon'] as String? ?? '📋', style: const TextStyle(fontSize: 20)),
                const SizedBox(width: 8),
                Text(_leaveTypeName(item) ?? 'Nghỉ phép',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
              ],
            ),
            const SizedBox(height: 6),

            // Date range
            Row(
              children: [
                const Icon(Icons.calendar_today_outlined, size: 14, color: AppColors.textSecondary),
                const SizedBox(width: 4),
                Text(
                  item['dateRange'] as String? ?? _formatRange(item),
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.textPrimary),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(_daysText(item), style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            const SizedBox(height: 4),
            Text('Gửi: ${_submittedText(item)}',
              style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
            const SizedBox(height: 6),
            Text(item['reason'] as String? ?? '',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              maxLines: 1, overflow: TextOverflow.ellipsis),

            const SizedBox(height: 8),
            const Divider(height: 1, color: AppColors.divider),
            const SizedBox(height: 8),

            // Status footer
            if (status == 'pending')
              Row(children: [
                Container(
                  width: 24, height: 24,
                  decoration: const BoxDecoration(color: AppColors.navy, shape: BoxShape.circle),
                  child: const Center(child: Text('CA', style: TextStyle(fontSize: 8, color: Colors.white, fontWeight: FontWeight.bold))),
                ),
                const SizedBox(width: 8),
                const Text('Đang chờ: Công An Khu Vực',
                  style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
              ]),

            if (status == 'approved')
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(children: [
                    Container(
                      width: 24, height: 24,
                      decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                      child: const Icon(Icons.check, size: 14, color: Colors.white),
                    ),
                    const SizedBox(width: 8),
                    Text(item['approver'] as String? ?? '',
                      style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  ]),
                  Text(item['approvedDate'] as String? ?? '',
                    style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                ],
              ),

            // No route resubmits a rejected request (leave.controller.ts), so no "Gửi lại" link
            if (status == 'rejected')
              Text('Lý do từ chối: ${item['rejectReason'] as String? ?? ''}',
                style: const TextStyle(fontSize: 11, color: AppColors.error)),
          ],
        ),
      ),
    );
  }
}

// ── Detail View ───────────────────────────────────────────────────────────────
class _DetailView extends StatelessWidget {
  final Map<String, dynamic> request;
  final VoidCallback onBack;

  /// PATCH /leave/:id/cancel is running
  final bool cancelling;
  final VoidCallback onCancel;

  const _DetailView({
    required this.request,
    required this.onBack,
    required this.cancelling,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final status = request['status'] as String? ?? 'pending';
    final badge = _badge(status);

    // Reviewer names and review dates are not in GET /leave, so none are shown
    final timeline = <(String, String, String, String)>[
      ('Đã gửi', 'completed', _submittedText(request), 'Bạn'),
      ('CA Khu vực', status == 'pending' ? 'pending' : 'completed', '', 'Công An Khu Vực'),
      ('CA Phường', status == 'approved' ? 'completed' : 'pending', '', 'Công An Phường'),
    ];

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // Header
          Container(
            color: Colors.white,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    GestureDetector(
                      onTap: onBack,
                      child: const Icon(Icons.chevron_left, color: AppColors.navy, size: 28),
                    ),
                    const Expanded(child: SizedBox()),
                    Text(request['code'] as String? ?? '',
                      style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, fontFamily: 'monospace')),
                    const Expanded(child: SizedBox()),
                    // Balances the back arrow so the code stays centred
                    const SizedBox(width: 28),
                  ],
                ),
              ),
            ),
          ),
          const Divider(height: 1, color: AppColors.divider),

          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Status + timeline
                  _Card(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(color: badge.bg, borderRadius: BorderRadius.circular(20)),
                        child: Text(badge.label, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: badge.fg)),
                      ),
                      const SizedBox(height: 16),
                      const Text('Quy trình phê duyệt',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
                      const SizedBox(height: 12),
                      ...timeline.asMap().entries.map((e) {
                        final i = e.key;
                        final t = e.value;
                        final done = t.$2 == 'completed';
                        return Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Column(
                              children: [
                                Container(
                                  width: 32, height: 32,
                                  decoration: BoxDecoration(
                                    color: done ? AppColors.success : AppColors.divider,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Center(
                                    child: done
                                        ? const Icon(Icons.check, size: 16, color: Colors.white)
                                        : Text('${i + 1}', style: const TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.bold, fontSize: 12)),
                                  ),
                                ),
                                if (i < timeline.length - 1)
                                  Container(width: 2, height: 32,
                                    color: done ? AppColors.success : AppColors.divider),
                              ],
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(bottom: 16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(t.$1, style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13,
                                      color: done ? AppColors.textPrimary : AppColors.textSecondary,
                                    )),
                                    Text(t.$4, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                                    if (t.$3.isNotEmpty)
                                      Text(t.$3, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        );
                      }),
                    ],
                  )),
                  const SizedBox(height: 12),

                  // Details
                  _Card(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Chi tiết đơn',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
                      const SizedBox(height: 12),
                      _DetailRow('Loại nghỉ', _leaveTypeName(request) ?? ''),
                      _DetailRow('Thời gian nghỉ', request['dateRange'] ?? _formatRange(request)),
                      _DetailRow('Số ngày', _daysText(request)),
                      _DetailRow('Lý do', request['reason'] ?? ''),
                      _DetailRow('Người thay thế', request['replacement'] ?? '—'),
                    ],
                  )),
                  const SizedBox(height: 12),

                  // Reject reason
                  if (status == 'rejected' && (request['rejectReason'] as String? ?? '').isNotEmpty)
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.error.withValues(alpha: 0.08),
                        border: Border.all(color: AppColors.error.withValues(alpha: 0.2)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Lý do từ chối',
                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.error)),
                          const SizedBox(height: 6),
                          Text(request['rejectReason'] as String,
                            style: const TextStyle(fontSize: 13, color: AppColors.textPrimary)),
                          const SizedBox(height: 4),
                          const Text('Đề xuất: Bổ sung giấy tờ và tạo đơn mới',
                            style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: _buildFooter(status, context),
    );
  }

  /// Only a pending request can be cancelled (leave.service.ts:434-435). No backend route edits or
  /// resubmits a rejected request, so nothing is offered for it.
  Widget? _buildFooter(String status, BuildContext context) {
    if (status != 'pending') return null;
    return Container(
      color: Colors.white,
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      child: SizedBox(
        height: 48,
        child: ElevatedButton(
          key: const Key('cancel_leave'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.error,
            disabledBackgroundColor: AppColors.error.withValues(alpha: 0.5),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          onPressed: cancelling ? null : onCancel,
          child: cancelling
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Hủy đơn', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
    ),
    child: child,
  );
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow(this.label, this.value);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
        const Divider(height: 14, color: AppColors.divider),
      ],
    ),
  );
}

// ── Badge helpers ─────────────────────────────────────────────────────────────
class _BadgeData {
  final String label;
  final Color fg;
  final Color bg;
  final Color borderColor;
  const _BadgeData(this.label, this.fg, this.bg, this.borderColor);
}

_BadgeData _badge(String status) {
  switch (status) {
    case 'approved':
      return _BadgeData('Đã duyệt', AppColors.success,
          AppColors.success.withValues(alpha: 0.1), AppColors.success);
    case 'rejected':
      return _BadgeData('Từ chối', AppColors.error,
          AppColors.error.withValues(alpha: 0.1), AppColors.error);
    case 'cancelled':
      return const _BadgeData('Đã hủy', AppColors.textSecondary,
          AppColors.divider, AppColors.textMuted);
    default:
      return _BadgeData('Chờ duyệt', AppColors.blue,
          AppColors.blue.withValues(alpha: 0.1), AppColors.blue);
  }
}

/// fromDate/toDate are DATE columns ('YYYY-MM-DD'), shown without timezone shifts
String _formatRange(Map<String, dynamic> item) => formatCalendarRange(
      item['fromDate'] ?? item['from_date'],
      item['toDate'] ?? item['to_date'],
    );

String? _leaveTypeName(Map<String, dynamic> item) {
  for (final key in ['leaveTypeName', 'type', 'leaveType']) {
    final value = item[key];
    if (value is String && value.trim().isNotEmpty) return value;
  }
  return null;
}

/// total_days is NUMERIC (0.5 for a half day) and may arrive as a string
String _daysText(Map<String, dynamic> item) {
  final days = parseDecimal(item['totalDays'] ?? item['days']);
  return days == null ? '' : '${formatDecimal(days)} ngày';
}

/// createdAt is a timestamp: shown in local time
String _submittedText(Map<String, dynamic> item) {
  final raw = item['createdAt'] ?? item['created_at'] ?? item['submittedDate'];
  final at = raw is String ? DateTime.tryParse(raw) : null;
  if (at == null) return formatCalendarDate(raw);
  return DateFormat(AppStrings.datetimeFormat).format(at.toLocal());
}
