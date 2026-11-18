import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/network/dio_client.dart';
import '../../../l10n/error_texts.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/utils/number_format.dart';
import '../../auth/providers/auth_provider.dart';
import '../kpi_data.dart';

/// Monthly KPI from GET /kpi/current and GET /kpi/history
/// (Web/backend/src/kpi/kpi.controller.ts:80-121). Only what the backend returns is shown:
/// it has no leaderboard or achievements endpoint.
class KpiScreen extends ConsumerStatefulWidget {
  const KpiScreen({super.key});

  @override
  ConsumerState<KpiScreen> createState() => _KpiScreenState();
}

class _KpiScreenState extends ConsumerState<KpiScreen> {
  KpiCurrent _current = const KpiCurrent();
  List<KpiTrendPoint> _trend = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// Both endpoints return bare JSON, without a {data} envelope
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = DioClient.getInstance(ref.read(secureStorageProvider));
      final responses = await Future.wait([
        dio.get<dynamic>(ApiConstants.kpiCurrent),
        dio.get<dynamic>(ApiConstants.kpiHistory),
      ]);
      if (!mounted) return;
      setState(() {
        _current = KpiCurrent.fromJson(responses[0].data);
        _trend = kpiTrend(responses[1].data);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorTextFor(context.l10n, e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        color: AppColors.navy,
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // ── Yellow header ───────────────────────────────────────────────
            SliverAppBar(
              pinned: true,
              expandedHeight: 0,
              backgroundColor: Colors.transparent,
              flexibleSpace: Container(
                decoration: const BoxDecoration(
                  gradient: AppColors.headerGradient,
                  border: Border(bottom: BorderSide(color: AppColors.primary, width: 4)),
                ),
              ),
              automaticallyImplyLeading: false,
              title: const Text('Chỉ Tiêu',
                  style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 20)),
              centerTitle: false,
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 80),
                child: _loading
                    ? const Padding(
                        padding: EdgeInsets.only(top: 80),
                        child: Center(child: CircularProgressIndicator(color: AppColors.navy)),
                      )
                    : _error != null
                        ? _buildError()
                        : _buildContent(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildError() => Padding(
        padding: const EdgeInsets.only(top: 60),
        child: Column(
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
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy),
              onPressed: _load,
              icon: const Icon(Icons.refresh, color: Colors.white, size: 18),
              label: const Text(AppStrings.retry, style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );

  Widget _buildContent() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _OverallCard(kpi: _current),
          const SizedBox(height: 16),
          _ComponentScoresCard(kpi: _current),
          const SizedBox(height: 16),
          _TrendCard(points: _trend),
          const SizedBox(height: 16),
          const _UnsupportedNote(),
        ],
      );
}

BoxDecoration _cardDecoration() => BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
    );

// ── Overall score ─────────────────────────────────────────────────────────────
class _OverallCard extends StatelessWidget {
  final KpiCurrent kpi;
  const _OverallCard({required this.kpi});

  @override
  Widget build(BuildContext context) {
    final score = kpi.score;
    final change = kpi.change;
    final rank = kpi.rank;
    final month = kpi.month;
    final year = kpi.year;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.tertiary, width: 2),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Điểm chỉ tiêu tổng thể',
                    style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ),
              if (month != null && year != null)
                Text('Tháng $month/$year',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ],
          ),
          const SizedBox(height: 8),
          if (score == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('Chưa có đánh giá tháng này',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
            )
          else
            Row(
              children: [
                Expanded(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(formatDecimal(score, fractionDigits: 1),
                          style: const TextStyle(
                              fontSize: 48, fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                      const Text('/100', style: TextStyle(fontSize: 18, color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                _CircularScore(score),
              ],
            ),
          if (change != null || rank != null) ...[
            const SizedBox(height: 12),
            const Divider(height: 1, color: AppColors.divider),
            const SizedBox(height: 12),
            Wrap(
              spacing: 16,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (change != null) _ChangeText(change),
                if (rank != null)
                  Text('Hạng #$rank',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.navy)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Change from last month; sign and colour follow the value
class _ChangeText extends StatelessWidget {
  final double change;
  const _ChangeText(this.change);

  @override
  Widget build(BuildContext context) {
    final color = change > 0
        ? AppColors.success
        : change < 0
            ? AppColors.error
            : AppColors.textSecondary;
    final icon = change > 0
        ? Icons.trending_up
        : change < 0
            ? Icons.trending_down
            : Icons.trending_flat;
    final sign = change > 0
        ? '+'
        : change < 0
            ? '-'
            : '';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(width: 4),
        Text('$sign${formatDecimal(change.abs())} so với tháng trước',
            style: TextStyle(fontSize: 12, color: color)),
      ],
    );
  }
}

class _CircularScore extends StatelessWidget {
  final double value;
  const _CircularScore(this.value);

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 100,
        height: 100,
        child: Stack(
          children: [
            SizedBox(
              width: 100,
              height: 100,
              child: CircularProgressIndicator(
                value: (value / 100).clamp(0.0, 1.0),
                strokeWidth: 8,
                backgroundColor: AppColors.divider,
                valueColor: const AlwaysStoppedAnimation(AppColors.navy),
              ),
            ),
            Center(
              child: Text('${formatDecimal(value, fractionDigits: 1)}%',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.navy)),
            ),
          ],
        ),
      );
}

// ── Component scores ─────────────────────────────────────────────────────────
class _ComponentScoresCard extends StatelessWidget {
  final KpiCurrent kpi;
  const _ComponentScoresCard({required this.kpi});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: _cardDecoration(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Điểm thành phần',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
            const SizedBox(height: 12),
            _ScoreRow('Chấm công', kpi.attendanceScore),
            const Divider(height: 16, color: AppColors.divider),
            _ScoreRow('Nhiệm vụ', kpi.taskScore),
          ],
        ),
      );
}

class _ScoreRow extends StatelessWidget {
  final String label;
  final double? score;
  const _ScoreRow(this.label, this.score);

  @override
  Widget build(BuildContext context) {
    final value = score;
    return Row(
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textPrimary)),
        ),
        Text(
          value == null ? '—' : '${formatDecimal(value, fractionDigits: 1)}/100',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.navy),
        ),
      ],
    );
  }
}

// ── Trend ─────────────────────────────────────────────────────────────────────
class _TrendCard extends StatelessWidget {
  final List<KpiTrendPoint> points;
  const _TrendCard({required this.points});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: _cardDecoration(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Xu hướng 6 tháng',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
            const SizedBox(height: 16),
            if (points.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text('Chưa có dữ liệu',
                      style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                ),
              )
            else
              SizedBox(height: 160, child: _TrendChart(points: points)),
          ],
        ),
      );
}

class _TrendChart extends StatelessWidget {
  final List<KpiTrendPoint> points;
  const _TrendChart({required this.points});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (final p in points)
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text(formatDecimal(p.score, fractionDigits: 1),
                    style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppColors.navy)),
                const SizedBox(height: 2),
                Container(
                  // Max bar height 120 for a score of 100
                  height: (p.score / 100).clamp(0.0, 1.0) * 120,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: const BoxDecoration(
                    gradient: AppColors.checkInGradient,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(4)),
                  ),
                ),
                const SizedBox(height: 4),
                Text(p.label, style: const TextStyle(fontSize: 10, color: AppColors.textSecondary)),
              ],
            ),
          ),
      ],
    );
  }
}

// ── Not supported by the backend ─────────────────────────────────────────────
class _UnsupportedNote extends StatelessWidget {
  const _UnsupportedNote();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.cardHover,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        child: const Row(
          children: [
            Icon(Icons.info_outline, size: 18, color: AppColors.textSecondary),
            SizedBox(width: 8),
            Expanded(
              child: Text('Máy chủ chưa hỗ trợ bảng xếp hạng chi tiết và thành tích.',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ),
          ],
        ),
      );
}
