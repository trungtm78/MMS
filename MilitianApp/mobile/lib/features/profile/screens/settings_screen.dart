import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../../auth/providers/auth_provider.dart';
import '../../../shared/services/biometric_service.dart';
import '../../../shared/services/push_notification_service.dart';
import '../../../shared/widgets/app_header.dart';

/// Secure-storage key for push notification opt-in preference.
const _kPushEnabled = 'push_notifications_enabled';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _biometricEnabled = false;
  bool _pushEnabled = true;
  bool _bioAvailable = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final storage = ref.read(secureStorageProvider);
    final enabled = await storage.isBiometricEnabled();
    final bio = BiometricService();
    final available = await bio.isAvailable();
    // Read persisted push preference (default: true)
    final pushPref = await storage.read(_kPushEnabled);
    if (mounted) {
      setState(() {
        _biometricEnabled = enabled;
        _bioAvailable = available;
        _pushEnabled = pushPref != 'false';
      });
    }
  }

  Future<void> _toggleBiometric(bool val) async {
    final storage = ref.read(secureStorageProvider);
    await storage.setBiometricEnabled(val);
    setState(() => _biometricEnabled = val);
  }

  Future<void> _togglePush(bool val) async {
    setState(() => _pushEnabled = val);
    final storage = ref.read(secureStorageProvider);
    await storage.write(_kPushEnabled, val ? 'true' : 'false');

    final pushService = ref.read(pushNotificationServiceProvider);
    if (!val) {
      // User opted out — delete FCM token from device and backend
      await pushService.deleteToken();
    } else {
      // User opted back in — re-initialise to get a fresh token
      await pushService.initialize();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppHeader(title: l10n.profileSettingsTitle, showBack: true),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _SectionHeader(l10n.profileSettingsSectionSecurity),
            Card(
              child: Column(
                children: [
                  if (_bioAvailable)
                    SwitchListTile(
                      value: _biometricEnabled,
                      onChanged: _toggleBiometric,
                      title: Text(l10n.profileSettingsBiometricTitle),
                      subtitle: Text(l10n.profileSettingsBiometricSubtitle),
                      secondary: const Icon(
                        Icons.fingerprint,
                        color: AppColors.navy,
                      ),
                      activeColor: AppColors.success,
                    ),
                  // POST /users/me/change-password ends every session: the screen signs out after it
                  ListTile(
                    leading: const Icon(Icons.lock_outline, color: AppColors.navy),
                    title: Text(l10n.profileSettingsChangePasswordTitle),
                    subtitle: Text(l10n.profileSettingsChangePasswordSubtitle),
                    trailing: const Icon(Icons.chevron_right, color: AppColors.textSecondary),
                    onTap: () => context.push(Routes.changePassword),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _SectionHeader(l10n.profileSettingsSectionNotifications),
            Card(
              child: SwitchListTile(
                value: _pushEnabled,
                onChanged: _togglePush,
                title: Text(l10n.profileSettingsPushTitle),
                subtitle: Text(
                  _pushEnabled ? l10n.profileSettingsPushOn : l10n.profileSettingsPushOff,
                  style: const TextStyle(fontSize: 12),
                ),
                secondary: const Icon(
                  Icons.notifications_outlined,
                  color: AppColors.navy,
                ),
                activeColor: AppColors.success,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String text;
  const _SectionHeader(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.bold,
            color: AppColors.textSecondary,
            letterSpacing: 0.5,
          ),
        ),
      );
}
