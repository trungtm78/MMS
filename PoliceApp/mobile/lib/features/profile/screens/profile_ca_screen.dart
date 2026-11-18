import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/utils/string_utils.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class ProfileCAScreen extends ConsumerStatefulWidget {
  const ProfileCAScreen({super.key});

  @override
  ConsumerState<ProfileCAScreen> createState() => _ProfileCAScreenState();
}

class _ProfileCAScreenState extends ConsumerState<ProfileCAScreen> {
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _policeProfile;
  AppFailure? _policeFailure;
  AppFailure? _failure;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// GET /users/me and GET /police-profile return their objects themselves (users.service.ts);
  /// the police service data failing leaves the account shown, with the reason
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.get(ApiConstants.profile);
      final (police, policeFailure) = await _optionalObject(() => dio.get(ApiConstants.policeProfile));
      if (!mounted) return;
      setState(() {
        _profile = resp.data is Map ? Map<String, dynamic>.from(resp.data as Map) : null;
        _policeProfile = police;
        _policeFailure = policeFailure;
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

  Future<(Map<String, dynamic>?, AppFailure?)> _optionalObject(Future<Response<dynamic>> Function() get) async {
    try {
      final body = (await get()).data;
      return (body is Map ? Map<String, dynamic>.from(body) : null, null);
    } catch (e) {
      return (null, AppFailure.from(e));
    }
  }

  Future<void> _logout() async {
    final l10n = context.l10n;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.profileLogoutConfirmTitle),
        content: Text(l10n.profileLogoutConfirmMessage),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l10n.profileLogoutConfirmCancel)),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white),
            child: Text(l10n.profileLogoutConfirmOk),
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
    final l10n = context.l10n;
    final police = _policeProfile;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.profileTitle, showBack: false),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _failure != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(l10n.profileLoadFailed(failureText(l10n, _failure!)), textAlign: TextAlign.center),
                  ),
                  ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
                ]))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    // Avatar card
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(children: [
                          CircleAvatar(
                            radius: 40,
                            backgroundColor: AppColors.navy.withValues(alpha: 0.1),
                            child: Text(
                              initials(_profile?['fullName'] as String?),
                              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: AppColors.navy),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(_profile?['fullName'] as String? ?? '',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(l10n.profileCaRoleBadge,
                                style: const TextStyle(
                                    color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 12)),
                          ),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Info
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          _SectionTitle(l10n.profileSectionAccount),
                          const Divider(height: 16),
                          _InfoTile(icon: Icons.person_outline, label: l10n.profileUsername,
                              value: _profile?['username'] as String? ?? ''),
                          _InfoTile(icon: Icons.email_outlined, label: l10n.profileEmail,
                              value: _profile?['email'] as String? ?? l10n.profileNotUpdated),
                          _InfoTile(icon: Icons.phone_outlined, label: l10n.profilePhone,
                              value: _profile?['phone'] as String? ?? l10n.profileNotUpdated),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Police profile, or why it is missing
                    if (police != null) ...[
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            _SectionTitle(l10n.profileCaSectionPolice),
                            const Divider(height: 16),
                            if (police['badgeNumber'] case final String badge)
                              _InfoTile(icon: Icons.badge_outlined, label: l10n.profileCaBadgeNumber, value: badge),
                            if (police['rank'] case final String rank)
                              _InfoTile(icon: Icons.military_tech_outlined, label: l10n.profileRank, value: rank),
                            if (police['station'] case final String station)
                              _InfoTile(icon: Icons.location_city_outlined, label: l10n.profileUnit, value: station),
                          ]),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ] else if (_policeFailure != null) ...[
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Text(
                            l10n.profileCaPoliceFailed(failureText(l10n, _policeFailure!)),
                            style: const TextStyle(color: AppColors.error, fontSize: 13),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Security: MFA status, enrolment, recovery codes (GET /auth/mfa/status ...)
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.security, color: AppColors.navy),
                        title: Text(l10n.profileSecurity),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.push(Routes.security),
                      ),
                    ),
                    const SizedBox(height: 12),

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
                        label: Text(l10n.profileLogout, style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
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
