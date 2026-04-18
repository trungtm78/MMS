import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/router/routes.dart';
import '../../auth/providers/auth_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.user;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              // ── Yellow gradient header (per Refs) ─────────────────────
              SliverAppBar(
                pinned: true,
                expandedHeight: 140,
                backgroundColor: Colors.transparent,
                flexibleSpace: FlexibleSpaceBar(
                  background: Container(
                    decoration: const BoxDecoration(
                      gradient: AppColors.headerGradient,
                      border: Border(
                        bottom: BorderSide(color: AppColors.primary, width: 4),
                      ),
                    ),
                    padding: const EdgeInsets.fromLTRB(16, 48, 16, 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // Avatar circle
                        Stack(
                          children: [
                            Container(
                              width: 56,
                              height: 56,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: AppColors.primary,
                                  width: 2,
                                ),
                              ),
                              child: const Icon(
                                Icons.person,
                                color: AppColors.primary,
                                size: 32,
                              ),
                            ),
                            // Online dot
                            Positioned(
                              bottom: 2,
                              right: 2,
                              child: Container(
                                width: 12,
                                height: 12,
                                decoration: BoxDecoration(
                                  color: AppColors.tertiary,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: Colors.white,
                                    width: 2,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(width: 12),
                        // Name + unit
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                user?.fullName ?? AppStrings.welcome,
                                style: const TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.primary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              // Unit badge
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.primary,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  user?.unit?.isNotEmpty == true
                                      ? 'DQTV - ${user!.unit}'
                                      : 'DQTV - CA Khu vực',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        // Bell icon
                        Stack(
                          children: [
                            IconButton(
                              icon: const Icon(
                                Icons.notifications_outlined,
                                color: AppColors.primary,
                                size: 28,
                              ),
                              onPressed: () => context.push(Routes.notifications),
                            ),
                            Positioned(
                              top: 6,
                              right: 6,
                              child: Container(
                                width: 10,
                                height: 10,
                                decoration: const BoxDecoration(
                                  color: AppColors.primary,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // ── Quick Actions 2×2 (per Refs) ──────────────────────
                    const _SectionTitle(AppStrings.quickActions),
                    const SizedBox(height: 12),
                    _QuickActionsGrid(context),
                    const SizedBox(height: 20),
                    // ── Attendance Stats ──────────────────────────────────
                    const _SectionTitle(AppStrings.attendance),
                    const SizedBox(height: 12),
                    const _AttendanceCard(),
                    const SizedBox(height: 20),
                    // ── Pending Tasks ─────────────────────────────────────
                    _PendingTasksCard(context),
                    // Extra bottom padding for FAB
                    const SizedBox(height: 80),
                  ]),
                ),
              ),
            ],
          ),

          // ── Floating SOS button (bottom-right per Refs) ──────────────
          Positioned(
            bottom: 80,
            right: 16,
            child: _FloatingSosButton(context),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w700,
          color: AppColors.textPrimary,
        ),
      );
}

// ─── Quick Actions 2×2 grid ──────────────────────────────────────────────────

class _QuickActionsGrid extends StatelessWidget {
  final BuildContext ctx;
  const _QuickActionsGrid(this.ctx);

  @override
  Widget build(BuildContext context) {
    final items = [
      _QAItem(Icons.location_on,       AppStrings.checkIn,      AppColors.tertiary, () => ctx.go(Routes.checkin)),
      _QAItem(Icons.assignment,        AppStrings.myTasks,      AppColors.blue,     () => ctx.go(Routes.tasks)),
      _QAItem(Icons.beach_access,      AppStrings.leaveRequest, AppColors.navy,     () => ctx.push(Routes.leaveRequest)),
      _QAItem(Icons.trending_up,       'Chỉ tiêu',              AppColors.success,  () => ctx.push(Routes.kpi)),
    ];
    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 2.4,
      children: items.map((item) => _buildTile(item)).toList(),
    );
  }

  Widget _buildTile(_QAItem item) => GestureDetector(
        onTap: item.onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.cardBorder, width: 2),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.06),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: item.color,
                  shape: BoxShape.circle,
                ),
                child: Icon(item.icon, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  item.label,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                  maxLines: 2,
                ),
              ),
            ],
          ),
        ),
      );
}

class _QAItem {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QAItem(this.icon, this.label, this.color, this.onTap);
}

// ─── Floating SOS button ─────────────────────────────────────────────────────

class _FloatingSosButton extends StatelessWidget {
  final BuildContext ctx;
  const _FloatingSosButton(this.ctx);

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => ctx.push(Routes.sos),
        child: Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: AppColors.error,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: AppColors.error.withOpacity(0.45),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: const Icon(Icons.emergency, color: Colors.white, size: 28),
        ),
      );
}

// ─── Attendance Stats Card ────────────────────────────────────────────────────

class _AttendanceCard extends ConsumerStatefulWidget {
  const _AttendanceCard();

  @override
  ConsumerState<_AttendanceCard> createState() => _AttendanceCardState();
}

class _AttendanceCardState extends ConsumerState<_AttendanceCard> {
  Map<String, dynamic>? _stats;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final now = DateTime.now();
      final res = await dio.get(
        ApiConstants.attendanceStats,
        queryParameters: {'year': now.year, 'month': now.month},
      );
      if (mounted) {
        setState(() => _stats = res.data['data'] as Map<String, dynamic>?);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.tertiary, width: 2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: _stats == null
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(8),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _StatItem(AppStrings.present,
                    '${_stats!['presentDays'] ?? 0}', AppColors.success),
                _Divider(),
                _StatItem(AppStrings.absent,
                    '${_stats!['absentDays'] ?? 0}', AppColors.error),
                _Divider(),
                _StatItem(AppStrings.late,
                    '${_stats!['lateDays'] ?? 0}', AppColors.warning),
              ],
            ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        height: 36,
        width: 1,
        color: AppColors.divider,
      );
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _StatItem(this.label, this.value, this.color);

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      );
}

// ─── Pending Tasks Card ───────────────────────────────────────────────────────

class _PendingTasksCard extends ConsumerStatefulWidget {
  final BuildContext ctx;
  const _PendingTasksCard(this.ctx);

  @override
  ConsumerState<_PendingTasksCard> createState() => _PendingTasksCardState();
}

class _PendingTasksCardState extends ConsumerState<_PendingTasksCard> {
  int _pendingCount = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final res = await dio.get(
        ApiConstants.tasks,
        queryParameters: {'status': 'pending', 'limit': 1},
      );
      if (mounted) {
        final total = res.data['pagination']?['total'] as int? ?? 0;
        setState(() => _pendingCount = total);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: ListTile(
          leading: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.warning.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.assignment_late,
              color: AppColors.warning,
              size: 22,
            ),
          ),
          title: const Text(
            AppStrings.pendingTasks,
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: Text('$_pendingCount nhiệm vụ chờ xử lý'),
          trailing: const Icon(Icons.arrow_forward_ios, size: 14),
          onTap: () => widget.ctx.go(Routes.tasks),
        ),
      );
}
