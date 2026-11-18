import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/utils/json_number.dart';
import '../../../shared/utils/string_utils.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';
import '../widgets/militia_documents_section.dart';

class DqtvDetailScreen extends ConsumerStatefulWidget {
  /// Militia profile id, as listed by GET /militia (dqtv_list_screen.dart)
  final String userId;
  const DqtvDetailScreen({super.key, required this.userId});

  @override
  ConsumerState<DqtvDetailScreen> createState() => _DqtvDetailScreenState();
}

class _DqtvDetailScreenState extends ConsumerState<DqtvDetailScreen> {
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _kpi;
  AppFailure? _kpiFailure;
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
      final dio = ref.read(dioProvider);
      // GET /militia/:id returns the profile object itself (militia.service.ts getMilitiaById);
      // the backend has no GET /users/:id
      final r = await dio.get(ApiConstants.militiaById.replaceFirst('{id}', widget.userId));
      final body = r.data;
      final profile = body is Map ? Map<String, dynamic>.from(body) : null;
      final (kpi, kpiFailure) = await _loadKpi(dio, profile?['userId']);
      if (!mounted) return;
      setState(() {
        _profile = profile;
        _kpi = kpi;
        _kpiFailure = kpiFailure;
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

  /// GET /kpi/current?userId= takes the member's USER id and returns the score object itself; a
  /// member without an account has no KPI. A KPI failure is shown next to the profile.
  Future<(Map<String, dynamic>?, AppFailure?)> _loadKpi(Dio dio, Object? userId) async {
    if (userId is! String) return (null, null);
    try {
      final k = await dio.get(ApiConstants.kpiCurrent, queryParameters: {'userId': userId});
      final body = k.data;
      return (body is Map ? Map<String, dynamic>.from(body) : null, null);
    } catch (e) {
      return (null, AppFailure.from(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = _profile;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.dqtvDetailTitle, showBack: true),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _failure != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(l10n.dqtvDetailLoadFailed(failureText(l10n, _failure!)), textAlign: TextAlign.center),
                  ),
                  ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
                ]))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    // Avatar + basic info
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(children: [
                          CircleAvatar(
                            radius: 36,
                            backgroundColor: AppColors.navy.withValues(alpha: 0.1),
                            child: Text(
                              initials(p?['fullName'] as String?),
                              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.navy),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(p?['fullName'] as String? ?? '',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          Text(p?['militiaCode'] as String? ?? '',
                              style: const TextStyle(color: AppColors.textSecondary)),
                          const SizedBox(height: 8),
                          _StatusBadge(active: (p?['status'] ?? 'active') == 'active'),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Contact info
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          _SectionTitle(l10n.dqtvDetailSectionContact),
                          const Divider(height: 16),
                          if (p?['email'] case final String email) _InfoRow(icon: Icons.email_outlined, label: email),
                          if (p?['phone'] case final String phone) _InfoRow(icon: Icons.phone_outlined, label: phone),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Militia profile
                    if (p != null) ...[
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            _SectionTitle(l10n.dqtvDetailSectionMilitary),
                            const Divider(height: 16),
                            if (p['militiaCode'] case final String code)
                              _DetailRow(label: l10n.dqtvDetailMilitiaCode, value: code),
                            if (p['rank'] case final String rank) _DetailRow(label: l10n.dqtvDetailRank, value: rank),
                            if (p['unitName'] case final String unit) _DetailRow(label: l10n.dqtvDetailUnit, value: unit),
                          ]),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Documents of the profile (staff may add)
                    MilitiaDocumentsSection(militiaId: widget.userId),
                    const SizedBox(height: 12),

                    // Evaluate button
                    const SizedBox(height: 4),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () => context.push('/ca/evaluate/${widget.userId}'),
                        icon: const Icon(Icons.rate_review_outlined),
                        label: Text(l10n.dqtvDetailEvaluate, style: const TextStyle(fontWeight: FontWeight.w600)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.navy,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // KPI of this month, or why it is missing
                    if (_kpi != null)
                      _KpiCard(kpi: _kpi!)
                    else if (_kpiFailure != null)
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Text(
                            l10n.dqtvDetailKpiFailed(failureText(l10n, _kpiFailure!)),
                            style: const TextStyle(color: AppColors.error, fontSize: 13),
                          ),
                        ),
                      ),
                  ],
                ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  final Map<String, dynamic> kpi;
  const _KpiCard({required this.kpi});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    // NUMERIC scores: JSON numbers or numeric strings
    final score = jsonNumber(kpi['totalScore']);
    // The highest score a month can reach (kpi.service.ts KPI_MAX_SCORE)
    final max = jsonNumber(kpi['maxScore']) ?? 10;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _SectionTitle(l10n.dqtvDetailSectionKpi),
          const Divider(height: 16),
          Center(
            child: Column(children: [
              Text(
                score?.toStringAsFixed(1) ?? '-',
                style: TextStyle(
                  fontSize: 42,
                  fontWeight: FontWeight.w800,
                  // kpiScoreColor grades a percentage
                  color: AppColors.kpiScoreColor(score == null || max <= 0 ? 0 : score * 100 / max),
                ),
              ),
              Text(l10n.dqtvDetailKpiOutOf('${max % 1 == 0 ? max.toInt() : max}'),
                  style: const TextStyle(color: AppColors.textSecondary)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);
  @override
  Widget build(BuildContext context) =>
      Text(text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary));
}

class _StatusBadge extends StatelessWidget {
  final bool active;
  const _StatusBadge({required this.active});
  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.success : AppColors.textMuted;
    final label = active ? context.l10n.dqtvStatusActive : context.l10n.dqtvStatusInactive;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  const _InfoRow({required this.icon, required this.label});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(children: [
        Icon(icon, size: 16, color: AppColors.textSecondary),
        const SizedBox(width: 10),
        Text(label, style: const TextStyle(fontSize: 14)),
      ]),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow({required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(children: [
        SizedBox(width: 100, child: Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13))),
        Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13))),
      ]),
    );
  }
}
