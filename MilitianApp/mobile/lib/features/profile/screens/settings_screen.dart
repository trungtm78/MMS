import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
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

  Future<void> _showChangePasswordDialog() async {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();
    String? errorMsg;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Đổi mật khẩu'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: currentCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Mật khẩu hiện tại'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: newCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Mật khẩu mới'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: confirmCtrl,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Xác nhận mật khẩu mới'),
              ),
              if (errorMsg != null) ...[
                const SizedBox(height: 8),
                Text(errorMsg!, style: const TextStyle(color: AppColors.error, fontSize: 12)),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              onPressed: () async {
                if (newCtrl.text != confirmCtrl.text) {
                  setDialogState(() => errorMsg = 'Mật khẩu xác nhận không khớp');
                  return;
                }
                if (newCtrl.text.length < 6) {
                  setDialogState(() => errorMsg = 'Mật khẩu mới phải có ít nhất 6 ký tự');
                  return;
                }
                try {
                  final storage = ref.read(secureStorageProvider);
                  final dio = DioClient.getInstance(storage);
                  await dio.post(ApiConstants.changePassword, data: {
                    'currentPassword': currentCtrl.text,
                    'newPassword': newCtrl.text,
                  });
                  if (ctx.mounted) Navigator.of(ctx).pop();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Đổi mật khẩu thành công')),
                    );
                  }
                } catch (_) {
                  setDialogState(() => errorMsg = 'Đổi mật khẩu thất bại. Kiểm tra lại mật khẩu hiện tại.');
                }
              },
              child: const Text('Xác nhận'),
            ),
          ],
        ),
      ),
    );

    currentCtrl.dispose();
    newCtrl.dispose();
    confirmCtrl.dispose();
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
    return Scaffold(
      appBar: AppHeader(title: AppStrings.settings, showBack: true),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _SectionHeader(AppStrings.security),
            Card(
              child: Column(
                children: [
                  if (_bioAvailable)
                    SwitchListTile(
                      value: _biometricEnabled,
                      onChanged: _toggleBiometric,
                      title: const Text(AppStrings.biometricLogin),
                      subtitle: const Text('Dùng vân tay / Face ID'),
                      secondary: const Icon(
                        Icons.fingerprint,
                        color: AppColors.navy,
                      ),
                      activeColor: AppColors.success,
                    ),
                  ListTile(
                    leading: const Icon(Icons.lock_outline, color: AppColors.navy),
                    title: const Text('Đổi mật khẩu'),
                    subtitle: const Text('Thay đổi mật khẩu đăng nhập'),
                    trailing: const Icon(Icons.chevron_right, color: AppColors.textSecondary),
                    onTap: _showChangePasswordDialog,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _SectionHeader(AppStrings.notifications),
            Card(
              child: SwitchListTile(
                value: _pushEnabled,
                onChanged: _togglePush,
                title: const Text(AppStrings.pushNotifications),
                subtitle: Text(
                  _pushEnabled ? 'Nhận thông báo đẩy' : 'Thông báo đẩy đã tắt',
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
