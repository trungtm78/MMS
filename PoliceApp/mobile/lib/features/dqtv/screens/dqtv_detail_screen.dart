import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class DqtvDetailScreen extends ConsumerStatefulWidget {
  final String userId;
  const DqtvDetailScreen({super.key, required this.userId});

  @override
  ConsumerState<DqtvDetailScreen> createState() => _DqtvDetailScreenState();
}

class _DqtvDetailScreenState extends ConsumerState<DqtvDetailScreen> {
  Map<String, dynamic>? _user;
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _kpi;
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
      final profileUrl = ApiConstants.userMilitiaProfile.replaceFirst('{id}', widget.userId);

      Map<String, dynamic>? user, profile, kpi;
      try {
        final r = await dio.get('${ApiConstants.users}/${widget.userId}');
        user = r.data['data'] as Map<String, dynamic>?;
      } catch (_) {}
      try {
        final r = await dio.get(profileUrl);
        profile = r.data['data'] as Map<String, dynamic>?;
      } catch (_) {}
      try {
        final r = await dio.get(ApiConstants.kpiCurrent, queryParameters: {'userId': widget.userId});
        kpi = r.data['data'] as Map<String, dynamic>?;
      } catch (_) {}

      setState(() {
        _user = user;
        _profile = profile;
        _kpi = kpi;
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = 'Lỗi tải hồ sơ'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: 'Hồ sơ DQTV', showBack: true),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _error != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                  const SizedBox(height: 8),
                  Text(_error!),
                  ElevatedButton(onPressed: _load, child: const Text('Thử lại')),
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
                            backgroundColor: AppColors.navy.withOpacity(0.1),
                            child: Text(
                              (_user?['fullName'] as String? ?? '?').substring(0, 1).toUpperCase(),
                              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.navy),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(_user?['fullName'] as String? ?? '',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          Text(_user?['username'] as String? ?? '',
                              style: const TextStyle(color: AppColors.textSecondary)),
                          const SizedBox(height: 8),
                          _StatusBadge(status: _user?['status'] as String? ?? 'active'),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Contact info
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('THÔNG TIN LIÊN HỆ', style: TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
                          const Divider(height: 16),
                          if (_user?['email'] != null)
                            _InfoRow(icon: Icons.email_outlined, label: _user!['email'] as String),
                          if (_user?['phone'] != null)
                            _InfoRow(icon: Icons.phone_outlined, label: _user!['phone'] as String),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Militia profile
                    if (_profile != null) ...[
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const Text('HỒ SƠ QUÂN SỰ', style: TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
                            const Divider(height: 16),
                            if (_profile!['militiaId'] != null)
                              _DetailRow(label: 'Mã DQTV', value: _profile!['militiaId'] as String),
                            if (_profile!['rank'] != null)
                              _DetailRow(label: 'Cấp bậc', value: _profile!['rank'] as String),
                            if (_profile!['unit'] != null)
                              _DetailRow(label: 'Đơn vị', value: _profile!['unit'] as String),
                            if (_profile!['joinDate'] != null)
                              _DetailRow(
                                label: 'Ngày vào',
                                value: _formatDate(_profile!['joinDate'] as String),
                              ),
                          ]),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // KPI
                    if (_kpi != null) ...[
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const Text('KPI THÁNG NÀY', style: TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
                            const Divider(height: 16),
                            Center(
                              child: Column(children: [
                                Text(
                                  '${(_kpi!['totalScore'] as num?)?.toStringAsFixed(1) ?? '-'}',
                                  style: TextStyle(
                                    fontSize: 42, fontWeight: FontWeight.w800,
                                    color: AppColors.kpiScoreColor((_kpi!['totalScore'] as num?)?.toDouble() ?? 0),
                                  ),
                                ),
                                const Text('/ 100 điểm', style: TextStyle(color: AppColors.textSecondary)),
                              ]),
                            ),
                          ]),
                        ),
                      ),
                    ],
                  ],
                ),
    );
  }

  String _formatDate(String iso) {
    try {
      return DateFormat('dd/MM/yyyy').format(DateTime.parse(iso));
    } catch (_) { return iso; }
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});
  @override
  Widget build(BuildContext context) {
    final color = status == 'active' ? AppColors.success : AppColors.textMuted;
    final label = status == 'active' ? 'Đang hoạt động' : 'Không hoạt động';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
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
