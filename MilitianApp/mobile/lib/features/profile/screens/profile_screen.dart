import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/error_texts.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/utils/number_format.dart';
import '../../auth/providers/auth_provider.dart';
import '../../kpi/kpi_repository.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

/// The signed-in member: GET /users/me (Web/backend/src/users/users.service.ts getProfile, a bare object:
/// fullName, email, phone, status, unitScope...) and this month's KPI standing from GET /kpi/current.
/// Only what the backend returns is shown: it keeps no seniority, neighbourhood, area officer or join
/// date for an account, so none is displayed.
class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  Map<String, dynamic>? _profileData;
  bool _loadingProfile = false;
  Object? _profileError;

  @override
  void initState() {
    super.initState();
    _fetchProfile();
  }

  Future<void> _fetchProfile() async {
    setState(() {
      _loadingProfile = true;
      _profileError = null;
    });
    try {
      final res = await ref.read(apiDioProvider).get<dynamic>(ApiConstants.profile);
      final data = res.data;
      if (!mounted) return;
      setState(() {
        _profileData = data is Map ? Map<String, dynamic>.from(data) : null;
        _loadingProfile = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _profileError = e;
          _loadingProfile = false;
        });
      }
    }
  }

  String? _text(String key) {
    final value = _profileData?[key];
    return value is String && value.trim().isNotEmpty ? value.trim() : null;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final authUser = ref.watch(authStateProvider).user;
    final fullName = _text('fullName') ?? authUser?.fullName ?? '—';
    final unit = _text('unitScope') ?? '—';
    final phone = _text('phone') ?? authUser?.phone ?? '—';
    final email = _text('email') ?? authUser?.email ?? '—';
    final active = _text('status') == 'active';
    final profileError = _profileError;

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
            title: Text(l10n.profileScreenTitle,
              style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 20)),
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
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
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
                        // users.status as the backend reports it; nothing is claimed without an answer
                        if (active) ...[
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(width: 8, height: 8,
                                decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle)),
                              const SizedBox(width: 6),
                              Text(l10n.profileScreenStatusActive,
                                style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (profileError != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Text(l10n.profileScreenLoadFailed(errorTextFor(l10n, profileError)),
                              style: const TextStyle(fontSize: 12, color: AppColors.error)),
                        ),
                        TextButton(onPressed: _fetchProfile, child: Text(l10n.commonRetryButton)),
                      ],
                    ),
                  ],
                  const SizedBox(height: 16),

                  // ── Quick stats: this month's KPI (GET /kpi/current) ─────
                  const _KpiStats(),
                  const SizedBox(height: 16),

                  // ── Personal info ────────────────────────────────────────
                  _InfoCard(
                    title: l10n.profileScreenPersonalInfoTitle,
                    children: [
                      _InfoRow(Icons.phone, l10n.profileScreenPhoneLabel, phone),
                      _InfoRow(Icons.email_outlined, l10n.profileScreenEmailLabel, email),
                      _InfoRow(Icons.badge_outlined, l10n.profileScreenUnitLabel, unit),
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
                      _QuickAction(Icons.description_outlined, l10n.profileScreenQuickLeaveRequest,
                          () => context.push(Routes.leaveRequest)),
                      _QuickAction(Icons.assignment_outlined, l10n.profileScreenQuickMyRequests,
                          () => context.push(Routes.myRequests)),
                      _QuickAction(Icons.calendar_month_outlined, l10n.profileScreenQuickWorkHistory, () {}),
                      _QuickAction(Icons.phone_outlined, l10n.profileScreenQuickHotline, () {}),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // ── Settings menu ────────────────────────────────────────
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
                    ),
                    child: Column(
                      children: [
                        _MenuTile(Icons.settings, l10n.profileScreenMenuSettings,
                            () => context.push(Routes.settings)),
                        const Divider(height: 1, indent: 54, color: AppColors.divider),
                        _MenuTile(Icons.security, l10n.profileScreenMenuSecurity,
                            () => context.push(Routes.security)),
                        const Divider(height: 1, indent: 54, color: AppColors.divider),
                        _MenuTile(Icons.info_outline, l10n.profileScreenMenuAbout, () {}),
                        const Divider(height: 1, indent: 54, color: AppColors.divider),
                        _MenuTile(Icons.help_outline, l10n.profileScreenMenuSupport, () {}),
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
                      child: Row(
                        children: [
                          const Icon(Icons.logout, color: AppColors.error, size: 20),
                          const SizedBox(width: 12),
                          Text(l10n.profileScreenLogout,
                            style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.w600, fontSize: 14)),
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

// ── KPI stats ─────────────────────────────────────────────────────────────────
/// The month's score on the backend's scale and the standing within the unit (rankInUnit / unitSize)
class _KpiStats extends ConsumerWidget {
  const _KpiStats();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final (Widget score, Widget rank) = ref.watch(kpiCurrentProvider).when(
          loading: () => (const _StatLoading(), const _StatLoading()),
          error: (error, stackTrace) =>
              (_StatValue(l10n.profileScreenStatUnavailable), _StatValue(l10n.profileScreenStatUnavailable)),
          data: (kpi) {
            final value = kpi.score;
            final inUnit = kpi.rankInUnit;
            final size = kpi.unitSize;
            return (
              _StatValue(value == null
                  ? l10n.profileScreenStatNotEvaluated
                  : l10n.kpiScoreOutOf(formatDecimal(value, fractionDigits: 1), formatDecimal(kpi.maxScore))),
              _StatValue(inUnit == null
                  ? l10n.profileScreenStatNotEvaluated
                  : size != null && size >= inUnit
                      ? l10n.profileScreenStatRankValue(inUnit, size)
                      : l10n.profileScreenStatRankOnly(inUnit)),
            );
          },
        );
    return Row(
      children: [
        Expanded(child: _StatCard(l10n.profileScreenStatKpiLabel, score)),
        const SizedBox(width: 10),
        Expanded(child: _StatCard(l10n.profileScreenStatRankLabel, rank)),
      ],
    );
  }
}

class _StatValue extends StatelessWidget {
  final String text;
  const _StatValue(this.text);

  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
      textAlign: TextAlign.center);
}

class _StatLoading extends StatelessWidget {
  const _StatLoading();

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: 16,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: AppColors.navy,
          semanticsLabel: context.l10n.profileScreenStatLoading,
        ),
      );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
class _StatCard extends StatelessWidget {
  final String label;
  final Widget value;
  const _StatCard(this.label, this.value);

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(10),
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)],
    ),
    child: Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textSecondary), textAlign: TextAlign.center),
        const SizedBox(height: 4),
        value,
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
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
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
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)],
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

  // Its own transparent Material: the white card around the menu would otherwise hide the ink splash
  @override
  Widget build(BuildContext context) => Material(
    type: MaterialType.transparency,
    child: ListTile(
      dense: true,
      leading: Icon(icon, color: AppColors.textSecondary, size: 20),
      title: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
      trailing: const Icon(Icons.chevron_right, size: 18, color: AppColors.textSecondary),
      onTap: onTap,
    ),
  );
}
