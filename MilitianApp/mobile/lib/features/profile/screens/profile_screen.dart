import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/router/routes.dart';
import '../../auth/providers/auth_provider.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  Map<String, dynamic>? _profileData;
  bool _loadingProfile = false;

  @override
  void initState() {
    super.initState();
    _fetchProfile();
  }

  Future<void> _fetchProfile() async {
    setState(() => _loadingProfile = true);
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final res = await dio.get(ApiConstants.profile);
      final data = res.data['data'] as Map<String, dynamic>?;
      if (mounted && data != null) {
        setState(() { _profileData = data; _loadingProfile = false; });
      } else {
        if (mounted) setState(() => _loadingProfile = false);
      }
    } catch (_) {
      if (mounted) setState(() => _loadingProfile = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authUser = ref.watch(authStateProvider).user;
    final fullName = _profileData?['fullName'] as String?
        ?? _profileData?['full_name'] as String?
        ?? authUser?.fullName ?? '—';
    final rank = _profileData?['rank'] as String? ?? authUser?.rank ?? '';
    final position = _profileData?['position'] as String? ?? authUser?.position ?? '';
    final unit = _profileData?['unit'] as String? ?? authUser?.unit ?? '—';
    final phone = _profileData?['phone'] as String? ?? authUser?.phone ?? '—';
    final email = _profileData?['email'] as String? ?? authUser?.email ?? '—';

    // Initials
    final parts = fullName.trim().split(' ');
    final initials = parts.length >= 2
        ? '${parts.first[0]}${parts.last[0]}'.toUpperCase()
        : fullName.isNotEmpty ? fullName[0].toUpperCase() : '?';

    return Scaffold(
      backgroundColor: AppColors.background,
      body: CustomScrollView(
        slivers: [
          // ── Yellow header ─────────────────────────────────────────────────
          SliverAppBar(
            expandedHeight: 0,
            pinned: true,
            backgroundColor: Colors.transparent,
            flexibleSpace: Container(
              decoration: const BoxDecoration(
                gradient: AppColors.headerGradient,
                border: Border(bottom: BorderSide(color: AppColors.primary, width: 4)),
              ),
            ),
            title: const Text('Cá Nhân',
              style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 20)),
            centerTitle: false,
            automaticallyImplyLeading: false,
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 80),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ── Profile card ─────────────────────────────────────────
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
                        Stack(
                          children: [
                            Container(
                              width: 80, height: 80,
                              decoration: const BoxDecoration(
                                gradient: AppColors.greenGradient,
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: _loadingProfile
                                    ? const CircularProgressIndicator(color: Colors.white, strokeWidth: 2)
                                    : Text(initials,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 26,
                                          fontWeight: FontWeight.bold,
                                        )),
                              ),
                            ),
                            // Online dot
                            Positioned(
                              bottom: 4, left: 4,
                              child: Container(
                                width: 14, height: 14,
                                decoration: BoxDecoration(
                                  color: AppColors.success,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 2),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(fullName,
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                        const SizedBox(height: 4),
                        if (rank.isNotEmpty || position.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.textPrimary.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              rank.isNotEmpty && position.isNotEmpty
                                  ? '$rank · $position'
                                  : rank.isNotEmpty ? rank : position,
                              style: const TextStyle(fontSize: 12, color: AppColors.textPrimary),
                            ),
                          ),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(width: 8, height: 8,
                              decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle)),
                            const SizedBox(width: 6),
                            const Text('Đang hoạt động', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── Quick stats ──────────────────────────────────────────
                  Row(
                    children: const [
                      Expanded(child: _StatCard('Thâm niên', '2 năm 3 tháng')),
                      SizedBox(width: 10),
                      Expanded(child: _StatCard('Điểm chỉ tiêu', '92.4')),
                      SizedBox(width: 10),
                      Expanded(child: _StatCard('Xếp hạng', '#3/28')),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // ── Personal info ────────────────────────────────────────
                  _InfoCard(
                    title: 'Thông tin cá nhân',
                    children: [
                      _InfoRow(Icons.phone, 'Số điện thoại', phone),
                      _InfoRow(Icons.email_outlined, 'Email', email),
                      _InfoRow(Icons.badge_outlined, 'Đơn vị', unit),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // ── Work info ────────────────────────────────────────────
                  _InfoCard(
                    title: 'Thông tin công tác',
                    children: [
                      _InfoRow(Icons.location_on_outlined, 'Khu phố', 'Khu phố 1'),
                      _InfoRow(Icons.people_outline, 'Công An KV', 'Trung úy Võ Văn Tân'),
                      _InfoRow(Icons.calendar_today_outlined, 'Ngày vào lực lượng', '01/10/2022'),
                      _InfoRow(Icons.work_outline, 'Ngạch công tác', position),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // ── Quick actions grid ───────────────────────────────────
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 2.2,
                    children: [
                      _QuickAction(Icons.description_outlined, 'Đăng ký nghỉ phép',
                          () => context.push(Routes.leaveRequest)),
                      _QuickAction(Icons.assignment_outlined, 'Đơn đã gửi',
                          () => context.push(Routes.myRequests)),
                      _QuickAction(Icons.calendar_month_outlined, 'Lịch sử công tác', () {}),
                      _QuickAction(Icons.phone_outlined, 'Hotline hỗ trợ', () {}),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // ── Settings menu ────────────────────────────────────────
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
                    ),
                    child: Column(
                      children: [
                        _MenuTile(Icons.settings, 'Cài đặt',
                            () => context.push(Routes.settings)),
                        const Divider(height: 1, indent: 54, color: AppColors.divider),
                        _MenuTile(Icons.security, 'Quản lý 2FA',
                            () => context.push(Routes.mfaSetup, extra: '')),
                        const Divider(height: 1, indent: 54, color: AppColors.divider),
                        _MenuTile(Icons.info_outline, 'Về ứng dụng', () {}),
                        const Divider(height: 1, indent: 54, color: AppColors.divider),
                        _MenuTile(Icons.help_outline, 'Hỗ trợ', () {}),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // ── Logout ───────────────────────────────────────────────
                  GestureDetector(
                    onTap: () async {
                      await ref.read(authStateProvider.notifier).logout();
                      if (context.mounted) context.go(Routes.login);
                    },
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.errorBg,
                        border: Border.all(color: AppColors.errorBorder, width: 2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.logout, color: AppColors.error, size: 20),
                          SizedBox(width: 12),
                          Text('Đăng xuất',
                            style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w600, fontSize: 14)),
                        ],
                      ),
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

// ── Stat Card ─────────────────────────────────────────────────────────────────
class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  const _StatCard(this.label, this.value);

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(10),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 6)],
    ),
    child: Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textSecondary), textAlign: TextAlign.center),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.textPrimary), textAlign: TextAlign.center),
      ],
    ),
  );
}

// ── Info Card ─────────────────────────────────────────────────────────────────
class _InfoCard extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _InfoCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
        const SizedBox(height: 12),
        ...children,
      ],
    ),
  );
}

// ── Info Row ──────────────────────────────────────────────────────────────────
class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow(this.icon, this.label, this.value);

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppColors.textSecondary),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
              Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
            ],
          ),
        ),
      ],
    ),
  );
}

// ── Quick Action ──────────────────────────────────────────────────────────────
class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _QuickAction(this.icon, this.label, this.onTap);

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 6)],
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.navy, size: 22),
          const SizedBox(width: 8),
          Expanded(
            child: Text(label,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    ),
  );
}

// ── Menu Tile ─────────────────────────────────────────────────────────────────
class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _MenuTile(this.icon, this.label, this.onTap);

  @override
  Widget build(BuildContext context) => ListTile(
    dense: true,
    leading: Icon(icon, color: AppColors.textSecondary, size: 20),
    title: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
    trailing: const Icon(Icons.chevron_right, size: 18, color: AppColors.textSecondary),
    onTap: onTap,
  );
}
