import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';

class KpiScreen extends ConsumerStatefulWidget {
  const KpiScreen({super.key});

  @override
  ConsumerState<KpiScreen> createState() => _KpiScreenState();
}

class _KpiScreenState extends ConsumerState<KpiScreen> {
  Map<String, dynamic>? _kpiData;

  // Static fallback data (mirrors KPI.tsx mock)
  static const _categories = [
    _Category('Chấm công', '✓', 95.0, AppColors.success,
        [('Ngày công', '22/22'), ('Đúng hạn', '20/22'), ('Trễ', '2 lần'), ('Sớm', '0 lần')]),
    _Category('Hoàn thành nhiệm vụ', '📋', 92.0, AppColors.blue,
        [('Hoàn thành', '15/16'), ('Đúng hạn', '14/16'), ('Quá hạn', '1'), ('Chất lượng TB', '4.5⭐')]),
    _Category('Kỷ luật', '🛡️', 100.0, AppColors.success,
        [('Vi phạm', '0'), ('Cảnh cáo', '0'), ('Khen thưởng', '2')]),
    _Category('Đánh giá từ cấp trên', '⭐', 90.0, AppColors.blue,
        [('Chất lượng TB', '4.5/5'), ('Số đánh giá', '3 đánh giá')]),
    _Category('Thái độ làm việc', '😊', 95.0, AppColors.success,
        [('Đặc điểm', 'Tích cực, Hợp tác, Trách nhiệm')]),
  ];

  static const _leaderboard = [
    _Leader(1, 'Trần Văn Bình', 'TB', 95.2, true, false),
    _Leader(2, 'Lê Thị Cẩm', 'LC', 93.8, true, false),
    _Leader(3, 'Nguyễn Văn An', 'NA', 92.4, true, true),
    _Leader(4, 'Phạm Minh Đức', 'PD', 91.5, false, false),
    _Leader(5, 'Hoàng Thị Ế', 'HE', 90.2, true, false),
  ];

  static const _achievements = [
    _Achievement('🏆', 'Nhân viên xuất sắc tháng 11', '15/11/2024', true),
    _Achievement('⏰', '100% chấm công đúng giờ', '01/12/2024', true),
    _Achievement('📋', 'Hoàn thành 50 nhiệm vụ', '10/12/2024', true),
    _Achievement('🌟', 'Chỉ tiêu trên 95 điểm', '', false),
  ];

  static const _trend = [85.0, 88.0, 87.0, 90.0, 89.0, 92.4];
  static const _trendLabels = ['T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final res = await dio.get(ApiConstants.kpiCurrent);
      if (mounted) setState(() { _kpiData = res.data['data']; });
    } catch (_) {
      // fallback to static data — no state change needed
    }
  }

  double get _overall => (_kpiData?['score'] as num?)?.toDouble() ?? 92.4;
  double get _change => (_kpiData?['change'] as num?)?.toDouble() ?? 2.3;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          // ── Yellow header ─────────────────────────────────────────────────
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ── Overall KPI card ─────────────────────────────────────
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.tertiary, width: 2),
                      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
                    ),
                    child: Column(
                      children: [
                        Container(
                          width: 64, height: 64,
                          decoration: const BoxDecoration(gradient: AppColors.greenGradient, shape: BoxShape.circle),
                          child: const Icon(Icons.emoji_events, color: Colors.white, size: 32),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Điểm chỉ tiêu tổng thể',
                                    style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                                  const SizedBox(height: 4),
                                  Row(
                                    crossAxisAlignment: CrossAxisAlignment.baseline,
                                    textBaseline: TextBaseline.alphabetic,
                                    children: [
                                      Text(_overall.toStringAsFixed(1),
                                        style: const TextStyle(fontSize: 48, fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                                      const Text('/100',
                                        style: TextStyle(fontSize: 18, color: AppColors.textSecondary)),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            // Circular progress
                            _CircularScore(_overall),
                          ],
                        ),
                        const SizedBox(height: 16),
                        const Divider(height: 1, color: AppColors.divider),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: AppColors.cardHover,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Text('Xuất sắc',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.success)),
                            ),
                            const SizedBox(width: 12),
                            const Icon(Icons.trending_up, color: AppColors.success, size: 18),
                            const SizedBox(width: 4),
                            Text('+${_change.toStringAsFixed(1)} so với tháng trước',
                              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        const Align(
                          alignment: Alignment.centerLeft,
                          child: Text('Cao hơn TB khu phố: +5.1 điểm',
                            style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── Category breakdown ───────────────────────────────────
                  ..._categories.map((cat) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _CategoryCard(cat),
                  )),

                  // ── Ranking ──────────────────────────────────────────────
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
                    ),
                    child: Column(
                      children: [
                        const Align(
                          alignment: Alignment.centerLeft,
                          child: Text('Xếp hạng trong Khu phố 1',
                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
                        ),
                        const SizedBox(height: 8),
                        Text('#3/28',
                          style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold, color: AppColors.navy)),
                        const SizedBox(height: 16),
                        // Podium
                        _Podium(leaders: _leaderboard.take(3).toList()),
                        const SizedBox(height: 16),
                        const Divider(height: 1, color: AppColors.divider),
                        const SizedBox(height: 12),
                        // Full leaderboard
                        ..._leaderboard.map((p) => _LeaderRow(p)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── Achievements ─────────────────────────────────────────
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: const [
                            Text('Thành tích',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
                            Text('Xem tất cả',
                              style: TextStyle(fontSize: 12, color: AppColors.navy, fontWeight: FontWeight.w600)),
                          ],
                        ),
                        const SizedBox(height: 12),
                        GridView.count(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          crossAxisCount: 2,
                          mainAxisSpacing: 10,
                          crossAxisSpacing: 10,
                          childAspectRatio: 1.5,
                          children: _achievements.map((a) => _AchievementCard(a)).toList(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── Trend chart ──────────────────────────────────────────
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Xu hướng 6 tháng',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
                        const SizedBox(height: 16),
                        SizedBox(
                          height: 160,
                          child: _TrendChart(values: _trend, labels: _trendLabels),
                        ),
                        const SizedBox(height: 12),
                        const Divider(height: 1, color: AppColors.divider),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(width: 12, height: 12,
                              decoration: const BoxDecoration(color: AppColors.navy, shape: BoxShape.circle)),
                            const SizedBox(width: 6),
                            const Text('Chỉ tiêu của bạn',
                              style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                            const SizedBox(width: 16),
                            Container(width: 12, height: 2, color: AppColors.textMuted),
                            const SizedBox(width: 6),
                            const Text('Trung bình',
                              style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                          ],
                        ),
                      ],
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

// ── Data models ───────────────────────────────────────────────────────────────
class _Category {
  final String name;
  final String icon;
  final double score;
  final Color color;
  final List<(String, String)> details;
  const _Category(this.name, this.icon, this.score, this.color, this.details);
}

class _Leader {
  final int rank;
  final String name;
  final String avatar;
  final double score;
  final bool trendUp;
  final bool isMe;
  const _Leader(this.rank, this.name, this.avatar, this.score, this.trendUp, this.isMe);
}

class _Achievement {
  final String icon;
  final String title;
  final String date;
  final bool earned;
  const _Achievement(this.icon, this.title, this.date, this.earned);
}

// ── Circular score ────────────────────────────────────────────────────────────
class _CircularScore extends StatelessWidget {
  final double value;
  const _CircularScore(this.value);

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 100, height: 100,
    child: Stack(
      children: [
        SizedBox(
          width: 100, height: 100,
          child: CircularProgressIndicator(
            value: value / 100,
            strokeWidth: 8,
            backgroundColor: AppColors.divider,
            valueColor: const AlwaysStoppedAnimation(AppColors.navy),
          ),
        ),
        Center(
          child: Text('${value.toStringAsFixed(1)}%',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.navy)),
        ),
      ],
    ),
  );
}

// ── Category card ─────────────────────────────────────────────────────────────
class _CategoryCard extends StatelessWidget {
  final _Category cat;
  const _CategoryCard(this.cat);

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(cat.icon, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(cat.name,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textPrimary)),
            ),
            Text('${cat.score.toStringAsFixed(0)}/100',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: cat.color)),
          ],
        ),
        const SizedBox(height: 10),
        // Progress bar
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: cat.score / 100,
            backgroundColor: AppColors.divider,
            valueColor: AlwaysStoppedAnimation(cat.color),
            minHeight: 8,
          ),
        ),
        const SizedBox(height: 10),
        // Detail grid
        Wrap(
          spacing: 12,
          runSpacing: 6,
          children: cat.details.map((d) => Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${d.$1}: ', style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
              Text(d.$2, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
            ],
          )).toList(),
        ),
      ],
    ),
  );
}

// ── Podium ────────────────────────────────────────────────────────────────────
class _Podium extends StatelessWidget {
  final List<_Leader> leaders; // top 3
  const _Podium({required this.leaders});

  @override
  Widget build(BuildContext context) {
    // order: 2nd, 1st, 3rd
    final order = [leaders[1], leaders[0], leaders[2]];
    final heights = [80.0, 96.0, 64.0];
    final medals = ['🥈', '🥇', '🥉'];
    final podiumColors = [AppColors.silver, AppColors.gold, AppColors.bronze];

    return SizedBox(
      height: 170,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: List.generate(3, (i) {
          final p = order[i];
          return Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    color: p.isMe ? AppColors.navy : AppColors.textSecondary,
                    shape: BoxShape.circle,
                    border: p.isMe ? Border.all(color: AppColors.navy.withOpacity(0.3), width: 3) : null,
                  ),
                  child: Center(
                    child: Text(p.avatar,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  p.name.split(' ').last,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: p.isMe ? AppColors.navy : AppColors.textPrimary,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Container(
                  width: double.infinity,
                  height: heights[i],
                  decoration: BoxDecoration(
                    color: podiumColors[i],
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(medals[i], style: const TextStyle(fontSize: 20)),
                      Text(p.score.toStringAsFixed(1),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white)),
                    ],
                  ),
                ),
              ],
            ),
          );
        }),
      ),
    );
  }
}

// ── Leader row ────────────────────────────────────────────────────────────────
class _LeaderRow extends StatelessWidget {
  final _Leader p;
  const _LeaderRow(this.p);

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 8),
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
    decoration: BoxDecoration(
      color: p.isMe ? AppColors.cardBlueLight : AppColors.cardHover,
      borderRadius: BorderRadius.circular(10),
      border: p.isMe ? Border.all(color: AppColors.navy) : null,
    ),
    child: Row(
      children: [
        SizedBox(
          width: 28,
          child: Text('#${p.rank}',
            style: TextStyle(
              fontSize: 13, fontWeight: FontWeight.bold,
              color: p.isMe ? AppColors.navy : AppColors.textSecondary,
            )),
        ),
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(
            color: p.isMe ? AppColors.navy : AppColors.textSecondary,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(p.avatar,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(p.name,
            style: TextStyle(
              fontSize: 13, fontWeight: FontWeight.w500,
              color: p.isMe ? AppColors.navy : AppColors.textPrimary,
            )),
        ),
        Text(p.score.toStringAsFixed(1),
          style: TextStyle(
            fontSize: 13, fontWeight: FontWeight.bold,
            color: p.isMe ? AppColors.navy : AppColors.textPrimary,
          )),
        const SizedBox(width: 6),
        Icon(
          p.trendUp ? Icons.trending_up : Icons.trending_down,
          size: 16,
          color: p.trendUp ? AppColors.success : AppColors.error,
        ),
      ],
    ),
  );
}

// ── Achievement card ──────────────────────────────────────────────────────────
class _AchievementCard extends StatelessWidget {
  final _Achievement a;
  const _AchievementCard(this.a);

  @override
  Widget build(BuildContext context) => Opacity(
    opacity: a.earned ? 1.0 : 0.5,
    child: Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        gradient: a.earned
            ? const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0x1AFFD700), Color(0x1AFFA500)],
              )
            : null,
        color: a.earned ? null : AppColors.cardHover,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: a.earned ? AppColors.gold : AppColors.divider,
          width: 2,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(a.icon, style: const TextStyle(fontSize: 28)),
          const SizedBox(height: 4),
          Text(a.title,
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis),
          if (a.earned && a.date.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(a.date, style: const TextStyle(fontSize: 9, color: AppColors.textSecondary)),
          ],
        ],
      ),
    ),
  );
}

// ── Trend chart ───────────────────────────────────────────────────────────────
class _TrendChart extends StatelessWidget {
  final List<double> values;
  final List<String> labels;
  const _TrendChart({required this.values, required this.labels});

  @override
  Widget build(BuildContext context) {
    final maxVal = 100.0;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: List.generate(values.length, (i) {
        final v = values[i];
        final barH = (v / maxVal) * 120; // max bar height 120
        return Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text(v.toStringAsFixed(1),
                style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppColors.navy)),
              const SizedBox(height: 2),
              Container(
                height: barH,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                decoration: BoxDecoration(
                  gradient: AppColors.checkInGradient,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                ),
              ),
              const SizedBox(height: 4),
              Text(labels[i],
                style: const TextStyle(fontSize: 10, color: AppColors.textSecondary)),
            ],
          ),
        );
      }),
    );
  }
}
