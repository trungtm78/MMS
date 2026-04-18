import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';

// ── Screen ────────────────────────────────────────────────────────────────────
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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final res = await dio.get(ApiConstants.leaveHistory);
      final data = (res.data['data'] as List?) ?? [];
      if (mounted) {
        setState(() {
          _requests = data.cast<Map<String, dynamic>>();
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() { _error = 'Lỗi tải dữ liệu'; _loading = false; });
    }
  }

  List<Map<String, dynamic>> get _filtered =>
      _tab == 'all' ? _requests : _requests.where((r) => r['status'] == _tab).toList();

  int _count(String status) => _requests.where((r) => r['status'] == status).length;

  @override
  Widget build(BuildContext context) {
    if (_selected != null) {
      return _DetailView(request: _selected!, onBack: () => setState(() => _selected = null));
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
                        const Icon(Icons.filter_list, color: AppColors.textSecondary, size: 22),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Tabs
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        _TabBtn('Chờ duyệt', 'pending', _tab, _count('pending'), (v) => setState(() => _tab = v)),
                        _TabBtn('Đã duyệt', 'approved', _tab, _count('approved'), (v) => setState(() => _tab = v)),
                        _TabBtn('Bị từ chối', 'rejected', _tab, _count('rejected'), (v) => setState(() => _tab = v)),
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
                              separatorBuilder: (_, __) => const SizedBox(height: 10),
                              itemBuilder: (ctx, i) => _RequestCard(
                                item: _filtered[i],
                                onTap: () => setState(() => _selected = _filtered[i]),
                              ),
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty() => Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: const [
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
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
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
                Text(item['type'] as String? ?? item['leaveType'] as String? ?? 'Nghỉ phép',
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
            Text('${item['days'] ?? ''} ngày', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            const SizedBox(height: 4),
            Text('Gửi: ${item['submittedDate'] ?? item['created_at'] ?? ''}',
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

            if (status == 'rejected')
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Lý do từ chối: ${item['rejectReason'] as String? ?? ''}',
                    style: const TextStyle(fontSize: 11, color: AppColors.error)),
                  const SizedBox(height: 4),
                  const Text('Gửi lại', style: TextStyle(fontSize: 12, color: AppColors.navy, fontWeight: FontWeight.w600)),
                ],
              ),
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
  const _DetailView({required this.request, required this.onBack});

  @override
  Widget build(BuildContext context) {
    final status = request['status'] as String? ?? 'pending';
    final badge = _badge(status);

    final timeline = [
      ('Đã gửi', 'completed', request['submittedDate'] ?? request['created_at'] ?? '', 'Bạn'),
      ('CA Khu vực', status == 'pending' ? 'pending' : 'completed',
          request['approvedDate'] ?? '', 'Trung úy Võ Văn Tân'),
      ('CA Phường', status == 'approved' ? 'completed' : 'pending',
          request['approvedDate'] ?? '', 'Đại úy Phạm Minh Tuấn'),
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
                    const Text('Chia sẻ', style: TextStyle(fontSize: 13, color: AppColors.navy, fontWeight: FontWeight.w600)),
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
                      _DetailRow('Loại nghỉ', request['type'] ?? request['leaveType'] ?? ''),
                      _DetailRow('Thời gian nghỉ', request['dateRange'] ?? _formatRange(request)),
                      _DetailRow('Số ngày', '${request['days'] ?? ''} ngày'),
                      _DetailRow('Lý do', request['reason'] ?? ''),
                      _DetailRow('Người thay thế', request['replacement'] ?? 'Trần Văn Bình'),
                    ],
                  )),
                  const SizedBox(height: 12),

                  // Reject reason
                  if (status == 'rejected' && (request['rejectReason'] as String? ?? '').isNotEmpty)
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.error.withOpacity(0.08),
                        border: Border.all(color: AppColors.error.withOpacity(0.2)),
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
                          const Text('Đề xuất: Bổ sung giấy tờ và gửi lại đơn',
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

  Widget? _buildFooter(String status, BuildContext context) {
    if (status == 'pending') {
      return Container(
        color: Colors.white,
        padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: SizedBox(
          height: 48,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () {},
            child: const Text('Hủy đơn', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ),
      );
    }
    if (status == 'rejected') {
      return Container(
        color: Colors.white,
        padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: SizedBox(
          height: 48,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.navy,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () {},
            child: const Text('Sửa & gửi lại', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ),
      );
    }
    return null;
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
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
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
          AppColors.success.withOpacity(0.1), AppColors.success);
    case 'rejected':
      return _BadgeData('Bị từ chối', AppColors.error,
          AppColors.error.withOpacity(0.1), AppColors.error);
    default:
      return _BadgeData('Chờ duyệt', AppColors.blue,
          AppColors.blue.withOpacity(0.1), AppColors.blue);
  }
}

String _formatRange(Map<String, dynamic> item) {
  final from = item['fromDate'] as String? ?? item['from_date'] as String? ?? '';
  final to = item['toDate'] as String? ?? item['to_date'] as String? ?? '';
  if (from.isEmpty) return '';
  if (to.isEmpty || from == to) return from;
  return '$from - $to';
}
