import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../auth/providers/auth_provider.dart';

// ── Screen ────────────────────────────────────────────────────────────────────
class UnitComplianceScreen extends ConsumerStatefulWidget {
  const UnitComplianceScreen({super.key});

  @override
  ConsumerState<UnitComplianceScreen> createState() => _UnitComplianceScreenState();
}

class _UnitComplianceScreenState extends ConsumerState<UnitComplianceScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      // Fetch profile to get unitCode
      String unitCode = '';
      try {
        final profileRes = await dio.get('/users/me');
        unitCode = profileRes.data['data']?['unitCode'] as String?
            ?? profileRes.data['data']?['unit']?['code'] as String?
            ?? '';
      } catch (_) {}
      final queryParams = unitCode.isNotEmpty ? {'unitCode': unitCode} : <String, dynamic>{};
      final res = await dio.get(
        '/dashboard/compliance',
        queryParameters: queryParams,
      );
      if (mounted) {
        setState(() {
          _data = res.data['data'] as Map<String, dynamic>? ?? res.data as Map<String, dynamic>? ?? {};
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() { _error = 'Lỗi tải dữ liệu. Vui lòng thử lại.'; _loading = false; });
    }
  }

  void _exportReport() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Xuất báo cáo'),
        content: const Text(
          'Chức năng này chỉ khả dụng trên web.\n\n'
          'Vui lòng truy cập cổng MMS trên máy tính để xuất báo cáo PDF.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Đóng', style: TextStyle(color: AppColors.navy)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, color: AppColors.navy, size: 28),
          onPressed: () => context.pop(),
        ),
        title: const Text(
          'Tuân thủ đơn vị',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: AppColors.textPrimary,
          ),
        ),
        centerTitle: true,
        actions: [
          TextButton.icon(
            icon: const Icon(Icons.file_download_outlined, size: 18, color: AppColors.navy),
            label: const Text('Xuất', style: TextStyle(color: AppColors.navy, fontSize: 13)),
            onPressed: _exportReport,
          ),
        ],
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppColors.divider),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _error != null
              ? _buildError()
              : RefreshIndicator(
                  color: AppColors.navy,
                  onRefresh: _load,
                  child: _buildContent(),
                ),
    );
  }

  Widget _buildContent() {
    final data = _data ?? {};
    final attendancePct = (data['attendancePercent'] as num?)?.toDouble() ?? 0;
    final trainingPct = (data['trainingPercent'] as num?)?.toDouble() ?? 0;
    final avgKpi = (data['avgKpi'] as num?)?.toDouble() ?? 0;
    final attentionCount = data['attentionCount'] as int?
        ?? (data['needsAttention'] as List?)?.length
        ?? 0;
    final needsAttention = (data['needsAttention'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // ── Summary Cards ──────────────────────────────────────────────────
        const Text(
          'TỔNG QUAN THÁNG NÀY',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: AppColors.textSecondary,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            _SummaryCard(
              label: '% Điểm danh\ntháng này',
              value: '${attendancePct.toStringAsFixed(0)}%',
              color: _pctColor(attendancePct),
              icon: Icons.how_to_reg_outlined,
            ),
            const SizedBox(width: 10),
            _SummaryCard(
              label: '% Đạt huấn\nluyện năm',
              value: '${trainingPct.toStringAsFixed(0)}%',
              color: _pctColor(trainingPct),
              icon: Icons.military_tech_outlined,
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            _SummaryCard(
              label: 'Điểm KPI\ntrung bình',
              value: avgKpi.toStringAsFixed(1),
              color: AppColors.kpiScoreColor(avgKpi),
              icon: Icons.bar_chart,
            ),
            const SizedBox(width: 10),
            _SummaryCard(
              label: 'DQTV cần\nchú ý',
              value: '$attentionCount',
              color: attentionCount > 0 ? AppColors.error : AppColors.success,
              icon: Icons.warning_amber_outlined,
            ),
          ],
        ),
        const SizedBox(height: 20),

        // ── Needs Attention List ───────────────────────────────────────────
        if (needsAttention.isNotEmpty) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'DQTV CẦN CHÚ Ý',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textSecondary,
                  letterSpacing: 0.5,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.error.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '${needsAttention.length}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.error,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...needsAttention.map((person) => _AttentionCard(
                person: person,
                onViewProfile: () {
                  final id = person['id'] as String? ?? person['userId'] as String? ?? '';
                  if (id.isNotEmpty) {
                    context.push('/ca/dqtv/$id');
                  }
                },
              )),
        ] else
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.success.withOpacity(0.06),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.success.withOpacity(0.2)),
            ),
            child: Row(
              children: const [
                Icon(Icons.check_circle_outline, color: AppColors.success, size: 24),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Tất cả DQTV trong đơn vị đang đáp ứng yêu cầu.',
                    style: TextStyle(fontSize: 13, color: AppColors.textPrimary),
                  ),
                ),
              ],
            ),
          ),

        const SizedBox(height: 80),
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
              style: const TextStyle(color: AppColors.textPrimary),
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

// ── Summary Card ──────────────────────────────────────────────────────────────
class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  const _SummaryCard({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(height: 10),
            Text(
              value,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
                height: 1.3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Attention Card ────────────────────────────────────────────────────────────
class _AttentionCard extends StatelessWidget {
  final Map<String, dynamic> person;
  final VoidCallback onViewProfile;

  const _AttentionCard({required this.person, required this.onViewProfile});

  @override
  Widget build(BuildContext context) {
    final name = person['fullName'] as String? ?? person['name'] as String? ?? 'N/A';
    final reasons = (person['reasons'] as List?)?.cast<String>() ??
        _inferReasons(person);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border(left: BorderSide(color: AppColors.error, width: 4)),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8),
        ],
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: AppColors.error.withOpacity(0.1),
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                color: AppColors.error,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: reasons.map((r) => _ReasonChip(r)).toList(),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            style: TextButton.styleFrom(
              foregroundColor: AppColors.navy,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              side: const BorderSide(color: AppColors.navy, width: 1),
            ),
            onPressed: onViewProfile,
            child: const Text(
              'Xem',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReasonChip extends StatelessWidget {
  final String reason;
  const _ReasonChip(this.reason);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.error.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        reason,
        style: const TextStyle(fontSize: 10, color: AppColors.error, fontWeight: FontWeight.w500),
      ),
    );
  }
}

List<String> _inferReasons(Map<String, dynamic> person) {
  final reasons = <String>[];
  final att = person['attendanceIssue'] as bool? ?? false;
  final training = person['trainingIssue'] as bool? ?? false;
  final kpi = person['kpiIssue'] as bool? ?? false;
  final violation = person['violation'] as bool? ?? false;
  if (att) reasons.add('Điểm danh');
  if (training) reasons.add('Huấn luyện');
  if (kpi) reasons.add('KPI thấp');
  if (violation) reasons.add('Vi phạm');
  if (reasons.isEmpty) reasons.add('Cần kiểm tra');
  return reasons;
}

Color _pctColor(double pct) {
  if (pct >= 90) return AppColors.success;
  if (pct >= 75) return AppColors.warning;
  return AppColors.error;
}
