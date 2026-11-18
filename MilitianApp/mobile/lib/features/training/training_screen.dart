import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/api_constants.dart';
import '../../core/constants/app_colors.dart';
import '../../core/network/dio_client.dart';
import '../../shared/utils/calendar_date.dart';
import '../../l10n/error_texts.dart';
import '../../l10n/l10n.dart';
import '../../shared/utils/number_format.dart';
import '../auth/providers/auth_provider.dart';
import 'training_result.dart';

// ── Constants ─────────────────────────────────────────────────────────────────
const _requiredDays = 15;

/// Filter chips by training_type code (Web/backend/src/training/training.service.ts)
const _filterTypes = [
  ('all', 'Tất cả'),
  ('military', 'Quân sự'),
  ('political', 'Chính trị'),
  ('fire', 'PCCC'),
  ('first_aid', 'Sơ cứu'),
  ('other', 'Khác'),
];

// ── Screen ────────────────────────────────────────────────────────────────────
class TrainingScreen extends ConsumerStatefulWidget {
  const TrainingScreen({super.key});

  @override
  ConsumerState<TrainingScreen> createState() => _TrainingScreenState();
}

class _TrainingScreenState extends ConsumerState<TrainingScreen> {
  final int _year = DateTime.now().year;
  List<Map<String, dynamic>> _records = [];
  bool _loading = true;
  String? _error;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// GET /training → {data, total, page, limit}. DQTV callers receive only their own records,
  /// so no militiaId is sent (the backend casts it ::uuid). year keeps the progress bar to
  /// this year; 100 is the backend's page size limit.
  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final res = await dio.get(
        ApiConstants.training,
        queryParameters: {'year': _year, 'limit': 100},
      );
      final body = res.data;
      final rows = body is Map && body['data'] is List ? body['data'] as List : const [];
      if (mounted) {
        setState(() {
          _records = rows.whereType<Map>().map((r) => Map<String, dynamic>.from(r)).toList();
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = errorTextFor(context.l10n, e); _loading = false; });
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  /// total_days is NUMERIC: half days are possible
  double get _totalDays =>
      _records.fold<double>(0, (sum, r) => sum + trainingDays(r['totalDays']));

  List<Map<String, dynamic>> get _filtered =>
      _records.where((r) => trainingMatchesFilter(r, _filter)).toList();

  // ── Build ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          _buildHeader(context),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
                : _error != null
                    ? _buildError()
                    : RefreshIndicator(
                        color: AppColors.navy,
                        onRefresh: _load,
                        child: _records.isEmpty
                            ? _buildEmpty()
                            : _buildContent(),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final total = _totalDays;
    final progress = (total / _requiredDays).clamp(0.0, 1.0);
    final statusInfo = _statusInfo(total);

    return Container(
      color: Colors.white,
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // AppBar row
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.chevron_left, color: AppColors.navy, size: 28),
                    onPressed: () => context.pop(),
                  ),
                  const Expanded(
                    child: Text(
                      'Huấn luyện',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
            ),
            // Progress section
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Tiến độ huấn luyện năm $_year',
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                          color: statusInfo.color.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: statusInfo.color.withValues(alpha: 0.3)),
                        ),
                        child: Text(
                          statusInfo.label,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: statusInfo.color,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: progress,
                            minHeight: 10,
                            backgroundColor: AppColors.divider,
                            valueColor: AlwaysStoppedAnimation<Color>(statusInfo.color),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        '${formatDecimal(total)}/$_requiredDays ngày',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Luật DQTV 2019 Điều 26 — yêu cầu tối thiểu $_requiredDays ngày/năm',
                    style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            // Filter chips
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: _filterTypes.map((f) {
                  final active = _filter == f.$1;
                  return GestureDetector(
                    onTap: () => setState(() => _filter = f.$1),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        color: active ? AppColors.navy : Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: active ? AppColors.navy : AppColors.divider,
                          width: 1.5,
                        ),
                      ),
                      child: Text(
                        f.$2,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: active ? Colors.white : AppColors.textSecondary,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 10),
            const Divider(height: 1, color: AppColors.divider),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    final filtered = _filtered;
    if (filtered.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 80),
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('🔍', style: TextStyle(fontSize: 48)),
                SizedBox(height: 12),
                Text(
                  'Không có đợt huấn luyện loại này',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
      itemCount: filtered.length,
      separatorBuilder: (context, index) => const SizedBox(height: 10),
      itemBuilder: (context, index) => _TrainingCard(record: filtered[index]),
    );
  }

  Widget _buildEmpty() {
    return ListView(
      children: const [
        SizedBox(height: 100),
        Column(
          children: [
            Text('🎖', style: TextStyle(fontSize: 56)),
            SizedBox(height: 12),
            Text(
              'Chưa có đợt huấn luyện nào trong năm',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Các đợt huấn luyện sẽ được cập nhật\nkhi có lịch từ đơn vị',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: AppColors.error, size: 48),
            const SizedBox(height: 12),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.navy,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              icon: const Icon(Icons.refresh, color: Colors.white, size: 18),
              label: const Text('Thử lại', style: TextStyle(color: Colors.white)),
              onPressed: _load,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Status Info ───────────────────────────────────────────────────────────────

class _StatusInfo {
  final String label;
  final Color color;
  const _StatusInfo(this.label, this.color);
}

_StatusInfo _statusInfo(double total) {
  if (total >= _requiredDays) {
    return const _StatusInfo('✓ Đạt yêu cầu', AppColors.success);
  } else if (total >= (_requiredDays * 2 / 3).round()) {
    final remaining = _requiredDays - total;
    return _StatusInfo('⚠ Cần thêm ${formatDecimal(remaining)} ngày', AppColors.warning);
  } else {
    return const _StatusInfo('✗ Chưa đạt', AppColors.error);
  }
}

// ── Training Card ─────────────────────────────────────────────────────────────

class _TrainingCard extends StatelessWidget {
  final Map<String, dynamic> record;
  const _TrainingCard({required this.record});

  @override
  Widget build(BuildContext context) {
    final rawType = record['trainingType'];
    final type = rawType is String ? rawType : '';
    final days = trainingDays(record['totalDays']);
    final outcome = TrainingOutcome.fromRecord(record);
    final outcomeColor = switch (outcome) {
      TrainingOutcome.passed => AppColors.success,
      TrainingOutcome.failed => AppColors.error,
      TrainingOutcome.notEvaluated => AppColors.textSecondary,
    };
    final rawLocation = record['location'];
    final location = rawLocation is String ? rawLocation : '';
    // fromDate/toDate are DATE columns ('YYYY-MM-DD'): no timezone conversion
    final dateRange = formatCalendarRange(record['fromDate'], record['toDate']);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border(
          left: BorderSide(
            color: outcomeColor,
            width: 4,
          ),
        ),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)
        ],
      ),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Icon
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.navy.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(_typeIcon(type), style: const TextStyle(fontSize: 22)),
            ),
          ),
          const SizedBox(width: 12),
          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  type.isEmpty ? 'Huấn luyện' : trainingTypeLabel(type),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                if (dateRange.isNotEmpty)
                  Row(
                    children: [
                      const Icon(Icons.calendar_today_outlined,
                          size: 12, color: AppColors.textSecondary),
                      const SizedBox(width: 4),
                      Text(
                        dateRange,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                if (location.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      const Icon(Icons.location_on_outlined,
                          size: 12, color: AppColors.textSecondary),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          location,
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.textSecondary),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          // Days + Result badge
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${formatDecimal(days)} ngày',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                  color: AppColors.navy,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: outcomeColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  outcome.label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: outcomeColor,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

String _typeIcon(String code) {
  switch (code) {
    case 'military':
      return '⚔️';
    case 'political':
      return '📋';
    case 'fire':
      return '🔥';
    case 'first_aid':
      return '➕';
    default:
      return '🎖';
  }
}
