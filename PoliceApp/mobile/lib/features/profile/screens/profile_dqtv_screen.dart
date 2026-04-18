import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class ProfileDqtvScreen extends ConsumerStatefulWidget {
  const ProfileDqtvScreen({super.key});

  @override
  ConsumerState<ProfileDqtvScreen> createState() => _ProfileDqtvScreenState();
}

class _ProfileDqtvScreenState extends ConsumerState<ProfileDqtvScreen> {
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _militiaProfile;
  Map<String, dynamic>? _kpi;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; });
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.get(ApiConstants.profile);
      Map<String, dynamic>? militiaProfile, kpi;
      try {
        final r = await dio.get(ApiConstants.militiaProfile);
        militiaProfile = r.data['data'] as Map<String, dynamic>?;
      } catch (_) {}
      try {
        final r = await dio.get(ApiConstants.kpiCurrent);
        kpi = r.data['data'] as Map<String, dynamic>?;
      } catch (_) {}
      setState(() {
        _profile = resp.data['data'] as Map<String, dynamic>?;
        _militiaProfile = militiaProfile;
        _kpi = kpi;
        _loading = false;
      });
    } catch (_) {
      setState(() { _loading = false; });
    }
  }

  Future<void> _logout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Đăng xuất'),
        content: const Text('Bạn có chắc muốn đăng xuất không?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
    );
    if (confirm == true) {
      await ref.read(authStateProvider.notifier).logout();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: 'Cá nhân', showBack: false),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Avatar
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(children: [
                      CircleAvatar(
                        radius: 40,
                        backgroundColor: AppColors.tertiary.withOpacity(0.1),
                        child: Text(
                          (_profile?['fullName'] as String? ?? '?').substring(0, 1).toUpperCase(),
                          style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: AppColors.tertiary),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(_profile?['fullName'] as String? ?? '',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.tertiary.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text('Dân Quân Tự Vệ',
                            style: TextStyle(color: AppColors.tertiary, fontWeight: FontWeight.w600, fontSize: 12)),
                      ),
                    ]),
                  ),
                ),
                const SizedBox(height: 12),

                // KPI card
                if (_kpi != null) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(children: [
                        const Text('KPI THÁNG NÀY', style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
                        const Divider(height: 16),
                        Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
                          _KpiItem(
                            label: 'Tổng điểm',
                            value: '${(_kpi!['totalScore'] as num?)?.toStringAsFixed(1) ?? '-'}',
                            color: AppColors.kpiScoreColor((_kpi!['totalScore'] as num?)?.toDouble() ?? 0),
                          ),
                          _KpiItem(
                            label: 'Chuyên cần',
                            value: '${(_kpi!['attendanceScore'] as num?)?.toStringAsFixed(0) ?? '-'}',
                            color: AppColors.blue,
                          ),
                          _KpiItem(
                            label: 'Nhiệm vụ',
                            value: '${(_kpi!['taskScore'] as num?)?.toStringAsFixed(0) ?? '-'}',
                            color: AppColors.success,
                          ),
                        ]),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // Account info
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('THÔNG TIN TÀI KHOẢN', style: TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
                      const Divider(height: 16),
                      _InfoTile(icon: Icons.person_outline, label: 'Tên đăng nhập',
                          value: _profile?['username'] as String? ?? ''),
                      _InfoTile(icon: Icons.email_outlined, label: 'Email',
                          value: _profile?['email'] as String? ?? 'Chưa cập nhật'),
                      _InfoTile(icon: Icons.phone_outlined, label: 'Điện thoại',
                          value: _profile?['phone'] as String? ?? 'Chưa cập nhật'),
                    ]),
                  ),
                ),
                const SizedBox(height: 12),

                // Militia profile
                if (_militiaProfile != null) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('HỒ SƠ QUÂN SỰ', style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
                        const Divider(height: 16),
                        if (_militiaProfile!['militiaId'] != null)
                          _InfoTile(icon: Icons.badge_outlined, label: 'Mã DQTV',
                              value: _militiaProfile!['militiaId'] as String),
                        if (_militiaProfile!['rank'] != null)
                          _InfoTile(icon: Icons.military_tech_outlined, label: 'Cấp bậc',
                              value: _militiaProfile!['rank'] as String),
                        if (_militiaProfile!['unit'] != null)
                          _InfoTile(icon: Icons.group_outlined, label: 'Đơn vị',
                              value: _militiaProfile!['unit'] as String),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // Logout
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: OutlinedButton.icon(
                    onPressed: _logout,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.error,
                      side: const BorderSide(color: AppColors.error),
                    ),
                    icon: const Icon(Icons.logout),
                    label: const Text('ĐĂNG XUẤT', style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
    );
  }
}

class _KpiItem extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _KpiItem({required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: color)),
      Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
    ]);
  }
}

class _InfoTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoTile({required this.icon, required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [
        Icon(icon, size: 18, color: AppColors.textSecondary),
        const SizedBox(width: 10),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
          Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
        ]),
      ]),
    );
  }
}
